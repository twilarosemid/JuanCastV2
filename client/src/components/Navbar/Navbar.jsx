import './Navbar.css';

export default function Navbar() {
  return (
    <nav>
      <div className="logo">JuanCast</div>
      <div className="pill">
        <a className="on" href="#top">Home</a>
        <a href="#vote">Vote</a>
        <a href="#chika">Community</a>
        <a href="#market">Market</a>
      </div>
    </nav>
  );
}
