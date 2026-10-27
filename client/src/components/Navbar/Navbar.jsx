import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { getJSON, img, getUser, clearUser } from '../../api';
import useMountTransition from '../../hooks/useMountTransition';
import './Navbar.css';

// Routes (see App.jsx). Links use react-router, so pages change without reloading.
const LINKS = {
  home: '/',
  vote: '/polls',
  community: '/community',
  market: '/market',
  profile: '/profile',
  transactions: '/transactions',
  login: '/login',
  settings: '/settings',
  notifications: '/notifications'
};

const NAV = [
  { key: 'home', label: 'Home', href: LINKS.home, icon: 'home' },
  { key: 'vote', label: 'Vote', href: LINKS.vote, icon: 'vote' },
  { key: 'community', label: 'Community', href: LINKS.community, icon: 'community' },
  { key: 'market', label: 'Market', href: LINKS.market, icon: 'market' }
];

const Icon = ({ children }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);
// icons for the bottom tab bar on phones (hidden on desktop)
const TabIcon = ({ name }) => (
  <Icon>
    {name === 'home' && <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M10 21v-6h4v6" /></>}
    {name === 'vote' && <><circle cx="12" cy="12" r="9" /><path d="m8.5 12.5 2.5 2.5 4.5-5" /></>}
    {name === 'community' && <><path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9.5" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>}
    {name === 'market' && <><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><path d="M3 6h18" /><path d="M16 10a4 4 0 0 1-8 0" /></>}
  </Icon>
);
const BellIcon = () => (
  <Icon><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></Icon>
);
const UserIcon = () => (
  <Icon><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></Icon>
);
const SettingsIcon = () => (
  <Icon><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></Icon>
);
const TransactionsIcon = () => (
  <Icon><path d="M4 2v20l3-2 3 2 3-2 3 2 3-2 1 .67V2l-1 .67L17 2l-3 2-3-2-3 2-3-2z" /><path d="M8 8h8M8 12h8M8 16h5" /></Icon>
);
const LoginIcon = () => (
  <Icon><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><path d="m10 17 5-5-5-5" /><path d="M15 12H3" /></Icon>
);
const LogoutIcon = () => (
  <Icon><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></Icon>
);

export default function Navbar() {
  const user = getUser();           // saved by your login page under "user"
  const loggedIn = Boolean(user?.email);
  const [, refresh] = useState(0);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const { mounted: menuMounted, visible: menuVisible } = useMountTransition(open, 220);

  // sliding white "bubble" behind the link of the current page
  const { pathname } = useLocation();
  const active = NAV.find((n) =>
    n.href === '/' ? pathname === '/' : pathname === n.href || pathname.startsWith(`${n.href}/`)
  )?.key ?? null;
  const [bubble, setBubble] = useState(null);
  const linkRefs = useRef({});
  const moveBubble = () => {
    const el = linkRefs.current[active];
    if (el) setBubble({ left: el.offsetLeft, width: el.offsetWidth });
  };
  useLayoutEffect(moveBubble, [active]);
  useEffect(() => {
    window.addEventListener('resize', moveBubble);
    document.fonts?.ready.then(moveBubble); // re-measure once the font has loaded
    return () => window.removeEventListener('resize', moveBubble);
  }, [active]);

  // re-read the saved user when it changes (login, logout, vote balance)
  useEffect(() => {
    const bump = () => refresh((n) => n + 1);
    window.addEventListener('juancast-user-updated', bump);
    window.addEventListener('storage', bump);
    return () => {
      window.removeEventListener('juancast-user-updated', bump);
      window.removeEventListener('storage', bump);
    };
  }, []);

  // close the account menu whenever the page changes
  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    if (!loggedIn || !user.username) return;
    getJSON(`/api/notifications?username=${encodeURIComponent(user.username)}`)
      .then((list) => setUnread(list.filter((n) => !n.isRead).length))
      .catch(console.error);
  }, [loggedIn, user?.username]);

  // close the menu on outside click or Escape
  useEffect(() => {
    if (!open) return;
    const onClick = (e) => { if (!menuRef.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const logout = () => {
    clearUser();
    setOpen(false);
  };

  const name = user?.username || user?.fullName || user?.email || '';
  const initial = name.replace(/^@/, '').charAt(0).toUpperCase() || '?';

  return (
    <nav className="site-nav">
      <Link className="logo" to={LINKS.home}>JuanCast</Link>

      <div className="pill" ref={menuRef}>
        <div className="links">
          {bubble && (
            <span
              className="bubble"
              style={{ width: bubble.width, transform: `translateX(${bubble.left}px)`, opacity: active ? 1 : 0 }}
            />
          )}
          {NAV.map((n) => (
            <Link
              key={n.key}
              ref={(el) => { linkRefs.current[n.key] = el; }}
              className={active === n.key ? 'on' : ''}
              aria-current={active === n.key ? 'page' : undefined}
              to={n.href}
            >
              <span className="nav-ico"><TabIcon name={n.icon} /></span>
              <span className="nav-label">{n.label}</span>
            </Link>
          ))}
        </div>
        <span className="divider" aria-hidden="true" />

        <Link
          className="icon-btn"
          to={LINKS.notifications}
          aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        >
          <span className="bell"><BellIcon /></span>
          {unread > 0 && <span className="badge">{unread > 9 ? '9+' : unread}</span>}
        </Link>

        <button
          type="button"
          className={`avatar ${open ? 'open' : ''}`}
          aria-label="Account menu"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {loggedIn ? (user.avatar ? <img src={img(user.avatar)} alt="" /> : initial) : <UserIcon />}
        </button>

        {menuMounted && (
          <div className={`menu ${menuVisible ? 'show' : ''}`} role="menu">
            {loggedIn ? (
              <>
                <div className="menu-head">{name.startsWith('@') ? name : `@${name}`}</div>
                <div className="sep" />
                <Link role="menuitem" to={LINKS.profile}><UserIcon /> Profile</Link>
                <Link role="menuitem" to={LINKS.transactions}><TransactionsIcon /> Transactions</Link>
                <Link role="menuitem" to={LINKS.settings}><SettingsIcon /> Settings</Link>
                <div className="sep" />
                <button role="menuitem" type="button" onClick={logout}><LogoutIcon /> Logout</button>
              </>
            ) : (
              <>
                <Link role="menuitem" to={LINKS.login}><LoginIcon /> Login</Link>
                <Link role="menuitem" to={LINKS.settings}><SettingsIcon /> Settings</Link>
              </>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
