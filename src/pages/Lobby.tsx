import { useState } from 'react';
import type { PublicGameState } from '../types/messages';
import { describeColor, describeTimeControl } from '../utils/labels';

type LobbyProps = {
  state: PublicGameState;
  connected: boolean;
  error: string | null;
};

export function Lobby({ state, connected, error }: LobbyProps) {
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}/g/${state.gameId}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <main className="center-page">
      <section className="panel lobby-panel">
        <p className="kicker">Lobby</p>
        <h1>Waiting for an opponent</h1>
        <p className="muted-text">
          {connected ? 'Connection is open.' : 'Reconnecting.'} {error ?? ''}
        </p>

        <div className="share-box">
          <label htmlFor="share-link">Share this link</label>
          <div className="inline-form-row">
            <input id="share-link" readOnly value={link} />
            <button type="button" className="secondary-button" onClick={copyLink}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>

        <dl className="summary-list">
          <div>
            <dt>Time</dt>
            <dd>{describeTimeControl(state.settings.timeControl)}</dd>
          </div>
          <div>
            <dt>Color</dt>
            <dd>{state.role === 'spectator' ? 'Spectator' : describeColor(state.role)}</dd>
          </div>
          <div>
            <dt>Spectators</dt>
            <dd>{state.settings.allowSpectators ? 'Allowed' : 'Not allowed'}</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
