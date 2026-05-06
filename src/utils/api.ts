import type {
  ApiErrorResponse,
  CreateGameRequest,
  CreateGameResponse,
  JoinGameResponse,
} from '../types/messages';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? '';
const pendingJoinRequests = new Map<string, Promise<JoinGameResponse>>();

export async function createGame(request: CreateGameRequest): Promise<CreateGameResponse> {
  return fetchJson<CreateGameResponse>('/api/games', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
}

export async function joinGame(gameId: string): Promise<JoinGameResponse> {
  const pendingRequest = pendingJoinRequests.get(gameId);

  if (pendingRequest) {
    return pendingRequest;
  }

  const request = fetchJson<JoinGameResponse>(`/api/games/${gameId}/join`, { method: 'POST' });
  pendingJoinRequests.set(gameId, request);

  try {
    return await request;
  } finally {
    pendingJoinRequests.delete(gameId);
  }
}

export function getGameSocketUrl(gameId: string, token: string): string {
  const url = new URL(`/api/games/${gameId}/ws`, getUrlOrigin());
  url.searchParams.set('token', token);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

async function fetchJson<TResponse>(path: string, init: RequestInit): Promise<TResponse> {
  const response = await fetch(`${apiBaseUrl}${path}`, init);
  const body: unknown = await response.json();

  if (!response.ok) {
    throw new Error(readApiError(body));
  }

  return body as TResponse;
}

function getUrlOrigin(): string {
  if (apiBaseUrl) {
    return apiBaseUrl;
  }

  return window.location.origin;
}

function readApiError(body: unknown): string {
  if (isRecord(body) && typeof body.error === 'string') {
    return body.error;
  }

  return 'Request failed.' satisfies ApiErrorResponse['error'];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
