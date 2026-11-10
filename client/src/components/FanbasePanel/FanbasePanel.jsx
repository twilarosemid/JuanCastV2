import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { API, getJSON, getUser, img } from '../../api';
import Modal from '../Modal/Modal';
import PhotoCarousel from '../PhotoCarousel/PhotoCarousel';
import './FanbasePanel.css';

const bg = (url) => (url ? { backgroundImage: `url("${img(url)}")` } : undefined);
const nf = (n) => Number(n || 0).toLocaleString('en-US');
const peso = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// 06.05.2026 | 5:45PM
const fmtWhen = (value) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const h = d.getHours() % 12 || 12;
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}.${mm}.${d.getFullYear()} | ${h}:${min}${d.getHours() < 12 ? 'AM' : 'PM'}`;
};

const StarIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2.8 2.7 5.8 6.3.8-4.6 4.3 1.2 6.3L12 17l-5.6 3 1.2-6.3L3 9.4l6.3-.8z" fill="#f7d98a" stroke="#f0c25a" strokeWidth="1.2" strokeLinejoin="round" /></svg>
);
const CommentIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5c-4.7 0-8.5 3.2-8.5 7.2 0 2.2 1.1 4.1 2.9 5.4L5.5 20l3.9-2c.8.2 1.7.3 2.6.3 4.7 0 8.5-3.2 8.5-7.2S16.700 3.500 12 3.500z" fill="#b7bcc9" /><circle cx="8.500" cy="10.800" r="1.100" fill="#fff" /><circle cx="12" cy="10.800" r="1.100" fill="#fff" /><circle cx="15.500" cy="10.800" r="1.100" fill="#fff" /></svg>
);
const Verified = () => (
  <svg className="fb-verified" viewBox="0 0 24 24" role="img" aria-label="Verified"><circle cx="12" cy="12" r="10" fill="#2f7bff" /><path d="m7.500 12.300 3 3 6-6.300" fill="none" stroke="#fff" strokeWidth="2.200" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
const LockIcon = () => (
  <svg viewBox="0 0 64 80" aria-hidden="true"><path d="M16 34V24a16 16 0 0 1 32 0v10" fill="none" stroke="#fff" strokeWidth="8" strokeLinecap="round" /><rect x="6" y="32" width="52" height="42" rx="9" fill="#fff" /><circle cx="32" cy="50" r="5.500" fill="#9a9a9a" /><rect x="29.500" y="52" width="5" height="12" rx="2.500" fill="#9a9a9a" /></svg>
);
const FANBASE_SOCIALS = [
  ['instagram', 'Instagram'], ['tiktok', 'TikTok'], ['x', 'X'], ['youtube', 'YouTube'],
  ['spotify', 'Spotify'], ['appleMusic', 'Apple Music'], ['facebook', 'Facebook'], ['threads', 'Threads']
];

function FanbaseSocialIcon({ platform }) {
  if (platform === 'instagram') return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.8" r="1" fill="currentColor" stroke="none" /></svg>;
  if (platform === 'tiktok') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3v11.2a4 4 0 1 1-3.5-4v3a1.2 1.2 0 1 0 .5 1V3h3c.4 2.4 1.8 3.8 4 4.2v3.1A8 8 0 0 1 14 8.5" /></svg>;
  if (platform === 'x') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 3h4.5l11.5 18h-4.5L4 3Zm0 18 7-8m2-2 7-8" /></svg>;
  if (platform === 'youtube') return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="5" width="19" height="14" rx="4" /><path d="m10 9 5 3-5 3z" fill="currentColor" stroke="none" /></svg>;
  if (platform === 'spotify') return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M6.5 9.5c4.4-1.3 8.7-.8 11.6 1M7.5 12.5c3.4-1 6.8-.6 9.3.8M8.5 15.4c2.6-.7 5-.4 6.9.7" /></svg>;
  if (platform === 'threads') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.7 10.6C17.2 7.4 15.1 5.5 12 5.5c-3.3 0-5.5 2.5-5.5 6.5s2.2 6.5 5.6 6.5c2.9 0 4.6-1.5 4.6-3.4 0-2.1-1.8-3.2-4.3-3.2-1.7 0-2.8.8-2.8 2 0 1 .9 1.7 2.2 1.7 1.8 0 3-1.3 3-3.6v-.6" /></svg>;
  if (platform === 'appleMusic') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16.8 4.5v12.1a2.8 2.8 0 1 1-1.8-2.6V8.1l-6.1 1.3v8.4a2.8 2.8 0 1 1-1.8-2.6V7.9l9.7-2.1Z" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 21v-8h2.7l.4-3h-3.1V8.1c0-.9.3-1.5 1.6-1.5h1.7V3.9c-.3 0-1.3-.1-2.4-.1-2.4 0-4 1.5-4 4.2V10H7.7v3h2.7v8z" fill="currentColor" stroke="none" /></svg>;
}

// every photo of a post (older posts only have imageUrl)
const photosOf = (post) => (post.images?.length ? post.images : (post.imageUrl ? [post.imageUrl] : []));

function PostCard({ post, onClick, focused = false, startIndex = 0 }) {
  const images = photosOf(post);
  // posts written by an artist link to that artist's profile
  const artistPath = post.source === 'artist' && post.authorUsername ? `/profile/${encodeURIComponent(post.authorUsername)}` : '';
  return (
    <article id={`fb-post-${post._id}`} className={`fb-post${images.length ? ' has-photo' : ''}${onClick ? ' clickable' : ''}${focused ? ' focused' : ''}`} onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter') onClick(); } : undefined}>
      {images.length > 1 && <PhotoCarousel images={images} ratio="4 / 3" initialIndex={startIndex} />}
      {images.length === 1 && <span className="fb-post-photo" style={bg(images[0])} role="img" aria-label="Post photo" />}
      <div className="fb-post-main">
        {artistPath
          ? <Link to={artistPath} className="fb-post-av" style={bg(post.authorAvatarUrl)} aria-label={`${post.authorName}'s profile`} />
          : <span className="fb-post-av" style={bg(post.authorAvatarUrl)} />}
        <div className="fb-post-body">
          <div className="fb-post-name">
            {artistPath ? <Link to={artistPath} className="fb-post-link">{post.authorName}</Link> : post.authorName}
            {post.verified !== false && <Verified />}
          </div>
          {post.text && <p>{post.text}</p>}
          <div className="fb-post-meta">
            <time>{fmtWhen(post.postedAt)}</time>
            <div className="fb-post-stats">
              <span><StarIcon />{nf(post.likes)}</span>
              <span><CommentIcon />{nf(post.comments)}</span>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

// blurred stand-in rows with the lock on top: the real posts never leave the server for non-subscribers
function LockedBlock({ count }) {
  return (
    <div className="fb-locked">
      <div className="fb-locked-rows" aria-hidden="true">
        {[0, 1, 2].map((n) => (
          <div className="fb-post ghost" key={n}>
            <span className="fb-post-av" />
            <div className="fb-post-body"><div className="ghost-bar w40" /><div className="ghost-bar w80" /><div className="ghost-bar w25" /></div>
            {n === 1 && <span className="fb-post-photo" />}
          </div>
        ))}
      </div>
      <div className="fb-lock-overlay" role="note">
        <LockIcon />
        <strong>SUBSCRIBE TO VIEW</strong>
        {count > 0 && <small>{nf(count)} more {count === 1 ? 'post' : 'posts'} on this board</small>}
      </div>
    </div>
  );
}

// Full-screen photo viewer for the Media tab. "View Post" jumps to that photo's post on the Board.
function Lightbox({ photos, index, onIndex, onClose, onViewPost }) {
  const photo = photos[index];
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onIndex(Math.max(0, index - 1));
      if (e.key === 'ArrowRight') onIndex(Math.min(photos.length - 1, index + 1));
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [index, photos.length, onClose, onIndex]);

  if (!photo) return null;
  return createPortal(
    <div className="fb-lb" role="dialog" aria-modal="true" aria-label="Photo viewer" onClick={onClose}>
      <button type="button" className="fb-lb-close" onClick={onClose} aria-label="Close photo">×</button>
      <div className="fb-lb-stage" onClick={(e) => e.stopPropagation()}>
        <img src={img(photo.url)} alt="Fanbase photo" />
        {index > 0 && <button type="button" className="fb-lb-nav prev" onClick={() => onIndex(index - 1)} aria-label="Previous photo">‹</button>}
        {index < photos.length - 1 && <button type="button" className="fb-lb-nav next" onClick={() => onIndex(index + 1)} aria-label="Next photo">›</button>}
      </div>
      <div className="fb-lb-bar" onClick={(e) => e.stopPropagation()}>
        <span>{index + 1} / {photos.length}</span>
        <button type="button" className="fb-subscribe fb-lb-view" onClick={() => onViewPost(photo)}>View Post</button>
      </div>
    </div>,
    document.body
  );
}

function ArtistCard({ fanbase, onOpen, index = 0 }) {
  return (
    <button type="button" className="fb-card" style={{ '--i': index }} onClick={() => onOpen(fanbase._id)}>
      <span className="fb-card-img" style={bg(fanbase.avatarUrl || fanbase.imageUrl)} />
      {fanbase.price > 0 && <span className="fb-card-price">Php {nf(fanbase.price)}/mo</span>}
      <span className="fb-card-meta">
        <strong>{fanbase.name}</strong>
        <small>{nf(fanbase.subscriberCount)} {Number(fanbase.subscriberCount) === 1 ? 'subscriber' : 'subscribers'}</small>
      </span>
    </button>
  );
}

function FeaturedCard({ post, fanbase, onOpen }) {
  const cover = post.imageUrl || fanbase?.imageUrl || fanbase?.avatarUrl;
  return (
    <article className={`fb-feature${onOpen ? ' clickable' : ''}`} onClick={onOpen} role={onOpen ? 'button' : undefined} tabIndex={onOpen ? 0 : undefined}
      onKeyDown={onOpen ? (e) => { if (e.key === 'Enter') onOpen(); } : undefined}>
      <span className="fb-feature-img" style={bg(cover)} />
      <div className="fb-feature-body">
        <span className="fb-feature-name">{post.authorName || fanbase?.name}{post.verified !== false && <Verified />}</span>
        {post.text && <p>{post.text}</p>}
        <div className="fb-post-meta">
          <time>{fmtWhen(post.postedAt)}</time>
          <div className="fb-post-stats">
            <span><StarIcon />{nf(post.likes)}</span>
            <span><CommentIcon />{nf(post.comments)}</span>
          </div>
        </div>
      </div>
    </article>
  );
}

function Board({ id, onBack }) {
  const user = getUser();
  const [state, setState] = useState({ loading: true, error: '', data: null });
  const [tab, setTab] = useState('board');
  const [soon, setSoon] = useState(false);
  const [lightbox, setLightbox] = useState(null); // index into the Media photos
  const [focus, setFocus] = useState(null);       // { postId, index }: a post to scroll to on the Board

  useEffect(() => {
    let alive = true;
    setState({ loading: true, error: '', data: null });
    setTab('board');
    setLightbox(null);
    setFocus(null);
    const qs = user?.email ? `?email=${encodeURIComponent(user.email)}` : '';
    getJSON(`/api/fanbases/${id}/board${qs}`)
      .then((data) => { if (alive) setState({ loading: false, error: '', data }); })
      .catch((err) => { if (alive) setState({ loading: false, error: err?.message || 'Could not load this board.', data: null }); });
    return () => { alive = false; };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // after "View Post": scroll to that post on the Board, highlight it for a moment, then let go
  useEffect(() => {
    if (!focus || tab !== 'board') return undefined;
    const el = document.getElementById(`fb-post-${focus.postId}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const timer = setTimeout(() => setFocus(null), 2600);
    return () => clearTimeout(timer);
  }, [focus, tab]);

  if (state.loading) {
    return <div className="fb-board" />;
  }
  if (state.error || !state.data) {
    return (
      <div className="fb-board">
        <button type="button" className="fb-back" onClick={onBack}>← Fanbase</button>
        <div className="feed-empty">{state.error || 'Fanbase not found.'}</div>
      </div>
    );
  }

  const { fanbase, locked, total, posts, members = [], previewPhotos = [], photoTotal = 0 } = state.data;
  const photos = posts.flatMap((p) => photosOf(p).map((url, n) => ({ key: `${p._id}-${n}`, url, postId: p._id, index: n })));
  const viewPost = (photo) => {
    setLightbox(null);
    setTab('board');
    setFocus({ postId: photo.postId, index: photo.index });
  };
  const TABS = [['board', 'Board'], ['media', 'Media'], ['about', 'About'], ['calendar', 'Calendar']];

  return (
    <div className="fb-board">
      <button type="button" className="fb-back" onClick={onBack}>← All artists</button>

      <header className="fb-banner" style={bg(fanbase.imageUrl)}>
        <div className="fb-banner-text">
          <h2>{fanbase.name}</h2>
          <span className="fb-chip">{nf(fanbase.subscriberCount)} {Number(fanbase.subscriberCount) === 1 ? 'subscriber' : 'subscribers'}</span>
        </div>
      </header>

      <div className="fb-bar">
        <nav className="fb-tabs" aria-label="Fanbase sections">
          {TABS.map(([key, label]) => (
            <button key={key} type="button" className={tab === key ? 'on' : ''} aria-current={tab === key ? 'page' : undefined} onClick={() => setTab(key)}>{label}</button>
          ))}
        </nav>
        <div className="fb-sub">
          <span className="fb-price">Php {peso(fanbase.price)}<small>/month</small></span>
          <button type="button" className="fb-subscribe" disabled={!locked} onClick={() => setSoon(true)}>{locked ? 'Subscribe' : 'Subscribed'}</button>
        </div>
      </div>

      {tab === 'board' && (
        <div className="fb-body open">
          <div className="fb-feed">
            {posts.length === 0 && <div className="feed-empty">No posts yet.</div>}
            {posts.map((post) => <PostCard key={post._id} post={post} focused={focus?.postId === post._id} startIndex={focus?.postId === post._id ? focus.index : 0} />)}
            {locked && <LockedBlock count={Math.max(0, total - 1)} />}
          </div>

          {/* desktop: photo rail beside the posts (2+ columns). Subscribers open the viewer; others see a few teaser photos. */}
          {!locked && photos.length > 0 && (
            <aside className="fb-rail" aria-label="Fanbase photos">
              <div className="fb-rail-head">
                <h3>Photos</h3>
                <button type="button" className="fb-rail-all" onClick={() => setTab('media')}>See all ({photos.length})</button>
              </div>
              <div className="fb-rail-grid">
                {photos.slice(0, 12).map((p, i) => (
                  <button key={p.key} type="button" className="fb-tile fb-tile-btn" style={bg(p.url)} onClick={() => setLightbox(i)} aria-label={`Open photo ${i + 1} of ${photos.length}`} />
                ))}
              </div>
            </aside>
          )}
          {locked && previewPhotos.length > 0 && (
            <aside className="fb-rail" aria-label="Fanbase photo preview">
              <div className="fb-rail-head">
                <h3>Photos</h3>
                <span className="fb-rail-count">{photoTotal} total</span>
              </div>
              <div className="fb-rail-grid">
                {previewPhotos.map((url, i) => <span key={`${url}-${i}`} className="fb-tile" style={bg(url)} role="img" aria-label="Photo preview" />)}
              </div>
              <button type="button" className="fb-subscribe fb-rail-unlock" onClick={() => setSoon(true)}>
                Subscribe to see all {photoTotal} photos
              </button>
            </aside>
          )}
        </div>
      )}

      {tab === 'media' && (
        locked ? <LockedBlock count={0} /> : photos.length ? (
          <div className="fb-media-grid">
            {photos.map((p, i) => (
              <button key={p.key} type="button" className="fb-tile fb-tile-btn" style={bg(p.url)} onClick={() => setLightbox(i)} aria-label={`Open photo ${i + 1} of ${photos.length}`} />
            ))}
          </div>
        ) : <div className="feed-empty">No photos yet.</div>
      )}

      {tab === 'about' && (
        <div className="fb-about">
          <section className="fb-about-section">
            <h3>About the group</h3>
            {fanbase.bio && <p className="fb-bio">{fanbase.bio}</p>}
            {members.length ? (
              <div className="fb-member-grid">
                {members.map((member, i) => (
                  <Link className="fb-card fb-member-card" key={member.email} style={{ '--i': i }} to={`/profile/${encodeURIComponent(member.username)}`}>
                    <span className="fb-card-img" style={bg(member.avatar)} />
                    {!member.avatar && <span className="fb-member-initial" aria-hidden="true">{(member.name || member.username || '?').charAt(0).toUpperCase()}</span>}
                    <span className="fb-card-meta">
                      <strong>{member.name}</strong>
                      <small>@{member.username}</small>
                    </span>
                  </Link>
                ))}
              </div>
            ) : <p className="fb-about-empty">Artist profiles will appear here when the group members are selected.</p>}
          </section>
          <section className="fb-about-section">
            <h3>Follow elsewhere</h3>
            <div className="fb-social-links">
              {FANBASE_SOCIALS.filter(([key]) => fanbase.socialLinks?.[key]).map(([key, label]) => (
                <a key={key} href={fanbase.socialLinks[key]} target="_blank" rel="noopener noreferrer" aria-label={label} title={label}>
                  <FanbaseSocialIcon platform={key} /><span>{label}</span>
                </a>
              ))}
              {!FANBASE_SOCIALS.some(([key]) => fanbase.socialLinks?.[key]) && <p className="fb-about-empty">Social links coming soon.</p>}
            </div>
          </section>
        </div>
      )}

      {tab === 'calendar' && <div className="feed-empty">Coming soon.</div>}

      {lightbox !== null && photos[lightbox] && (
        <Lightbox photos={photos} index={lightbox} onIndex={setLightbox} onClose={() => setLightbox(null)} onViewPost={viewPost} />
      )}

      <Modal open={soon} onClose={() => setSoon(false)} label="Subscribe" role="alertdialog">
        <div className="center">
          <h3>Subscriptions are coming soon</h3>
          <p className="fb-soon">Subscribing to {fanbase.name} (Php {peso(fanbase.price)}/month) isn&apos;t available yet. Check back soon!</p>
          <button type="button" className="btn-solid" onClick={() => setSoon(false)}>Got it</button>
        </div>
      </Modal>
    </div>
  );
}

export default function FanbasePanel() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const artistId = params.get('artist');
  const user = getUser();

  const [loading, setLoading] = useState(true);
  const [fanbases, setFanbases] = useState([]);
  const [featured, setFeatured] = useState(null);
  const [mineIds, setMineIds] = useState([]);
  const [picker, setPicker] = useState(false);
  const [draft, setDraft] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const open = useCallback((id) => setParams({ tab: 'fanbase', artist: id }), [setParams]);
  const back = useCallback(() => setParams({ tab: 'fanbase' }), [setParams]);

  useEffect(() => {
    if (artistId) return undefined;
    let alive = true;
    setLoading(true);
    Promise.all([
      getJSON('/api/fanbases').catch(() => []),
      getJSON('/api/fanbases/featured').catch(() => null),
      user?.email ? getJSON(`/api/users/fanbases?email=${encodeURIComponent(user.email)}`).catch(() => ({ ids: [] })) : Promise.resolve({ ids: [] })
    ]).then(([list, feat, mine]) => {
      if (!alive) return;
      setFanbases(Array.isArray(list) ? list : []);
      setFeatured(feat?.post ? feat : null);
      setMineIds(Array.isArray(mine?.ids) ? mine.ids : []);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [artistId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (artistId) return <Board id={artistId} onBack={back} />;

  const byId = new Map(fanbases.map((f) => [f._id, f]));
  const mine = mineIds.map((id) => byId.get(id)).filter(Boolean);
  const others = fanbases.filter((f) => !mineIds.includes(f._id));

  const openPicker = () => {
    if (!user?.email) { navigate('/login', { state: { from: '/community?tab=fanbase' } }); return; }
    setDraft(mine.map((f) => f._id));
    setError('');
    setPicker(true);
  };
  const toggle = (id) => setDraft((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const savePicks = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`${API}/api/users/fanbases`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, ids: draft })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Could not save your artists.');
      setMineIds(data.ids || draft);
      setPicker(false);
    } catch (err) {
      setError(err.message || 'Could not save your artists.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="fb-home" />;

  return (
    <div className="fb-home" data-tour="fanbase-list">
      {featured?.post && (
        <section className="fb-sec">
          <h3 className="fb-h">Featured</h3>
          <FeaturedCard post={featured.post} fanbase={featured.fanbase} onOpen={featured.fanbase ? () => open(featured.fanbase._id) : undefined} />
        </section>
      )}

      <section className="fb-sec">
        <h3 className="fb-h">Your artists</h3>
        <div className="fb-grid">
          {mine.map((f, i) => <ArtistCard key={f._id} fanbase={f} onOpen={open} index={i} />)}
          <button type="button" className="fb-card fb-add" style={{ '--i': mine.length }} onClick={openPicker} aria-label="Add or remove your artists">
            <span className="fb-add-plus">+</span>
            <span className="fb-add-label">{mine.length ? 'Edit your artists' : 'Add your artists'}</span>
          </button>
        </div>
      </section>

      <section className="fb-sec">
        <h3 className="fb-h">Explore artists</h3>
        {others.length === 0
          ? <div className="feed-empty">{fanbases.length === 0 ? 'No artists yet.' : 'You have added every artist.'}</div>
          : <div className="fb-grid">{others.map((f, i) => <ArtistCard key={f._id} fanbase={f} onOpen={open} index={i} />)}</div>}
      </section>

      <Modal open={picker} onClose={() => setPicker(false)} label="Your artists" className="fb-picker">
        <h3>Your Artists</h3>
        <div className="fb-pick-list">
          {fanbases.map((f) => (
            <button key={f._id} type="button" className={`fb-pick${draft.includes(f._id) ? ' on' : ''}`} onClick={() => toggle(f._id)} aria-pressed={draft.includes(f._id)}>
              <span className="fb-pick-img" style={bg(f.avatarUrl || f.imageUrl)} />
              <span>{f.name}</span>
            </button>
          ))}
          {fanbases.length === 0 && <p>No artists yet.</p>}
        </div>
        {error && <p className="fb-error" role="alert">{error}</p>}
        <div className="fb-pick-actions">
          <button type="button" className="btn-ghost" onClick={() => setPicker(false)} disabled={saving}>Cancel</button>
          <button type="button" className="btn-solid" onClick={savePicks} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </Modal>
    </div>
  );
}
