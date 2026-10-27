import { useEffect, useRef, useState } from 'react';
import { img } from '../../api';
import useDominantColor from '../../hooks/useDominantColor';
import './HeroCarousel.css';

export default function HeroCarousel({ banners }) {
  const [index, setIndex] = useState(0);
  const active = banners[index];
  const tint = useDominantColor(active ? img(active.imageUrl) : '');
  const touchStart = useRef(null);
  // each banner's real width/height, so the frame always matches the artwork (no crop, no letterbox)
  const [ratios, setRatios] = useState({});

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
      <div className="hero-frame" style={{ aspectRatio: ratios[active?._id] || '10 / 3' }}>
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
      {/* same thin line as the Polls carousel: fills over the autoplay interval */}
      {banners.length > 1 && (
        <div className="hero-progress" aria-hidden="true">
          <span key={index} style={{ animationDuration: '6000ms' }} />
        </div>
      )}
    </section>
  );
}
