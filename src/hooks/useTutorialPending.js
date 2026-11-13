import { useEffect, useState } from 'react';
import { getUser } from '../api';
import { isTutorialRunning, tutorialPending } from '../tutorialGate';

// true while a new user still has the tutorial ahead of them (or it is on screen).
// The daily check-in popup waits for this so the two never stack.
export default function useTutorialPending() {
  const calc = () => isTutorialRunning() || tutorialPending(getUser());
  const [pending, setPending] = useState(calc);
  useEffect(() => {
    const sync = () => setPending(calc());
    window.addEventListener('juancast-tutorial-state', sync);
    window.addEventListener('juancast-user-updated', sync);
    sync();
    return () => {
      window.removeEventListener('juancast-tutorial-state', sync);
      window.removeEventListener('juancast-user-updated', sync);
    };
  }, []);
  return pending;
}
