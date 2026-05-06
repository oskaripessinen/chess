import { ChessGame } from './game';
import type {
  ApiErrorResponse,
  CreateGameRequest,
  GameId,
  GameSettings,
} from './types';

export { ChessGame };

export interface Env {
  CHESS_GAME: DurableObjectNamespace;
}

type GameRoute =
  | { type: 'collection' }
  | { type: 'game'; gameId: GameId }
  | { type: 'join'; gameId: GameId }
  | { type: 'ws'; gameId: GameId }
  | { type: 'unknown' };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const route = getRoute(new URL(request.url));

    if (route.type === 'collection' && request.method === 'POST') {
      return withCors(await createGame(request, env));
    }

    if (route.type === 'game' && request.method === 'GET') {
      return withCors(await forwardToGame(route.gameId, env, '/info', request));
    }

    if (route.type === 'join' && request.method === 'POST') {
      return withCors(await forwardToGame(route.gameId, env, '/join', request));
    }

    if (route.type === 'ws' && request.headers.get('Upgrade') === 'websocket') {
      return forwardToGame(route.gameId, env, '/ws', request);
    }

    return withCors(json({ error: 'Route not found.' }, 404));
  },
};

async function createGame(request: Request, env: Env): Promise<Response> {
  const settings = await readCreateGameRequest(request);

  if (!settings) {
    return json({ error: 'Invalid game settings.' }, 400);
  }

  const gameId = createGameId();
  const objectId = env.CHESS_GAME.idFromName(gameId);
  const stub = env.CHESS_GAME.get(objectId);
  const body = JSON.stringify({ gameId, settings });

  return stub.fetch('https://game/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}

async function forwardToGame(
  gameId: GameId,
  env: Env,
  path: string,
  request: Request,
): Promise<Response> {
  const objectId = env.CHESS_GAME.idFromName(gameId);
  const stub = env.CHESS_GAME.get(objectId);
  const url = new URL(request.url);
  url.protocol = 'https:';
  url.hostname = 'game';
  url.pathname = path;

  return stub.fetch(new Request(url, request));
}

async function readCreateGameRequest(request: Request): Promise<GameSettings | null> {
  let value: unknown;

  try {
    value = await request.json();
  } catch {
    return null;
  }

  if (!isRecord(value)) {
    return null;
  }

  const { timeControl, playerColor, allowSpectators } = value;

  if (!isTimeControl(timeControl) || !isColorChoice(playerColor)) {
    return null;
  }

  if (typeof allowSpectators !== 'boolean') {
    return null;
  }

  return { timeControl, playerColor, allowSpectators } satisfies CreateGameRequest;
}

function getRoute(url: URL): GameRoute {
  const parts = url.pathname.split('/').filter(Boolean);

  if (parts.length === 2 && parts[0] === 'api' && parts[1] === 'games') {
    return { type: 'collection' };
  }

  if (parts.length === 3 && parts[0] === 'api' && parts[1] === 'games') {
    return { type: 'game', gameId: parts[2] };
  }

  if (parts.length === 4 && parts[0] === 'api' && parts[1] === 'games' && parts[3] === 'join') {
    return { type: 'join', gameId: parts[2] };
  }

  if (parts.length === 4 && parts[0] === 'api' && parts[1] === 'games' && parts[3] === 'ws') {
    return { type: 'ws', gameId: parts[2] };
  }

  return { type: 'unknown' };
}

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);

  for (const [key, value] of Object.entries(corsHeaders)) {
    headers.set(key, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function json(body: ApiErrorResponse, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function createGameId(): GameId {
  return crypto.randomUUID().replaceAll('-', '').slice(0, 12);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isTimeControl(value: unknown): value is GameSettings['timeControl'] {
  return value === '5min' || value === '10min' || value === 'none';
}

function isColorChoice(value: unknown): value is GameSettings['playerColor'] {
  return value === 'white' || value === 'black' || value === 'random';
}
