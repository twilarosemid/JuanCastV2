import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { API, getJSON, img, mergeUser, normalizeHandle, saveUser } from '../../api';
import useUser from '../../hooks/useUser';
import Modal from '../../components/Modal/Modal';
import Feedback from '../../components/Feedback/Feedback';
import QRCode from '../../components/QRCode/QRCode';
import { ArtistHero, ArtistFeed } from './ArtistProfile';
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
  totalVotes: Math.max(0, Number(data.totalVotes) || 0),
  followers: Array.isArray(data.followers) ? data.followers : [],
  following: Array.isArray(data.following) ? data.following : [],
  role: data.role || 'user',
  coverPhoto: data.coverPhoto || '',
  bio: data.bio || ''
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

// Same size and baseline for both footer buttons (emoji and text glyphs sat at different heights)
const HeartIcon = ({ filled }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.7 4.8 6.2 4.5c2-.2 3.9.8 5.8 3 1.9-2.2 3.8-3.2 5.8-3 3.5.3 5.3 3.9 3.8 7.3C19.5 16.4 12 21 12 21z" />
  </svg>
);
const ReplyIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 11.5a8.5 8.5 0 0 1-12.4 7.5L3 20.5l1.6-4.9A8.5 8.5 0 1 1 21 11.5z" />
  </svg>
);

const CloseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
  </svg>
);
const ChevronIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 6l6 6-6 6" />
  </svg>
);
const PeopleIcon = () => (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="9" cy="8" r="3.5" /><path d="M2.5 20v-1a5 5 0 0 1 5-5h3a5 5 0 0 1 5 5v1" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.4A5 5 0 0 1 21.5 19v1" />
  </svg>
);

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
  const [peopleList, setPeopleList] = useState(null); // 'followers' | 'following' | null
  const [peopleQuery, setPeopleQuery] = useState('');
  const [qrOpen, setQrOpen] = useState(false);
  const [previewFan, setPreviewFan] = useState(false); // artists: see their own page the way fans see it
  const [linkCopied, setLinkCopied] = useState(false);
  const [people, setPeople] = useState({});            // handle -> { avatar, name } (filled in lazily)
  const [feedback, setFeedback] = useState({ open: false, type: 'error', message: '' });

  // when a followers/following list opens, look up each person's avatar and name (first 60)
  useEffect(() => {
    if (!peopleList || !profile) return undefined;
    const handles = (peopleList === 'followers' ? profile.followers : profile.following).slice(0, 60);
    let cancelled = false;
    handles.forEach((h) => {
      const key = normalizeHandle(h);
      if (!key || people[key]) return;
      getJSON(`/api/users/profile/${encodeURIComponent(key)}`)
        .then((data) => { if (!cancelled) setPeople((prev) => ({ ...prev, [key]: { avatar: data.avatar || '', name: data.fullName || '' } })); })
        .catch(() => { if (!cancelled) setPeople((prev) => ({ ...prev, [key]: { avatar: '', name: '' } })); });
    });
    return () => { cancelled = true; };
  }, [peopleList, profile?.followers, profile?.following]);

  useEffect(() => { if (!peopleList) setPeopleQuery(''); }, [peopleList]);
  useEffect(() => { setPreviewFan(false); }, [routeUsername]);

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

  // opened from a notification (/profile#post-<id>): open that post's replies and scroll to it, once
  const jumpedTo = useRef('');
  useEffect(() => {
    const match = /^#post-(.+)$/.exec(location.hash || '');
    if (!match || jumpedTo.current === location.hash) return undefined;
    const id = match[1];
    if (!posts.some((p) => (p._id || p.id) === id)) return undefined;
    jumpedTo.current = location.hash;
    setExpanded((prev) => ({ ...prev, [id]: true }));
    const t = setTimeout(() => document.getElementById(`post-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 200);
    return () => clearTimeout(t);
  }, [posts, location.hash]);

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
      setProfile((p) => {
        const others = (p.followers || []).filter((h) => normalizeHandle(h) !== viewerHandle);
        return { ...p, followers: data.isFollowing ? [...others, myHandle] : others };
      });
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

  const balanceChip = (
    <div className="pf-balance" aria-label="Your balance">
      <span><img src={SunCurr} alt="Suns" />{(viewer?.suns ?? 0).toLocaleString()}</span>
      <i aria-hidden="true">/</i>
      <span><img src={StarCurr} alt="Stars" />{(viewer?.stars ?? 0).toLocaleString()}</span>
    </div>
  );

  const isArtist = profile.role === 'artist';
  const ownView = isOwn && !(isArtist && previewFan); // your own page, unless an artist is previewing it as a fan
  const daily = dailyState(viewer);
  const listHandles = peopleList === 'followers' ? profile.followers : peopleList === 'following' ? profile.following : [];
  const peopleTitle = peopleList === 'following' ? 'Following' : 'Followers';
  const query = peopleQuery.trim().replace(/^@/, '').toLowerCase();
  const visibleHandles = query
    ? listHandles.filter((h) => {
        const key = normalizeHandle(h);
        return key.includes(query) || (people[key]?.name || '').toLowerCase().includes(query);
      })
    : listHandles;

  // every profile gets its own QR: scanning it opens that profile
  const profileUrl = `${window.location.origin}/profile/${encodeURIComponent(normalizeHandle(profile.username))}`;
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(profileUrl);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1800);
    } catch {
      say('error', 'Could not copy the link. Please copy it manually.');
    }
  };

  return (
    <main className="pf-page">
      {isArtist ? (
        <ArtistHero
          profile={profile}
          ownView={ownView}
          isOwn={isOwn}
          previewing={isOwn && previewFan}
          onPreview={setPreviewFan}
          isFollowing={isFollowing}
          onToggleFollow={toggleFollow}
          onOpenQR={() => setQrOpen(true)}
          qrValue={profileUrl}
          onProfileChange={(patch) => setProfile((p) => ({ ...p, ...patch }))}
          say={say}
          balance={balanceChip}
        />
      ) : (
      <section className="pf-hero rise">
        <div className="pf-head">
          <div className="pf-ident">
            <Avatar src={profile.avatar} className="pf-avatar" />
            <button type="button" className="pf-qr" onClick={() => setQrOpen(true)} aria-label="Show profile QR code" title="Profile QR">
              <QRCode value={profileUrl} label={`QR code for @${profile.username}`} />
            </button>
          </div>
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
      )}

      <div className="pf-cols">
        <aside className="pf-side">
          <div className="pf-card rise" style={{ '--d': '80ms' }}>
            <h2>Statistics</h2>
            <div className="pf-statgrid">
              <div className="pf-stat pf-stat-wide">
                <span className="pf-stat-label">Total Lifetime Votes</span>
                <strong>{profile.totalVotes.toLocaleString()}</strong>
              </div>
              <button type="button" className="pf-stat" onClick={() => setPeopleList('followers')} aria-label="View followers">
                <span className="pf-stat-label">Followers</span>
                <strong>{followersCount.toLocaleString()}</strong>
                <ChevronIcon />
              </button>
              <button type="button" className="pf-stat" onClick={() => setPeopleList('following')} aria-label="View following">
                <span className="pf-stat-label">Following</span>
                <strong>{profile.following.length.toLocaleString()}</strong>
                <ChevronIcon />
              </button>
            </div>
          </div>

          {ownView && (
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

        {isArtist ? (
          <ArtistFeed profile={profile} ownView={ownView} viewer={viewer} say={say} goLogin={goLogin} />
        ) : (
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
              <article key={id} id={`post-${id}`} className="pf-card pf-post rise" style={{ '--d': `${Math.min(i, 6) * 60}ms` }}>
                <header>
                  <Avatar src={avatarOf(post.user, post.avatar)} className="pf-mini" />
                  <div>
                    <strong><Link className="pf-who" to={`/profile/${encodeURIComponent(normalizeHandle(post.user))}`}>{post.user}</Link></strong>
                    <span>{timeAgo(post.createdAt)}</span>
                  </div>
                </header>
                <p className="pf-post-text">{post.text}</p>
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
                        <Avatar src={avatarOf(reply.user, reply.avatar)} className="pf-mini sm" />
                        <p><strong><Link className="pf-who" to={`/profile/${encodeURIComponent(normalizeHandle(reply.user))}`}>{reply.user}</Link></strong> {reply.text}</p>
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
        )}
      </div>

      <Modal open={Boolean(peopleList)} onClose={() => setPeopleList(null)} label={peopleTitle} className="pf-people-modal">
        <header className="pf-pm-head">
          <h3>{peopleTitle}<span className="pf-pm-count">{listHandles.length}</span></h3>
          <button type="button" className="pf-pm-x" onClick={() => setPeopleList(null)} aria-label="Close"><CloseIcon /></button>
        </header>

        {listHandles.length > 5 && (
          <label className="pf-pm-search">
            <SearchIcon />
            <input
              type="text"
              placeholder="Search people"
              value={peopleQuery}
              onChange={(e) => setPeopleQuery(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </label>
        )}

        {listHandles.length === 0 ? (
          <div className="pf-pm-empty">
            <PeopleIcon />
            <strong>{peopleList === 'following' ? 'Not following anyone yet' : 'No followers yet'}</strong>
            <span>{peopleList === 'following' ? 'Accounts followed will show up here.' : 'When people follow this profile, they will show up here.'}</span>
          </div>
        ) : visibleHandles.length === 0 ? (
          <div className="pf-pm-empty"><SearchIcon /><strong>No matches</strong><span>Try a different name or @username.</span></div>
        ) : (
          <ul className="pf-people">
            {visibleHandles.map((h) => {
              const key = normalizeHandle(h);
              const info = people[key];
              return (
                <li key={key}>
                  <Link to={`/profile/${encodeURIComponent(key)}`} onClick={() => setPeopleList(null)}>
                    <Avatar src={info?.avatar} className="pf-pm-avatar" />
                    <span className="pf-pm-text">
                      {info ? <strong>{info.name || `@${key}`}</strong> : <i className="pf-pm-skel" aria-hidden="true" />}
                      <em>@{key}</em>
                    </span>
                    <ChevronIcon />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Modal>

      <Modal open={qrOpen} onClose={() => setQrOpen(false)} label="Profile QR code" className="pf-qr-modal">
        <header className="pf-pm-head">
          <h3>Profile QR</h3>
          <button type="button" className="pf-pm-x" onClick={() => setQrOpen(false)} aria-label="Close"><CloseIcon /></button>
        </header>
        <div className="pf-qr-big"><QRCode value={profileUrl} label={`QR code for @${profile.username}`} /></div>
        <p className="pf-qr-name"><strong>{profile.name}</strong><span>@{profile.username}</span></p>
        <p className="pf-qr-hint">Scan this code to open this profile on JuanCast.</p>
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={copyLink}>{linkCopied ? 'Link copied!' : 'Copy link'}</button>
          <button type="button" className="btn-solid" onClick={() => setQrOpen(false)}>Done</button>
        </div>
      </Modal>

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
