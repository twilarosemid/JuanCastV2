export const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export const getJSON = async (path) => {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error(`Request failed: ${path}`);
  return res.json();
};

// Works for both "/uploads/x.png" and full URLs
export const img = (url = '') =>
  !url ? '' : /^(https?:|data:)/.test(url) ? url : `${API}${url}`;

// Your old site saves the logged-in user under "juancast_user" (we also accept "user")
export const USER_KEY = 'juancast_user';
// A login lasts 24 hours, then the person is logged out (loginAt is stamped when they log in)
export const SESSION_MS = 24 * 60 * 60 * 1000;
const readStoredUser = () => {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || localStorage.getItem('user') || 'null');
  } catch {
    return null;
  }
};
export const getUser = () => {
  const user = readStoredUser();
  if (!user) return null;
  if (!user.loginAt) {
    // a session from before this rule: its 24 hours start now
    user.loginAt = Date.now();
    try { localStorage.setItem(USER_KEY, JSON.stringify(user)); } catch { /* ignore */ }
    return user;
  }
  if (Date.now() - user.loginAt > SESSION_MS) {
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem('user');
    setTimeout(() => window.dispatchEvent(new Event('juancast-user-updated')), 0); // not during a render
    return null;
  }
  return user;
};
export const saveUser = (user) => {
  const next = { ...user, loginAt: user.loginAt || readStoredUser()?.loginAt || Date.now() };
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(next));
  } catch {
    // storage full (big avatar image): keep everything except the avatar
    try { localStorage.setItem(USER_KEY, JSON.stringify({ ...next, avatar: '' })); } catch { /* give up quietly */ }
  }
  window.dispatchEvent(new Event('juancast-user-updated'));
};

// Only these fields are copied from a server response into the saved user
const USER_FIELDS = ['email', 'username', 'fullName', 'avatar', 'followers', 'following', 'stars', 'suns', 'dailyStreak', 'lastClaimDate', 'totalVotes', 'createdAt', 'role'];
export const mergeUser = (base, fresh) => {
  const out = { ...base };
  USER_FIELDS.forEach((key) => { if (fresh?.[key] !== undefined) out[key] = fresh[key]; });
  return out;
};

export const normalizeHandle = (value = '') => String(value || '').replace(/^@/, '').trim().toLowerCase();
export const clearUser = () => {
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem('user');
  window.dispatchEvent(new Event('juancast-user-updated'));
};

export const VOTE_COST = 1; // default stars spent per vote

export const castVote = async (rankingId, user, cost = VOTE_COST, currencyType = 'stars') => {
  const res = await fetch(`${API}/api/rankings/${rankingId}/vote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: user.email, currencyType, cost })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Vote failed');
  return data;
};

// ---------- admin ----------
// Roles: user, artist, groupadmin (fanbase groups + artist profiles), systemadmin (website functions and content),
// superadmin (everything, including accounts & roles)
export const isAdminUser = (user) => Boolean(user?.isAdmin || user?.role === 'groupadmin' || user?.role === 'systemadmin' || user?.role === 'admin' || user?.role === 'superadmin');
export const isSuperAdminUser = (user) => user?.role === 'superadmin';
export const isSystemAdminUser = (user) => user?.role === 'systemadmin';
export const isGroupAdminUser = (user) => isAdminUser(user) && !isSuperAdminUser(user) && !isSystemAdminUser(user);
export const isArtistUser = (user) => user?.role === 'artist';

// Calls an admin-only endpoint. Sends the admin token that the server hands out at login.
// Pass a FormData body for uploads (the browser sets its own Content-Type).
export const adminFetch = async (path, options = {}) => {
  const token = getUser()?.token;
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { ...options, headers });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!res.ok) {
    const err = new Error(data?.message || data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
};
