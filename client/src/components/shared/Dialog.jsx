import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';

/**
 * Dialog system — replaces window.confirm / window.alert / window.prompt
 * with portal-rendered, brand-styled, accessible modals. Hook-based API:
 *
 *   const confirm = useConfirm();
 *   if (await confirm({ title: 'Remove witness?', body: '...', danger: true })) {
 *     await doRemove();
 *   }
 *
 *   const prompt = usePrompt();
 *   const ref = await prompt({ title: 'HSE reference', label: 'Number from F2508' });
 *   if (ref != null) { await save(ref); }
 *
 *   const alert = useAlert();
 *   await alert({ title: 'Download failed', body: err.message });
 *
 * The provider holds one dialog open at a time, which matches how every
 * existing window.* call site was invoked.
 */

const DialogContext = createContext(null);

export function DialogProvider({ children }) {
  const [confirmOpts, setConfirmOpts] = useState(null);
  const [promptOpts, setPromptOpts]   = useState(null);
  const [alertOpts, setAlertOpts]     = useState(null);
  const resolverRef = useRef(null);

  const settle = (value) => {
    const r = resolverRef.current;
    resolverRef.current = null;
    setConfirmOpts(null);
    setPromptOpts(null);
    setAlertOpts(null);
    r?.(value);
  };

  const confirm = useCallback((opts) => new Promise((resolve) => {
    resolverRef.current = resolve;
    setConfirmOpts(opts || {});
  }), []);

  const prompt = useCallback((opts) => new Promise((resolve) => {
    resolverRef.current = resolve;
    setPromptOpts(opts || {});
  }), []);

  const alert = useCallback((opts) => new Promise((resolve) => {
    resolverRef.current = resolve;
    setAlertOpts(opts || {});
  }), []);

  return (
    <DialogContext.Provider value={{ confirm, prompt, alert }}>
      {children}
      {confirmOpts && <ConfirmModal {...confirmOpts} onClose={settle} />}
      {promptOpts  && <PromptModal  {...promptOpts}  onClose={settle} />}
      {alertOpts   && <AlertModal   {...alertOpts}   onClose={settle} />}
    </DialogContext.Provider>
  );
}

const useDialog = () => {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialog/useConfirm/usePrompt/useAlert must be used inside <DialogProvider>');
  return ctx;
};
export const useConfirm = () => useDialog().confirm;
export const usePrompt  = () => useDialog().prompt;
export const useAlert   = () => useDialog().alert;

/* ============================================================
 * Confirm modal — yes/no decision, optionally destructive.
 * Returns true on confirm, false on cancel/Escape/backdrop.
 * ============================================================ */
function ConfirmModal({ title, body, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false, onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose(false);
      // Enter confirms only for non-destructive — guards against accidental confirm.
      if (e.key === 'Enter' && !danger) onClose(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [danger, onClose]);

  return createPortal(
    <div className="modal-backdrop" onClick={() => onClose(false)}>
      <div
        className="modal"
        onClick={e => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dlg-confirm-title"
        aria-describedby="dlg-confirm-body"
      >
        <div className="modal-h">
          <div>
            <div className="modal-title" id="dlg-confirm-title">{title}</div>
          </div>
          <button className="icon-btn" onClick={() => onClose(false)} aria-label="Close dialog">
            <Icon name="close" size={18} />
          </button>
        </div>
        {body && (
          <div className="modal-body">
            <div id="dlg-confirm-body" style={{ fontSize: 13, color: 'var(--sds-fg-secondary)', lineHeight: 1.55 }}>{body}</div>
          </div>
        )}
        <div className="modal-f">
          <button className="btn btn-secondary" onClick={() => onClose(false)} autoFocus={danger}>
            {cancelLabel}
          </button>
          <button
            className={danger ? 'btn btn-danger' : 'btn btn-primary'}
            onClick={() => onClose(true)}
            autoFocus={!danger}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ============================================================
 * Prompt modal — single-input. Resolves to the string value or
 * null if the user cancels/dismisses.
 * ============================================================ */
function PromptModal({ title, body, label, placeholder = '', defaultValue = '', confirmLabel = 'Submit', cancelLabel = 'Cancel', required = false, type = 'text', onClose }) {
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const disabled = required && !value.trim();
  const submit = (e) => {
    e?.preventDefault();
    if (disabled) return;
    onClose(value);
  };

  return createPortal(
    <div className="modal-backdrop" onClick={() => onClose(null)}>
      <form
        className="modal"
        onSubmit={submit}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dlg-prompt-title"
      >
        <div className="modal-h">
          <div>
            <div className="modal-title" id="dlg-prompt-title">{title}</div>
          </div>
          <button type="button" className="icon-btn" onClick={() => onClose(null)} aria-label="Close dialog">
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="modal-body">
          {body && <div style={{ fontSize: 13, color: 'var(--sds-fg-secondary)', lineHeight: 1.55, marginBottom: 12 }}>{body}</div>}
          <div className="field">
            {label && (
              <label className="label" htmlFor="dlg-prompt-input">
                {label}{required && <span className="req" aria-label="required"> *</span>}
              </label>
            )}
            <input
              id="dlg-prompt-input"
              className="input"
              type={type}
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder={placeholder}
              autoFocus
            />
          </div>
        </div>
        <div className="modal-f">
          <button type="button" className="btn btn-secondary" onClick={() => onClose(null)}>{cancelLabel}</button>
          <button type="submit" className="btn btn-primary" disabled={disabled}>{confirmLabel}</button>
        </div>
      </form>
    </div>,
    document.body
  );
}

/* ============================================================
 * Alert modal — single OK button. Resolves to undefined when
 * dismissed. Used to replace `window.alert` calls for failure
 * messages where a toast isn't suitable (e.g. blocking errors).
 * ============================================================ */
function AlertModal({ title, body, dismissLabel = 'OK', tone = 'info', onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' || e.key === 'Enter') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const iconName = tone === 'error' ? 'warning' : tone === 'success' ? 'check' : 'info';

  return createPortal(
    <div className="modal-backdrop" onClick={() => onClose()}>
      <div
        className="modal"
        onClick={e => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dlg-alert-title"
      >
        <div className="modal-h">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className={`dlg-alert-icon dlg-alert-icon-${tone}`} aria-hidden="true">
              <Icon name={iconName} size={18} />
            </span>
            <div className="modal-title" id="dlg-alert-title">{title}</div>
          </div>
        </div>
        {body && (
          <div className="modal-body">
            <div style={{ fontSize: 13, color: 'var(--sds-fg-secondary)', lineHeight: 1.55 }}>{body}</div>
          </div>
        )}
        <div className="modal-f">
          <button className="btn btn-primary" onClick={() => onClose()} autoFocus>{dismissLabel}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
