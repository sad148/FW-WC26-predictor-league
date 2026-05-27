export default function MyBetsPage() {
  return (
    <section>
      <div className="sh">
        <div className="sh-title">MY BETS</div>
        <div className="sh-sub">Coming next: history + stats.</div>
      </div>
      <div className="empty-state">
        <div className="ei">🚧</div>
        <h3>Under construction</h3>
        <p>This page will pull your bets from <code>/api/bets</code>. Wired up next.</p>
      </div>
    </section>
  );
}
