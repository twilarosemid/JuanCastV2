import { useEffect, useState } from 'react';
import './ScrollHint.css';

// Animated down arrow near the bottom of the screen: tells people the page keeps going.
// Shows while the page is at the top and still has content below; fades away once they scroll.
// Click / tap it to glide down one screen.
export default function ScrollHint() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const update = () => {
      const more = document.documentElement.scrollHeight - window.innerHeight > 80;
      setShow(more && window.scrollY < 60);
    };
    update();
    const t = setTimeout(update, 600); // content (banners, panels) can load after first paint
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      clearTimeout(t);
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  const goDown = () => window.scrollTo({ top: window.innerHeight * 0.9, behavior: 'smooth' });

  return (
    <button
      type="button"
      className={`scroll-hint${show ? ' on' : ''}`}
      onClick={goDown}
      aria-label="Scroll down"
      aria-hidden={!show}
      tabIndex={show ? 0 : -1}
    >
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m6 6 6 6 6-6" />
        <path d="m6 13 6 6 6-6" />
      </svg>
    </button>
  );
}
