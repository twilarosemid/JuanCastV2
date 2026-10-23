import { useEffect, useState } from 'react';
import { getUser } from '../api';

// Returns the saved user and re-reads it whenever it changes (login, logout, converting, spinning).
export default function useUser() {
  const [user, setUser] = useState(getUser);

  useEffect(() => {
    const sync = () => setUser(getUser());
    window.addEventListener('juancast-user-updated', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('juancast-user-updated', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  return user;
}
