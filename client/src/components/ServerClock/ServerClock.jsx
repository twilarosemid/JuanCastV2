import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import './ServerClock.css';

// The server time in its own pill. It sits above the poll details; once the details have scrolled
// out of view the same pill floats at the top of the screen so the time stays visible.
export default function ServerClock({ text, live = true, watchRef }) {
  const [floating, setFloating] = useState(false);

  useEffect(() => {
    const check = () => {
      const el = watchRef?.current;
      if (!el) return;
      setFloating(el.getBoundingClientRect().bottom < 90);
    };
    check();
    window.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    return () => {
      window.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
    };
  }, [watchRef]);

  const pill = (
    <div className="server-clock" role="timer" aria-label="Server time">
      {live && <span className="live-dot" aria-hidden="true" />}
      <span className="sc-label">Server time</span>
      <time className="sc-time">{text}</time>
    </div>
  );

  return (
    <>
      {/* in-flow copy keeps its space (hidden while the floating one is showing) so the page never jumps */}
      <div className={`server-clock-slot${floating ? ' away' : ''}`}>{pill}</div>
      {floating && createPortal(<div className="server-clock-float">{pill}</div>, document.body)}
    </>
  );
}
