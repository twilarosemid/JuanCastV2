import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { API, adminFetch, getJSON, getUser, img, isSuperAdminUser, isSystemAdminUser, normalizeHandle } from '../../api';
import Modal from '../Modal/Modal';
import './BoardPanel.css';

const MAX_PHOTOS = 10;
const MODES = [
  { id: 'open', label: 'Comments open', hint: 'Anyone signed in can comment.' },
  { id: 'locked', label: 'Comments locked', hint: 'People can read the comments but not write new ones.' },
  { id: 'off', label: 'Comments off', hint: 'The comments are hidden from everyone but admins.' }
];

const timeAgo = (value) => {
  const s = Math.floor((Date.now() - new Date(value)) / 1000);
  if (isNaN(s) || s < 60) return 'Just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const Avatar = ({ src, name = '', small }) => (
  <span className={`chat-av ${small ? 'small' : ''}`}>
    {src ? <img src={img(src)} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} /> : null}
    <b>{name.replace(/^@/, '').charAt(0).toUpperCase() || '?'}</b>
  </span>
);

// @name / avatar -> that person's profile (their own handle opens your profile)
const profilePath = (name = '') => {
  const handle = String(name).replace(/^@/, '').trim();
  return handle && handle.toLowerCase() !== 'guest' ? `/profile/${encodeURIComponent(handle)}` : null;
};
const WhoLink = ({ name, className = '', children, label }) => {
  const to = profilePath(name);
  return to
    ? <Link to={to} className={`who ${className}`} aria-label={label || `View ${name}'s profile`}>{children}</Link>
    : <span className={className}>{children}</span>;
};

const Icon = ({ children, size = 18, fill = 'none' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
const HeartIcon = ({ filled, size }) => (
  <Icon size={size} fill={filled ? 'currentColor' : 'none'}><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z" /></Icon>
);
const BubbleIcon = () => <Icon><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></Icon>;
const PinIcon = ({ size = 15 }) => <Icon size={size}><path d="M12 17v5" /><path d="M9 3h6l-1 6 3 3v2H7v-2l3-3z" /></Icon>;
const LockIcon = ({ size = 15 }) => <Icon size={size}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></Icon>;
const DotsIcon = () => <Icon><circle cx="12" cy="5" r="1.2" fill="currentColor" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /><circle cx="12" cy="19" r="1.2" fill="currentColor" /></Icon>;
const ImageIcon = () => <Icon><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="9" cy="9" r="1.6" /><path d="m21 15-5-5L5 21" /></Icon>;
const CloseIcon = () => <Icon size={16}><path d="M18 6 6 18M6 6l12 12" /></Icon>;
const TrashIcon = () => <Icon size={15}><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" /></Icon>;
const ShareIcon = () => <Icon><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" /></Icon>;
const ShareIconSm = () => <Icon size={14}><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" /></Icon>;
const BanIcon = () => <Icon size={15}><circle cx="12" cy="12" r="9" /><path d="m5.6 5.6 12.8 12.8" /></Icon>;

// small dropdown that closes when you click away ("..." button by default, or your own trigger)
function Menu({ label = 'More', trigger, up, children }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);   // where the list sits on screen (fixed), so no post photo or scroll box can cover or cut it
  const ref = useRef(null);
  const listRef = useRef(null);

  // the list is drawn on the page itself (a portal), placed next to the button, flipped when there is no room
  const place = useCallback(() => {
    const btn = ref.current;
    const list = listRef.current;
    if (!btn || !list) return;
    const r = btn.getBoundingClientRect();
    const w = list.offsetWidth;
    const h = list.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const gap = 4;
    const roomBelow = vh - r.bottom - gap - 8;
    const roomAbove = r.top - gap - 8;
    const goUp = up ? (roomAbove >= h || roomAbove >= roomBelow) : (roomBelow < h && roomAbove > roomBelow);
    const top = goUp ? Math.max(8, r.top - gap - h) : Math.min(r.bottom + gap, Math.max(8, vh - h - 8));
    const left = up ? r.left : r.right - w;   // share menus line up with their button's left edge, the ⋯ menu with its right edge
    setPos({ top, left: Math.min(Math.max(8, left), Math.max(8, vw - w - 8)) });
  }, [up]);

  useLayoutEffect(() => {
    if (!open) { setPos(null); return undefined; }
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);   // true: also follows the scrolling of any box around the button
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open, place]);

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!ref.current?.contains(e.target) && !listRef.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  return (
    <div className={`bd-menu${trigger ? ' custom' : ''}`} ref={ref}>
      {trigger
        ? trigger({ open, toggle: () => setOpen((o) => !o) })
        : <button type="button" className="bd-icon-btn" onClick={() => setOpen((o) => !o)} aria-label={label} aria-expanded={open}><DotsIcon /></button>}
      {open && createPortal(
        <div
          ref={listRef}
          className="bd-menu-list floating"
          role="menu"
          style={pos ? { top: pos.top, left: pos.left } : { top: 0, left: 0, visibility: 'hidden' }}
          onClick={() => setOpen(false)}
        >{children}</div>,
        document.body
      )}
    </div>
  );
}
const MenuItem = ({ danger, children, ...props }) => (
  <button type="button" role="menuitem" className={`bd-menu-item${danger ? ' danger' : ''}`} {...props}>{children}</button>
);

// brand logos for the share menu (official brand colours)
const Logo = ({ children, bg }) => (
  <span className="share-logo" style={{ background: bg }} aria-hidden="true">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff">{children}</svg>
  </span>
);
const LinkLogo = () => <span className="share-logo" style={{ background: 'rgba(255,255,255,.18)' }} aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></svg></span>;
const FacebookLogo = () => <Logo bg="#1877F2"><path d="M13.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.5 1.5-1.5h1.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.2H8v3h2.4V21z" /></Logo>;
const XLogo = () => <Logo bg="#000"><path d="M17.8 3h2.9l-6.3 7.2L21.8 21h-5.8l-4.5-5.9L6.3 21H3.4l6.7-7.7L2.9 3h5.9l4.1 5.4zm-1 16.3h1.6L7.9 4.6H6.2z" /></Logo>;
const WhatsAppLogo = () => <Logo bg="#25D366"><path d="M12 3.2a8.7 8.7 0 0 0-7.5 13.1L3.2 20.8l4.6-1.2A8.7 8.7 0 1 0 12 3.2zm0 1.6a7.1 7.1 0 1 1-3.7 13.2l-.3-.2-2.4.6.7-2.3-.2-.3A7.1 7.1 0 0 1 12 4.8zm-2.6 3.4c-.2 0-.4.1-.6.3-.2.3-.8.8-.8 2s.8 2.3.9 2.5c.1.2 1.6 2.6 4 3.5 2 .8 2.4.6 2.8.6.5 0 1.4-.6 1.6-1.1.2-.5.2-1 .1-1.1-.1-.1-.2-.2-.5-.3l-1.5-.7c-.2-.1-.4-.1-.5.1l-.7.9c-.1.2-.3.2-.5.1-.3-.1-1-.4-1.9-1.2-.7-.6-1.2-1.4-1.3-1.6-.1-.2 0-.4.1-.5l.4-.4.2-.4c.1-.1 0-.3 0-.4l-.7-1.6c-.2-.4-.3-.4-.5-.4z" /></Logo>;
const TelegramLogo = () => <Logo bg="#229ED9"><path d="M20.7 4.4 3.4 11.1c-.8.3-.8.8-.1 1l4.4 1.4 1.7 5.2c.2.6.1.8.7.8.5 0 .7-.2 1-.5l2.1-2 4.4 3.2c.8.5 1.4.2 1.6-.7l2.9-13.7c.3-1.2-.4-1.7-1.4-1.4zM9 13.4l8.4-5.3c.4-.2.8-.1.5.2l-6.9 6.2-.3 3z" /></Logo>;
const MoreLogo = () => <span className="share-logo" style={{ background: 'rgba(255,255,255,.18)' }} aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg></span>;

// the share choices, identical for a post, a comment and a reply
const ShareItems = ({ post, ref_, copyLink, shareTo, shareNative }) => (
  <>
    <MenuItem onClick={() => copyLink(post, ref_)}><LinkLogo />Copy link</MenuItem>
    <MenuItem onClick={() => shareTo(post, 'facebook', ref_)}><FacebookLogo />Facebook</MenuItem>
    <MenuItem onClick={() => shareTo(post, 'x', ref_)}><XLogo />X</MenuItem>
    <MenuItem onClick={() => shareTo(post, 'whatsapp', ref_)}><WhatsAppLogo />WhatsApp</MenuItem>
    <MenuItem onClick={() => shareTo(post, 'telegram', ref_)}><TelegramLogo />Telegram</MenuItem>
    {typeof navigator !== 'undefined' && navigator.share && <MenuItem onClick={() => shareNative(post, ref_)}><MoreLogo />More…</MenuItem>}
  </>
);

// Photos keep their own size and shape (nothing is cropped). One photo fills the post's width at its natural height;
// several photos become a swipeable row, one photo per swipe.
// post text cut to a few lines with "See more" (like a Facebook post); the button only shows when the text is really longer
function PostText({ text }) {
  const [more, setMore] = useState(false);
  const [long, setLong] = useState(false);
  const ref = useRef(null);
  useLayoutEffect(() => {
    if (more) return undefined;
    const check = () => { const el = ref.current; if (el) setLong(el.scrollHeight > el.clientHeight + 1); };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [text, more]);
  return (
    <>
      <p ref={ref} className={`post-text${more ? '' : ' clamp'}`}>{text}</p>
      {long && !more && <button type="button" className="see-more" onClick={() => setMore(true)}>See more</button>}
    </>
  );
}

function Photos({ images, onOpen }) {
  const [index, setIndex] = useState(0);
  if (!images.length) return null;
  if (images.length === 1) {
    return (
      <button type="button" className="bd-photo single" onClick={() => onOpen(images, 0)} aria-label="Open photo">
        <img src={img(images[0])} alt="" loading="lazy" />
      </button>
    );
  }
  return (
    <div className="bd-carousel">
      <div className="bd-track" onScroll={(e) => setIndex(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}>
        {images.map((src, i) => (
          <button type="button" key={src + i} className="bd-photo slide" onClick={() => onOpen(images, i)} aria-label={`Open photo ${i + 1}`}>
            <img src={img(src)} alt="" loading="lazy" />
          </button>
        ))}
      </div>
      <span className="bd-count">{Math.min(index, images.length - 1) + 1}/{images.length}</span>
    </div>
  );
}

export default function BoardPanel({ compact = false }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const focusId = params.get('post');
  const focusComment = params.get('comment'); // shared link to one comment
  const focusReply = params.get('reply');     // ...or to one reply under it

  const [user, setUser] = useState(getUser());
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});
  const [replyInputs, setReplyInputs] = useState({});
  const [replyTarget, setReplyTarget] = useState(null); // { commentId, toReplyId, toUser }: whose comment / reply the open reply box answers
  const [childText, setChildText] = useState('');
  const [flashId, setFlashId] = useState('');           // comment / reply highlighted after opening a shared link
  const [popId, setPopId] = useState(null);
  const [notice, setNotice] = useState('');
  const [lightbox, setLightbox] = useState(null); // { images, index }
  const [confirm, setConfirm] = useState(null);   // { title, body, label, danger, run }
  const [busy, setBusy] = useState(false);

  // composer (admins only)
  const [composerOpen, setComposerOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [draft, setDraft] = useState('');
  const [files, setFiles] = useState([]);
  const [mode, setMode] = useState('open');
  const [posting, setPosting] = useState(false);
  const [composeError, setComposeError] = useState('');
  const fileInput = useRef(null);
  const noticeTimer = useRef(0);

  // edit post
  const [editing, setEditing] = useState(null); // { id, title, text }

  // muted people (admins only)
  const [mutesOpen, setMutesOpen] = useState(false);
  const [mutes, setMutes] = useState([]);
  const [muteName, setMuteName] = useState('');
  const [muteError, setMuteError] = useState('');

  const handle = user?.username ? `@${user.username}` : 'Guest';
  const isStaff = isSystemAdminUser(user) || isSuperAdminUser(user);
  const canPost = isStaff && !compact;      // the home page only shows the board; managing happens on the Community page
  const canModerate = isStaff && !compact;

  // keep the logged-in user fresh (login, logout, avatar change)
  useEffect(() => {
    const sync = () => setUser(getUser());
    window.addEventListener('juancast-user-updated', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('juancast-user-updated', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  useEffect(() => {
    getJSON('/api/posts')
      .then((data) => setPosts(Array.isArray(data) ? data : []))
      .catch((err) => console.error('Error fetching posts:', err))
      .finally(() => setLoading(false));
  }, []);

  // opened from a notification or a shared link (/community?post=<id>[&comment=<id>[&reply=<id>]]):
  // open that post's comments and scroll to the post, comment or reply, once
  const jumped = useRef('');
  useEffect(() => {
    const key = `${focusId}|${focusComment}|${focusReply}`;
    if (compact || !focusId || jumped.current === key || !posts.some((p) => p._id === focusId)) return undefined;
    jumped.current = key;
    setExpanded((prev) => ({ ...prev, [focusId]: true }));
    const targetId = focusReply ? `reply-${focusReply}` : focusComment ? `comment-${focusComment}` : '';
    if (targetId) setFlashId(focusReply || focusComment);
    const t = setTimeout(() => {
      const el = (targetId && document.getElementById(targetId)) || document.getElementById(`post-${focusId}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, targetId ? 500 : 250);
    const clear = targetId ? setTimeout(() => setFlashId(''), 3500) : null;
    return () => { clearTimeout(t); if (clear) clearTimeout(clear); };
  }, [posts, focusId, focusComment, focusReply, compact]);

  // photo previews for the composer
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  const say = useCallback((message) => {
    setNotice(message);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(''), 4500);
  }, []);
  useEffect(() => () => window.clearTimeout(noticeTimer.current), []);

  const requireLogin = () => {
    if (user?.email) return true;
    navigate('/login');
    return false;
  };

  const replacePost = (updated) => setPosts((prev) => {
    const next = prev.map((p) => (p._id === updated._id ? updated : p));
    return next.sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned))); // pinned stay on top (stable sort keeps newest-first inside)
  });

  // run an admin request, update the post from the answer, say what went wrong
  const staffAction = async (path, options, { onDone } = {}) => {
    setBusy(true);
    try {
      const data = await adminFetch(path, options);
      if (data?._id) replacePost(data);
      onDone?.(data);
      return data;
    } catch (err) {
      say(err.status === 401 ? 'Your admin session ended. Please log in again.' : (err.message || 'Something went wrong.'));
      return null;
    } finally {
      setBusy(false);
    }
  };
  const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });

  // ---------- composer ----------
  const pickFiles = (e) => {
    const picked = Array.from(e.target.files || []).filter((f) => /^image\//.test(f.type));
    e.target.value = '';
    if (!picked.length) return;
    setFiles((prev) => {
      const next = [...prev, ...picked].slice(0, MAX_PHOTOS);
      if (prev.length + picked.length > MAX_PHOTOS) setComposeError(`You can add up to ${MAX_PHOTOS} photos.`);
      return next;
    });
  };

  const canSubmit = Boolean(draft.trim() || files.length);

  const publish = async () => {
    setPosting(true);
    setComposeError('');
    try {
      const form = new FormData();
      form.append('title', title.trim());
      form.append('text', draft.trim());
      form.append('commentsMode', mode);
      files.forEach((f) => form.append('images', f));
      const data = await adminFetch('/api/posts', { method: 'POST', body: form });
      setPosts((prev) => {
        const pinned = prev.filter((p) => p.pinned);
        return [...pinned, data, ...prev.filter((p) => !p.pinned)];
      });
      setTitle(''); setDraft(''); setFiles([]); setMode('open');
      setConfirm(null);
      setComposerOpen(false);
    } catch (err) {
      setConfirm(null);
      setComposeError(err.status === 401 ? 'Your admin session ended. Please log in again.' : (err.message || 'Failed to post.'));
    } finally {
      setPosting(false);
    }
  };

  const askToPost = () => {
    if (!canSubmit) return;
    setComposeError('');
    setConfirm({
      title: 'Publish this post?',
      body: `It will appear at the top of the Community Board for everyone. ${MODES.find((m) => m.id === mode).hint}`,
      label: 'Publish',
      run: publish
    });
  };

  // share: copy the link, open a network's share page, or use the phone's own share sheet.
  // `ref` is empty for the post itself, or { commentId, childId, user, text } for one comment / reply (the link opens and highlights it).
  const postLink = (post) => `${window.location.origin}/community?post=${encodeURIComponent(post._id)}`;
  const linkOf = (post, ref) => (ref
    ? `${postLink(post)}&comment=${encodeURIComponent(ref.commentId)}${ref.childId ? `&reply=${encodeURIComponent(ref.childId)}` : ''}`
    : postLink(post));
  const titleOf = (post, ref) => (ref ? `${ref.user}'s ${ref.childId ? 'reply' : 'comment'} on JuanCast` : (post.title || `Post by ${post.user} on JuanCast`));
  const copyLink = async (post, ref) => {
    const url = linkOf(post, ref);
    try {
      await navigator.clipboard.writeText(url);
      say('Link copied to clipboard.');
    } catch {
      window.prompt('Copy this link', url);
    }
  };
  const shareTo = (post, network, ref) => {
    const url = encodeURIComponent(linkOf(post, ref));
    const text = encodeURIComponent(titleOf(post, ref));
    const targets = {
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${url}`,
      x: `https://twitter.com/intent/tweet?url=${url}&text=${text}`,
      whatsapp: `https://wa.me/?text=${text}%20${url}`,
      telegram: `https://t.me/share/url?url=${url}&text=${text}`
    };
    window.open(targets[network], '_blank', 'noopener,noreferrer');
  };
  const shareNative = async (post, ref) => {
    try {
      await navigator.share({ title: titleOf(post, ref), text: ((ref ? ref.text : post.text) || '').slice(0, 120), url: linkOf(post, ref) });
    } catch (err) {
      if (err?.name !== 'AbortError') copyLink(post, ref);
    }
  };

  // ---------- fans: like + comment ----------
  const toggleLike = async (post) => {
    if (!requireLogin()) return;
    const likes = Array.isArray(post.likes) ? post.likes : [];
    const had = likes.includes(handle);
    setPopId(had ? null : post._id);
    setTimeout(() => setPopId(null), 700);
    setPosts((prev) => prev.map((p) => (p._id === post._id ? { ...p, likes: had ? likes.filter((u) => u !== handle) : [...likes, handle] } : p)));
    try {
      await fetch(`${API}/api/posts/${post._id}/like`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: handle })
      });
    } catch (err) {
      console.error('Error toggling like:', err);
    }
  };

  const submitReply = async (post) => {
    if (!requireLogin()) return;
    const text = (replyInputs[post._id] || '').trim();
    if (!text) return;
    try {
      const res = await fetch(`${API}/api/posts/${post._id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(user?.token ? { Authorization: `Bearer ${user.token}` } : {}) },
        body: JSON.stringify({ user: handle, avatar: user?.avatar || '', text })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Could not send your comment.');
      replacePost(data);
      setReplyInputs((prev) => ({ ...prev, [post._id]: '' }));
    } catch (err) {
      say(err.message || 'Could not send your comment.');
    }
  };

  // ---------- hearts on comments and replies ----------
  const toggleCommentHeart = async (post, comment, child) => {
    if (!requireLogin()) return;
    const id = child?._id || comment._id;
    const before = post;
    const flip = (item) => {
      const likes = Array.isArray(item.likes) ? item.likes : [];
      return { ...item, likes: likes.includes(handle) ? likes.filter((u) => u !== handle) : [...likes, handle] };
    };
    const hadIt = (Array.isArray((child || comment).likes) ? (child || comment).likes : []).includes(handle);
    setPopId(hadIt ? null : id);
    setTimeout(() => setPopId(null), 700);
    // show the heart right away; the server's answer replaces it
    setPosts((prev) => prev.map((p) => (p._id !== post._id ? p : {
      ...p,
      replies: (p.replies || []).map((r) => {
        if (r._id !== comment._id) return r;
        if (!child) return flip(r);
        return { ...r, replies: (r.replies || []).map((c) => (c._id === child._id ? flip(c) : c)) };
      })
    })));
    try {
      const path = child
        ? `/api/posts/${post._id}/replies/${comment._id}/replies/${child._id}/like`
        : `/api/posts/${post._id}/replies/${comment._id}/like`;
      const res = await fetch(`${API}${path}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: handle }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Could not update the heart.');
      replacePost(data);
    } catch (err) {
      replacePost(before); // put it back the way it was
      say(err.message || 'Could not update the heart.');
    }
  };

  // ---------- replies to comments ----------
  const openReply = (post, comment, child) => {
    if (!requireLogin()) return;
    setChildText('');
    setReplyTarget({ commentId: comment._id, toReplyId: child?._id || '', toUser: (child || comment).user });
  };

  const submitChild = async (post) => {
    if (!requireLogin() || !replyTarget) return;
    const text = childText.trim();
    if (!text) return;
    try {
      const res = await fetch(`${API}/api/posts/${post._id}/replies/${replyTarget.commentId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(user?.token ? { Authorization: `Bearer ${user.token}` } : {}) },
        body: JSON.stringify({ user: handle, avatar: user?.avatar || '', text, toReplyId: replyTarget.toReplyId })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Could not send your reply.');
      replacePost(data);
      setChildText('');
      setReplyTarget(null);
    } catch (err) {
      say(err.message || 'Could not send your reply.');
    }
  };

  // ---------- admins: post + comment controls ----------
  const togglePin = (post) => staffAction(`/api/posts/${post._id}/pin`, json('PATCH', { pinned: !post.pinned }));
  const setCommentsMode = (post, next) => staffAction(`/api/posts/${post._id}/comments`, json('PATCH', { mode: next }));
  const pinComment = (post, reply) => staffAction(`/api/posts/${post._id}/replies/${reply._id}/pin`, json('PATCH', { pinned: !reply.pinned }));

  const askDeletePost = (post) => setConfirm({
    title: 'Delete this post?',
    body: 'The post, its photos and all of its comments will be removed for good.',
    label: 'Delete post',
    danger: true,
    run: async () => {
      const done = await staffAction(`/api/posts/${post._id}`, { method: 'DELETE' }, {
        onDone: () => setPosts((prev) => prev.filter((p) => p._id !== post._id))
      });
      if (done) setConfirm(null);
    }
  });

  const askRemoveReply = (post, comment, child) => setConfirm({
    title: 'Remove this reply?',
    body: `${child.user}'s reply will be replaced by “removed by a moderator” for everyone.`,
    label: 'Remove',
    danger: true,
    run: async () => { await staffAction(`/api/posts/${post._id}/replies/${comment._id}/replies/${child._id}`, { method: 'DELETE' }); setConfirm(null); }
  });

  const askRemoveComment = (post, reply) => setConfirm({
    title: 'Remove this comment?',
    body: `${reply.user}'s comment will be replaced by “removed by a moderator” for everyone.`,
    label: 'Remove',
    danger: true,
    run: async () => { await staffAction(`/api/posts/${post._id}/replies/${reply._id}`, { method: 'DELETE' }); setConfirm(null); }
  });

  const loadMutes = async () => {
    try { setMutes(await adminFetch('/api/board/mutes')); } catch (err) { setMuteError(err.message || 'Could not load the list.'); }
  };
  const openMutes = () => { setMuteError(''); setMuteName(''); setMutesOpen(true); loadMutes(); };

  const muteUser = async (name, removeComments) => {
    setBusy(true);
    setMuteError('');
    try {
      const data = await adminFetch('/api/board/mutes', json('POST', { handle: name, removeComments }));
      if (removeComments) setPosts(await getJSON('/api/posts'));
      say(`@${data.handle} can no longer comment${removeComments && data.removed ? ` · ${data.removed} comment${data.removed === 1 ? '' : 's'} removed` : ''}.`);
      setMuteName('');
      if (mutesOpen) loadMutes();
      return true;
    } catch (err) {
      setMuteError(err.message || 'Could not mute.');
      say(err.message || 'Could not mute.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const askMuteFromComment = (reply) => setConfirm({
    title: `Mute ${reply.user}?`,
    body: 'They can still read and like, but won’t be able to comment anywhere on the board until you unmute them. Their existing comments can be removed too.',
    label: 'Mute and remove their comments',
    secondary: { label: 'Just mute', run: async () => { await muteUser(normalizeHandle(reply.user), false); setConfirm(null); } },
    danger: true,
    run: async () => { await muteUser(normalizeHandle(reply.user), true); setConfirm(null); }
  });

  const unmute = async (name) => {
    try {
      await adminFetch(`/api/board/mutes/${encodeURIComponent(name)}`, { method: 'DELETE' });
      setMutes((prev) => prev.filter((m) => m.handle !== name));
    } catch (err) {
      setMuteError(err.message || 'Could not unmute.');
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    const done = await staffAction(`/api/posts/${editing.id}`, json('PUT', { title: editing.title, text: editing.text }));
    if (done) setEditing(null);
  };

  // ---------- render ----------
  const refOf = (comment, child) => ({ commentId: comment._id, childId: child?._id || '', user: (child || comment).user, text: (child || comment).text });

  // "Reply" and "Share" under a comment or a reply; Share opens a row of choices right underneath (no pop-up to get clipped)
  const actionsRow = (post, comment, child, canWrite) => {
    const id = child?._id || comment._id;
    const ref = refOf(comment, child);
    const likes = Array.isArray((child || comment).likes) ? (child || comment).likes : [];
    const hearted = likes.includes(handle);
    return (
      <>
        <div className="reply-actions">
          <button type="button" className={`reply-act heart${hearted ? ' liked' : ''}`} onClick={() => toggleCommentHeart(post, comment, child)} aria-pressed={hearted} aria-label={hearted ? 'Remove heart' : 'Heart'}>
            <span className={popId === id ? 'pop' : ''}><HeartIcon filled={hearted} size={15} /></span>
            {likes.length > 0 && <span className="heart-count">{likes.length}</span>}
          </button>
          {canWrite && <button type="button" className="reply-act" onClick={() => openReply(post, comment, child)}>Reply</button>}
          <Menu
            label={`Share ${child ? 'reply' : 'comment'}`}
            up
            trigger={({ open: shareOpen, toggle }) => (
              <button type="button" className={`reply-act${shareOpen ? ' on' : ''}`} onClick={toggle} aria-haspopup="menu" aria-expanded={shareOpen}>
                <ShareIconSm /> Share
              </button>
            )}
          >
            <ShareItems post={post} ref_={ref} copyLink={copyLink} shareTo={shareTo} shareNative={shareNative} />
          </Menu>
        </div>
      </>
    );
  };

  // replies under one comment, plus the box to write a new one
  const childThread = (post, comment, canWrite, open) => {
    const kids = Array.isArray(comment.replies) ? comment.replies : [];
    const composing = canWrite && replyTarget?.commentId === comment._id;
    if (!kids.length && !composing) return null;
    return (
      <div className="child-replies">
        {kids.map((c) => (c.removed ? (
          <div key={c._id} id={`reply-${c._id}`} className="reply child removed"><p>This reply was removed by a moderator.</p></div>
        ) : (
          <div key={c._id} id={`reply-${c._id}`} className={`reply child${flashId === c._id ? ' flash' : ''}`}>
            <WhoLink name={c.user} className="who-av" label={`View ${c.user}'s profile`}><Avatar src={c.avatar} name={c.user} small /></WhoLink>
            <div className="reply-main">
              <div className="reply-head">
                <WhoLink name={c.user}><strong>{c.user}</strong></WhoLink>
                {c.official && <span className="bd-badge small">Official</span>}
                <time>{timeAgo(c.createdAt)}</time>
                {canModerate && (
                  <span className="reply-tools">
                    <button type="button" onClick={() => askRemoveReply(post, comment, c)} aria-label="Remove reply" title="Remove"><TrashIcon /></button>
                    {!c.official && <button type="button" onClick={() => askMuteFromComment(c)} aria-label={`Mute ${c.user}`} title="Mute this person"><BanIcon /></button>}
                  </span>
                )}
              </div>
              <p>{c.replyTo && normalizeHandle(c.replyTo) !== normalizeHandle(comment.user) && <span className="reply-to">{c.replyTo} </span>}{c.text}</p>
              {actionsRow(post, comment, c, canWrite)}
            </div>
          </div>
        )))}
        {composing && (
          <div className="child-compose">
            <span className="reply-to-label">Replying to <strong>{replyTarget.toUser}</strong> <button type="button" onClick={() => setReplyTarget(null)}>Cancel</button></span>
            <div className="reply-input">
              <input
                type="text"
                autoFocus
                placeholder="Write a reply…"
                value={childText}
                maxLength={1000}
                onChange={(e) => setChildText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitChild(post)}
                tabIndex={open ? 0 : -1}
              />
              <button type="button" onClick={() => submitChild(post)} tabIndex={open ? 0 : -1}>Reply</button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const commentList = (post) => {
    const list = Array.isArray(post.replies) ? post.replies : [];
    return [...list].sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)));
  };

  return (
    <div className="chat board">
      {notice && <div className="bd-notice" role="status">{notice}</div>}

      {canPost && (
        <div className={`composer board-composer${composerOpen ? ' open' : ''}`}>
          {!composerOpen ? (
            <button type="button" className="bd-compose-open" onClick={() => setComposerOpen(true)}>
              <Avatar src={user?.avatar} name={handle} />
              <span>Write a new post for the community…</span>
              <b>+ New post</b>
            </button>
          ) : (
            <div className="bd-compose">
              <div className="bd-compose-head">
                <strong>New post</strong>
                <span className="bd-compose-actions">
                  <button type="button" className="bd-link-btn" onClick={openMutes}><BanIcon /> Muted people</button>
                  <button type="button" className="bd-icon-btn" onClick={() => setComposerOpen(false)} aria-label="Close composer"><CloseIcon /></button>
                </span>
              </div>
              <input
                className="bd-title-input"
                type="text"
                value={title}
                maxLength={120}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Title (optional)"
                aria-label="Post title"
              />
              <textarea
                rows={4}
                value={draft}
                maxLength={5000}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="What do you want to tell the community?"
                aria-label="Write a post"
              />
              {previews.length > 0 && (
                <div className="bd-previews">
                  {previews.map((src, i) => (
                    <div className="bd-preview" key={src}>
                      <img src={src} alt="" />
                      <button type="button" onClick={() => setFiles((prev) => prev.filter((_, n) => n !== i))} aria-label="Remove photo"><CloseIcon /></button>
                    </div>
                  ))}
                </div>
              )}
              <div className="bd-compose-bar">
                <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={pickFiles} />
                <button type="button" className="bd-link-btn" onClick={() => fileInput.current?.click()} disabled={files.length >= MAX_PHOTOS}>
                  <ImageIcon /> Photos {files.length ? `(${files.length}/${MAX_PHOTOS})` : ''}
                </button>
                <label className="bd-select">
                  <span className="sr-only">Comments</span>
                  <select value={mode} onChange={(e) => setMode(e.target.value)} aria-label="Comments">
                    {MODES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                </label>
                <button type="button" className="btn-solid" onClick={askToPost} disabled={!canSubmit || posting}>Post</button>
              </div>
              {composeError && <p className="post-error">{composeError}</p>}
            </div>
          )}
        </div>
      )}

      <div className="chat-scroll">
        {!loading && posts.length === 0 && (
          <div className="feed-empty">Nothing on the board yet. Check back soon!</div>
        )}

        {posts.map((post, i) => {
          const likes = Array.isArray(post.likes) ? post.likes : [];
          const liked = likes.includes(handle);
          const replies = commentList(post);
          const live = replies.reduce((n, r) => n + (r.removed ? 0 : 1) + (r.replies || []).filter((c) => !c.removed).length, 0);
          const open = !!expanded[post._id];
          const cMode = post.commentsMode || 'open';
          const commentsHidden = cMode === 'off' && !canModerate;
          const canWrite = cMode === 'open' || canModerate;
          const isEditing = editing?.id === post._id;
          return (
            <article
              key={post._id}
              id={`post-${post._id}`}
              className={`post rise${post.pinned ? ' pinned' : ''}${focusId === post._id && !compact ? ' focus' : ''}`}
              style={{ '--d': `${Math.min(i, 8) * 60}ms` }}
              data-tour={i === 0 ? 'board-post' : undefined}
            >
              <WhoLink name={post.user} className="who-av"><Avatar src={post.avatar} name={post.user} /></WhoLink>
              <div className="post-body">
                <div className="post-head">
                  <WhoLink name={post.user}><strong>{post.user}</strong></WhoLink>
                  {post.official && <span className="bd-badge">Official</span>}
                  {post.pinned && <span className="bd-pin"><PinIcon /> Pinned</span>}
                  <time>{timeAgo(post.createdAt)}{post.editedAt ? ' · edited' : ''}</time>
                  {canModerate && (
                    <Menu label="Post options">
                      <MenuItem onClick={() => togglePin(post)}><PinIcon /> {post.pinned ? 'Unpin post' : 'Pin to top'}</MenuItem>
                      <MenuItem onClick={() => setEditing({ id: post._id, title: post.title || '', text: post.text || '' })}>Edit post</MenuItem>
                      <div className="bd-menu-sep">Comments</div>
                      {MODES.map((m) => (
                        <MenuItem key={m.id} onClick={() => setCommentsMode(post, m.id)} aria-checked={cMode === m.id}>
                          <span className={`bd-check${cMode === m.id ? ' on' : ''}`} /> {m.label}
                        </MenuItem>
                      ))}
                      <div className="bd-menu-sep" />
                      <MenuItem danger onClick={() => askDeletePost(post)}><TrashIcon /> Delete post</MenuItem>
                    </Menu>
                  )}
                </div>

                {isEditing ? (
                  <div className="bd-edit">
                    <input className="bd-title-input" type="text" value={editing.title} maxLength={120} placeholder="Title (optional)"
                      onChange={(e) => setEditing((c) => ({ ...c, title: e.target.value }))} />
                    <textarea rows={5} value={editing.text} maxLength={5000} onChange={(e) => setEditing((c) => ({ ...c, text: e.target.value }))} />
                    <div className="bd-edit-bar">
                      <button type="button" className="btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
                      <button type="button" className="btn-solid" onClick={saveEdit} disabled={busy}>Save</button>
                    </div>
                  </div>
                ) : (
                  <>
                    {post.title && <h3 className="bd-post-title">{post.title}</h3>}
                    {post.text && <PostText text={post.text} />}
                    <Photos images={post.images || []} onOpen={(images, index) => setLightbox({ images, index })} />
                  </>
                )}

                <div className="post-actions">
                  <button type="button" className={`act like ${liked ? 'liked' : ''}`} onClick={() => toggleLike(post)} aria-pressed={liked} aria-label="Like">
                    <span className={popId === post._id ? 'pop' : ''}><HeartIcon filled={liked} /></span>
                    {likes.length}
                  </button>
                  {!commentsHidden && (
                    <button type="button" className={`act ${open ? 'on' : ''}`} onClick={() => setExpanded((e) => ({ ...e, [post._id]: !e[post._id] }))} aria-expanded={open}>
                      <BubbleIcon /> {live}
                      <span className="act-label">{open ? 'Hide' : 'Comments'}</span>
                    </button>
                  )}
                  <Menu
                    label="Share"
                    up
                    trigger={({ open: shareOpen, toggle }) => (
                      <button type="button" className={`act ${shareOpen ? 'on' : ''}`} onClick={toggle} aria-haspopup="menu" aria-expanded={shareOpen}>
                        <ShareIcon /><span className="act-label">Share</span>
                      </button>
                    )}
                  >
                    <ShareItems post={post} copyLink={copyLink} shareTo={shareTo} shareNative={shareNative} />
                  </Menu>
                  {cMode !== 'open' && (
                    <span className="bd-state" title={MODES.find((m) => m.id === cMode)?.hint}>
                      <LockIcon /> {cMode === 'locked' ? 'Comments locked' : 'Comments off'}
                    </span>
                  )}
                </div>

                {!commentsHidden && (
                  <div className={`replies ${open ? 'open' : ''}`}>
                    <div className="replies-inner">
                      {replies.length === 0 && <p className="bd-no-comments">No comments yet.</p>}
                      {replies.map((r) => (r.removed ? (
                        <div key={r._id} id={`comment-${r._id}`} className="reply removed">
                          <div className="reply-main">
                            <p>This comment was removed by a moderator.</p>
                            {childThread(post, r, canWrite, open)}
                          </div>
                        </div>
                      ) : (
                        <div key={r._id} id={`comment-${r._id}`} className={`reply${r.pinned ? ' is-pinned' : ''}${flashId === r._id ? ' flash' : ''}`}>
                          <WhoLink name={r.user} className="who-av" label={`View ${r.user}'s profile`}><Avatar src={r.avatar} name={r.user} small /></WhoLink>
                          <div className="reply-main">
                            <div className="reply-head">
                              <WhoLink name={r.user}><strong>{r.user}</strong></WhoLink>
                              {r.official && <span className="bd-badge small">Official</span>}
                              {r.pinned && <span className="bd-pin small"><PinIcon size={12} /> Pinned</span>}
                              <time>{timeAgo(r.createdAt)}</time>
                              {canModerate && (
                                <span className="reply-tools">
                                  <button type="button" onClick={() => pinComment(post, r)} aria-label={r.pinned ? 'Unpin comment' : 'Pin comment'} title={r.pinned ? 'Unpin' : 'Pin'}><PinIcon size={14} /></button>
                                  <button type="button" onClick={() => askRemoveComment(post, r)} aria-label="Remove comment" title="Remove"><TrashIcon /></button>
                                  {!r.official && <button type="button" onClick={() => askMuteFromComment(r)} aria-label={`Mute ${r.user}`} title="Mute this person"><BanIcon /></button>}
                                </span>
                              )}
                            </div>
                            <p>{r.text}</p>
                            {actionsRow(post, r, null, canWrite)}
                            {childThread(post, r, canWrite, open)}
                          </div>
                        </div>
                      )))}

                      {canWrite ? (
                        <div className="reply-input">
                          <input
                            type="text"
                            placeholder={canModerate && cMode !== 'open' ? 'Comment as an admin…' : 'Write a comment…'}
                            value={replyInputs[post._id] || ''}
                            maxLength={1000}
                            onChange={(e) => setReplyInputs((prev) => ({ ...prev, [post._id]: e.target.value }))}
                            onKeyDown={(e) => e.key === 'Enter' && submitReply(post)}
                            tabIndex={open ? 0 : -1}
                          />
                          <button type="button" onClick={() => submitReply(post)} tabIndex={open ? 0 : -1}>Reply</button>
                        </div>
                      ) : (
                        <p className="bd-locked-note"><LockIcon /> Comments are locked on this post.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {/* confirm (publish / delete / remove / mute) */}
      <Modal open={Boolean(confirm)} onClose={() => !posting && !busy && setConfirm(null)} label={confirm?.title || 'Confirm'}>
        {confirm && (
          <>
            <h3>{confirm.title}</h3>
            <p>{confirm.body}</p>
            <div className="modal-actions bd-confirm-actions">
              <button className="btn-ghost" onClick={() => setConfirm(null)} disabled={posting || busy}>Cancel</button>
              {confirm.secondary && <button className="btn-ghost" onClick={confirm.secondary.run} disabled={busy}>{confirm.secondary.label}</button>}
              <button className={confirm.danger ? 'btn-solid bd-danger' : 'btn-solid'} onClick={confirm.run} disabled={posting || busy}>
                {posting ? 'Posting…' : confirm.label}
              </button>
            </div>
          </>
        )}
      </Modal>

      {/* muted people */}
      <Modal open={mutesOpen} onClose={() => setMutesOpen(false)} label="Muted people" className="bd-mutes">
        <h3>Muted people</h3>
        <p>Muted people can read and like posts, but can’t comment.</p>
        <div className="bd-mute-add">
          <input
            type="text"
            value={muteName}
            placeholder="@username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) => setMuteName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && muteName.trim() && muteUser(normalizeHandle(muteName), false)}
          />
          <button type="button" className="btn-solid" disabled={!muteName.trim() || busy} onClick={() => muteUser(normalizeHandle(muteName), false)}>Mute</button>
        </div>
        {muteError && <p className="post-error">{muteError}</p>}
        <ul className="bd-mute-list">
          {mutes.length === 0 && <li className="bd-no-comments">No one is muted.</li>}
          {mutes.map((m) => (
            <li key={m.handle}>
              <span><strong>@{m.handle}</strong>{m.mutedBy ? <em> · by {m.mutedBy}</em> : null}</span>
              <button type="button" className="btn-ghost" onClick={() => unmute(m.handle)}>Unmute</button>
            </li>
          ))}
        </ul>
        <div className="modal-actions"><button className="btn-solid" onClick={() => setMutesOpen(false)}>Done</button></div>
      </Modal>

      {/* photo viewer */}
      <Modal open={Boolean(lightbox)} onClose={() => setLightbox(null)} label="Photo" className="bd-lightbox">
        {lightbox && (
          <div className="bd-lb">
            <img src={img(lightbox.images[lightbox.index])} alt="" />
            {lightbox.images.length > 1 && (
              <div className="bd-lb-nav">
                <button type="button" onClick={() => setLightbox((l) => ({ ...l, index: (l.index - 1 + l.images.length) % l.images.length }))} aria-label="Previous photo">‹</button>
                <span>{lightbox.index + 1} / {lightbox.images.length}</span>
                <button type="button" onClick={() => setLightbox((l) => ({ ...l, index: (l.index + 1) % l.images.length }))} aria-label="Next photo">›</button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
