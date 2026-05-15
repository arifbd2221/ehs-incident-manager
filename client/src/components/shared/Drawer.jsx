import { useEffect } from 'react';
import { createPortal } from 'react-dom';

export default function Drawer({ open, onClose, width = 560, className, children }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="drawer-backdrop" onClick={onClose}>
      <div
        className={`drawer ${className || ''}`}
        style={{ width }}
        role="dialog"
        aria-modal="true"
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
