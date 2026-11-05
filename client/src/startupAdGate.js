// Shared state between the startup popup ad and the daily check-in, so the ad always goes first.
// 'idle' (nothing happened yet) | 'checking' (asking the server) | 'showing' (popup open) | 'done'
const SEEN_KEY = 'juancast-startup-ad-seen';
let state = 'idle';

export const getStartupState = () => state;
export const setStartupState = (next) => {
  if (state === next) return;
  state = next;
  window.dispatchEvent(new Event('juancast-startup-state'));
};

export const startupSeenThisVisit = () => {
  try { return sessionStorage.getItem(SEEN_KEY) === '1'; } catch { return false; }
};
export const markStartupSeen = () => {
  try { sessionStorage.setItem(SEEN_KEY, '1'); } catch { /* private mode: it just shows again next time */ }
};
// call on login so the popup shows again for the person who just signed in
export const resetStartupAd = () => {
  try { sessionStorage.removeItem(SEEN_KEY); } catch { /* ignore */ }
};
