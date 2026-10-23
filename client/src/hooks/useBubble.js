import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

// Same idea as the navbar's white bubble, but reusable: it slides to whichever item is active.
// Usage: const { setRef, bubble } = useBubble(activeKey, optionalDepThatChangesLayout)
export default function useBubble(activeKey, dep) {
  const refs = useRef({});
  const [bubble, setBubble] = useState(null);

  const measure = useCallback(() => {
    const el = refs.current[activeKey];
    if (el) setBubble({ x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight });
  }, [activeKey]);

  useLayoutEffect(measure, [measure, dep]);
  useEffect(() => {
    window.addEventListener('resize', measure);
    document.fonts?.ready.then(measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  const setRef = (key) => (el) => { refs.current[key] = el; };
  const style = bubble
    ? { width: bubble.w, height: bubble.h, transform: `translate(${bubble.x}px, ${bubble.y}px)` }
    : null;
  return { setRef, style };
}
