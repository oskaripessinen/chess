export function getStoredPlayerToken(gameId: string): string | null {
  return window.localStorage.getItem(getTokenKey(gameId));
}

export function storePlayerToken(gameId: string, token: string): void {
  window.localStorage.setItem(getTokenKey(gameId), token);
}

function getTokenKey(gameId: string): string {
  return `chess:game:${gameId}:token`;
}
