import { useEffect, useState } from 'react';

// mounted: render it. visible: add the "show" class (flip it a tick after mounting so CSS can transition)
export default function useMountTransition(open, ms = 250) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const t = setTimeout(() => setVisible(true), 20);
      return () => clearTimeout(t);
    }
    setVisible(false);
    const t = setTimeout(() => setMounted(false), ms);
    return () => clearTimeout(t);
  }, [open, ms]);

  return { mounted, visible };
}
