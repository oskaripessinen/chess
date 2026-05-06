import { useEffect, useRef, useState } from 'react';
import { getGameSocketUrl } from '../utils/api';
import type { ClientMessage, PublicGameState, ServerMessage } from '../types/messages';

export function useGameSocket(gameId: string, token: string | null) {
  const socketRef = useRef<WebSocket | null>(null);
  const [state, setState] = useState<PublicGameState | null>(null);
  const [receivedAt, setReceivedAt] = useState(() => Date.now());
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      return;
    }

    const playerToken = token;
    let stopped = false;
    let retryCount = 0;
    let retryTimer: number | null = null;

    function connect() {
      const socket = new WebSocket(getGameSocketUrl(gameId, playerToken));
      socketRef.current = socket;

      socket.onopen = () => {
        retryCount = 0;
        setConnected(true);
        setError(null);
      };

      socket.onmessage = (event) => {
        const message = parseServerMessage(event.data);

        if (!message) {
          setError('The server sent an invalid message.');
          return;
        }

        if (message.type === 'error') {
          setError(message.message);
          return;
        }

        setReceivedAt(Date.now());
        setState(message.state);
      };

      socket.onclose = () => {
        setConnected(false);

        if (stopped) {
          return;
        }

        retryCount += 1;
        retryTimer = window.setTimeout(connect, Math.min(5000, 600 + retryCount * 600));
      };

      socket.onerror = () => {
        setError('Connection lost. Retrying.');
        socket.close();
      };
    }

    connect();

    return () => {
      stopped = true;

      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
      }

      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [gameId, token]);

  function sendMessage(message: ClientMessage) {
    if (socketRef.current?.readyState !== WebSocket.OPEN) {
      setError('The connection is not open.');
      return;
    }

    socketRef.current.send(JSON.stringify(message));
  }

  return { state, receivedAt, connected, error, sendMessage };
}

function parseServerMessage(data: unknown): ServerMessage | null {
  if (typeof data !== 'string') {
    return null;
  }

  let value: unknown;

  try {
    value = JSON.parse(data);
  } catch {
    return null;
  }

  if (!isRecord(value)) {
    return null;
  }

  if (value.type === 'error' && typeof value.message === 'string') {
    return { type: 'error', message: value.message };
  }

  if (value.type === 'state' && isRecord(value.state)) {
    return { type: 'state', state: value.state as PublicGameState };
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
