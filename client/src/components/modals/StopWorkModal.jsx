import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { submitStopWork } from '../../api/stop_work';
import { listSites } from '../../api/sites';
import { listAssets } from '../../api/assets';
import Icon from '../shared/Icon';

// STOP WORK modal — single-step submission per locked decision #11.
//
// Available to any authenticated user (no role gate). Anonymous toggle allowed.
// On submit the backend locks severity=1, track=A, is_imminent_danger=1.
//
// Follows the design system rules: rendered via createPortal to escape the
// .page transform stacking context, uses canonical .modal / .modal-h /
// .modal-body / .modal-f classes.

export default function StopWorkModal({ open, onClose, onSubmitted }) {
  const navigate = useNavigate();
  const [sites, setSites] = useState([]);
  const [assets, setAssets] = useState([]);
  const [siteId, setSiteId] = useState('');
  const [assetId, setAssetId] = useState('');
  const [area, setArea] = useState('');
  const [description, setDescription] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    listSites().then(s => {
      setSites(s);
      if (s.length > 0 && !siteId) setSiteId(String(s[0].id));
    }).catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!siteId) { setAssets([]); setAssetId(''); return; }
    listAssets({ site_id: siteId, active: 1, limit: 200 })
      .then(d => setAssets(d.assets || []))
      .catch(() => setAssets([]));
    setAssetId('');
  }, [siteId]);

  // Reset form when reopening
  useEffect(() => {
    if (!open) {
      setArea(''); setDescription(''); setIsAnonymous(false); setErr(''); setAssetId('');
    }
  }, [open]);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!siteId) return setErr('Site is required');
    if (!area.trim()) return setErr('Area is required');
    setSubmitting(true);
    setErr('');
    try {
      const incident = await submitStopWork({
        site_id: Number(siteId),
        asset_id: assetId ? Number(assetId) : null,
        area: area.trim(),
        description: description.trim() || undefined,
        is_anonymous: isAnonymous,
      });
      onSubmitted?.(incident);
      onClose();
      // Take the user straight to the incident so they can see the routing
      navigate(`/incidents/${incident.id}`);
    } catch (e) {
      setErr(e.response?.data?.error || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-h">
          <div>
            <div className="modal-title" style={{ color: 'var(--sds-error)' }}>
              <Icon name="warning" size={18} color="var(--sds-error)" /> &nbsp;STOP WORK
            </div>
            <div className="modal-sub">Imminent danger — work halts until the area is made safe</div>
          </div>
          <div style={{ flex: 1 }} />
          <button className="icon-btn" onClick={onClose} title="Close"><Icon name="close" size={18} /></button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div
              style={{
                background: 'rgba(211, 47, 47, 0.08)',
                borderLeft: '4px solid var(--sds-error)',
                padding: '12px 14px',
                borderRadius: 'var(--sds-radius-sm)',
                fontSize: 13,
                color: 'var(--sds-fg-primary)',
              }}
            >
              <strong>This will create a Track A incident immediately</strong> and notify EHS managers + Site
              Admins for the chosen site. The system will not allow this report to be down-routed.
            </div>

            <div className="field-row">
              <div className="field">
                <label className="label">Site <span className="req">*</span></label>
                <select className="select" value={siteId} onChange={(e) => setSiteId(e.target.value)} autoFocus>
                  {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label className="label">Area / location <span className="req">*</span></label>
                <input
                  className="input"
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                  placeholder="e.g. Bay 3, Lab 2, Workshop B"
                />
              </div>
            </div>

            <div className="field">
              <label className="label">Asset (optional)</label>
              <select className="select" value={assetId} onChange={(e) => setAssetId(e.target.value)} disabled={assets.length === 0}>
                <option value="">— No specific asset —</option>
                {assets.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name} · {a.asset_type}{a.location_description ? ` · ${a.location_description}` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label className="label">Brief description</label>
              <textarea
                className="textarea"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What's the immediate danger? (optional — investigation will fill in the rest)"
              />
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--sds-fg-secondary)', cursor: 'pointer' }}>
              <input type="checkbox" checked={isAnonymous} onChange={(e) => setIsAnonymous(e.target.checked)} />
              Submit anonymously — your identity will not be stored on the record
            </label>

            {err && (
              <div
                style={{
                  background: 'rgba(211, 47, 47, 0.08)',
                  borderLeft: '4px solid var(--sds-error)',
                  padding: '10px 14px',
                  borderRadius: 'var(--sds-radius-sm)',
                  fontSize: 13,
                  color: 'var(--sds-error)',
                }}
              >
                {err}
              </div>
            )}
          </div>

          <div className="modal-f">
            <button type="button" className="btn btn-tertiary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn-danger" disabled={submitting}>
              {submitting ? 'Submitting…' : 'STOP WORK'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
