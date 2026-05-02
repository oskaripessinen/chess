export function App() {
  return (
    <main className="home-page">
      <section className="home-card" aria-labelledby="home-title">
        <p className="home-kicker">Kahden pelaajan peli</p>
        <h1 id="home-title">Shakki</h1>
        <div className="home-actions">
          <button type="button">Luo uusi peli</button>
          <button type="button" className="secondary-button">
            Liity peliin
          </button>
        </div>
      </section>
    </main>
  );
}
