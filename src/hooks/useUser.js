import { useEffect, useState } from 'react';
import { getUser } from '../api';

// Returns the saved user and re-reads it whenever it changes (login, logout, converting, spinning).
export default function useUser() {
  const [user, setUser] = useState(getUser);

  useEffect(() => {
    const sync = () => setUser(getUser());
    window.addEventListener('juancast-user-updated', sync);
    window.addEventListener('storage', sync);
    window.addEventListener('focus', sync);
    const timer = setInterval(sync, 60 * 1000); // an open tab is logged out once its 24 hours are up
    return () => {
      window.removeEventListener('juancast-user-updated', sync);
      window.removeEventListener('storage', sync);
      window.removeEventListener('focus', sync);
      clearInterval(timer);
    };
  }, []);

  return user;
}
