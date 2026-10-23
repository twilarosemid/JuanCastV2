import { useEffect, useRef, useState } from 'react';

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Eases a number from its previous value to the new one (0 -> value on first render)
export default function useCountUp(target, duration = 1000) {
  const [value, setValue] = useState(0);
  const from = useRef(0);

  useEffect(() => {
    const to = Number(target) || 0;
    if (reduced()) { from.current = to; setValue(to); return; }
    const start = performance.now();
    const a = from.current;
    let raf;
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      const v = a + (to - a) * eased;
      from.current = v;
      setValue(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return Math.round(value);
}
