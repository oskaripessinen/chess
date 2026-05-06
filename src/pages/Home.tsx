import { FormEvent, useState } from 'react';

type HomeProps = {
  onCreate: () => void;
  onJoin: (gameId: string) => void;
};

export function Home({ onCreate, onJoin }: HomeProps) {
  const [joinValue, setJoinValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const gameId = parseGameId(joinValue);

    if (!gameId) {
      setError('Enter a game code or link.');
      return;
    }

    onJoin(gameId);
  }

  return (
    <main className="center-page">
      <section className="home-card" aria-labelledby="home-title">
        <h1 id="home-title">Chess</h1>
        <div className="home-actions">
          <button type="button" onClick={onCreate}>
            Create new game
          </button>
        </div>
        <form className="join-form" onSubmit={handleSubmit}>
          <label htmlFor="game-code">Join with a code or link</label>
          <div className="inline-form-row">
            <input
              id="game-code"
              value={joinValue}
              onChange={(event) => {
                setError(null);
                setJoinValue(event.target.value);
              }}
              placeholder="abc123"
            />
            <button type="submit" className="secondary-button">
              Join
            </button>
          </div>
          {error ? <p className="form-error">{error}</p> : null}
        </form>
      </section>
    </main>
  );
}

function parseGameId(value: string): string | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    const parts = url.pathname.split('/').filter(Boolean);
    const gameIndex = parts.indexOf('g');

    if (gameIndex !== -1 && parts[gameIndex + 1]) {
      return parts[gameIndex + 1];
    }
  } catch {
    return trimmed.replace(/^g\//, '');
  }

  return trimmed;
}
