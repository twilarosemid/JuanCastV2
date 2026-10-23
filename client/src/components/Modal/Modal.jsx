import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import useMountTransition from '../../hooks/useMountTransition';
import './Modal.css';

// Animated dialog: overlay fades + blurs in, card springs up, and both animate out on close.
export default function Modal({ open, onClose, label, role = 'dialog', className = '', children }) {
  const { mounted, visible } = useMountTransition(open, 280);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    const prev = document.body.style.overflow;
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

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
