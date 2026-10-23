export const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export const getJSON = async (path) => {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error(`Request failed: ${path}`);
  return res.json();
};

// Works for both "/uploads/x.png" and full URLs
export const img = (url = '') =>
  !url ? '' : /^(https?:|data:)/.test(url) ? url : `${API}${url}`;

// Logged-in user saved by your old site (expects { email, ... } under the "user" key)
export const getUser = () => {
  try { return JSON.parse(localStorage.getItem('user')); } catch { return null; }
};

export const VOTE_COST = 1; // stars spent per vote

export const castVote = async (rankingId, user) => {
  const res = await fetch(`${API}/api/rankings/${rankingId}/vote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: user.email, currencyType: 'stars', cost: VOTE_COST })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Vote failed');
  return data;
};
