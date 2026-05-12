// CertifyOsha300AModal.jsx — OSHA 1904.32 annual summary sign-off.
//
// Updated for WI-02:
//   • Title becomes a dropdown of the 4 keys per 29 CFR 1904.32(b)(4)
//     (owner / corporate_officer / highest_ranking_official /
//     immediate_supervisor_of_highest_ranking). The selected key is
//     submitted to the BE; the BE looks up the verbatim Act label and
//     stores both on the certified-snapshot row.
//   • Affirmation text is the verbatim 1904.32(b)(3) wording, shown
//     under the header "By signing, you affirm the following statement,
//     made under 29 CFR 1904.32(b)(3):".
//   • Sign-then-snapshot: server creates regulatory_certifications +
//     osha_300a_certified_summaries atomically; modal closes on 201.
//
// Phase 2 W6 F6.1 + WI-02.

import { useState, useEffect } from 'react';
import Icon from '../shared/Icon';
import { useAuth } from '../../context/AuthContext';
import { certifyOsha300A, getOsha300A } from '../../api/reports';

export default function CertifyOsha300AModal({ siteId, year, siteName, affirmationText, onCancel, onCertified }) {
  const { user } = useAuth();
  const [typedName, setTypedName] = useState('');
  const [titleKey, setTitleKey] = useState('highest_ranking_official');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  // certifier_title_options come from the JSON branch of /reports/osha-300a.
  // The 300A panel already loaded that data; we fetch fresh here in case
  // the modal is opened directly.
  const [titleOptions, setTitleOptions] = useState([]);

  useEffect(() => {
    getOsha300A({ site_id: siteId, year })
      .then(d => setTitleOptions(d.certifier_title_options || []))
      .catch(() => {});
  }, [siteId, year]);

  const expected = (user?.name || '').trim();
  const nameMatches = typedName.trim().toLowerCase() === expected.toLowerCase();
  const canSubmit = nameMatches && titleKey && !submitting;

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const cert = await certifyOsha300A({
        site_id: Number(siteId),
        year: Number(year),
        typed_name: typedName.trim(),
        certifier_title_key: titleKey,
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
      <div className="modal modal-lg" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="certify-osha-modal-title">
        <div className="modal-h">
          <div>
            <div className="modal-title" id="certify-osha-modal-title">Certify OSHA 300A</div>
            <div className="modal-sub">{siteName} · Calendar year {year}</div>
          </div>
          <button className="icon-btn" onClick={onCancel} disabled={submitting}><Icon name="close" size={18}/></button>
        </div>
        <div className="modal-body">
          <div className="cert-affirmation">
            <div className="cert-affirmation-label">
              By signing, you affirm the following statement, made under 29 CFR 1904.32(b)(3):
            </div>
            <p className="cert-affirmation-text">{affirmationText}</p>
            <div className="cert-affirmation-meta">
              Once signed, the column totals are frozen into a certified snapshot. The 300 Log itself remains updateable per 29 CFR 1904.33(b)(1), but the posted 300A summary must not be altered (29 CFR 1904.32(b)(5)).
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
              <select className="select" value={titleKey} onChange={e => setTitleKey(e.target.value)}>
                {titleOptions.length === 0 && <option value="">Loading…</option>}
                {titleOptions.map(opt => (
                  <option key={opt.key} value={opt.key}>{opt.label}</option>
                ))}
              </select>
              <span className="helper">Per 29 CFR 1904.32(b)(4) — only these four titles may certify.</span>
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
