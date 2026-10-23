import './Atmosphere.css';

// The Home page gets its glow from the hero banner. Every other page gets this:
// the same tinted gradient plus two slowly drifting orbs.
export default function Atmosphere() {
  return (
    <div className="atmos" aria-hidden="true">
      <span className="orb o1" />
      <span className="orb o2" />
    </div>
  );
}
