import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { API, adminFetch, getJSON, getUser, img, normalizeHandle } from '../../api';
import Modal from '../../components/Modal/Modal';
import QRCode from '../../components/QRCode/QRCode';
import './ArtistProfile.css';

const MAX_IMAGE = 8 * 1024 * 1024; // same cap as the server

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
  const [bioOpen, setBioOpen] = useState(false);
  const [bioDraft, setBioDraft] = useState('');

  const saveProfile = async (form) => {
    if (needsRelogin()) { say('error', RELOGIN); return false; }
    setBusy(true);
    try {
      const data = await adminFetch('/api/artist/profile', { method: 'PUT', body: form });
      onProfileChange({ coverPhoto: data.coverPhoto, bio: data.bio });
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

  const openBio = () => { setBioDraft(profile.bio || ''); setBioOpen(true); };
  const saveBio = async () => {
    const form = new FormData();
    form.append('bio', bioDraft.trim());
    if (await saveProfile(form)) setBioOpen(false);
  };

  return (
    <section className={`pf-hero ap-hero rise${ownView ? ' own' : ''}`}>
      <div className={`ap-cover${profile.coverPhoto ? '' : ' empty'}`} style={profile.coverPhoto ? { backgroundImage: `url("${img(profile.coverPhoto)}")` } : undefined}>
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

      <div className="ap-head">
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
            : ownView && <p className="ap-bio ap-bio-empty">Tell fans who you are. Add a short bio.</p>}
          <p className="pf-joined">{profile.joined}</p>
        </div>

        <div className="pf-actions ap-actions">
          {ownView && balance}
          {ownView && (
            <>
              <button type="button" className="btn-ghost" onClick={openBio}>{profile.bio ? 'Edit bio' : 'Add bio'}</button>
              <Link className="btn-ghost" to="/profile/edit">Edit Profile</Link>
              <button type="button" className="btn-ghost ap-preview-btn" onClick={() => onPreview(true)} title="See your page the way fans see it"><EyeIcon /> Preview as fan</button>
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

      <Modal open={bioOpen} onClose={() => setBioOpen(false)} label="Edit bio">
        <h3>{profile.bio ? 'Edit bio' : 'Add a bio'}</h3>
        <textarea className="ap-bio-input" rows={4} maxLength={300} value={bioDraft} onChange={(e) => setBioDraft(e.target.value)} placeholder="Who are you, and what do you make?" autoFocus />
        <p className="ap-count">{bioDraft.length}/300</p>
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={() => setBioOpen(false)} disabled={busy}>Cancel</button>
          <button type="button" className="btn-solid" onClick={saveBio} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </Modal>
    </section>
  );
}

// ---------------------------------------------------------------
// The artist's post feed. Own page: composer (text + photo) and delete buttons.
// Visitors: read, like, reply.
// ---------------------------------------------------------------
export function ArtistFeed({ profile, ownView, viewer, say, goLogin }) {
  const handle = normalizeHandle(profile.username);
  const myHandle = `@${viewer?.username || ''}`;
  const fileRef = useRef(null);

  const [posts, setPosts] = useState(null); // null = loading
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [replyInputs, setReplyInputs] = useState({});
  const [toDelete, setToDelete] = useState(null);

  useEffect(() => {
    if (!handle) return undefined;
    let cancelled = false;
    setPosts(null);
    getJSON(`/api/artists/${encodeURIComponent(handle)}/posts`)
      .then((data) => { if (!cancelled) setPosts(Array.isArray(data) ? data : []); })
      .catch(() => { if (!cancelled) setPosts([]); });
    return () => { cancelled = true; };
  }, [handle]);

  useEffect(() => {
    if (!photo) { setPreview(''); return undefined; }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const pickPhoto = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { say('error', 'Please choose an image file.'); return; }
    if (file.size > MAX_IMAGE) { say('error', 'That image is too big (max 8 MB).'); return; }
    setPhoto(file);
  };

  const publish = async () => {
    const body = text.trim();
    if (!body && !photo) return;
    if (needsRelogin()) { say('error', RELOGIN); return; }
    setPublishing(true);
    try {
      const form = new FormData();
      form.append('text', body);
      if (photo) form.append('image', photo);
      const created = await adminFetch('/api/artist/posts', { method: 'POST', body: form });
      setPosts((list) => [created, ...(list || [])]);
      setText('');
      setPhoto(null);
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
    } catch (error) {
      say('error', error.status === 401 ? RELOGIN : (error.message || 'Could not delete the post.'));
    }
  };

  const toggleLike = async (postId) => {
    if (!viewer?.email) { goLogin(); return; }
    const setLikes = (fn) => setPosts((list) => list.map((p) => (p._id === postId ? { ...p, likes: fn(p.likes || []) } : p)));
    const had = (posts.find((p) => p._id === postId)?.likes || []).includes(myHandle);
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

  const canPublish = (text.trim() || photo) && !publishing;

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
          {preview && (
            <div className="ap-attach">
              <img src={preview} alt="Attached" />
              <button type="button" onClick={() => setPhoto(null)} aria-label="Remove photo">×</button>
            </div>
          )}
          <div className="pf-composer-bar ap-composer-bar">
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickPhoto} />
            <button type="button" className="ap-chip dark" onClick={() => fileRef.current?.click()}><ImageIcon /> Photo</button>
            <span className="ap-count">{text.length}/2000</span>
            <button type="button" className="btn-solid" disabled={!canPublish} onClick={publish}>{publishing ? 'Posting…' : 'Post'}</button>
          </div>
        </div>
      )}

      {posts === null && <div className="pf-card"><div className="pf-skel-block ap-skel" /></div>}
      {posts && posts.length === 0 && (
        <div className="pf-card"><p className="pf-empty">{ownView ? 'You haven’t posted yet. Your first post will show up here for your fans.' : 'No posts from this artist yet.'}</p></div>
      )}

      {(posts || []).map((post, i) => {
        const id = post._id;
        const likes = post.likes || [];
        const replies = post.replies || [];
        const liked = Boolean(viewer?.email) && likes.includes(myHandle);
        return (
          <article key={id} className="pf-card pf-post rise" style={{ '--d': `${Math.min(i, 6) * 60}ms` }}>
            <header>
              <Avatar src={post.avatar || profile.avatar} className="pf-mini" />
              <div>
                <strong>{profile.name}<CheckBadge /></strong>
                <span>{timeAgo(post.createdAt)}</span>
              </div>
              {ownView && (
                <button type="button" className="ap-del" onClick={() => setToDelete(id)} aria-label="Delete post" title="Delete post"><TrashIcon /></button>
              )}
            </header>
            {post.text && <p className="pf-post-text">{post.text}</p>}
            {post.imageUrl && <img className="ap-post-photo" src={img(post.imageUrl)} alt="Post" loading="lazy" />}
            <footer>
              <button type="button" className={liked ? 'liked' : ''} onClick={() => toggleLike(id)} aria-pressed={liked} aria-label={liked ? 'Unlike' : 'Like'}>
                <HeartIcon filled={liked} /> <span>{likes.length}</span>
              </button>
              <button type="button" onClick={() => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))} aria-expanded={Boolean(expanded[id])}>
                <ReplyIcon /> <span>{replies.length} {replies.length === 1 ? 'Reply' : 'Replies'}</span>
              </button>
            </footer>

            {expanded[id] && (
              <div className="pf-replies">
                {replies.map((reply, n) => (
                  <div key={`${id}-${n}`} className="pf-reply">
                    <Avatar src={reply.avatar} className="pf-mini sm" />
                    <p><strong><Link className="pf-who" to={`/profile/${encodeURIComponent(normalizeHandle(reply.user))}`}>{reply.user}</Link></strong> {reply.text}</p>
                  </div>
                ))}
                <div className="pf-reply-box">
                  <input
                    type="text"
                    placeholder="Write a comment..."
                    maxLength={500}
                    value={replyInputs[id] || ''}
                    onChange={(e) => setReplyInputs((prev) => ({ ...prev, [id]: e.target.value }))}
                    onKeyDown={(e) => e.key === 'Enter' && sendReply(id)}
                  />
                  <button type="button" className="btn-solid" onClick={() => sendReply(id)}>Reply</button>
                </div>
              </div>
            )}
          </article>
        );
      })}

      <Modal open={Boolean(toDelete)} onClose={() => setToDelete(null)} label="Delete post">
        <h3>Delete this post?</h3>
        <p>This removes the post, its likes and its replies for everyone. It can&apos;t be undone.</p>
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={() => setToDelete(null)}>Cancel</button>
          <button type="button" className="btn-solid" onClick={confirmDelete}>Delete</button>
        </div>
      </Modal>
    </section>
  );
}
