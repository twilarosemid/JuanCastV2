import { useEffect, useState } from 'react';
import { getJSON, img } from '../../api';
import { markStartupSeen, setStartupState, startupSeenThisVisit } from '../../startupAdGate';
import Modal from '../Modal/Modal';
import './StartupAd.css';

// Popup ad(s) shown when the home page opens, once per visit and again right after each login.
// Upload them in Admin > Ads (Where it shows: Startup popup). With several live, each one appears
// after the previous is closed. An ad with a link opens it in a new tab when tapped.
// The daily check-in waits for this popup (see startupAdGate), so the ad always comes first.
export default function StartupAd() {
  const [skip] = useState(startupSeenThisVisit);
  const [ads, setAds] = useState([]);
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (skip) { setStartupState('done'); return undefined; }
    setStartupState('checking');
    let alive = true;
    let timer;
    getJSON('/api/ads?placement=startup')
      .then((list) => {
        if (!alive) return;
        if (Array.isArray(list) && list.length) {
          setAds(list);
          // let the page settle a moment, then pop up
          timer = setTimeout(() => { setIndex(0); setOpen(true); setStartupState('showing'); markStartupSeen(); }, 600);
        } else {
          setStartupState('done');
        }
      })
      .catch(() => { if (alive) setStartupState('done'); });
    return () => { alive = false; clearTimeout(timer); setStartupState('done'); };
  }, [skip]);

  const finish = () => { setOpen(false); setStartupState('done'); };
  const close = () => {
    if (index + 1 < ads.length) setIndex(index + 1);
    else finish();
  };

  const ad = ads[index];
  if (skip || !ad) return null;

  const picture = <img src={img(ad.imageUrl)} alt={ad.altText || 'Advertisement'} draggable="false" />;

  return (
    <Modal open={open} onClose={close} label="Announcement" className="sa-modal">
      <div className="sa-wrap" key={ad._id || ad.id || index} onContextMenu={(e) => e.preventDefault()} onDragStart={(e) => e.preventDefault()}>
        <button type="button" className="sa-close" onClick={close} aria-label="Close">×</button>
        {ad.linkUrl ? (
          <a href={ad.linkUrl} target="_blank" rel="noopener noreferrer sponsored" onClick={finish} draggable="false">{picture}</a>
        ) : picture}
      </div>
    </Modal>
  );
}