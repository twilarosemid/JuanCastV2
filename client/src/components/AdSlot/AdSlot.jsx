import { useEffect, useState } from 'react';
import { img } from '../../api';
import './AdSlot.css';

const ROTATE_MS = 7000;

// Tall (1:2) ad pinned beside the page (desktop web only, see useWebAds).
// One ad shows as-is; several crossfade on their own. Visitors can't pick, pause or drag them.
export default function AdSlot({ ads }) {
  const [index, setIndex] = useState(0);
  const count = ads.length;

  useEffect(() => { if (index >= count) setIndex(0); }, [count, index]);

  useEffect(() => {
    if (count < 2) return undefined;
    const id = setTimeout(() => setIndex((i) => (i + 1) % count), ROTATE_MS);
    return () => clearTimeout(id);
  }, [count, index]);

  if (!count) return null;

  return (
    <aside className="ad-slot" aria-label="Advertisement" onContextMenu={(e) => e.preventDefault()}>
      <div className="ad-slot-frame">
        {ads.map((ad, n) => {
          const picture = <img src={img(ad.imageUrl)} alt={ad.altText || 'Advertisement'} draggable="false" />;
          return (
            <div key={ad._id || ad.id || n} className={`ad-slot-item${n === index ? ' on' : ''}`} aria-hidden={n !== index}>
              {ad.linkUrl ? (
                <a href={ad.linkUrl} target="_blank" rel="noopener noreferrer sponsored" tabIndex={n === index ? 0 : -1} draggable="false">{picture}</a>
              ) : picture}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
