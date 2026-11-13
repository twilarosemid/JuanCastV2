import { useEffect, useState } from 'react';

// 0 at the top of the page, 1 after scrolling ~75% of the screen height
export default function useScrollFade() {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const onScroll = () =>
      setValue(Math.min(1, window.scrollY / (window.innerHeight * 0.75)));
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return value;
}
