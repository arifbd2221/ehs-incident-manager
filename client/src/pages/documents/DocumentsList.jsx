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

const SORT_OPTIONS = [
  { value: 'date', label: 'Date modified' },
  { value: 'name', label: 'Name' },
  { value: 'size', label: 'File size' },
  { value: 'type', label: 'Type' },
];

const typeMeta = (t) => DOC_TYPES.find(x => x.value === t) || DOC_TYPES[DOC_TYPES.length - 1];

function previewKind(mime) {
  if (!mime) return 'other';
  if (mime.startsWith('image/')) return 'image';
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'other';
}

function fmtSize(bytes) {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function fmtExt(name) {
  if (!name) return '?';
  const parts = name.split('.');
  return parts.length > 1 ? parts.pop().toUpperCase() : '?';
}

function fmtDate(d) {
  if (!d) return '—';
  const date = new Date(d);
  const now = new Date();
  const diff = now - date;
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function DocumentsList() {
  const { user } = useAuth();
  const canEdit = ELEVATED.has(user?.role);

  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('active');
  const [typeFilter, setTypeFilter] = useState('');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState('grid');
  const [sortBy, setSortBy] = useState('date');
  const [sortDir, setSortDir] = useState('desc');

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadName, setUploadName] = useState('');
  const [uploadType, setUploadType] = useState('sds');
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState({ type: '', text: '' });
  const [section, setSection] = useState('upload');
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef(null);

  const [previewDoc, setPreviewDoc] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

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
    let result = docs;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(d =>
        (d.name || '').toLowerCase().includes(q) ||
        (d.document_number || '').toLowerCase().includes(q) ||
        (d.document_type || '').toLowerCase().includes(q)
      );
    }
    return [...result].sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case 'name': cmp = (a.name || '').localeCompare(b.name || ''); break;
        case 'size': cmp = (a.size_bytes || 0) - (b.size_bytes || 0); break;
        case 'type': cmp = (a.document_type || '').localeCompare(b.document_type || ''); break;
        case 'date': default: cmp = (a.created_at || '').localeCompare(b.created_at || ''); break;
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });
  }, [docs, search, sortBy, sortDir]);

  const toggleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir(col === 'name' || col === 'type' ? 'asc' : 'desc'); }
  };

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

  const handlePreview = async (doc) => {
    setPreviewDoc(doc);
    setPreviewLoading(true);
    setPreviewUrl(null);
    try {
      const res = await api.get(`/documents/${doc.id}/download`, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: doc.mime_type || 'application/octet-stream' });
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (err) {
      alert(err.response?.data?.error || 'Preview failed');
      setPreviewDoc(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const closePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewDoc(null);
    setPreviewUrl(null);
  };

  return (
    <div className="page dp-page">
      {/* Header */}
      <div className="dp-header dp-anim" style={{ animationDelay: '0ms' }}>
        <div className="dp-header-left">
          <div className="dp-header-icon">
            <Icon name="file" size={22} />
          </div>
          <div>
            <h1 className="dp-title">Documents</h1>
            <p className="dp-sub">SDS sheets, manuals, policies, certificates</p>
          </div>
        </div>
        {canEdit && (
          <button className="dp-upload-btn" onClick={openUpload}>
            <Icon name="upload" size={16} />
            <span>Upload</span>
          </button>
        )}
      </div>

      {/* Search bar (Drive-style) */}
      <div className="dp-search-wrap dp-anim" style={{ animationDelay: '40ms' }}>
        <div className="dp-search">
          <Icon name="search" size={18} />
          <input
            className="dp-search-input"
            placeholder="Search in Documents"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="dp-search-clear" onClick={() => setSearch('')}>
              <Icon name="close" size={14} />
            </button>
          )}
        </div>
        {search && (
          <span className="dp-search-count">
            {filtered.length} result{filtered.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="dp-tabs dp-anim" style={{ animationDelay: '80ms' }}>
        <div className="dp-tabs-left">
          {[
            { id: 'active', label: 'Active' },
            { id: 'archived', label: 'Archived' },
            { id: 'all', label: 'All' },
          ].map(t => (
            <button
              key={t.id}
              className={`dp-tab${activeTab === t.id ? ' active' : ''}`}
              onClick={() => setActiveTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="dp-tabs-right">
          <div className="dp-sort">
            <select
              className="dp-sort-select"
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
            >
              {SORT_OPTIONS.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <button
              className={`dp-sort-dir${sortDir === 'desc' ? ' desc' : ''}`}
              onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
              title={sortDir === 'asc' ? 'Ascending' : 'Descending'}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 2.5v9M4 8.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
          <div className="dp-view-toggle">
            <button
              className={`dp-view-btn${viewMode === 'grid' ? ' active' : ''}`}
              onClick={() => setViewMode('grid')}
              title="Grid view"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="1" y="1" width="5.5" height="5.5" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
                <rect x="9.5" y="1" width="5.5" height="5.5" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
                <rect x="1" y="9.5" width="5.5" height="5.5" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
                <rect x="9.5" y="9.5" width="5.5" height="5.5" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
              </svg>
            </button>
            <button
              className={`dp-view-btn${viewMode === 'list' ? ' active' : ''}`}
              onClick={() => setViewMode('list')}
              title="List view"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M1 3h14M1 8h14M1 13h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Type filter chips */}
      <div className="dp-chips dp-anim" style={{ animationDelay: '120ms' }}>
        <button
          className={`dp-chip${!typeFilter ? ' active' : ''}`}
          onClick={() => setTypeFilter('')}
        >
          All types
        </button>
        {DOC_TYPES.map(t => (
          <button
            key={t.value}
            className={`dp-chip${typeFilter === t.value ? ' active' : ''}`}
            onClick={() => setTypeFilter(typeFilter === t.value ? '' : t.value)}
            style={{ '--chip-color': t.color }}
          >
            <span className="dp-chip-dot" style={{ background: t.color }} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Loading skeleton */}
      {loading && viewMode === 'grid' && (
        <div className="dp-grid">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="dp-skel-card" style={{ animationDelay: `${i * 50}ms` }}>
              <div className="dp-skel-thumb" />
              <div className="dp-skel-body">
                <div className="dp-skel-line w60" />
                <div className="dp-skel-line w40" />
                <div className="dp-skel-line w75" />
              </div>
            </div>
          ))}
        </div>
      )}
      {loading && viewMode === 'list' && (
        <div className="dp-list-wrap">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="dp-skel-row" style={{ animationDelay: `${i * 40}ms` }} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <div className="dp-empty">
          <div className="dp-empty-icon">
            <Icon name={docs.length === 0 ? 'upload' : 'search'} size={32} />
          </div>
          <h3 className="dp-empty-title">{docs.length === 0 ? 'No documents yet' : 'No matches found'}</h3>
          <p className="dp-empty-text">{docs.length === 0
            ? (canEdit ? 'Upload your first document to get started' : 'No documents in the library yet')
            : 'Try adjusting your search or filters'}</p>
          {docs.length === 0 && canEdit && (
            <button className="dp-empty-btn" onClick={openUpload}>
              <Icon name="upload" size={16} /> Upload document
            </button>
          )}
        </div>
      )}

      {/* === GRID VIEW === */}
      {!loading && filtered.length > 0 && viewMode === 'grid' && (
        <div className="dp-grid">
          {filtered.map((d, i) => {
            const meta = typeMeta(d.document_type);
            return (
              <div
                key={d.id}
                className={`dp-card${!d.active ? ' archived' : ''}`}
                style={{ animationDelay: `${Math.min(i, 15) * 40}ms` }}
              >
                <div
                  className="dp-card-thumb"
                  style={{ '--thumb-color': meta.color }}
                  onClick={() => handlePreview(d)}
                >
                  <Icon name={meta.icon} size={30} />
                  <span className="dp-card-ext">{fmtExt(d.stored_filename || d.name)}</span>
                  {!d.active && <span className="dp-card-archived">Archived</span>}
                  <div className="dp-card-overlay">
                    <button className="dp-overlay-btn" onClick={e => { e.stopPropagation(); handlePreview(d); }} title="Preview">
                      <Icon name="eye" size={18} />
                    </button>
                    <button className="dp-overlay-btn" onClick={e => { e.stopPropagation(); handleDownload(d); }} title="Download">
                      <Icon name="download" size={18} />
                    </button>
                    {canEdit && d.active && (
                      <button className="dp-overlay-btn danger" onClick={e => { e.stopPropagation(); handleArchive(d); }} title="Archive">
                        <Icon name="close" size={18} />
                      </button>
                    )}
                    {canEdit && !d.active && (
                      <button className="dp-overlay-btn" onClick={e => { e.stopPropagation(); handleRestore(d); }} title="Restore">
                        <Icon name="check" size={18} />
                      </button>
                    )}
                  </div>
                </div>
                <div className="dp-card-body" onClick={() => handlePreview(d)}>
                  <div className="dp-card-name">{d.name}</div>
                  <div className="dp-card-info">
                    <span className="dp-card-type-dot" style={{ background: meta.color }} />
                    <span className="dp-card-type-label">{meta.label}</span>
                    <span className="dp-card-sep">·</span>
                    <span>{fmtSize(d.size_bytes)}</span>
                    <span className="dp-card-sep">·</span>
                    <span>{fmtDate(d.created_at)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* === LIST VIEW === */}
      {!loading && filtered.length > 0 && viewMode === 'list' && (
        <div className="dp-list-wrap">
          <table className="dp-table">
            <thead>
              <tr>
                <th className="dp-th dp-th-type" onClick={() => toggleSort('type')}>
                  Type {sortBy === 'type' && <span className={`dp-th-arrow${sortDir === 'desc' ? ' desc' : ''}`}>↑</span>}
                </th>
                <th className="dp-th dp-th-name" onClick={() => toggleSort('name')}>
                  Name {sortBy === 'name' && <span className={`dp-th-arrow${sortDir === 'desc' ? ' desc' : ''}`}>↑</span>}
                </th>
                <th className="dp-th dp-th-id">ID</th>
                <th className="dp-th">Owner</th>
                <th className="dp-th dp-th-date" onClick={() => toggleSort('date')}>
                  Modified {sortBy === 'date' && <span className={`dp-th-arrow${sortDir === 'desc' ? ' desc' : ''}`}>↑</span>}
                </th>
                <th className="dp-th dp-th-size" onClick={() => toggleSort('size')}>
                  Size {sortBy === 'size' && <span className={`dp-th-arrow${sortDir === 'desc' ? ' desc' : ''}`}>↑</span>}
                </th>
                <th className="dp-th dp-th-actions" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((d, i) => {
                const meta = typeMeta(d.document_type);
                return (
                  <tr
                    key={d.id}
                    className={`dp-row${!d.active ? ' archived' : ''}`}
                    style={{ animationDelay: `${Math.min(i, 20) * 30}ms` }}
                  >
                    <td>
                      <span className="dp-row-type-icon" style={{ '--type-color': meta.color }}>
                        <Icon name={meta.icon} size={14} />
                      </span>
                    </td>
                    <td>
                      <div className="dp-row-name" onClick={() => handlePreview(d)}>
                        {d.name}
                        {!d.active && <span className="dp-row-arch-tag">archived</span>}
                      </div>
                    </td>
                    <td><span className="dp-row-id">{d.document_number}</span></td>
                    <td>
                      <span className="dp-row-owner">{d.uploaded_by_initials || '?'}</span>
                    </td>
                    <td className="dp-row-date">{fmtDate(d.created_at)}</td>
                    <td className="dp-row-size">{fmtSize(d.size_bytes)}</td>
                    <td>
                      <div className="dp-row-actions">
                        <button className="dp-row-btn" onClick={() => handleDownload(d)} title="Download">
                          <Icon name="download" size={14} />
                        </button>
                        {canEdit && d.active && (
                          <button className="dp-row-btn dp-row-btn-danger" onClick={() => handleArchive(d)} title="Archive">
                            <Icon name="close" size={14} />
                          </button>
                        )}
                        {canEdit && !d.active && (
                          <button className="dp-row-btn" onClick={() => handleRestore(d)} title="Restore">
                            <Icon name="check" size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ========== PREVIEW MODAL ========== */}
      {previewDoc && createPortal(
        <div className="dpv-backdrop" onClick={closePreview}>
          <div className="dpv-modal" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="dpv-header">
              <div className="dpv-header-left">
                <span className="dpv-type-pill" style={{ background: typeMeta(previewDoc.document_type).color }}>
                  <Icon name={typeMeta(previewDoc.document_type).icon} size={12} />
                  {typeMeta(previewDoc.document_type).label}
                </span>
                <span className="dpv-name">{previewDoc.name}</span>
                <span className="dpv-meta-pill">{fmtSize(previewDoc.size_bytes)}</span>
              </div>
              <div className="dpv-header-right">
                <button className="dpv-action" onClick={() => handleDownload(previewDoc)} title="Download">
                  <Icon name="download" size={18} />
                </button>
                <button className="dpv-action dpv-close" onClick={closePreview} title="Close">
                  <Icon name="close" size={18} />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="dpv-content">
              {previewLoading && (
                <div className="dpv-loading">
                  <div className="dpv-spinner" />
                  <span>Loading preview…</span>
                </div>
              )}

              {!previewLoading && previewUrl && previewKind(previewDoc.mime_type) === 'image' && (
                <img className="dpv-image" src={previewUrl} alt={previewDoc.name} />
              )}

              {!previewLoading && previewUrl && previewKind(previewDoc.mime_type) === 'pdf' && (
                <iframe className="dpv-pdf" src={previewUrl} title={previewDoc.name} />
              )}

              {!previewLoading && previewUrl && previewKind(previewDoc.mime_type) === 'video' && (
                <video className="dpv-video" src={previewUrl} controls autoPlay />
              )}

              {!previewLoading && previewUrl && previewKind(previewDoc.mime_type) === 'audio' && (
                <div className="dpv-audio-wrap">
                  <div className="dpv-audio-icon">
                    <Icon name="pulse" size={40} />
                  </div>
                  <audio className="dpv-audio" src={previewUrl} controls autoPlay />
                </div>
              )}

              {!previewLoading && previewUrl && previewKind(previewDoc.mime_type) === 'other' && (
                <div className="dpv-nopreview">
                  <div className="dpv-nopreview-icon">
                    <Icon name="file" size={40} />
                  </div>
                  <h3>Preview not available</h3>
                  <p>{previewDoc.mime_type || 'Unknown file type'} · {fmtSize(previewDoc.size_bytes)}</p>
                  <button className="dpv-download-btn" onClick={() => handleDownload(previewDoc)}>
                    <Icon name="download" size={16} /> Download file
                  </button>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="dpv-footer">
              <span className="dpv-footer-id">{previewDoc.document_number}</span>
              <span className="dpv-footer-meta">
                Uploaded by {previewDoc.uploaded_by_initials || '?'} · {fmtDate(previewDoc.created_at)}
              </span>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ========== UPLOAD MODAL ========== */}
      {uploadOpen && createPortal(
        <div className="dm-backdrop" onClick={closeUpload}>
          <form className={`dm-modal${success ? ' dm-success' : ''}`} onClick={e => e.stopPropagation()} onSubmit={handleUploadSubmit}>
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

            <div className="dm-progress">
              <div className="dm-progress-bar" style={{ width: `${pct}%` }} />
              <span className="dm-progress-label">{pct}% complete</span>
            </div>

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

            {uploadMsg.text && (
              <div className={`dm-msg dm-msg-${uploadMsg.type}`}>
                <Icon name={uploadMsg.type === 'error' ? 'warning' : 'check'} size={14} />
                {uploadMsg.text}
              </div>
            )}

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
