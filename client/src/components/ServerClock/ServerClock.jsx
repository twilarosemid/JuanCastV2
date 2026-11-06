import { useEffect, useRef, useState } from 'react';
import './ServerClock.css';

// The server time in its own container. It is as wide as the poll details card; as you scroll it moves up to the
// top bar's row (same level as the logo and the nav), sticks there and shrinks to a small centred pill with just the time.
export default function ServerClock({ text, shortText, live = true }) {
  const ref = useRef(null);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const check = () => {
      const el = ref.current;
      if (!el) return;
      const top = parseFloat(getComputedStyle(el).top) || 0; // where it sticks (set in the CSS)
      setStuck(el.getBoundingClientRect().top <= top + 60); // start shrinking a little before it reaches the top bar row
    };
    check();
    window.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    return () => {
      window.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
    };
  }, []);

  return (
    <div ref={ref} className={`server-clock${stuck ? ' stuck' : ''}`} role="timer" aria-label="Server time">
      {live && <span className="live-dot" aria-hidden="true" />}
      <span className="sc-label">Server time</span>
      <time className="sc-full">{text}</time>
      <time className="sc-short">{shortText || text}</time>
    </div>
  );
}
