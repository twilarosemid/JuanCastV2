// Tutorial bookkeeping. "Done" is remembered per account in this browser (localStorage), so a skipped or
// finished tutorial never comes back on its own. It can always be replayed from Settings.
import { isAdminUser, isArtistUser } from './api';

const doneKey = (email) => `juancast_tutorial_v1:${String(email || '').toLowerCase()}`;
const newKey = (email) => `juancast_tutorial_new:${String(email || '').toLowerCase()}`;
const NEW_WINDOW_MS = 3 * 24 * 60 * 60 * 1000; // accounts made in the last 3 days count as new

const read = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key, value) => { try { localStorage.setItem(key, value); } catch { /* private mode: it may show again, that is fine */ } };

let running = false; // true while the tutorial is on screen
const announce = () => window.dispatchEvent(new Event('juancast-tutorial-state'));

// SignUp calls this right after an account is created.
export const flagNewAccount = (email) => { if (email) write(newKey(email), '1'); };

export const markTutorialDone = (email) => {
  if (email) write(doneKey(email), '1');
  running = false;
  announce();
};

export const setTutorialRunning = (value) => {
  if (running === value) return;
  running = value;
  announce();
};

export const isTutorialRunning = () => running;

// Should this signed-in person get the tutorial on their own (first visit)?
export const tutorialPending = (user) => {
  if (!user?.email || isAdminUser(user) || isArtistUser(user)) return false;
  if (read(doneKey(user.email)) === '1') return false;
  if (read(newKey(user.email)) === '1') return true;
  const made = user.createdAt ? new Date(user.createdAt).getTime() : 0;
  return made > 0 && Date.now() - made < NEW_WINDOW_MS;
};

// Settings > "Replay tutorial"
export const startTutorial = () => window.dispatchEvent(new Event('juancast-start-tutorial'));
