import { useEffect, useState } from 'react';
import { getJSON } from '../api';

// Active ads for one placement (e.g. 'market'). Stays empty if the request fails,
// so a broken ad service never breaks the page.
export default function useAds(placement = 'market', enabled = true) {
  const [ads, setAds] = useState([]);

  useEffect(() => {
    if (!enabled) { setAds([]); return undefined; }
    let alive = true;
    getJSON(`/api/ads?placement=${encodeURIComponent(placement)}`)
      .then((list) => { if (alive && Array.isArray(list)) setAds(list); })
      .catch(() => { if (alive) setAds([]); });
    return () => { alive = false; };
  }, [placement, enabled]);

  return ads;
}
