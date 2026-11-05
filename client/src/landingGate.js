// The landing page greets every new visit. Pressing "Home" on it remembers that for the rest of this
// browser session (closing the tab starts fresh), so "/" then shows the real homepage.
const KEY = 'juancast_entered';

export const hasEntered = () => {
  try { return sessionStorage.getItem(KEY) === '1'; } catch { return false; }
};

export const markEntered = () => {
  try { sessionStorage.setItem(KEY, '1'); } catch { /* private mode: it just shows the landing again next time */ }
  window.dispatchEvent(new Event('juancast-entered'));
};
