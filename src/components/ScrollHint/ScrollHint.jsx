import { useEffect, useState } from 'react';
import useDesktopWeb from '../../hooks/useDesktopWeb';
import './ScrollHint.css';

// Animated down arrow near the bottom of the screen: tells people the page keeps going.
// Shows while the page is at the top and still has content below; fades away once they scroll.
// Click / tap it to glide down one screen.
export default function ScrollHint() {
  const desktop = useDesktopWeb(); // web only: phones / tablets / the app never get it
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!desktop) return undefined;
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
  }, [desktop]);

  const goDown = () => window.scrollTo({ top: window.innerHeight * 0.9, behavior: 'smooth' });

  if (!desktop) return null;

  return (
    <button
      type="button"
      className={`scroll-hint${show ? ' on' : ''}`}
      onClick={goDown}
      aria-label="Scroll down"
      aria-hidden={!show}
      tabIndex={show ? 0 : -1}
    >
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 4v15" />
        <path d="m5.5 12.5 6.5 6.5 6.5-6.5" />
      </svg>
    </button>
  );
}
