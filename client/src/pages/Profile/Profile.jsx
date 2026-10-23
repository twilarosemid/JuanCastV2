import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { API, getJSON, img, mergeUser, normalizeHandle, saveUser } from '../../api';
import useUser from '../../hooks/useUser';
import Modal from '../../components/Modal/Modal';
import Feedback from '../../components/Feedback/Feedback';
import RewardsCenter from '../../components/RewardsCenter/RewardsCenter';
import DailyRewards, { dailyState } from '../../components/DailyRewards/DailyRewards';
import StarCurr from '../../assets/StarCurr.png';
import SunCurr from '../../assets/SunCurr.png';
import './Profile.css';

const formatJoined = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return 'Joined recently';
  return `Joined ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
};

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

const toProfile = (data) => ({
  name: data.fullName || data.name || 'User',
  username: data.username || '',
  joined: formatJoined(data.createdAt || data.joinDate),
  avatar: data.avatar || '',
  coverPhoto: data.coverPhoto || '',
  coverPosition: data.coverPosition || { x: 50, y: 50 },
  followers: Array.isArray(data.followers) ? data.followers : [],
  following: Array.isArray(data.following) ? data.following : []
});

const UserSvg = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
  </svg>
);

const Avatar = ({ src, className = '' }) => (
  <div className={`pf-avatar-box ${className}`}>{src ? <img src={img(src)} alt="" /> : <UserSvg />}</div>
);

const FEATURES = [
  { id: 'rewards', icon: '⭐', label: 'Rewards' },
  { id: 'juantask', icon: '🎁', label: 'Juantask', soon: true },
  { id: 'promo', icon: '📢', label: 'Promo', soon: true },
  { id: 'badges', icon: '🎖️', label: 'Badges', soon: true }
];

export default function Profile() {
  const { username: routeUsername } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const viewer = useUser();
  const viewerRef = useRef(viewer);
  viewerRef.current = viewer;

  const viewerHandle = normalizeHandle(viewer?.username);
  const isOwn = Boolean(viewer?.email) && (!routeUsername || normalizeHandle(routeUsername) === viewerHandle);

  const [profile, setProfile] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [posts, setPosts] = useState([]);
  const [expanded, setExpanded] = useState({});
  const [replyInputs, setReplyInputs] = useState({});
  const [newPost, setNewPost] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rewardsOpen, setRewardsOpen] = useState(false);
  const [dailyOpen, setDailyOpen] = useState(false);
  const [feedback, setFeedback] = useState({ open: false, type: 'error', message: '' });

  const say = (type, message) => setFeedback({ open: true, type, message });
  const goLogin = () => navigate('/login', { state: { from: location.pathname } });

  // load the profile being viewed (your own is refreshed from the server so balances stay current)
  useEffect(() => {
    let cancelled = false;
    setNotFound(false);

    const applyOther = (data) => {
      const followers = Array.isArray(data.followers) ? data.followers : [];
      setProfile(toProfile(data));
      setFollowersCount(followers.length);
      setIsFollowing(followers.some((h) => normalizeHandle(h) === normalizeHandle(viewerRef.current?.username)));
    };

    const load = async () => {
      const me = viewerRef.current;
      try {
        if (isOwn) {
          setProfile(toProfile(me));
          setFollowersCount(Array.isArray(me.followers) ? me.followers.length : 0);
          const fresh = await getJSON(`/api/users/me?email=${encodeURIComponent(me.email)}`);
          if (cancelled) return;
          saveUser(mergeUser(viewerRef.current || me, fresh));
          setProfile(toProfile(fresh));
          setFollowersCount(Array.isArray(fresh.followers) ? fresh.followers.length : 0);
        } else if (routeUsername) {
          const data = await getJSON(`/api/users/profile/${encodeURIComponent(normalizeHandle(routeUsername))}`);
          if (!cancelled) applyOther(data);
        }
      } catch (error) {
        console.error('Error loading profile:', error);
        if (!cancelled && !isOwn) setNotFound(true);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [routeUsername, isOwn, viewer?.email]);

  // posts written by this profile
  useEffect(() => {
    const handle = normalizeHandle(profile?.username);
    if (!handle) { setPosts([]); return undefined; }
    let cancelled = false;
    getJSON('/api/posts')
      .then((data) => {
        if (!cancelled && Array.isArray(data)) setPosts(data.filter((p) => normalizeHandle(p.user) === handle));
      })
      .catch((error) => console.error('Error fetching posts:', error));
    return () => { cancelled = true; };
  }, [profile?.username]);

  // your own page needs a login
  if (!routeUsername && !viewer?.email) {
    return <Navigate to="/login" replace state={{ from: '/profile' }} />;
  }

  const myHandle = `@${viewer?.username || ''}`;

  const toggleFollow = async () => {
    if (!viewer?.email) { goLogin(); return; }
    try {
      const res = await fetch(`${API}/api/users/follow`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: viewer.email, username: profile.username })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to update follow status.');
      setIsFollowing(Boolean(data.isFollowing));
      setFollowersCount(Number(data.followersCount ?? followersCount));
    } catch (error) {
      say('error', error.message || 'Unable to update follow status.');
    }
  };

  const toggleLike = async (postId) => {
    if (!viewer?.email) { goLogin(); return; }
    const setLikes = (fn) => setPosts((list) => list.map((p) => ((p._id || p.id) === postId ? { ...p, likes: fn(Array.isArray(p.likes) ? p.likes : []) } : p)));
    const had = (posts.find((p) => (p._id || p.id) === postId)?.likes || []).includes(myHandle);
    setLikes((likes) => (had ? likes.filter((h) => h !== myHandle) : [...likes, myHandle]));
    try {
      const res = await fetch(`${API}/api/posts/${postId}/like`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: myHandle })
      });
      if (!res.ok) throw new Error('like failed');
    } catch (error) {
      console.error('Error toggling like:', error);
      setLikes((likes) => (had ? [...likes, myHandle] : likes.filter((h) => h !== myHandle)));
    }
  };

  const sendReply = async (postId) => {
    if (!viewer?.email) { goLogin(); return; }
    const text = (replyInputs[postId] || '').trim();
    if (!text) return;
    try {
      const res = await fetch(`${API}/api/posts/${postId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: myHandle, avatar: viewer.avatar || '', text })
      });
      if (!res.ok) throw new Error('Could not send your reply.');
      const updated = await res.json();
      setPosts((list) => list.map((p) => ((p._id || p.id) === postId ? updated : p)));
      setReplyInputs((prev) => ({ ...prev, [postId]: '' }));
    } catch (error) {
      say('error', error.message || 'Could not send your reply.');
    }
  };

  const createPost = async () => {
    const text = newPost.trim();
    if (!text) return;
    try {
      const res = await fetch(`${API}/api/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: myHandle, avatar: viewer.avatar || '', text })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to post.');
      setPosts((list) => [data, ...list]);
      setNewPost('');
      setConfirmOpen(false);
    } catch (error) {
      setConfirmOpen(false);
      say('error', error.message || 'Failed to post.');
    }
  };

  const claimDaily = async () => {
    if (!viewer?.email) { setDailyOpen(false); goLogin(); return { ok: false, message: 'Please log in first.' }; }
    try {
      const res = await fetch(`${API}/api/users/daily-claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: viewer.email })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || data.error || 'Failed to claim reward.');
      const gained = Math.max(0, (data.stars || 0) - (viewer.stars || 0));
      saveUser(mergeUser(viewer, data));
      return { ok: true, day: data.dailyStreak, gained };
    } catch (error) {
      return { ok: false, message: error.message || 'Server error. Please try again later.' };
    }
  };

  if (notFound) {
    return (
      <main className="pf-page">
        <div className="pf-card pf-missing rise">
          <h1>Profile not found</h1>
          <p>We couldn't find @{normalizeHandle(routeUsername)}.</p>
          <Link className="btn-solid" to="/">Back home</Link>
        </div>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="pf-page">
        <div className="pf-hero pf-skel-block" />
      </main>
    );
  }

  const daily = dailyState(viewer);
  const comments = posts.reduce((sum, p) => sum + (p.replies?.length || 0), 0);
  const reactions = posts.reduce((sum, p) => sum + (Array.isArray(p.likes) ? p.likes.length : 0), 0);
  const stats = [
    ['Total Posts', posts.length],
    ['Comments', comments],
    ['Reactions', reactions],
    ['Followers', followersCount],
    ['Following', profile.following.length]
  ];

  return (
    <main className="pf-page">
      <section className="pf-hero rise">
        <div className="pf-cover">
          {profile.coverPhoto && (
            <img src={img(profile.coverPhoto)} alt="" style={{ objectPosition: `${profile.coverPosition?.x ?? 50}% ${profile.coverPosition?.y ?? 50}%` }} />
          )}
        </div>
        <div className="pf-head">
          <Avatar src={profile.avatar} className="pf-avatar" />
          <div className="pf-id">
            <h1>{profile.name}</h1>
            <p className="pf-handle">@{profile.username}</p>
            <p className="pf-joined">{profile.joined}</p>
          </div>
          <div className="pf-actions">
            {isOwn && (
              <div className="pf-balance" aria-label="Your balance">
                <span><img src={SunCurr} alt="Suns" />{(viewer.suns ?? 0).toLocaleString()}</span>
                <i aria-hidden="true">/</i>
                <span><img src={StarCurr} alt="Stars" />{(viewer.stars ?? 0).toLocaleString()}</span>
              </div>
            )}
            {isOwn && <Link className="btn-ghost" to="/profile/edit">Edit Profile</Link>}
            {!isOwn && routeUsername && (
              <button type="button" className={isFollowing ? 'btn-solid' : 'btn-ghost'} onClick={toggleFollow}>
                {isFollowing ? 'Unfollow' : 'Follow'}
              </button>
            )}
          </div>
        </div>
      </section>

      <div className="pf-cols">
        <aside className="pf-side">
          <div className="pf-card rise" style={{ '--d': '80ms' }}>
            <h2>Activity Overview</h2>
            <dl className="pf-stats">
              {stats.map(([label, value]) => (
                <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
              ))}
            </dl>
          </div>

          {isOwn && (
            <div className="pf-card rise" style={{ '--d': '160ms' }}>
              <h2>Platform Features</h2>
              <div className="pf-features">
                {FEATURES.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className="pf-feature"
                    disabled={f.soon}
                    onClick={() => f.id === 'rewards' && setRewardsOpen(true)}
                  >
                    <span className="pf-feature-icon">{f.icon}</span>
                    <span>{f.label}</span>
                    {f.soon && <em>Soon</em>}
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>

        <section className="pf-feed">
          {isOwn && (
            <div className="pf-card pf-composer rise" style={{ '--d': '120ms' }}>
              <textarea
                placeholder="What are you Juan-dering about?"
                value={newPost}
                rows={1}
                maxLength={1000}
                onChange={(e) => {
                  setNewPost(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = `${e.target.scrollHeight}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (newPost.trim()) setConfirmOpen(true);
                  }
                }}
              />
              <div className="pf-composer-bar">
                <button type="button" className="btn-solid" disabled={!newPost.trim()} onClick={() => setConfirmOpen(true)}>Post</button>
              </div>
            </div>
          )}

          {posts.length === 0 ? (
            <div className="pf-card"><p className="pf-empty">No posts yet from this profile.</p></div>
          ) : posts.map((post, i) => {
            const id = post._id || post.id;
            const likes = Array.isArray(post.likes) ? post.likes : [];
            const replies = Array.isArray(post.replies) ? post.replies : [];
            const liked = Boolean(viewer?.email) && likes.includes(myHandle);
            const avatarOf = (who, own) => own || (normalizeHandle(who) === normalizeHandle(profile.username) ? profile.avatar : '') || (normalizeHandle(who) === viewerHandle ? viewer?.avatar : '') || '';
            return (
              <article key={id} className="pf-card pf-post rise" style={{ '--d': `${Math.min(i, 6) * 60}ms` }}>
                <header>
                  <Avatar src={avatarOf(post.user, post.avatar)} className="pf-mini" />
                  <div>
                    <strong>{post.user}</strong>
                    <span>{timeAgo(post.createdAt)}</span>
                  </div>
                </header>
                <p className="pf-post-text">{post.text}</p>
                <footer>
                  <button type="button" className={liked ? 'liked' : ''} onClick={() => toggleLike(id)} aria-pressed={liked}>
                    {liked ? '❤️' : '♡'} {likes.length}
                  </button>
                  <button type="button" onClick={() => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))} aria-expanded={Boolean(expanded[id])}>
                    💬 {replies.length} {replies.length === 1 ? 'Reply' : 'Replies'}
                  </button>
                </footer>

                {expanded[id] && (
                  <div className="pf-replies">
                    {replies.map((reply, n) => (
                      <div key={`${id}-${n}`} className="pf-reply">
                        <Avatar src={avatarOf(reply.user, reply.avatar)} className="pf-mini sm" />
                        <p><strong>{reply.user}</strong> {reply.text}</p>
                      </div>
                    ))}
                    <div className="pf-reply-box">
                      <input
                        type="text"
                        placeholder="Write a comment..."
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
        </section>
      </div>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} label="Post to community">
        <h3>Post to Community?</h3>
        <p>Are you sure your post contents are correct? Posts cannot be deleted or edited once submitted.</p>
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={() => setConfirmOpen(false)}>Cancel</button>
          <button type="button" className="btn-solid" onClick={createPost}>Post it!</button>
        </div>
      </Modal>

      {isOwn && (
        <>
          <RewardsCenter
            open={rewardsOpen}
            onClose={() => setRewardsOpen(false)}
            user={viewer}
            dailyStreak={daily.streak}
            onOpenDaily={() => setDailyOpen(true)}
          />
          <DailyRewards
            open={dailyOpen}
            onClose={() => setDailyOpen(false)}
            streak={daily.streak}
            claimedToday={daily.claimedToday}
            onClaim={claimDaily}
          />
        </>
      )}

      <Feedback state={feedback} onClose={() => setFeedback((f) => ({ ...f, open: false }))} />
    </main>
  );
}
