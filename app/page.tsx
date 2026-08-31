import WeddingStage from '@/components/WeddingStage';

export default function Home() {
  return (
    <main className="stage">
      <WeddingStage />

      <div className="overlay">
        <header className="titles">
          <p className="kicker">Sunday 6 September</p>
          <h1 className="names">
            Oto <span className="amp">&amp;</span> Mari
          </h1>
          <p className="place">Tbilisi · dancing until the lights come on</p>
        </header>

        <nav className="actions" aria-label="Photo wall">
          <a className="btn btn--primary" href="/upload">
            Add your photos
          </a>
          <a className="btn" href="/gallery">
            See the gallery
          </a>
        </nav>
      </div>
    </main>
  );
}
