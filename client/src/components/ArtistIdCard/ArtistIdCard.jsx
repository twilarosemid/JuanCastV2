import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { img } from '../../api';
import Modal from '../Modal/Modal';
import { SOCIAL_PLATFORMS, SocialIcon } from '../SocialLinks/SocialLinks';
import './ArtistIdCard.css';

const UserSvg = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
  </svg>
);
const CheckBadge = () => (
  <svg className="idc-check" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="10" fill="#2f7bff" /><path d="m7.5 12.3 3 3 6-6.3" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// Animated down arrow (same look as the banner's scroll hint): shows while the card has more below, hides at the bottom.
function useMoreBelow() {
  const [scroller, setScroller] = useState(null);
  const [more, setMore] = useState(false);
  // callback ref on the card: the scrolling element is the modal that wraps it
  const cardRef = useCallback((node) => setScroller(node ? node.closest('.idc-modal') : null), []);

  useEffect(() => {
    if (!scroller) return undefined;
    const update = () => setMore(scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight > 24);
    update();
    const t = setTimeout(update, 400); // photo / text can finish loading after first paint
    scroller.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    if (ro) { ro.observe(scroller); if (scroller.firstElementChild) ro.observe(scroller.firstElementChild); }
    return () => {
      clearTimeout(t);
      scroller.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      if (ro) ro.disconnect();
    };
  }, [scroller]);

  const goDown = () => scroller?.scrollBy({ top: scroller.clientHeight * 0.8, behavior: 'smooth' });
  return { cardRef, more, goDown };
}

// ---------------------------------------------------------------
// "View Profile" pop-up: the artist's ID card.
//   left : portrait (9:16) with the stage name under it
//   right: details in 2 columns (as many rows as the artist adds), then Facts (1 full-width column),
//          then link icons (only the socials the artist filled in)
// ---------------------------------------------------------------
export default function ArtistIdModal({ open, onClose, profile }) {
  const stageName = profile.stageName || profile.name;
  const photo = profile.idPhoto || profile.avatar;
  const details = (profile.idDetails || []).filter((row) => row.label || row.value);
  const facts = (profile.idFacts || []).filter(Boolean);
  const links = SOCIAL_PLATFORMS.filter(({ key }) => profile.socialLinks?.[key]);
  const nothingYet = !details.length && !facts.length && !links.length;
  const { cardRef, more, goDown } = useMoreBelow();

  return (
    <Modal open={open} onClose={onClose} label={`${stageName} artist ID`} className="idc-modal">
      <article className="idc" ref={cardRef}>
        <header className="idc-top">
          <span className="idc-slot" aria-hidden="true" />
          <span className="idc-brand">JuanCast · Artist ID</span>
          <button type="button" className="idc-x" onClick={onClose} aria-label="Close">×</button>
        </header>

        <div className="idc-body">
          <figure className="idc-left">
            <div className="idc-photo">
              {photo ? <img src={img(photo)} alt={stageName} /> : <UserSvg />}
            </div>
            <figcaption className="idc-name">
              <h1>{stageName}<CheckBadge /></h1>
              {profile.username
                ? <Link to={`/profile/${encodeURIComponent(profile.username)}`} className="idc-handle" onClick={onClose} title="View profile" aria-label={`View ${stageName}'s profile`}>@{profile.username}</Link>
                : <span>@{profile.username}</span>}
            </figcaption>
          </figure>

          <div className="idc-right">
            {details.length > 0 && (
              <dl className="idc-grid">
                {details.map((row, n) => (
                  <div className="idc-cell" key={`${row.label}-${n}`}>
                    <dt>{row.label}</dt>
                    <dd>{row.value || '—'}</dd>
                  </div>
                ))}
              </dl>
            )}

            {facts.length > 0 && (
              <section className="idc-facts" aria-label={`${stageName} facts`}>
                <h2>{stageName} Facts</h2>
                <ul>
                  {facts.map((fact, n) => <li key={`${n}-${fact.slice(0, 12)}`}>{fact}</li>)}
                </ul>
              </section>
            )}

            {links.length > 0 && (
              <nav className="idc-links" aria-label={`${stageName} links`}>
                {links.map(({ key, label }) => (
                  <a key={key} href={profile.socialLinks[key]} target="_blank" rel="noopener noreferrer" aria-label={label} title={label}>
                    <SocialIcon platform={key} />
                  </a>
                ))}
              </nav>
            )}

            {nothingYet && (
              <div className="idc-empty">
                This artist hasn&apos;t filled in their ID yet.
              </div>
            )}
          </div>
        </div>
      </article>
      <div className="idc-hint" aria-hidden={!more}>
        <button type="button" className={`idc-hint-btn${more ? ' on' : ''}`} onClick={goDown} aria-label="Scroll down" tabIndex={more ? 0 : -1}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 4v15" />
            <path d="m5.5 12.5 6.5 6.5 6.5-6.5" />
          </svg>
        </button>
      </div>
    </Modal>
  );
}
