import { useEffect, useState } from 'react';
import { getStartupState } from '../startupAdGate';

export default function useStartupState() {
  const [state, setState] = useState(getStartupState);
  useEffect(() => {
    const sync = () => setState(getStartupState());
    window.addEventListener('juancast-startup-state', sync);
    sync();
    return () => window.removeEventListener('juancast-startup-state', sync);
  }, []);
  return state;
}
