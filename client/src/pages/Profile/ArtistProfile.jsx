import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { API, adminFetch, getJSON, getUser, img, normalizeHandle } from '../../api';
import Modal from '../../components/Modal/Modal';
import PhotoCarousel from '../../components/PhotoCarousel/PhotoCarousel';
import QRCode from '../../components/QRCode/QRCode';
import { SOCIAL_PLATFORMS, SocialIcon } from '../../components/SocialLinks/SocialLinks';
import './ArtistProfile.css';

const MAX_IMAGE = 8 * 1024 * 1024; // same cap as the server
const MAX_PHOTOS = 10;             // photos per post, same cap as the server

const timeAgo = (value) => {
  if (!value) return 'Just now';
  const seconds = Math.floor((Date.now() - new Date(value)) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
};

const Svg = ({ children, size = 18, fill = 'none', sw = 2 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
const HeartIcon = ({ filled }) => <Svg fill={filled ? 'currentColor' : 'none'}><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.7 4.8 6.2 4.5c2-.2 3.9.8 5.8 3 1.9-2.2 3.8-3.2 5.8-3 3.5.3 5.3 3.9 3.8 7.3C19.5 16.4 12 21 12 21z" /></Svg>;
const ReplyIcon = () => <Svg><path d="M21 11.5a8.5 8.5 0 0 1-12.4 7.5L3 20.5l1.6-4.9A8.5 8.5 0 1 1 21 11.5z" /></Svg>;
const CameraIcon = () => <Svg><path d="M4 8h3l1.5-2h7L17 8h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></Svg>;
const ImageIcon = () => <Svg><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><circle cx="9" cy="10" r="1.6" /><path d="m4 18 5-5 4 4 3-3 4 4" /></Svg>;
const LockIcon = () => <Svg size={34} sw={2.2}><rect x="5" y="11" width="14" height="10" rx="2.5" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></Svg>;
const DotsIcon = () => <Svg size={20} fill="currentColor" sw={0}><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></Svg>;
const TrashIcon = () => <Svg><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12h10l1-12M9 7V4h6v3" /></Svg>;
const EyeIcon = () => <Svg><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></Svg>;
const UserSvg = () => <Svg sw={2}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></Svg>;
const CheckBadge = () => (
  <svg className="ap-badge-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#2f7bff" /><path d="m7.5 12.3 3 3 6-6.3" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

const Avatar = ({ src, className = '' }) => (
  <div className={`pf-avatar-box ${className}`}>{src ? <img src={img(src)} alt="" /> : <UserSvg />}</div>
);

// Artist tools need the signed token that is handed out at login
const needsRelogin = () => !getUser()?.token;
const RELOGIN = 'Please log out and log in again to unlock your artist tools.';

// ---------------------------------------------------------------
// The top of an artist profile: cover photo, avatar, name, bio, actions.
// Own page (ownView): change cover, edit bio, preview as fan. Anyone else: Follow + share.
// ---------------------------------------------------------------
export function ArtistHero({ profile, ownView, isOwn, previewing, onPreview, isFollowing, onToggleFollow, onOpenQR, qrValue, onProfileChange, say, balance }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // close the ... menu on an outside click or Escape
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDown = (e) => { if (!menuRef.current?.contains(e.target)) setMenuOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [menuOpen]);

  const saveProfile = async (form) => {
    if (needsRelogin()) { say('error', RELOGIN); return false; }
    setBusy(true);
    try {
      const data = await adminFetch('/api/artist/profile', { method: 'PUT', body: form });
      onProfileChange({ coverPhoto: data.coverPhoto, bio: data.bio, socialLinks: data.socialLinks || {} });
      return true;
    } catch (error) {
      say('error', error.status === 401 ? RELOGIN : (error.message || 'Could not update your page.'));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const pickCover = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { say('error', 'Please choose an image file.'); return; }
    if (file.size > MAX_IMAGE) { say('error', 'That image is too big (max 8 MB).'); return; }
    const form = new FormData();
    form.append('cover', file);
    await saveProfile(form);
  };

  const removeCover = () => {
    const form = new FormData();
    form.append('removeCover', 'true');
    saveProfile(form);
  };

  return (
    <section className={`pf-hero ap-hero rise${ownView ? ' own' : ''}`}>
      <div className="ap-cover">
        <div className={`ap-cover-img${profile.coverPhoto ? '' : ' empty'}`} style={profile.coverPhoto ? { backgroundImage: `url("${img(profile.coverPhoto)}")` } : undefined} />
        {ownView && (
          <div className="ap-kebab-wrap" ref={menuRef}>
            <button type="button" className="ap-kebab" onClick={() => setMenuOpen((o) => !o)} aria-haspopup="menu" aria-expanded={menuOpen} aria-label="More options" title="More options">
              <DotsIcon />
            </button>
            {menuOpen && (
              <div className="ap-menu" role="menu">
                <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onPreview(true); }}>
                  <EyeIcon /> Preview as fan
                </button>
              </div>
            )}
          </div>
        )}
        {ownView && (
          <div className="ap-cover-tools">
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickCover} />
            <button type="button" className="ap-chip" disabled={busy} onClick={() => fileRef.current?.click()}>
              <CameraIcon /> {busy ? 'Saving…' : profile.coverPhoto ? 'Change cover' : 'Add cover photo'}
            </button>
            {profile.coverPhoto && <button type="button" className="ap-chip subtle" disabled={busy} onClick={removeCover}>Remove</button>}
          </div>
        )}
      </div>

      <div className="pf-head ap-head">
        <div className="pf-ident ap-ident">
          <Avatar src={profile.avatar} className="pf-avatar ap-avatar" />
          <button type="button" className="pf-qr" onClick={onOpenQR} aria-label="Show profile QR code" title="Profile QR">
            <QRCode value={qrValue} label={`QR code for @${profile.username}`} />
          </button>
        </div>

        <div className="pf-id ap-id">
          <h1>{profile.name}<span className="ap-badge"><CheckBadge /> Artist</span></h1>
          <p className="pf-handle">@{profile.username}</p>
          {profile.bio
            ? <p className="ap-bio">{profile.bio}</p>
            : ownView && <p className="ap-bio ap-bio-empty">Tell fans who you are. <Link to="/profile/edit">Add a bio and your links in Edit Profile.</Link></p>}
          <p className="pf-joined">{profile.joined}</p>
        </div>

        <div className="pf-actions ap-actions">
          {ownView && balance}
          {ownView && (
            <>
              <Link className="btn-ghost" to="/profile/edit">Edit Profile</Link>
            </>
          )}
          {!ownView && !isOwn && (
            <button type="button" className={isFollowing ? 'btn-solid' : 'btn-ghost'} onClick={onToggleFollow}>{isFollowing ? 'Unfollow' : 'Follow'}</button>
          )}
          {!ownView && isOwn && previewing && (
            <>
              <button type="button" className="btn-ghost" disabled title="Fans see a Follow button here">Follow</button>
              <button type="button" className="btn-solid" onClick={() => onPreview(false)}>Exit preview</button>
            </>
          )}
        </div>
      </div>

      {previewing && <div className="ap-preview-banner" role="status"><EyeIcon /> You&apos;re previewing your page as a fan sees it.</div>}

    </section>
  );
}

// ---------------------------------------------------------------
// Artist links, shown under Statistics: the first few, then "View more" opens the rest as a vertical list.
// ---------------------------------------------------------------
const LINKS_COLLAPSED = 3;
const prettyLink = (url = '') => String(url).replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '');

export function ArtistLinksCard({ links, ownView }) {
  const [open, setOpen] = useState(false);
  const all = SOCIAL_PLATFORMS.filter(({ key }) => links?.[key]);
  if (!all.length && !ownView) return null;
  const shown = open ? all : all.slice(0, LINKS_COLLAPSED);
  const hidden = all.length - shown.length;

  return (
    <div className="pf-card al-card rise" style={{ '--d': '120ms' }}>
      <h2>Links</h2>
      {all.length === 0 ? (
        <p className="al-empty">No links yet. <Link to="/profile/edit">Add them in Edit Profile.</Link></p>
      ) : (
        <>
          <ul className="al-list">
            {shown.map(({ key, label }) => (
              <li key={key}>
                <a className="al-link" href={links[key]} target="_blank" rel="noopener noreferrer">
                  <span className="al-ico"><SocialIcon platform={key} /></span>
                  <span className="al-text"><strong>{label}</strong><small>{prettyLink(links[key])}</small></span>
                </a>
              </li>
            ))}
          </ul>
          {all.length > LINKS_COLLAPSED && (
            <button type="button" className="al-more" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
              {open ? 'View less' : `View more (${hidden})`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

// Blurred stand-ins + a subscribe prompt. The locked posts themselves never leave the server.
function LockedPosts({ count, fanbase, name }) {
  const price = Number(fanbase?.price || 0);
  return (
    <div className="ig-locked rise">
      <div className="ig-locked-ghosts" aria-hidden="true">
        {[0, 1].map((n) => (
          <div className="ig-ghost" key={n}>
            <div className="ig-ghost-head"><span className="ig-ghost-av" /><span className="ig-ghost-bar" /></div>
            <div className="ig-ghost-photo" />
          </div>
        ))}
      </div>
      <div className="ig-lock-overlay" role="note">
        <LockIcon />
        <strong>Subscribe to see more</strong>
        <small>{count > 0 ? `${count.toLocaleString('en-US')} more ${count === 1 ? 'post' : 'posts'} from ${name}` : `More posts from ${name}`}</small>
        {fanbase?._id && (
          <Link className="btn-solid ig-lock-cta" to={`/community?tab=fanbase&artist=${encodeURIComponent(fanbase._id)}`}>
            Subscribe{price > 0 ? ` · Php ${price.toLocaleString('en-US')}/mo` : ''}
          </Link>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// The artist's post feed, styled like Instagram posts (swipeable multi-photo, likes, caption, comments).
// Own page: composer (text + up to 10 photos) and delete buttons. Visitors: read, like, reply.
// If the artist is in a fanbase, visitors who aren't subscribed only see the newest post.
// ---------------------------------------------------------------
export function ArtistFeed({ profile, ownView, viewer, say, goLogin }) {
  const handle = normalizeHandle(profile.username);
  const myHandle = `@${viewer?.username || ''}`;
  const fileRef = useRef(null);

  const [posts, setPosts] = useState(null); // null = loading
  const [lock, setLock] = useState({ locked: false, total: 0, fanbase: null });
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState([]);   // File[]
  const [previews, setPreviews] = useState([]); // blob URLs for the files above
  const [publishing, setPublishing] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [openCaption, setOpenCaption] = useState({});
  const [replyInputs, setReplyInputs] = useState({});
  const [toDelete, setToDelete] = useState(null);

  // "Preview as fan" on your own page must show what a real fan sees, so it doesn't identify you as the artist
  const viewerEmail = viewer?.email && (ownView || normalizeHandle(viewer.username) !== handle) ? viewer.email : '';

  useEffect(() => {
    if (!handle) return undefined;
    let cancelled = false;
    setPosts(null);
    const qs = viewerEmail ? `?email=${encodeURIComponent(viewerEmail)}` : '';
    getJSON(`/api/artists/${encodeURIComponent(handle)}/posts${qs}`)
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data) ? data : (data?.posts || []);
        setPosts(list);
        setLock({ locked: Boolean(data?.locked), total: Number(data?.total ?? list.length), fanbase: data?.fanbase || null });
      })
      .catch(() => { if (!cancelled) { setPosts([]); setLock({ locked: false, total: 0, fanbase: null }); } });
    return () => { cancelled = true; };
  }, [handle, viewerEmail]);

  useEffect(() => {
    const urls = photos.map((file) => URL.createObjectURL(file));
    setPreviews(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [photos]);

  const pickPhotos = (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    const valid = [];
    files.forEach((file) => {
      if (!file.type.startsWith('image/')) { say('error', 'Please choose image files only.'); return; }
      if (file.size > MAX_IMAGE) { say('error', `${file.name || 'That image'} is too big (max 8 MB).`); return; }
      valid.push(file);
    });
    if (photos.length + valid.length > MAX_PHOTOS) say('error', `You can add up to ${MAX_PHOTOS} photos per post.`);
    setPhotos((cur) => [...cur, ...valid].slice(0, MAX_PHOTOS));
  };

  const removePhoto = (n) => setPhotos((cur) => cur.filter((_, i) => i !== n));

  const publish = async () => {
    const body = text.trim();
    if (!body && !photos.length) return;
    if (needsRelogin()) { say('error', RELOGIN); return; }
    setPublishing(true);
    try {
      const form = new FormData();
      form.append('text', body);
      photos.forEach((file) => form.append('images', file));
      const created = await adminFetch('/api/artist/posts', { method: 'POST', body: form });
      setPosts((list) => [created, ...(list || [])]);
      setLock((cur) => ({ ...cur, total: cur.total + 1 }));
      setText('');
      setPhotos([]);
    } catch (error) {
      say('error', error.status === 401 ? RELOGIN : (error.message || 'Could not publish your post.'));
    } finally {
      setPublishing(false);
    }
  };

  const confirmDelete = async () => {
    const id = toDelete;
    setToDelete(null);
    if (!id) return;
    try {
      await adminFetch(`/api/artist/posts/${id}`, { method: 'DELETE' });
      setPosts((list) => (list || []).filter((p) => p._id !== id));
      setLock((cur) => ({ ...cur, total: Math.max(0, cur.total - 1) }));
    } catch (error) {
      say('error', error.status === 401 ? RELOGIN : (error.message || 'Could not delete the post.'));
    }
  };

  const toggleLike = async (postId, { onlyLike = false } = {}) => {
    if (!viewer?.email) { goLogin(); return; }
    const had = (posts.find((p) => p._id === postId)?.likes || []).includes(myHandle);
    if (onlyLike && had) return; // double-tapping a photo never un-likes
    const setLikes = (fn) => setPosts((list) => list.map((p) => (p._id === postId ? { ...p, likes: fn(p.likes || []) } : p)));
    setLikes((likes) => (had ? likes.filter((h) => h !== myHandle) : [...likes, myHandle]));
    try {
      const res = await fetch(`${API}/api/artist-posts/${postId}/like`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: viewer.email }) });
      if (!res.ok) throw new Error('like failed');
    } catch {
      setLikes((likes) => (had ? [...likes, myHandle] : likes.filter((h) => h !== myHandle)));
    }
  };

  const sendReply = async (postId) => {
    if (!viewer?.email) { goLogin(); return; }
    const reply = (replyInputs[postId] || '').trim();
    if (!reply) return;
    try {
      const res = await fetch(`${API}/api/artist-posts/${postId}/reply`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: viewer.email, text: reply }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Could not send your reply.');
      setPosts((list) => list.map((p) => (p._id === postId ? { ...p, replies: data.replies } : p)));
      setReplyInputs((prev) => ({ ...prev, [postId]: '' }));
    } catch (error) {
      say('error', error.message || 'Could not send your reply.');
    }
  };

  const canPublish = (text.trim() || photos.length) && !publishing;
  const lockedCount = Math.max(0, lock.total - (posts || []).length);

  return (
    <section className="pf-feed ap-feed">
      {ownView && (
        <div className="pf-card pf-composer ap-composer rise" style={{ '--d': '120ms' }}>
          <textarea
            placeholder="Share something with your fans…"
            value={text}
            rows={2}
            maxLength={2000}
            onChange={(e) => {
              setText(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = `${e.target.scrollHeight}px`;
            }}
          />
          <p className="ap-fb-note">Your post also appears on your Fanbase board. Fans who aren&apos;t subscribed only see your newest post.</p>
          {previews.length > 0 && (
            <div className="ap-attach-grid" aria-label={`${previews.length} photo${previews.length === 1 ? '' : 's'} attached`}>
              {previews.map((src, n) => (
                <div className="ap-attach-tile" key={`${src}-${n}`}>
                  <img src={src} alt={`Attached ${n + 1}`} />
                  {n === 0 && previews.length > 1 && <span className="ap-attach-cover">Cover</span>}
                  <button type="button" onClick={() => removePhoto(n)} aria-label={`Remove photo ${n + 1}`}>×</button>
                </div>
              ))}
            </div>
          )}
          <div className="pf-composer-bar ap-composer-bar">
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={pickPhotos} />
            <button type="button" className="ap-chip dark" disabled={photos.length >= MAX_PHOTOS} onClick={() => fileRef.current?.click()}>
              <ImageIcon /> {photos.length ? `Add more (${photos.length}/${MAX_PHOTOS})` : 'Photos'}
            </button>
            <span className="ap-count">{text.length}/2000</span>
            <button type="button" className="btn-solid" disabled={!canPublish} onClick={publish}>{publishing ? 'Posting…' : 'Post'}</button>
          </div>
        </div>
      )}

      {posts && posts.length === 0 && (
        <div className="pf-card"><p className="pf-empty">{ownView ? 'You haven’t posted yet. Your first post will show up here for your fans.' : 'No posts from this artist yet.'}</p></div>
      )}

      {(posts || []).map((post, i) => {
        const id = post._id;
        const likes = post.likes || [];
        const replies = post.replies || [];
        const liked = Boolean(viewer?.email) && likes.includes(myHandle);
        const images = post.images?.length ? post.images : (post.imageUrl ? [post.imageUrl] : []);
        const longCaption = (post.text || '').length > 140 || (post.text || '').split('\n').length > 3;
        const captionOpen = Boolean(openCaption[id]);
        return (
          <article key={id} className="ig-post rise" style={{ '--d': `${Math.min(i, 6) * 60}ms` }}>
            <header className="ig-head">
              <span className="ig-ring"><Avatar src={post.avatar || profile.avatar} className="pf-mini" /></span>
              <div className="ig-who">
                <strong>{profile.name}<CheckBadge /></strong>
                <span>@{profile.username}</span>
              </div>
              {ownView && (
                <button type="button" className="ap-del" onClick={() => setToDelete(id)} aria-label="Delete post" title="Delete post"><TrashIcon /></button>
              )}
            </header>

            {images.length > 0 && <PhotoCarousel images={images} onDoubleTap={() => toggleLike(id, { onlyLike: true })} />}

            <div className="ig-actions">
              <button type="button" className={liked ? 'liked' : ''} onClick={() => toggleLike(id)} aria-pressed={liked} aria-label={liked ? 'Unlike' : 'Like'}>
                <HeartIcon filled={liked} />
              </button>
              <button type="button" onClick={() => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))} aria-expanded={Boolean(expanded[id])} aria-label="Comments">
                <ReplyIcon />
              </button>
            </div>

            <div className="ig-meta">
              <p className="ig-likes">{likes.length.toLocaleString('en-US')} {likes.length === 1 ? 'like' : 'likes'}</p>
              {post.text && (
                <p className={`ig-caption${longCaption && !captionOpen ? ' clamp' : ''}`}>
                  <strong>{profile.name}</strong> {post.text}
                  {longCaption && !captionOpen && <button type="button" className="ig-more" onClick={() => setOpenCaption((prev) => ({ ...prev, [id]: true }))}>more</button>}
                </p>
              )}
              {replies.length > 0 && !expanded[id] && (
                <button type="button" className="ig-viewall" onClick={() => setExpanded((prev) => ({ ...prev, [id]: true }))}>
                  View all {replies.length} {replies.length === 1 ? 'comment' : 'comments'}
                </button>
              )}
              <time className="ig-time" dateTime={post.createdAt}>{timeAgo(post.createdAt)}</time>
            </div>

            {expanded[id] && (
              <div className="pf-replies ig-replies">
                {replies.map((reply, n) => (
                  <div key={`${id}-${n}`} className="pf-reply">
                    <Avatar src={reply.avatar} className="pf-mini sm" />
                    <p><strong><Link className="pf-who" to={`/profile/${encodeURIComponent(normalizeHandle(reply.user))}`}>{reply.user}</Link></strong> {reply.text}</p>
                  </div>
                ))}
                <div className="pf-reply-box">
                  <input
                    type="text"
                    placeholder="Add a comment…"
                    maxLength={500}
                    value={replyInputs[id] || ''}
                    onChange={(e) => setReplyInputs((prev) => ({ ...prev, [id]: e.target.value }))}
                    onKeyDown={(e) => e.key === 'Enter' && sendReply(id)}
                  />
                  <button type="button" className="btn-solid" onClick={() => sendReply(id)}>Post</button>
                </div>
              </div>
            )}
          </article>
        );
      })}

      {lock.locked && <LockedPosts count={lockedCount} fanbase={lock.fanbase} name={profile.name} />}

      <Modal open={Boolean(toDelete)} onClose={() => setToDelete(null)} label="Delete post">
        <h3>Delete this post?</h3>
        <p>This removes the post, its photos, likes and replies for everyone. It can&apos;t be undone.</p>
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={() => setToDelete(null)}>Cancel</button>
          <button type="button" className="btn-solid" onClick={confirmDelete}>Delete</button>
        </div>
      </Modal>
    </section>
  );
}
