import { FormEvent, useState } from 'react';
import { createGame } from '../utils/api';
import { storePlayerToken } from '../utils/playerTokens';
import type { ColorChoice, TimeControl } from '../types/messages';

type CreateProps = {
  onBack: () => void;
  onCreated: (gameId: string) => void;
};

export function Create({ onBack, onCreated }: CreateProps) {
  const [timeControl, setTimeControl] = useState<TimeControl>('10min');
  const [playerColor, setPlayerColor] = useState<ColorChoice>('random');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await createGame({ timeControl, playerColor });
      storePlayerToken(response.gameId, response.playerToken);
      onCreated(response.gameId);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Failed to create the game.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="center-page">
      <form className="panel settings-panel" onSubmit={handleSubmit}>
        <button type="button" className="link-button" onClick={onBack}>
          Back
        </button>
        <div>
          <h1>Game settings</h1>
        </div>

        <fieldset>
          <legend>Time</legend>
          <label>
            <input
              type="radio"
              name="timeControl"
              value="5min"
              checked={timeControl === '5min'}
              onChange={() => setTimeControl('5min')}
            />
            5 minutes
          </label>
          <label>
            <input
              type="radio"
              name="timeControl"
              value="10min"
              checked={timeControl === '10min'}
              onChange={() => setTimeControl('10min')}
            />
            10 minutes
          </label>
          <label>
            <input
              type="radio"
              name="timeControl"
              value="none"
              checked={timeControl === 'none'}
              onChange={() => setTimeControl('none')}
            />
            No time limit
          </label>
        </fieldset>

        <fieldset>
          <legend>Color choice</legend>
          <label>
            <input
              type="radio"
              name="playerColor"
              value="white"
              checked={playerColor === 'white'}
              onChange={() => setPlayerColor('white')}
            />
            White
          </label>
          <label>
            <input
              type="radio"
              name="playerColor"
              value="black"
              checked={playerColor === 'black'}
              onChange={() => setPlayerColor('black')}
            />
            Black
          </label>
          <label>
            <input
              type="radio"
              name="playerColor"
              value="random"
              checked={playerColor === 'random'}
              onChange={() => setPlayerColor('random')}
            />
            Random
          </label>
        </fieldset>

        {error ? <p className="form-error">{error}</p> : null}

        <button type="submit" disabled={submitting}>
          {submitting ? 'Creating...' : 'Create game'}
        </button>
      </form>
    </main>
  );
}
