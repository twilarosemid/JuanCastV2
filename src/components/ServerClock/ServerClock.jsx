import { useEffect, useRef, useState } from 'react';
import './ServerClock.css';

// The server time in its own container. It is as wide as the poll details card; as you scroll it moves up to the
// top bar's row (same level as the logo and the nav), sticks there and shrinks to a centred pill. Nothing is dropped: the dot,
// the label, the date and the time all stay (on phones they stack on two lines so the pill fits between the logo and the buttons).
export default function ServerClock({ text, live = true }) {
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
      <span className="sc-head">
        {live && <span className="live-dot" aria-hidden="true" />}
        <span className="sc-label">Server time</span>
      </span>
      <time className="sc-time">{text}</time>
    </div>
  );
}
