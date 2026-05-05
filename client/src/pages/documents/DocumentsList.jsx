import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../context/AuthContext';
import { listDocuments, uploadDocument, updateDocument, deleteDocument } from '../../api/documents';
import api from '../../api/client';
import Icon from '../../components/shared/Icon';
import '../../styles/documents.css';

const ELEVATED = new Set(['supervisor', 'ehs_officer', 'ehs_manager', 'admin']);

const DOC_TYPES = [
  { value: 'sds', label: 'SDS', color: '#D32F2F', icon: 'fire' },
  { value: 'manual', label: 'Manual', color: '#626DF9', icon: 'file' },
  { value: 'policy', label: 'Policy', color: '#5C00FF', icon: 'shield' },
  { value: 'photo', label: 'Photo', color: '#0DB4F0', icon: 'photo' },
  { value: 'video', label: 'Video', color: '#ED6C02', icon: 'photo' },
  { value: 'log', label: 'Log', color: '#2E7D32', icon: 'pulse' },
  { value: 'certificate', label: 'Certificate', color: '#8e44ad', icon: 'check' },
  { value: 'other', label: 'Other', color: '#90A4AE', icon: 'file' },
];

const MODAL_SECTIONS = [
  { key: 'upload', label: 'Upload', icon: 'upload' },
  { key: 'details', label: 'Details', icon: 'info' },
];

const typeMeta = (t) => DOC_TYPES.find(x => x.value === t) || DOC_TYPES[DOC_TYPES.length - 1];

function fmtSize(bytes) {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function fmtExt(name) {
  const ext = (name || '').split('.').pop();
  return ext ? ext.toUpperCase() : '?';
}

export default function DocumentsList() {
  const { user } = useAuth();
  const canEdit = ELEVATED.has(user?.role);

  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('active');
  const [typeFilter, setTypeFilter] = useState('');
  const [search, setSearch] = useState('');

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadName, setUploadName] = useState('');
  const [uploadType, setUploadType] = useState('sds');
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState({ type: '', text: '' });
  const [section, setSection] = useState('upload');
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef(null);

  const refresh = () => {
    setLoading(true);
    const params = {};
    if (activeTab === 'active') params.active = 1;
    else if (activeTab === 'archived') params.active = 0;
    if (typeFilter) params.document_type = typeFilter;
    listDocuments(params)
      .then(d => setDocs(d.documents || []))
      .catch(() => setDocs([]))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, [activeTab, typeFilter]);

  const filtered = useMemo(() => {
    if (!search.trim()) return docs;
    const q = search.toLowerCase();
    return docs.filter(d =>
      (d.name || '').toLowerCase().includes(q) ||
      (d.document_number || '').toLowerCase().includes(q) ||
      (d.document_type || '').toLowerCase().includes(q)
    );
  }, [docs, search]);

  const openUpload = () => {
    setUploadOpen(true);
    setUploadFile(null);
    setUploadName('');
    setUploadType('sds');
    setUploadMsg({ type: '', text: '' });
    setSection('upload');
    setSuccess(false);
  };
  const closeUpload = () => {
    setUploadOpen(false);
    setUploadMsg({ type: '', text: '' });
    setSuccess(false);
  };

  const handleFilePick = (file) => {
    setUploadFile(file);
    if (file && !uploadName) {
      // Pre-fill name from filename without extension
      setUploadName(file.name.replace(/\.[^.]+$/, ''));
    }
  };

  const pct = (() => {
    let filled = 0, total = 3;
    if (uploadFile) filled++;
    if (uploadName.trim()) filled++;
    if (uploadType) filled++;
    return Math.round((filled / total) * 100);
  })();

  const handleUploadSubmit = async (e) => {
    e?.preventDefault();
    if (!uploadFile) {
      setUploadMsg({ type: 'error', text: 'Please pick a file first' });
      setSection('upload');
      return;
    }
    setUploading(true);
    setUploadMsg({ type: '', text: '' });
    try {
      await uploadDocument({ file: uploadFile, name: uploadName.trim(), document_type: uploadType });
      setSuccess(true);
      setTimeout(() => { refresh(); closeUpload(); }, 600);
    } catch (err) {
      setUploadMsg({ type: 'error', text: err.response?.data?.error || 'Upload failed' });
    } finally {
      setUploading(false);
    }
  };

  const handleArchive = async (doc) => {
    if (!window.confirm(`Archive "${doc.name}"?`)) return;
    try { await deleteDocument(doc.id); refresh(); }
    catch (err) { alert(err.response?.data?.error || 'Archive failed'); }
  };
  const handleRestore = async (doc) => {
    try { await updateDocument(doc.id, { active: 1 }); refresh(); }
    catch (err) { alert(err.response?.data?.error || 'Restore failed'); }
  };
  const handleDownload = async (doc) => {
    try {
      const res = await api.get(`/documents/${doc.id}/download`, { responseType: 'blob' });
      const blob = new Blob([res.data]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.name || doc.stored_filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.response?.data?.error || 'Download failed');
    }
  };

  return (
    <div className="page docs-page">
      <div className="docs-header">
        <div>
          <h1 className="docs-title"><Icon name="file" size={26} /> Documents</h1>
          <p className="docs-sub">SDS sheets, manuals, policies, certificates — linkable to incidents, assets, investigations.</p>
        </div>
        <div style={{ flex: 1 }} />
        {canEdit && (
          <button className="btn btn-primary" onClick={openUpload}>
            <Icon name="upload" size={16} /> Upload
          </button>
        )}
      </div>

      <div className="docs-tabs">
        {[
          { id: 'active', label: 'Active' },
          { id: 'archived', label: 'Archived' },
          { id: 'all', label: 'All' },
        ].map(t => (
          <div key={t.id} className={`docs-tab ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => setActiveTab(t.id)}>
            {t.label}
          </div>
        ))}
      </div>

      <div className="docs-toolbar">
        <div className="docs-search">
          <Icon name="search" size={16} />
          <input className="input" placeholder="Search by name, number, type…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="input docs-filter" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="">All types</option>
          {DOC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>

      {loading && <div className="docs-loading">Loading…</div>}

      {!loading && filtered.length === 0 && (
        <div className="docs-empty">
          {docs.length === 0
            ? (canEdit ? 'No documents yet. Click "Upload" to add one.' : 'No documents in the library yet.')
            : 'No documents match your filters.'}
        </div>
      )}

      <div className="docs-grid">
        {filtered.map(d => {
          const meta = typeMeta(d.document_type);
          return (
            <div key={d.id} className={`doc-card ${!d.active ? 'archived' : ''}`}>
              <div className="doc-card-h">
                <div className="doc-type-pill" style={{ background: meta.color }}>
                  <Icon name={meta.icon} size={12} /> {meta.label}
                </div>
                {!d.active && <span className="doc-badge-archived">archived</span>}
              </div>
              <div className="doc-name" onClick={() => handleDownload(d)}>{d.name}</div>
              <div className="doc-num">{d.document_number}</div>
              <div className="doc-meta">
                <div className="doc-meta-row">
                  {d.uploaded_by_initials || '?'} · {d.created_at?.slice(0, 10)}
                </div>
                <div className="doc-meta-row">
                  {fmtSize(d.size_bytes)}
                  {d.mime_type && <> · {d.mime_type.split('/')[1] || d.mime_type}</>}
                </div>
              </div>
              <div className="doc-actions">
                <button className="btn btn-secondary btn-sm" onClick={() => handleDownload(d)}>
                  <Icon name="download" size={13} /> Download
                </button>
                {canEdit && (d.active
                  ? <button className="btn btn-ghost btn-sm doc-archive" onClick={() => handleArchive(d)}>Archive</button>
                  : <button className="btn btn-ghost btn-sm" onClick={() => handleRestore(d)}>Restore</button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {uploadOpen && createPortal(
        <div className="dm-backdrop" onClick={closeUpload}>
          <form className={`dm-modal${success ? ' dm-success' : ''}`} onClick={e => e.stopPropagation()} onSubmit={handleUploadSubmit}>
            {/* Header */}
            <div className="dm-header">
              <div className="dm-header-icon">
                <Icon name="file" size={20} />
              </div>
              <div className="dm-header-text">
                <h2>Upload document</h2>
                <p>Add a document to your organization's library</p>
              </div>
              <button type="button" className="dm-close" onClick={closeUpload}>
                <Icon name="close" size={18} />
              </button>
            </div>

            {/* Progress */}
            <div className="dm-progress">
              <div className="dm-progress-bar" style={{ width: `${pct}%` }} />
              <span className="dm-progress-label">{pct}% complete</span>
            </div>

            {/* Tabs */}
            <div className="dm-tabs">
              {MODAL_SECTIONS.map(s => (
                <button
                  key={s.key}
                  type="button"
                  className={`dm-tab${section === s.key ? ' active' : ''}`}
                  onClick={() => setSection(s.key)}
                >
                  <Icon name={s.icon} size={16} />
                  <span>{s.label}</span>
                </button>
              ))}
            </div>

            {/* Body */}
            <div className="dm-body">
              {section === 'upload' && (
                <div className="dm-section" key="upload">
                  <input
                    ref={fileInputRef}
                    type="file"
                    style={{ display: 'none' }}
                    onChange={e => handleFilePick(e.target.files[0])}
                  />
                  <div
                    className={`dm-dropzone${uploadFile ? ' has-file' : ''}`}
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('dragover'); }}
                    onDragLeave={e => e.currentTarget.classList.remove('dragover')}
                    onDrop={e => {
                      e.preventDefault();
                      e.currentTarget.classList.remove('dragover');
                      if (e.dataTransfer.files.length > 0) handleFilePick(e.dataTransfer.files[0]);
                    }}
                    style={{ animationDelay: '0ms' }}
                  >
                    {uploadFile ? (
                      <div className="dm-dz-selected">
                        <div className="dm-dz-file-badge">
                          <Icon name="file" size={22} />
                          <span className="dm-dz-ext">{fmtExt(uploadFile.name)}</span>
                        </div>
                        <div className="dm-dz-file-info">
                          <div className="dm-dz-file-name">{uploadFile.name}</div>
                          <div className="dm-dz-file-meta">{fmtSize(uploadFile.size)}</div>
                        </div>
                        <div className="dm-dz-change">
                          <Icon name="edit" size={12} /> Change
                        </div>
                      </div>
                    ) : (
                      <div className="dm-dz-empty">
                        <div className="dm-dz-icon-wrap">
                          <Icon name="upload" size={28} />
                        </div>
                        <div className="dm-dz-text">Drop a file here or click to browse</div>
                        <div className="dm-dz-hint">PDF, DOCX, images, video — max 25 MB</div>
                      </div>
                    )}
                  </div>

                  {uploadFile && (
                    <div className="dm-file-preview" style={{ animationDelay: '80ms' }}>
                      <div className="dm-preview-title">
                        <Icon name="check" size={14} /> File ready
                      </div>
                      <div className="dm-preview-rows">
                        <div className="dm-preview-row">
                          <span className="dm-preview-k">Name</span>
                          <span className="dm-preview-v">{uploadFile.name}</span>
                        </div>
                        <div className="dm-preview-row">
                          <span className="dm-preview-k">Size</span>
                          <span className="dm-preview-v mono">{fmtSize(uploadFile.size)}</span>
                        </div>
                        <div className="dm-preview-row">
                          <span className="dm-preview-k">Type</span>
                          <span className="dm-preview-v">{uploadFile.type || 'unknown'}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {section === 'details' && (
                <div className="dm-section" key="details">
                  <div className="dm-field" style={{ animationDelay: '0ms' }}>
                    <label className="dm-label">Display name</label>
                    <input
                      className="dm-input"
                      value={uploadName}
                      onChange={e => setUploadName(e.target.value)}
                      placeholder="Auto-filled from filename if blank"
                    />
                  </div>

                  <div className="dm-field" style={{ animationDelay: '60ms' }}>
                    <label className="dm-label">Document type <span className="req">*</span></label>
                    <div className="dm-type-grid">
                      {DOC_TYPES.map(t => (
                        <button
                          key={t.value}
                          type="button"
                          className={`dm-type-btn${uploadType === t.value ? ' active' : ''}`}
                          onClick={() => setUploadType(t.value)}
                          style={{ '--type-color': t.color }}
                        >
                          <span className="dm-type-dot" style={{ background: t.color }} />
                          <Icon name={t.icon} size={13} />
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Summary card */}
                  <div className="dm-summary" style={{ animationDelay: '120ms' }}>
                    <div className="dm-summary-title">
                      <Icon name="check" size={14} /> Upload summary
                    </div>
                    <div className="dm-summary-rows">
                      <div className="dm-summary-row">
                        <span className="dm-summary-k">File</span>
                        <span className="dm-summary-v">{uploadFile?.name || '— no file selected'}</span>
                      </div>
                      {uploadFile && (
                        <div className="dm-summary-row">
                          <span className="dm-summary-k">Size</span>
                          <span className="dm-summary-v mono">{fmtSize(uploadFile.size)}</span>
                        </div>
                      )}
                      <div className="dm-summary-row">
                        <span className="dm-summary-k">Display name</span>
                        <span className="dm-summary-v">{uploadName || uploadFile?.name?.replace(/\.[^.]+$/, '') || '—'}</span>
                      </div>
                      <div className="dm-summary-row">
                        <span className="dm-summary-k">Type</span>
                        <span className="dm-summary-v">
                          <span className="dm-summary-pill" style={{ background: typeMeta(uploadType).color }}>
                            <Icon name={typeMeta(uploadType).icon} size={10} />
                            {typeMeta(uploadType).label}
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Error */}
            {uploadMsg.text && (
              <div className={`dm-msg dm-msg-${uploadMsg.type}`}>
                <Icon name={uploadMsg.type === 'error' ? 'warning' : 'check'} size={14} />
                {uploadMsg.text}
              </div>
            )}

            {/* Footer */}
            <div className="dm-footer">
              <button type="button" className="dm-btn-secondary" onClick={closeUpload}>Cancel</button>
              <button type="submit" className="dm-btn-primary" disabled={uploading || !uploadFile}>
                {uploading ? (
                  <><span className="dm-spinner" /> Uploading…</>
                ) : (
                  <><Icon name="upload" size={14} /> Upload document</>
                )}
              </button>
            </div>
          </form>
        </div>,
        document.body
      )}
    </div>
  );
}
