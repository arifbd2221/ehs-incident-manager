import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../../../components/shared/Icon';
import ComboBox from '../../../components/shared/ComboBox';
import DatePicker from '../../../components/shared/DatePicker';
import { createRisk } from '../../../api/risks';
import { getSites } from '../../../api/auth';
import { getUsers } from '../../../api/users';
import { useApp } from '../../../context/AppContext';

const CATEGORIES = [
  { value: 'safety', label: 'Safety' },
  { value: 'health', label: 'Health' },
  { value: 'environmental', label: 'Environmental' },
  { value: 'ergonomic', label: 'Ergonomic' },
  { value: 'chemical', label: 'Chemical' },
  { value: 'biological', label: 'Biological' },
  { value: 'physical', label: 'Physical' },
  { value: 'psychosocial', label: 'Psychosocial' },
  { value: 'other', label: 'Other' },
];

export default function NewRiskModal({ onCancel, onCreated }) {
  const { activeSiteId } = useApp();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [siteId, setSiteId] = useState(activeSiteId ? String(activeSiteId) : '');
  const [source, setSource] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [reviewDate, setReviewDate] = useState('');
  const [sites, setSites] = useState([]);
  const [users, setUsers] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    getSites().then(r => {
      const list = r.sites || r;
      setSites(list);
      if (!siteId && activeSiteId && list.some(s => s.id === activeSiteId)) {
        setSiteId(String(activeSiteId));
      }
    }).catch(() => {});
    getUsers().then(r => setUsers(r.users || r)).catch(() => {});
  }, []);

  const siteOpts = sites.map(s => ({ value: String(s.id), label: s.name }));
  const userOpts = users.map(u => ({ value: String(u.id), label: u.name }));

  const canSubmit = title.trim() && category && siteId && !submitting;

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const risk = await createRisk({
        title: title.trim(),
        description,
        category,
        site_id: Number(siteId),
        source: source || undefined,
        assigned_to: assignedTo ? Number(assignedTo) : undefined,
        owner_id: ownerId ? Number(ownerId) : undefined,
        review_date: reviewDate || undefined,
      });
      onCreated(risk);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to create risk');
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-h">
          <div>
            <div className="modal-title">Register New Risk</div>
            <div className="modal-sub">Identify a hazard and add it to the risk register</div>
          </div>
          <button className="icon-btn" onClick={onCancel}><Icon name="close" size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="field">
            <label className="label">Title <span className="req">*</span></label>
            <input className="input" placeholder="Describe the hazard or risk..." value={title} onChange={e => setTitle(e.target.value)} />
          </div>

          <div className="field-row">
            <div className="field">
              <label className="label">Category <span className="req">*</span></label>
              <ComboBox options={CATEGORIES} value={category} onChange={setCategory} placeholder="Select category..." />
            </div>
            <div className="field">
              <label className="label">Site <span className="req">*</span></label>
              <ComboBox options={siteOpts} value={siteId} onChange={setSiteId} placeholder="Select site..." />
            </div>
          </div>

          <div className="field">
            <label className="label">Description</label>
            <textarea className="textarea" rows={3} placeholder="Detailed description of the risk..." value={description} onChange={e => setDescription(e.target.value)} />
          </div>

          <div className="field">
            <label className="label">Source</label>
            <input className="input" placeholder="e.g. Inspection, Audit, Observation..." value={source} onChange={e => setSource(e.target.value)} />
          </div>

          <div className="field-row">
            <div className="field">
              <label className="label">Assigned To</label>
              <ComboBox options={userOpts} value={assignedTo} onChange={setAssignedTo} placeholder="Select assignee..." />
            </div>
            <div className="field">
              <label className="label">Owner</label>
              <ComboBox options={userOpts} value={ownerId} onChange={setOwnerId} placeholder="Select owner..." />
            </div>
          </div>

          <div className="field">
            <label className="label">Review Date</label>
            <DatePicker value={reviewDate} onChange={setReviewDate} />
          </div>

          {error && <div style={{ color: 'var(--sds-error)', fontSize: 13, marginTop: 8 }}>{error}</div>}
        </div>
        <div className="modal-f">
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? 'Creating...' : 'Register Risk'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
