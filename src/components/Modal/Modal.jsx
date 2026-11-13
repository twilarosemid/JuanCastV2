import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import useMountTransition from '../../hooks/useMountTransition';
import './Modal.css';

// Several dialogs can be open at once (e.g. a result popup opening as a form closes).
// Count the locks so the page only becomes scrollable again when the LAST one closes.
let scrollLocks = 0;
const lockScroll = () => {
  if (scrollLocks++ === 0) document.body.style.overflow = 'hidden';
};
const unlockScroll = () => {
  scrollLocks = Math.max(0, scrollLocks - 1);
  if (scrollLocks === 0) document.body.style.overflow = '';
};

// Animated dialog: overlay fades + blurs in, card springs up, and both animate out on close.
export default function Modal({ open, onClose, label, role = 'dialog', className = '', children }) {
  const { mounted, visible } = useMountTransition(open, 280);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    lockScroll();
    const onKey = (e) => { if (e.key === 'Escape') closeRef.current?.(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      unlockScroll();
    };
  }, [open]);

  if (!mounted) return null;

  return createPortal(
    <div className={`modal-overlay ${visible ? 'show' : ''}`} onClick={onClose}>
      <div className={`modal ${className}`.trim()} role={role} aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>,
    document.body
  );
}
