// shared/ImportModal.jsx — generic CSV import modal for P3-OB2.
//
// Drives the same dry-run → preview → commit flow for any entity. Per-entity
// callers inject a label set + the import API call. The errors table, summary
// pill row, and atomic-commit reassurance are entity-agnostic.
//
// Typical use:
//   <ImportModal
//     title="Import users from CSV"
//     subtitle="Bulk-onboard your team. Strict template — headers must match exactly."
//     helperText="Columns: email, name, role, department, job_title, site_name, password."
//     templateUrl="/api/users/import/template.csv"
//     templateFilename="users_template.csv"
//     importFn={importUsers}              // (csv_text, mode) => Promise<report>
//     entityNoun={{ singular: 'user', plural: 'users' }}
//     onClose={...}
//     onImported={(count) => ...}
//   />

import { useState, useRef } from 'react';
import Icon from './Icon';

export default function ImportModal({
  title,
  subtitle,
  helperText,
  templateUrl,
  templateFilename,
  importFn,
  entityNoun,
  onClose,
  onImported,
}) {
  const [csvText, setCsvText] = useState('');
  const [filename, setFilename] = useState('');
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const safeClose = () => { if (!busy) onClose(); };

  const downloadTemplate = async () => {
    try {
      const token = localStorage.getItem('token');
      const resp = await fetch(templateUrl, { headers: { Authorization: `Bearer ${token}` } });
      if (!resp.ok) throw new Error('Template download failed');
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = templateFilename;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.message || 'Template download failed');
    }
  };

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setError(''); setReport(null);
    setFilename(f.name);
    const text = await f.text();
    setCsvText(text);
    e.target.value = '';
    setBusy(true);
    try {
      const r = await importFn(text, 'dry_run');
      setReport(r);
    } catch (err) {
      setError(err?.response?.data?.error || 'Could not parse CSV');
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    setBusy(true); setError('');
    try {
      const r = await importFn(csvText, 'commit');
      if (r.error_count > 0) {
        setReport(r);
        setError('Some rows failed during commit. Nothing was saved.');
      } else {
        onImported(r.inserted_ids?.length || r.valid_count);
      }
    } catch (err) {
      setError(err?.response?.data?.error || 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setCsvText(''); setFilename(''); setReport(null); setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const canCommit = report && report.valid_count > 0 && report.error_count === 0;
  const noun = (n) => n === 1 ? entityNoun.singular : entityNoun.plural;

  return (
    <div className="modal-backdrop" onClick={safeClose}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-h">
          <div>
            <div className="modal-title">{title}</div>
            <div className="modal-sub">{subtitle}</div>
          </div>
          <button className="icon-btn" onClick={safeClose} disabled={busy} aria-label="Close">
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="modal-body">
          {!report && (
            <>
              <div className="field">
                <label className="label">1. Download the template</label>
                <button type="button" className="btn btn-tertiary" onClick={downloadTemplate}>
                  <Icon name="download" size={14} />Download {templateFilename}
                </button>
                {helperText && <span className="helper">{helperText}</span>}
              </div>

              <div className="field">
                <label className="label">2. Upload your filled CSV</label>
                <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={onFile} disabled={busy} />
                {filename && <span className="helper">Selected: {filename}</span>}
              </div>

              {busy && <div style={{ color: 'var(--sds-fg-tertiary)', fontSize: 13 }}>Validating…</div>}
            </>
          )}

          {report && (
            <>
              <div style={{ display: 'flex', gap: 'var(--sds-space-md)', marginBottom: 'var(--sds-space-md)' }}>
                <span className="pill pill-success"><span className="dot"/>{report.valid_count} valid</span>
                {report.error_count > 0 && <span className="pill pill-err">{report.error_count} {report.error_count === 1 ? 'error' : 'errors'}</span>}
                <span className="pill pill-gray">{report.total} {report.total === 1 ? 'row' : 'rows'} total</span>
                <button type="button" className="btn btn-tertiary btn-sm" onClick={reset} style={{ marginLeft: 'auto' }}>
                  <Icon name="upload" size={13} />Choose another file
                </button>
              </div>

              {report.error_count > 0 && (
                <>
                  <div className="label">Errors — fix in your CSV and re-upload</div>
                  <table className="tbl" style={{ marginTop: 'var(--sds-space-xs)' }}>
                    <thead>
                      <tr>
                        <th style={{ width: 60 }}>Row</th>
                        <th style={{ width: 160 }}>Column</th>
                        <th>Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.errors.map((e, i) => (
                        <tr key={i}>
                          <td className="id">{e.row || '—'}</td>
                          <td>{e.column || <span style={{ color: 'var(--sds-fg-tertiary)' }}>—</span>}</td>
                          <td>{e.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}

              {canCommit && (
                <div className="helper" style={{ marginTop: 'var(--sds-space-md)' }}>
                  Ready to import. Atomic — all {report.valid_count} {noun(report.valid_count)} created in one transaction. An audit trail row is written for each plus a summary row.
                </div>
              )}
            </>
          )}

          {error && <div style={{ color: 'var(--sds-error)', fontSize: 13, marginTop: 'var(--sds-space-sm)' }}>{error}</div>}
        </div>

        <div className="modal-f">
          <button type="button" className="btn btn-secondary" onClick={safeClose} disabled={busy}>Close</button>
          <button type="button" className="btn btn-primary" onClick={commit} disabled={!canCommit || busy}>
            {busy ? 'Importing…' : canCommit ? `Import ${report.valid_count} ${noun(report.valid_count)}` : 'Import'}
          </button>
        </div>
      </div>
    </div>
  );
}
