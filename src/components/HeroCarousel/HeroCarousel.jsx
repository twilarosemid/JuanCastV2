import { useEffect, useRef, useState } from 'react';
import { img } from '../../api';
import useDominantColor from '../../hooks/useDominantColor';
import './HeroCarousel.css';

const INTERVAL = 6000;

export default function HeroCarousel({ banners }) {
  const [index, setIndex] = useState(0);
  const active = banners[index];
  const tint = useDominantColor(active ? img(active.imageUrl) : '');
  const touchStart = useRef(null);
  // each banner's real width/height (used on mobile, where the frame follows the artwork)
  const [ratios, setRatios] = useState({});

  // page gradient follows the current banner
  useEffect(() => {
    document.documentElement.style.setProperty('--tint', tint);
  }, [tint]);

  // autoplay (restarts whenever the slide changes, including when a dot is clicked)
  useEffect(() => {
    if (banners.length < 2) return;
    const timer = setInterval(
      () => setIndex((i) => (i + 1) % banners.length),
      INTERVAL
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
      <div className="hero-frame" style={{ '--ar': ratios[active?._id] || '10 / 3' }}>
        {banners.map((banner, n) => (
          <img
            key={banner._id}
            className={`slide ${n === index ? 'active' : ''}`}
            src={img(banner.imageUrl)}
            alt={banner.altText || ''}
            draggable="false"
            onLoad={(e) => {
              const { naturalWidth: w, naturalHeight: h } = e.target;
              if (w && h) setRatios((r) => ({ ...r, [banner._id]: `${w} / ${h}` }));
            }}
          />
        ))}
      </div>

      {/* clickable dots: the current one stretches into a line that fills left to right */}
      {banners.length > 1 && (
        <div className="hero-dots" role="tablist" aria-label="Banners">
          {banners.map((banner, n) => (
            <button
              key={banner._id}
              type="button"
              role="tab"
              aria-selected={n === index}
              aria-label={`Show banner ${n + 1}`}
              className={`hero-dot ${n === index ? 'active' : ''}`}
              onClick={() => setIndex(n)}
            >
              <span className="bar">
                {n === index && <i key={index} style={{ animationDuration: `${INTERVAL}ms` }} />}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
