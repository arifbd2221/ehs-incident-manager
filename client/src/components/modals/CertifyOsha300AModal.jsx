// CertifyOsha300AModal.jsx — OSHA 1904.32 annual summary sign-off.
//
// The 300A must be signed by a "company executive" before posting (Feb 1).
// We capture: typed name (must match account name — OSHA-style "wet
// signature" stand-in), executive title (free text), and the affirmation
// statement (read-only, server-defined). The cert flows to
// regulatory_certifications + activity_log.
//
// Phase 2 W6 F6.1.

import { useState } from 'react';
import Icon from '../shared/Icon';
import { useAuth } from '../../context/AuthContext';
import { certifyOsha300A } from '../../api/reports';

export default function CertifyOsha300AModal({ siteId, year, siteName, affirmationText, onCancel, onCertified }) {
  const { user } = useAuth();
  const [typedName, setTypedName] = useState('');
  const [title, setTitle] = useState(user?.job_title || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const expected = (user?.name || '').trim();
  const nameMatches = typedName.trim().toLowerCase() === expected.toLowerCase();
  const canSubmit = nameMatches && title.trim().length > 0 && !submitting;

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const cert = await certifyOsha300A({
        site_id: Number(siteId),
        year: Number(year),
        typed_name: typedName.trim(),
        certifier_title: title.trim(),
      });
      onCertified(cert);
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to certify.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-h">
          <div>
            <div className="modal-title">Certify OSHA 300A</div>
            <div className="modal-sub">{siteName} · Calendar year {year}</div>
          </div>
          <button className="icon-btn" onClick={onCancel} disabled={submitting}><Icon name="close" size={18}/></button>
        </div>
        <div className="modal-body">
          <div className="cert-affirmation">
            <div className="cert-affirmation-label">Affirmation statement</div>
            <p className="cert-affirmation-text">{affirmationText}</p>
            <div className="cert-affirmation-meta">
              Per 29 CFR 1904.32 — must be signed by a company executive before posting Feb 1.
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label className="label">Typed full name <span className="req">*</span></label>
              <input
                className="input"
                placeholder={expected}
                value={typedName}
                onChange={e => setTypedName(e.target.value)}
                autoFocus
              />
              <span className="helper">Must match your account name on file.</span>
              {typedName && !nameMatches && (
                <span className="cert-name-warn">Doesn't match "{expected}".</span>
              )}
            </div>
            <div className="field">
              <label className="label">Executive title <span className="req">*</span></label>
              <input
                className="input"
                placeholder="e.g. EHS Lead, VP of Operations"
                value={title}
                onChange={e => setTitle(e.target.value)}
              />
            </div>
          </div>

          {error && <div className="cert-error">{error}</div>}
        </div>
        <div className="modal-f">
          <button className="btn btn-secondary" onClick={onCancel} disabled={submitting}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={!canSubmit}>
            {submitting ? 'Signing…' : (
              <><Icon name="check" size={14}/>Sign &amp; certify</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
