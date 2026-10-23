import './Placeholder.css';

// Stand-in for pages you haven't built yet. Replace each route in App.jsx with the real page.
export default function Placeholder({ title }) {
  return (
    <main className="subpage">
      <div className="subpage-inner">
        <h1 className="subpage-title rise">{title}</h1>
        <p className="subpage-note rise" style={{ '--d': '120ms' }}>Coming soon.</p>
      </div>
    </main>
  );
}
