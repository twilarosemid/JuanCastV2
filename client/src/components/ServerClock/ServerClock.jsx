import { useEffect, useRef, useState } from 'react';
import './ServerClock.css';

// The server time in its own container. It is as wide as the poll details card and sticks under the top bar
// while you scroll; the moment it is stuck it shrinks to a centred pill the size of its content.
export default function ServerClock({ text, live = true }) {
  const ref = useRef(null);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const check = () => {
      const el = ref.current;
      if (!el) return;
      const top = parseFloat(getComputedStyle(el).top) || 0; // where it sticks (set in the CSS)
      setStuck(el.getBoundingClientRect().top <= top + 1);
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
      <time className="sc-time">{text}</time>
    </div>
  );
}
