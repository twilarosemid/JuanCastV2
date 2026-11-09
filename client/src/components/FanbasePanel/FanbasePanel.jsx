import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { API, getJSON, getUser, img } from '../../api';
import Modal from '../Modal/Modal';
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

function PostCard({ post, onClick }) {
  return (
    <article className={`fb-post${onClick ? ' clickable' : ''}`} onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter') onClick(); } : undefined}>
      <span className="fb-post-av" style={bg(post.authorAvatarUrl)} />
      <div className="fb-post-body">
        <div className="fb-post-name">{post.authorName}{post.verified !== false && <Verified />}</div>
        {post.text && <p>{post.text}</p>}
        <div className="fb-post-meta">
          <time>{fmtWhen(post.postedAt)}</time>
          <div className="fb-post-stats">
            <span><StarIcon />{nf(post.likes)}</span>
            <span><CommentIcon />{nf(post.comments)}</span>
          </div>
        </div>
      </div>
      {post.imageUrl && <span className="fb-post-photo" style={bg(post.imageUrl)} role="img" aria-label="Post photo" />}
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

function Circle({ fanbase, onOpen }) {
  return (
    <button type="button" className="fb-circle" onClick={() => onOpen(fanbase._id)} title={fanbase.name}>
      <span className="fb-circle-img" style={bg(fanbase.avatarUrl || fanbase.imageUrl)} />
      <span className="fb-circle-name">{fanbase.name}</span>
    </button>
  );
}

function Board({ id, onBack }) {
  const user = getUser();
  const [state, setState] = useState({ loading: true, error: '', data: null });
  const [tab, setTab] = useState('board');
  const [soon, setSoon] = useState(false);

  useEffect(() => {
    let alive = true;
    setState({ loading: true, error: '', data: null });
    setTab('board');
    const qs = user?.email ? `?email=${encodeURIComponent(user.email)}` : '';
    getJSON(`/api/fanbases/${id}/board${qs}`)
      .then((data) => { if (alive) setState({ loading: false, error: '', data }); })
      .catch((err) => { if (alive) setState({ loading: false, error: err?.message || 'Could not load this board.', data: null }); });
    return () => { alive = false; };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (state.loading) {
    return <div className="fb-board"><div className="skeleton fb-skel-banner" /><div className="skeleton fb-skel-post" /></div>;
  }
  if (state.error || !state.data) {
    return (
      <div className="fb-board">
        <button type="button" className="fb-back" onClick={onBack}>← Fanbase</button>
        <div className="feed-empty">{state.error || 'Artist not found.'}</div>
      </div>
    );
  }

  const { fanbase, locked, total, posts } = state.data;
  const photos = posts.filter((p) => p.imageUrl);
  const TABS = [['board', 'Board'], ['media', 'Media'], ['artist', 'Artist'], ['calendar', 'Calendar']];

  return (
    <div className="fb-board">
      <button type="button" className="fb-back" onClick={onBack}>← Fanbase</button>

      <header className="fb-banner" style={bg(fanbase.imageUrl)}>
        <div className="fb-banner-text">
          <h2>{fanbase.name}</h2>
          <span>Subscribers: {nf(fanbase.subscriberCount)}</span>
        </div>
      </header>

      <div className="fb-bar">
        <nav className="fb-tabs" aria-label="Artist sections">
          {TABS.map(([key, label]) => (
            <button key={key} type="button" className={tab === key ? 'on' : ''} aria-current={tab === key ? 'page' : undefined} onClick={() => setTab(key)}>{label}</button>
          ))}
        </nav>
        <div className="fb-sub">
          <span className="fb-price">Php {peso(fanbase.price)}/Month</span>
          <button type="button" className="fb-subscribe" disabled={!locked} onClick={() => setSoon(true)}>{locked ? 'Subscribe' : 'Subscribed'}</button>
        </div>
      </div>

      {tab === 'board' && (
        <div className={`fb-body${locked ? '' : ' open'}`}>
          <div className="fb-feed">
            {posts.length === 0 && <div className="feed-empty">No posts yet.</div>}
            {posts.map((post) => <PostCard key={post._id} post={post} />)}
            {locked && <LockedBlock count={Math.max(0, total - 1)} />}
          </div>
          {!locked && photos.length > 0 && (
            <aside className="fb-media" aria-label="Photos">
              {photos.slice(0, 6).map((p) => <span key={p._id} className="fb-tile" style={bg(p.imageUrl)} />)}
            </aside>
          )}
        </div>
      )}

      {tab === 'media' && (
        locked ? <LockedBlock count={0} /> : photos.length ? (
          <div className="fb-media-grid">{photos.map((p) => <span key={p._id} className="fb-tile" style={bg(p.imageUrl)} />)}</div>
        ) : <div className="feed-empty">No photos yet.</div>
      )}

      {(tab === 'artist' || tab === 'calendar') && <div className="feed-empty">Coming soon.</div>}

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

  if (loading) {
    return (
      <div className="fb-home">
        <h2 className="fb-h">Your Artists</h2>
        <div className="fb-circles">{[0, 1, 2, 3].map((n) => <span key={n} className="fb-circle-img skeleton" />)}</div>
        <h2 className="fb-h">Explore Other Artists</h2>
        <div className="fb-circles">{[0, 1, 2, 3, 4, 5].map((n) => <span key={n} className="fb-circle-img skeleton" />)}</div>
      </div>
    );
  }

  return (
    <div className="fb-home">
      <section>
        <h2 className="fb-h">Your Artists</h2>
        <div className="fb-circles">
          {mine.map((f) => <Circle key={f._id} fanbase={f} onOpen={open} />)}
          <button type="button" className="fb-circle fb-add" onClick={openPicker} aria-label="Add or remove your artists" title="Add artists">
            <span className="fb-circle-img">+</span>
            <span className="fb-circle-name">{mine.length ? 'Edit' : 'Add'}</span>
          </button>
        </div>
      </section>

      <section>
        <h2 className="fb-h">Explore Other Artists</h2>
        {others.length === 0
          ? <div className="feed-empty">{fanbases.length === 0 ? 'No artists yet.' : 'You have added every artist.'}</div>
          : <div className="fb-circles">{others.map((f) => <Circle key={f._id} fanbase={f} onOpen={open} />)}</div>}
      </section>

      {featured?.post && (
        <section>
          <h2 className="fb-h">Featured Artist</h2>
          <PostCard post={featured.post} onClick={featured.fanbase ? () => open(featured.fanbase._id) : undefined} />
        </section>
      )}

      <Modal open={picker} onClose={() => setPicker(false)} label="Your artists" className="fb-picker">
        <h3>Your Artists</h3>
        <div className="fb-pick-list">
          {fanbases.map((f) => (
            <button key={f._id} type="button" className={`fb-pick${draft.includes(f._id) ? ' on' : ''}`} onClick={() => toggle(f._id)} aria-pressed={draft.includes(f._id)}>
              <span className="fb-circle-img" style={bg(f.avatarUrl || f.imageUrl)} />
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
