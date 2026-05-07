import { useState, useRef } from 'react';
import Icon from '../../components/shared/Icon';
import { updateCapa } from '../../api/capas';
import { uploadAttachments } from '../../api/incidents';

export default function UpdateProgressModal({ capa, onCancel, onSaved }) {
  const [progress, setProgress] = useState(capa.progress || 0);
  const [note, setNote] = useState('');
  const [files, setFiles] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  const handleFiles = (e) => {
    setFiles(prev => [...prev, ...Array.from(e.target.files)]);
    e.target.value = '';
  };

  const removeFile = (i) => setFiles(f => f.filter((_, idx) => idx !== i));

  const handleSubmit = async () => {
    if (!note.trim()) return setError('Please describe what was done.');
    setError('');
    setSubmitting(true);
    try {
      await updateCapa(capa.id, { progress, progress_note: note.trim() });
      if (files.length > 0) {
        await uploadAttachments('capa', capa.id, files);
      }
      onSaved();
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to update progress.');
    } finally {
      setSubmitting(false);
    }
  };

  const fillClass = progress >= 100 ? 'pf-done' : '';

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-h">
          <div>
            <div className="modal-title">Update progress</div>
            <div className="modal-sub">{capa.capa_number} — {capa.title}</div>
          </div>
          <button className="icon-btn" onClick={onCancel}><Icon name="close" size={18}/></button>
        </div>
        <div className="modal-body">
          {error && <div className="auth-error" style={{ marginBottom: 14 }}><Icon name="warning" size={14}/>{error}</div>}

          <div className="field">
            <label className="label">Progress</label>
            <div className="capd-progress-input-row">
              <input
                type="range" min="0" max="100" step="5"
                className="capd-progress-slider"
                value={progress}
                onChange={e => setProgress(Number(e.target.value))}
              />
              <div className="capd-progress-num">{progress}%</div>
            </div>
            <div className="capd-modal-progress-track">
              <div className={`capd-modal-progress-fill ${fillClass}`} style={{ width: `${progress}%` }}/>
            </div>
          </div>

          <div className="field">
            <label className="label">What was done <span className="req">*</span></label>
            <textarea
              className="textarea"
              rows={3}
              placeholder="e.g. Installed machine guard, completed training for shift B..."
              value={note}
              onChange={e => setNote(e.target.value)}
            />
          </div>

          <div className="field">
            <label className="label">Evidence (optional)</label>
            <div className="capd-file-drop" onClick={() => fileRef.current?.click()}>
              <Icon name="upload" size={18}/>
              <div>Click to attach photos, documents, or receipts</div>
            </div>
            <input ref={fileRef} type="file" multiple hidden onChange={handleFiles}/>
            {files.length > 0 && (
              <div className="capd-file-list">
                {files.map((f, i) => (
                  <div key={i} className="capd-file-item">
                    <Icon name="file" size={14}/>
                    <span>{f.name}</span>
                    <button className="capd-file-rm" onClick={() => removeFile(i)}>
                      <Icon name="close" size={12}/>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="modal-f">
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? <><span className="login-spinner"/>Saving...</> : 'Save update'}
          </button>
        </div>
      </div>
    </div>
  );
}
