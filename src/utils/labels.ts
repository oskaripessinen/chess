import type { GameResult, GameStatus, PlayerColor, PlayerRole, TimeControl } from '../types/messages';

export function describeTimeControl(timeControl: TimeControl): string {
  if (timeControl === '5min') {
    return '5 minutes';
  }

  if (timeControl === '10min') {
    return '10 minutes';
  }

  return 'No time limit';
}

export function describeColor(color: PlayerColor): string {
  return color === 'white' ? 'White' : 'Black';
}

export function describeRole(role: PlayerRole): string {
  if (role === 'spectator') {
    return 'Spectator';
  }

  return describeColor(role);
}

export function describeStatus(status: GameStatus): string {
  if (status === 'waiting') {
    return 'Waiting for a player';
  }

  if (status === 'active') {
    return 'Game in progress';
  }

  return 'Game over';
}

export function describeGameResult(result: GameResult): string {
  if (!result.winner) {
    return describeDrawResult(result.reason);
  }

  return `${describeColor(result.winner)} won by ${describeWinReason(result.reason)}.`;
}

function describeDrawResult(reason: GameResult['reason']): string {
  if (reason === 'stalemate') {
    return 'Draw by stalemate.';
  }

  return 'Draw.';
}

function describeWinReason(reason: GameResult['reason']): string {
  if (reason === 'checkmate') {
    return 'checkmate';
  }

  if (reason === 'resignation') {
    return 'resignation';
  }

  if (reason === 'timeout') {
    return 'timeout';
  }

  return 'game result';
}
