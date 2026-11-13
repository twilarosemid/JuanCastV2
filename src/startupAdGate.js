// Shared state between the startup popup ad and the daily check-in, so the ad always goes first.
// 'idle' (nothing happened yet) | 'checking' (asking the server) | 'showing' (popup open) | 'done'
let state = 'idle';

export const getStartupState = () => state;
export const setStartupState = (next) => {
  if (state === next) return;
  state = next;
  window.dispatchEvent(new Event('juancast-startup-state'));
};

// Kept in memory only (not sessionStorage): a page refresh resets it, so the popup shows on every
// fresh load of the site, logged in or not. Moving around inside the app doesn't repeat it.
let seen = false;
export const startupSeenThisVisit = () => seen;
export const markStartupSeen = () => { seen = true; };
// call on login so the popup shows again for the person who just signed in
export const resetStartupAd = () => { seen = false; };
