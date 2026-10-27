import { useEffect, useRef, useState } from 'react';
import { img } from '../../api';
import useDominantColor from '../../hooks/useDominantColor';
import './HeroCarousel.css';

export default function HeroCarousel({ banners }) {
  const [index, setIndex] = useState(0);
  const active = banners[index];
  const tint = useDominantColor(active ? img(active.imageUrl) : '');
  const touchStart = useRef(null);

  // page gradient follows the current banner
  useEffect(() => {
    document.documentElement.style.setProperty('--tint', tint);
  }, [tint]);

  // autoplay (restarts whenever the slide changes)
  useEffect(() => {
    if (banners.length < 2) return;
    const timer = setInterval(
      () => setIndex((i) => (i + 1) % banners.length),
      6000
    );
    return () => clearInterval(timer);
  }, [banners.length, index]);

  return (
    <section
      className="hero"
      id="top"
      onTouchStart={(e) => { touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
      onTouchEnd={(e) => {
        const s = touchStart.current; touchStart.current = null;
        if (!s || banners.length < 2) return;
        const dx = e.changedTouches[0].clientX - s.x;
        const dy = e.changedTouches[0].clientY - s.y;
        if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.3) {
          setIndex((i) => (i + (dx < 0 ? 1 : -1) + banners.length) % banners.length);
        }
      }}
    >
      <div className="hero-frame">
        {banners.map((banner, n) => {
          const url = img(banner.imageUrl);
          return (
            <div key={banner._id} className={`slide ${n === index ? 'active' : ''}`} role="img" aria-label={banner.altText}>
              {/* blurred copy fills any leftover space so the real image can be shown uncropped */}
              <div className="slide-fill" style={{ backgroundImage: `url("${url}")` }} />
              <img className="slide-img" src={url} alt="" draggable="false" />
            </div>
          );
        })}
        <div className="dots">
          {banners.map((banner, n) => (
            <button
              key={banner._id}
              className={n === index ? 'on' : ''}
              onClick={() => setIndex(n)}
              aria-label={`Slide ${n + 1}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
