import { useEffect, useRef, useState } from 'react';
import { img } from '../../api';
import './PhotoCarousel.css';

// Instagram-style photo viewer: swipe (or use the arrows / dots) through a post's photos.
// One photo renders as a plain image. Double-tap / double-click calls onDoubleTap and plays a heart burst.
export default function PhotoCarousel({ images = [], ratio = '1 / 1', alt = 'Post photo', onDoubleTap, initialIndex = 0 }) {
  const trackRef = useRef(null);
  const lastTap = useRef(0);
  const [index, setIndex] = useState(0);
  const [burst, setBurst] = useState(0);
  const count = images.length;

  // open on a specific photo (e.g. coming from the Media tab)
  useEffect(() => {
    const el = trackRef.current;
    if (!el || initialIndex <= 0) return;
    el.scrollLeft = initialIndex * el.clientWidth;
    setIndex(initialIndex);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!count) return null;

  const goTo = (n) => {
    const el = trackRef.current;
    if (!el) return;
    const next = Math.max(0, Math.min(count - 1, n));
    el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' });
  };
  const onScroll = () => {
    const el = trackRef.current;
    if (!el || !el.clientWidth) return;
    setIndex(Math.round(el.scrollLeft / el.clientWidth));
  };
  const onTap = () => {
    if (!onDoubleTap) return;
    const now = Date.now();
    if (now - lastTap.current < 320) {
      lastTap.current = 0;
      onDoubleTap();
      setBurst((n) => n + 1);
    } else {
      lastTap.current = now;
    }
  };
  const onKeyDown = (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); goTo(index + 1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(index - 1); }
  };

  return (
    <div className="pc" style={{ '--pc-ratio': ratio }}>
      <div
        ref={trackRef}
        className="pc-track"
        onScroll={onScroll}
        onClick={onTap}
        onKeyDown={count > 1 ? onKeyDown : undefined}
        tabIndex={count > 1 ? 0 : undefined}
        role={count > 1 ? 'group' : undefined}
        aria-roledescription={count > 1 ? 'carousel' : undefined}
        aria-label={count > 1 ? `${alt}s, ${count} photos` : undefined}
      >
        {images.map((url, n) => (
          <div className="pc-slide" key={`${url}-${n}`} aria-label={count > 1 ? `Photo ${n + 1} of ${count}` : undefined}>
            <img src={img(url)} alt={alt} loading={n === 0 ? 'eager' : 'lazy'} draggable="false" />
          </div>
        ))}
      </div>

      {count > 1 && (
        <>
          <span className="pc-count" aria-hidden="true">{index + 1}/{count}</span>
          {index > 0 && <button type="button" className="pc-nav prev" onClick={() => goTo(index - 1)} aria-label="Previous photo">‹</button>}
          {index < count - 1 && <button type="button" className="pc-nav next" onClick={() => goTo(index + 1)} aria-label="Next photo">›</button>}
          <div className="pc-dots" aria-hidden="true">
            {images.map((url, n) => <span key={`${url}-${n}`} className={n === index ? 'on' : ''} />)}
          </div>
        </>
      )}

      {burst > 0 && (
        <svg key={burst} className="pc-heart" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.7 4.8 6.2 4.5c2-.2 3.9.8 5.8 3 1.9-2.2 3.8-3.2 5.8-3 3.5.3 5.3 3.9 3.8 7.3C19.5 16.4 12 21 12 21z" fill="#fff" />
        </svg>
      )}
    </div>
  );
}
