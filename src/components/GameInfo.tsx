import type { PublicGameState } from '../types/messages';
import {
  describeColor,
  describeGameResult,
  describeRole,
  describeStatus,
  describeTimeControl,
} from '../utils/labels';

type GameInfoProps = {
  state: PublicGameState;
  connected: boolean;
  error: string | null;
};

export function GameInfo({ state, connected, error }: GameInfoProps) {
  const opponentConnected = getOpponentConnected(state);

  return (
    <section className="game-info">
      <h1>{describeStatus(state.status)}</h1>
      {state.result ? <p className="result-text">{describeGameResult(state.result)}</p> : null}
      <dl className="summary-list compact-list">
        <div>
          <dt>Role</dt>
          <dd>{describeRole(state.role)}</dd>
        </div>
        <div>
          <dt>Turn</dt>
          <dd>{describeColor(state.turn === 'w' ? 'white' : 'black')}</dd>
        </div>
        <div>
          <dt>Time</dt>
          <dd>{describeTimeControl(state.settings.timeControl)}</dd>
        </div>
        <div>
          <dt>Connection</dt>
          <dd>{connected ? 'Open' : 'Disconnected'}</dd>
        </div>
        <div>
          <dt>Opponent</dt>
          <dd>{opponentConnected}</dd>
        </div>
      </dl>
      {error ? <p className="form-error">{error}</p> : null}
    </section>
  );
}

function getOpponentConnected(state: PublicGameState): string {
  const connected = state.role === 'white' ? state.players.blackConnected : state.players.whiteConnected;
  return connected ? 'Online' : 'Offline';
}
