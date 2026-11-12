import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API, getJSON, img, normalizeHandle } from '../../api';
import './NotificationsMenu.css';

const timeAgo = (value) => {
  if (!value) return 'Just now';
  const seconds = Math.floor((Date.now() - new Date(value)) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const idOf = (n) => n._id || n.id;
const isReport = (n) => n.type === 'mail' && String(n.sourceId || '').startsWith('report:');
// cut on whole characters (graphemes) so a joined emoji like the black cat is never split in half
const clip = (text = '', max = 90) => {
  const parts = typeof Intl !== 'undefined' && Intl.Segmenter
    ? Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text), (x) => x.segment)
    : Array.from(text);
  return parts.length > max ? `${parts.slice(0, max).join('').trimEnd()}…` : text;
};

const HeartSvg = () => <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.7 4.8 6.2 4.5c2-.2 3.9.8 5.8 3 1.9-2.2 3.8-3.2 5.8-3 3.5.3 5.3 3.9 3.8 7.3C19.5 16.4 12 21 12 21z" /></svg>;
const ReplySvg = () => <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21 11.5a8.5 8.5 0 0 1-12.4 7.5L3 20.5l1.6-4.9A8.5 8.5 0 1 1 21 11.5z" /></svg>;
const FollowSvg = () => <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M10 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zm0 2c-3.9 0-7 2-7 4.5V20h11.1a6 6 0 0 1-.1-1c0-1.7.7-3.2 1.9-4.3A9 9 0 0 0 10 14zm9 0v2.5h-2.5V18H19v2.5h2V18h2.5v-1.5H21V14h-2z" /></svg>;
const MailSvg = () => <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm9 7.2L4.5 7v.1L12 12.4 19.5 7.1V7L12 12.2z" /></svg>;
const MicSvg = () => <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 14a3.5 3.5 0 0 0 3.5-3.5v-5a3.5 3.5 0 0 0-7 0v5A3.5 3.5 0 0 0 12 14zm6-3.5a1 1 0 1 0-2 0 4 4 0 0 1-8 0 1 1 0 1 0-2 0 6 6 0 0 0 5 5.9V19H9a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2h-2v-2.6a6 6 0 0 0 5-5.9z" /></svg>;
const ICONS = { like: HeartSvg, reply: ReplySvg, follow: FollowSvg, mail: MailSvg, artist_post: MicSvg };

// Notifications as a dropdown under the bell (same style as the account menu): likes, replies, follows
// and report updates from the team. Tap a row to jump to it; tap a report update to read it right here.
// Mounted by the navbar only while it is open, so it loads a fresh list every time.
export default function NotificationsMenu({ visible, onClose, user, onUnreadChange }) {
  const navigate = useNavigate();
  const username = user?.username || '';
  const [items, setItems] = useState(null); // null = loading
  const [error, setError] = useState('');
  const [reading, setReading] = useState(null); // the report update being read

  const report = useCallback((list) => onUnreadChange?.(list.filter((n) => !n.isRead).length), [onUnreadChange]);

  useEffect(() => {
    setReading(null);
    setError('');
    if (!username) { setItems([]); return undefined; }
    let alive = true;
    setItems(null);
    getJSON(`/api/notifications?username=${encodeURIComponent(normalizeHandle(username))}`)
      .then((list) => { if (alive) { const arr = Array.isArray(list) ? list : []; setItems(arr); report(arr); } })
      .catch(() => { if (alive) { setItems([]); setError('Could not load your notifications.'); } });
    return () => { alive = false; };
  }, [username, report]);

  const patch = (path, body) => fetch(`${API}${path}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  }).catch(() => {});

  const markRead = (n) => {
    if (n.isRead) return;
    setItems((list) => {
      const next = list.map((x) => (idOf(x) === idOf(n) ? { ...x, isRead: true } : x));
      report(next);
      return next;
    });
    patch(`/api/notifications/${idOf(n)}/read`, { username: normalizeHandle(username) });
  };

  const markAll = () => {
    setItems((list) => { const next = list.map((x) => ({ ...x, isRead: true })); report(next); return next; });
    patch('/api/notifications/read-all', { username: normalizeHandle(username) });
  };

  const openItem = (n) => {
    markRead(n);
    if (n.type === 'mail') { setReading({ ...n, isRead: true }); return; }
    const actor = normalizeHandle(n.actor);
    onClose();
    if (n.type === 'follow') navigate(`/profile/${encodeURIComponent(actor)}`);
    else if (n.type === 'artist_post') navigate(n.sourceId ? `/community?tab=fanbase&artist=${encodeURIComponent(n.sourceId)}${n.postId ? `&post=${encodeURIComponent(n.postId)}` : `&by=${encodeURIComponent(actor)}`}` : `/profile/${encodeURIComponent(actor)}`);
    else navigate(n.postId ? `/profile#post-${n.postId}` : '/profile');
  };

  const unread = (items || []).filter((n) => !n.isRead).length;

  const label = (n) => {
    const who = <strong>{n.actor}</strong>;
    if (n.type === 'like') return <>{who} liked your post</>;
    if (n.type === 'reply') return <>{who} replied to your post</>;
    if (n.type === 'follow') return <>{who} started following you</>;
    if (n.type === 'artist_post') return <><strong>{n.subject || n.actor}</strong> shared a new post</>;
    return <strong>{n.subject || 'Message from JuanCast'}</strong>;
  };

  return (
    <div className={`nt-menu${visible ? ' show' : ''}`} role="dialog" aria-label="Notifications">
      {reading ? (
        <div className="nt-detail">
          <header className="nt-head">
            <button type="button" className="nt-back" onClick={() => setReading(null)}>‹ Back</button>
            <button type="button" className="nt-x" onClick={onClose} aria-label="Close">×</button>
          </header>
          <div className="nt-detail-body">
            {isReport(reading) && <span className="nt-chip">Report update</span>}
            <h2>{reading.subject || 'Message from JuanCast'}</h2>
            <p className="nt-detail-meta">From {reading.actor || 'JuanCast'} · {new Date(reading.createdAt).toLocaleString()}</p>
            <p className="nt-detail-text">{reading.preview}</p>
          </div>
        </div>
      ) : (
        <>
          <header className="nt-head">
            <h2>Notifications{unread > 0 && <span className="nt-count">{unread}</span>}</h2>
            <div className="nt-head-actions">
              {unread > 0 && <button type="button" className="nt-link" onClick={markAll}>Mark all read</button>}
              <button type="button" className="nt-x" onClick={onClose} aria-label="Close">×</button>
            </div>
          </header>

          <div className="nt-list">
            {!username ? (
              <p className="nt-empty">Log in to see your notifications.</p>
            ) : items === null ? (
              <p className="nt-empty">Loading…</p>
            ) : error ? (
              <p className="nt-empty">{error}</p>
            ) : items.length === 0 ? (
              <p className="nt-empty">You’re all caught up. Likes, replies, follows, new posts from your artists and report updates will show up here.</p>
            ) : items.map((n) => {
              const Ico = ICONS[n.type] || MailSvg;
              return (
                <button type="button" key={idOf(n)} className={`nt-item${n.isRead ? '' : ' unread'}`} onClick={() => openItem(n)}>
                  <span className={`nt-ico ${n.type}`}>
                    {n.actorAvatar && n.type !== 'mail' ? <img src={img(n.actorAvatar)} alt="" /> : <Ico />}
                  </span>
                  <span className="nt-body">
                    <span className="nt-title">{label(n)}</span>
                    {n.preview && <span className="nt-preview">{clip(n.preview)}</span>}
                    <span className="nt-meta">
                      {isReport(n) && <span className="nt-chip">Report update</span>}
                      {timeAgo(n.createdAt)}
                    </span>
                  </span>
                  {!n.isRead && <span className="nt-dot" aria-label="Unread" />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
