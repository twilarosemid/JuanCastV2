import { useEffect, useState } from 'react';

// True on a wide screen with a mouse (a normal desktop browser). Phones, tablets and the
// mobile app get false, so side ads never show there.
const QUERY = '(min-width: 1101px) and (hover: hover) and (pointer: fine)';

export default function useDesktopWeb() {
  const get = () => typeof window !== 'undefined' && window.matchMedia(QUERY).matches;
  const [yes, setYes] = useState(get);

  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const on = () => setYes(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  return yes;
}
