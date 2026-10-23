import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API, getJSON, getUser, img } from '../../api';
import Modal from '../Modal/Modal';
import './ChatPanel.css';

const timeAgo = (value) => {
  const s = Math.floor((Date.now() - new Date(value)) / 1000);
  if (isNaN(s) || s < 60) return 'Just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

const Avatar = ({ src, name = '', small }) => (
  <span className={`chat-av ${small ? 'small' : ''}`}>
    {src ? <img src={img(src)} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} /> : null}
    <b>{name.replace(/^@/, '').charAt(0).toUpperCase() || '?'}</b>
  </span>
);

const HeartIcon = ({ filled }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z" />
  </svg>
);
const BubbleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

export default function ChatPanel() {
  const navigate = useNavigate();
  const [user, setUser] = useState(getUser());
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState('');
  const [expanded, setExpanded] = useState({});
  const [replyInputs, setReplyInputs] = useState({});
  const [popId, setPopId] = useState(null); // heart that was just tapped

  const handle = user?.username ? `@${user.username}` : 'Guest';

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

  const requireLogin = () => {
    if (user?.email) return true;
    navigate('/login');
    return false;
  };

  const askToPost = () => {
    if (!requireLogin() || !draft.trim()) return;
    setPostError('');
    setConfirmOpen(true);
  };

  const confirmPost = async () => {
    setPosting(true);
    try {
      const res = await fetch(`${API}/api/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: handle, avatar: user?.avatar || '', text: draft.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to post');
      setPosts((prev) => [data, ...prev]);
      setDraft('');
      setConfirmOpen(false);
    } catch (err) {
      setPostError(err.message || 'Server error. Please try again.');
    } finally {
      setPosting(false);
    }
  };

  const toggleLike = async (post) => {
    if (!requireLogin()) return;
    const likes = Array.isArray(post.likes) ? post.likes : [];
    const had = likes.includes(handle);
    setPopId(had ? null : post._id);
    setTimeout(() => setPopId(null), 700);
    setPosts((prev) => prev.map((p) =>
      p._id === post._id ? { ...p, likes: had ? likes.filter((u) => u !== handle) : [...likes, handle] } : p
    ));
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

  const submitReply = async (postId) => {
    if (!requireLogin()) return;
    const text = (replyInputs[postId] || '').trim();
    if (!text) return;
    try {
      const res = await fetch(`${API}/api/posts/${postId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: handle, avatar: user?.avatar || '', text })
      });
      if (res.ok) {
        const updated = await res.json();
        setPosts((prev) => prev.map((p) => (p._id === postId ? updated : p)));
        setReplyInputs((prev) => ({ ...prev, [postId]: '' }));
      }
    } catch (err) {
      console.error('Error posting reply:', err);
    }
  };

  return (
    <div className="chat">
      <div className="composer">
        <Avatar src={user?.avatar} name={handle} />
        <textarea
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="What are you Juan-dering about?"
          aria-label="Write a post"
        />
        <button type="button" className="btn-solid" onClick={askToPost} disabled={!draft.trim() && !!user?.email}>
          Post
        </button>
      </div>

      <div className="chat-scroll">
        {loading && [0, 1, 2].map((n) => <div key={n} className="feed-skel" />)}

        {!loading && posts.length === 0 && (
          <div className="feed-empty">No posts yet. Be the first to say something!</div>
        )}

        {posts.map((post, i) => {
          const likes = Array.isArray(post.likes) ? post.likes : [];
          const liked = likes.includes(handle);
          const replies = Array.isArray(post.replies) ? post.replies : [];
          const open = !!expanded[post._id];
          return (
            <article key={post._id} className="post rise" style={{ '--d': `${Math.min(i, 8) * 60}ms` }}>
              <Avatar src={post.avatar} name={post.user} />
              <div className="post-body">
                <div className="post-head">
                  <strong>{post.user}</strong>
                  <time>{timeAgo(post.createdAt)}</time>
                </div>
                {post.text && <p className="post-text">{post.text}</p>}

                <div className="post-actions">
                  <button type="button" className={`act like ${liked ? 'liked' : ''}`} onClick={() => toggleLike(post)} aria-pressed={liked} aria-label="Like">
                    <span className={popId === post._id ? 'pop' : ''}><HeartIcon filled={liked} /></span>
                    {likes.length}
                  </button>
                  <button type="button" className={`act ${open ? 'on' : ''}`} onClick={() => setExpanded((e) => ({ ...e, [post._id]: !e[post._id] }))} aria-expanded={open}>
                    <BubbleIcon /> {replies.length}
                    <span className="act-label">{open ? 'Hide' : 'Reply'}</span>
                  </button>
                </div>

                {/* grid-rows trick: animates height 0 -> auto */}
                <div className={`replies ${open ? 'open' : ''}`}>
                  <div className="replies-inner">
                    {replies.map((r, idx) => (
                      <div key={idx} className="reply">
                        <Avatar src={r.avatar} name={r.user} small />
                        <p><strong>{r.user}</strong> {r.text}</p>
                      </div>
                    ))}
                    <div className="reply-input">
                      <input
                        type="text"
                        placeholder="Write a comment…"
                        value={replyInputs[post._id] || ''}
                        onChange={(e) => setReplyInputs((prev) => ({ ...prev, [post._id]: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && submitReply(post._id)}
                        tabIndex={open ? 0 : -1}
                      />
                      <button type="button" onClick={() => submitReply(post._id)} tabIndex={open ? 0 : -1}>Reply</button>
                    </div>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <Modal open={confirmOpen} onClose={() => !posting && setConfirmOpen(false)} label="Post to community">
        <h3>Post to Community?</h3>
        <p>Are you sure your post is correct? Posts can’t be edited or deleted once submitted.</p>
        {postError && <p className="post-error">{postError}</p>}
        <div className="modal-actions">
          <button className="btn-ghost" onClick={() => setConfirmOpen(false)} disabled={posting}>Cancel</button>
          <button className="btn-solid" onClick={confirmPost} disabled={posting}>{posting ? 'Posting…' : 'Post it!'}</button>
        </div>
      </Modal>
    </div>
  );
}
