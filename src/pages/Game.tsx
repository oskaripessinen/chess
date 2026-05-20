import { useEffect, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { GameBoard } from '../components/GameBoard';
import { GameInfo } from '../components/GameInfo';
import { Lobby } from './Lobby';
import { MoveHistory } from '../components/MoveHistory';
import { Clock } from '../components/Clock';
import { joinGame } from '../utils/api';
import { getStoredPlayerToken, storePlayerToken } from '../utils/playerTokens';
import { useGameSocket } from '../hooks/useGameSocket';
import type { ClientMessage, PlayerColor, PublicGameState } from '../types/messages';

type GameProps = {
  gameId: string;
  onHome: () => void;
};

export function Game({ gameId, onHome }: GameProps) {
  const [token, setToken] = useState<string | null>(() => getStoredPlayerToken(gameId));
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const joinStartedRef = useRef(false);
  const socket = useGameSocket(gameId, token);

  useEffect(() => {
    if (token || joinStartedRef.current || joinError) {
      return;
    }

    joinStartedRef.current = true;
    setJoining(true);
    setJoinError(null);

    joinGame(gameId)
      .then((response) => {
        storePlayerToken(gameId, response.playerToken);
        setToken(response.playerToken);
      })
      .catch((error) => {
        setJoinError(error instanceof Error ? error.message : 'Failed to join the game.');
      })
      .finally(() => {
        joinStartedRef.current = false;
        setJoining(false);
      });
  }, [gameId, joinError, token]);

  if (joinError) {
    return (
      <main className="center-page">
        <section className="panel narrow-panel">
          <h1>Could not join the game</h1>
          <p>{joinError}</p>
          <button type="button" onClick={onHome}>
            Back to home
          </button>
        </section>
      </main>
    );
  }

  if (!token || !socket.state) {
    return (
      <main className="center-page">
        <section className="panel narrow-panel">
          <h1>Loading game state</h1>
          <p>{socket.error ?? (joining ? 'Joining the game.' : 'Opening game connection.')}</p>
        </section>
      </main>
    );
  }

  if (socket.state.status === 'waiting') {
    return <Lobby state={socket.state} connected={socket.connected} error={socket.error} />;
  }

  return (
    <GameContent
      state={socket.state}
      connected={socket.connected}
      error={socket.error}
      receivedAt={socket.receivedAt}
      sendMessage={socket.sendMessage}
    />
  );
}

type GameContentProps = {
  state: PublicGameState;
  connected: boolean;
  error: string | null;
  receivedAt: number;
  sendMessage: (message: ClientMessage) => void;
};

function GameContent({ state, connected, error, receivedAt, sendMessage }: GameContentProps) {
  const [replayIndex, setReplayIndex] = useState<number | null>(null);
  const displayFen = getDisplayFen(state, replayIndex);
  const isReplay = replayIndex !== null;
  const canInteract = !isReplay && state.status === 'active';
  const showReplay = state.status === 'finished' && state.moves.length > 0;
  const canUseRematch = state.status === 'finished';
  const bottomColor: PlayerColor = state.role;
  const topColor: PlayerColor = bottomColor === 'white' ? 'black' : 'white';

  useEffect(() => {
    if (state.status !== 'finished') {
      setReplayIndex(null);
    }
  }, [state.status]);

  function handleMove(from: string, to: string) {
    const promotionPiece = getPromotion(displayFen, from, to);
    sendMessage({ type: 'move', from, to, promotion: promotionPiece });
  }

  return (
    <main className="game-page">
      <section className="game-layout">
        <div className="board-column">
          <div className="player-strip top-player">
            <span>{getPlayerLabel(topColor)}</span>
            <Clock
              time={getClockTime(state, topColor)}
              active={isClockActive(state, topColor, isReplay)}
              receivedAt={receivedAt}
            />
          </div>

          <GameBoard
            fen={displayFen}
            role={state.role}
            turn={state.turn}
            disabled={!canInteract}
            onMove={handleMove}
          />

          <div className="player-strip bottom-player">
            <span>{getPlayerLabel(bottomColor)}</span>
            <Clock
              time={getClockTime(state, bottomColor)}
              active={isClockActive(state, bottomColor, isReplay)}
              receivedAt={receivedAt}
            />
          </div>
        </div>

        <aside className="side-panel">
          <GameInfo state={state} connected={connected} error={error} />

          <div className="action-row">
            <button
              type="button"
              className="secondary-button"
              disabled={state.status !== 'active'}
              onClick={() => sendMessage({ type: 'offer_draw' })}
            >
              Offer draw
            </button>
            <button
              type="button"
              className="danger-button"
              disabled={state.status !== 'active'}
              onClick={() => sendMessage({ type: 'resign' })}
            >
              Resign
            </button>
          </div>

          {state.drawOfferBy && state.status === 'active' && state.drawOfferBy !== state.role ? (
            <div className="notice-box draw-offer-box">
              <button type="button" className="draw-offer-button" onClick={() => sendMessage({ type: 'accept_draw' })}>
                Accept draw
              </button>
            </div>
          ) : null}

          {canUseRematch ? (
            <div className="notice-box rematch-box">
              {state.rematchOfferBy === state.role ? (
                <>
                  <button type="button" className="secondary-button rematch-button" disabled>
                    Offer sent
                  </button>
                </>
              ) : state.rematchOfferBy ? (
                <>
                  <button type="button" className="rematch-button" onClick={() => sendMessage({ type: 'accept_rematch' })}>
                    Accept rematch
                  </button>
                </>
              ) : (
                <button type="button" className="rematch-button" onClick={() => sendMessage({ type: 'offer_rematch' })}>
                  Offer rematch
                </button>
              )}
            </div>
          ) : null}

          {showReplay ? (
            <div className="replay-box">
              <div className="section-heading">
                <h2>Replay</h2>
              </div>
              <input
                type="range"
                min={0}
                max={state.moves.length}
                value={replayIndex ?? state.moves.length}
                onChange={(event) => setReplayIndex(Number(event.target.value))}
              />
              <p className="muted-text">Move {replayIndex ?? state.moves.length} / {state.moves.length}</p>
            </div>
          ) : null}

          <MoveHistory moves={state.moves} />
        </aside>
      </section>
    </main>
  );
}

function getDisplayFen(state: PublicGameState, replayIndex: number | null): string {
  if (replayIndex === null || replayIndex === state.moves.length) {
    return state.fen;
  }

  if (replayIndex <= 0) {
    return new Chess().fen();
  }

  return state.moves[replayIndex - 1]?.fen ?? state.fen;
}

function getPromotion(fen: string, from: string, to: string): 'q' | undefined {
  const chess = new Chess(fen);
  const piece = chess.get(from as Parameters<Chess['get']>[0]);

  if (!piece || piece.type !== 'p') {
    return undefined;
  }

  const targetRank = to[1];
  return targetRank === '8' || targetRank === '1' ? 'q' : undefined;
}

function getPlayerLabel(color: PlayerColor): string {
  return color === 'white' ? 'White' : 'Black';
}

function getClockTime(state: PublicGameState, color: PlayerColor): number | null {
  return color === 'white' ? state.clocks.w : state.clocks.b;
}

function isClockActive(state: PublicGameState, color: PlayerColor, isReplay: boolean): boolean {
  const turn = color === 'white' ? 'w' : 'b';
  return state.status === 'active' && state.turn === turn && !isReplay;
}
