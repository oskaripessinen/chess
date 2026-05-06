import type { MoveRecord } from '../types/messages';

type MoveHistoryProps = {
  moves: MoveRecord[];
};

export function MoveHistory({ moves }: MoveHistoryProps) {
  const rows = [];

  for (let index = 0; index < moves.length; index += 2) {
    rows.push({ number: index / 2 + 1, white: moves[index], black: moves[index + 1] });
  }

  return (
    <section className="move-history">
      <div className="section-heading">
        <h2>Moves</h2>
        <span>{moves.length}</span>
      </div>
      {rows.length === 0 ? (
        <p className="muted-text">No moves yet.</p>
      ) : (
        <ol>
          {rows.map((row) => (
            <li key={row.number}>
              <span className="move-number">{row.number}.</span>
              <span>{row.white?.san ?? ''}</span>
              <span>{row.black?.san ?? ''}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
