import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { API, getJSON, img, getUser, saveUser, mergeUser, clearUser, isAdminUser } from '../../api';
import logoImg from '../../assets/juancast_logo.webp';
import StarCurr from '../../assets/StarCurr.png';
import SunCurr from '../../assets/SunCurr.png';
import DailyRewards, { dailyState } from '../DailyRewards/DailyRewards';
import useStartupState from '../../hooks/useStartupState';
import useTutorialPending from '../../hooks/useTutorialPending';
import useActivePowerups, { clock } from '../../hooks/useActivePowerups';
import NotificationsMenu from '../NotificationsMenu/NotificationsMenu';
import useMountTransition from '../../hooks/useMountTransition';
import { markEntered } from '../../landingGate';
import './Navbar.css';

// Routes (see App.jsx). Links use react-router, so pages change without reloading.
const DAILY_PROMPT_KEY = 'juancast_daily_prompt';
let dailyAutoShown = false; // in memory: resets on refresh so the check-in pops once per page load

const LINKS = {
  home: '/',
  vote: '/polls',
  community: '/community',
  market: '/market',
  profile: '/profile',
  transactions: '/transactions',
  login: '/login',
  settings: '/settings'
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
const CalendarIcon = () => (
  <Icon><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /><path d="m9 16 2 2 4-4" /></Icon>
);
const ShieldIcon = () => (
  <Icon><path d="M12 3 4 6v6c0 4.5 3.2 8.2 8 9 4.8-.8 8-4.5 8-9V6z" /><path d="m9 12 2 2 4-4" /></Icon>
);
const BoltIcon = () => (
  <Icon><path d="M13 2 4 14h7l-1 8 9-12h-7z" /></Icon>
);
const LogoutIcon = () => (
  <Icon><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></Icon>
);

export default function Navbar() {
  const user = getUser();           // saved by your login page under "user"
  const loggedIn = Boolean(user?.email);
  const [, refresh] = useState(0);
  const [unread, setUnread] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const [dailyOpen, setDailyOpen] = useState(false);
  const [dailyWanted, setDailyWanted] = useState(false);
  const [tipKey, setTipKey] = useState(null); // powerup whose time-left tooltip was opened by tapping
  const powerups = useActivePowerups(loggedIn ? user.email : '');
  const startupState = useStartupState();
  const tutorialPending = useTutorialPending();
  const [condensed, setCondensed] = useState(false);
  const menuRef = useRef(null);
  const { mounted: menuMounted, visible: menuVisible } = useMountTransition(open, 220);
  const { mounted: notifMounted, visible: notifVisible } = useMountTransition(notifOpen, 220);

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

  // close the account menu and notifications whenever the page changes
  useEffect(() => { setOpen(false); setNotifOpen(false); }, [pathname]);

  // unread count on the bell: loaded on login, then refreshed every minute and whenever you come back to the tab
  useEffect(() => {
    if (!loggedIn || !user.username) { setUnread(0); return undefined; }
    let alive = true;
    const load = () => getJSON(`/api/notifications?username=${encodeURIComponent(user.username)}`)
      .then((list) => { if (alive && Array.isArray(list)) setUnread(list.filter((n) => !n.isRead).length); })
      .catch(() => {});
    load();
    const id = setInterval(load, 60000);
    window.addEventListener('focus', load);
    return () => { alive = false; clearInterval(id); window.removeEventListener('focus', load); };
  }, [loggedIn, user?.username]);

  // a tapped powerup tooltip (phones have no hover) closes itself after a few seconds
  useEffect(() => {
    if (!tipKey) return undefined;
    const id = setTimeout(() => setTipKey(null), 8000);
    const away = (e) => { if (!e.target.closest?.('.pu-btn')) setTipKey(null); };
    document.addEventListener('pointerdown', away);
    return () => { clearTimeout(id); document.removeEventListener('pointerdown', away); };
  }, [tipKey]);

  // lets any page open the popup: window.dispatchEvent(new Event('juancast-open-notifications'))
  useEffect(() => {
    const show = () => { setOpen(false); setNotifOpen(true); };
    window.addEventListener('juancast-open-notifications', show);
    return () => window.removeEventListener('juancast-open-notifications', show);
  }, []);

  // close the account menu / notifications on outside click or Escape
  useEffect(() => {
    if (!open && !notifOpen) return undefined;
    const onClick = (e) => { if (!menuRef.current?.contains(e.target)) { setOpen(false); setNotifOpen(false); } };
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(false); setNotifOpen(false); } };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, notifOpen]);

  // web view: once the page scrolls past the banner, the bar shrinks into a compact floating pill
  // (pages without a banner condense after a short scroll)
  useEffect(() => {
    const check = () => {
      const hero = document.getElementById('top');
      setCondensed(hero ? hero.getBoundingClientRect().bottom < 90 : window.scrollY > 120);
    };
    check();
    // the new page scrolls to the top a moment after the route changes; re-check once it has
    const raf = requestAnimationFrame(() => requestAnimationFrame(check));
    const later = setTimeout(check, 250);
    window.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(later);
      window.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
    };
  }, [pathname]);

  // phones: the balance + buffs get their own row under the top bar, so pages need to clear a taller bar (see styles/mobile.css)
  useEffect(() => {
    const root = document.documentElement;
    if (loggedIn) root.dataset.navStatus = 'on'; else delete root.dataset.navStatus;
    return () => { delete root.dataset.navStatus; };
  }, [loggedIn]);

  const daily = dailyState(user);

  // right after a login, pop the daily check-in once if today's reward is still waiting
  useEffect(() => {
    if (!loggedIn) return;
    let flagged = false;
    try { flagged = sessionStorage.getItem(DAILY_PROMPT_KEY) === '1'; sessionStorage.removeItem(DAILY_PROMPT_KEY); } catch { /* ignore */ }
    // also on every fresh page load / refresh while logged in (once per load; admins skip it)
    const onLoad = !dailyAutoShown && !isAdminUser(getUser());
    if ((flagged || onLoad) && !daily.claimedToday) { dailyAutoShown = true; setDailyWanted(true); }
  }, [loggedIn, pathname]);

  // the startup popup ad goes first: on the home page the check-in waits until that popup is closed
  // (or until we know there isn't one). Anywhere else, or if it takes too long, it opens right away.
  const waitingForAd = pathname === '/' && startupState !== 'done';
  useEffect(() => {
    if (!dailyWanted) return undefined;
    if (tutorialPending) return undefined; // new users get the tutorial first; the check-in opens right after it
    if (!waitingForAd) {
      const id = setTimeout(() => { setDailyWanted(false); if (!dailyState(getUser()).claimedToday) setDailyOpen(true); }, 350);
      return () => clearTimeout(id);
    }
    const giveUp = setTimeout(() => { setDailyWanted(false); setDailyOpen(true); }, 15000);
    return () => clearTimeout(giveUp);
  }, [dailyWanted, waitingForAd, tutorialPending]);

  // lets any page open the check-in: window.dispatchEvent(new Event('juancast-open-daily'))
  useEffect(() => {
    const show = () => setDailyOpen(true);
    window.addEventListener('juancast-open-daily', show);
    return () => window.removeEventListener('juancast-open-daily', show);
  }, []);

  const claimDaily = async () => {
    const current = getUser();
    if (!current?.email) { setDailyOpen(false); return { ok: false, message: 'Please log in first.' }; }
    try {
      const res = await fetch(`${API}/api/users/daily-claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: current.email })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || data.error || 'Failed to claim reward.');
      const gained = Math.max(0, (data.stars || 0) - (current.stars || 0));
      saveUser(mergeUser(current, data));
      return { ok: true, day: data.dailyStreak, gained };
    } catch (error) {
      return { ok: false, message: error.message || 'Server error. Please try again later.' };
    }
  };

  const logout = () => {
    // you are already inside the site, so logging out keeps you on the page you were on instead of bouncing to the landing page
    markEntered();
    clearUser();
    setOpen(false);
  };

  const name = user?.username || user?.fullName || user?.email || '';
  const initial = name.replace(/^@/, '').charAt(0).toUpperCase() || '?';

  return (
    <>
    <nav className={`site-nav${condensed ? ' condensed' : ''}`}>
      <Link className="logo" to={LINKS.home} aria-label="JuanCast home"><img src={logoImg} alt="JuanCast" /></Link>

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
              data-tour={`nav-${n.key}`}
              aria-current={active === n.key ? 'page' : undefined}
              to={n.href}
            >
              <span className="nav-ico"><TabIcon name={n.icon} /></span>
              <span className="nav-label">{n.label}</span>
            </Link>
          ))}
        </div>
        <span className="divider" aria-hidden="true" />

        {loggedIn && (
          <>
            {powerups.map((p, i) => (
              <button
                key={p.key}
                type="button"
                className={`icon-btn pu-btn${i > 0 ? ' pu-secondary' : ''}`}
                data-open={tipKey === p.key}
                aria-label={`${p.name}${p.multiplier ? ` x${p.multiplier}` : ''}, ${clock(p.left)} left`}
                onClick={() => setTipKey((k) => (k === p.key ? null : p.key))}
              >
                <span className="pu-pie" style={{ '--pct': `${p.pct}%` }} aria-hidden="true" />
                {p.image ? <img className="pu-img" src={p.image} alt="" /> : <span className="pu-img pu-bolt"><BoltIcon /></span>}
                {i === 0 && powerups.length > 1 && <i className="pu-count" aria-hidden="true">+{powerups.length - 1}</i>}
                <span className="pu-tip" role="tooltip">
                  <b>{p.name}{p.multiplier ? ` ×${p.multiplier}` : ''}</b>
                  <span>{clock(p.left)} left</span>
                  {/* phones show one powerup icon, so its tooltip lists the others too */}
                  {i === 0 && powerups.slice(1).map((o) => (
                    <div className="pu-extra" key={o.key}>
                      <b>{o.name}{o.multiplier ? ` ×${o.multiplier}` : ''}</b>
                      <span>{clock(o.left)} left</span>
                    </div>
                  ))}
                </span>
              </button>
            ))}
            <span className="nav-balance" data-tour="balance" aria-label="Your balance">
              <span><img src={SunCurr} alt="Suns" />{Number(user?.suns ?? 0).toLocaleString()}</span>
              <i aria-hidden="true">/</i>
              <span><img src={StarCurr} alt="Stars" />{Number(user?.stars ?? 0).toLocaleString()}</span>
            </span>
          </>
        )}

        <button
          type="button"
          className="icon-btn"
          data-tour="bell"
          aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
          aria-haspopup="dialog"
          aria-expanded={notifOpen}
          onClick={() => { setOpen(false); setNotifOpen((o) => !o); }}
        >
          <span className="bell"><BellIcon /></span>
          {unread > 0 && <span className="badge">{unread > 9 ? '9+' : unread}</span>}
        </button>

        <button
          type="button"
          className={`avatar ${open ? 'open' : ''}`}
          data-tour="avatar"
          aria-label="Account menu"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => { setNotifOpen(false); setOpen((o) => !o); }}
        >
          {loggedIn ? (user.avatar ? <img src={img(user.avatar)} alt="" /> : initial) : <UserIcon />}
        </button>

        {notifMounted && (
          <NotificationsMenu visible={notifVisible} onClose={() => setNotifOpen(false)} user={user} onUnreadChange={setUnread} />
        )}

        {menuMounted && (
          <div className={`menu ${menuVisible ? 'show' : ''}`} role="menu">
            {loggedIn ? (
              <>
                <div className="menu-head">
                  <span className="menu-name">{name.startsWith('@') ? name : `@${name}`}</span>
                </div>
                <div className="sep" />
                <Link role="menuitem" to={LINKS.profile}><UserIcon /> Profile</Link>
                <button role="menuitem" type="button" onClick={() => { setOpen(false); setDailyOpen(true); }}>
                  <CalendarIcon /> Daily Check-In
                  {!daily.claimedToday && <span className="daily-dot" aria-label="Reward available" />}
                </button>
                <Link role="menuitem" to={LINKS.transactions}><TransactionsIcon /> Transactions</Link>
                {isAdminUser(user) && <Link role="menuitem" to="/admin"><ShieldIcon /> Admin Dashboard</Link>}
                <Link role="menuitem" to={LINKS.settings}><SettingsIcon /> Settings</Link>
                <div className="sep" />
                <button role="menuitem" type="button" onClick={logout}><LogoutIcon /> Logout</button>
              </>
            ) : (
              <>
                <Link role="menuitem" to="/landing"><LoginIcon /> Login</Link>
                <Link role="menuitem" to={LINKS.settings}><SettingsIcon /> Settings</Link>
              </>
            )}
          </div>
        )}
      </div>

      {/* phones only: the balance on a row of its own (the desktop pill above hides it on phones); the powerup icon sits in the top row beside the bell */}
      {loggedIn && (
        <div className="nav-status">
          <span className="ns-chip ns-balance" data-tour="balance" aria-label="Your balance">
            <span><img src={SunCurr} alt="Suns" />{Number(user?.suns ?? 0).toLocaleString()}</span>
            <i aria-hidden="true" />
            <span><img src={StarCurr} alt="Stars" />{Number(user?.stars ?? 0).toLocaleString()}</span>
          </span>
        </div>
      )}
    </nav>
    {loggedIn && (
      <DailyRewards
        open={dailyOpen}
        onClose={() => setDailyOpen(false)}
        streak={daily.streak}
        claimedToday={daily.claimedToday}
        onClaim={claimDaily}
      />
    )}
    </>
  );
}
