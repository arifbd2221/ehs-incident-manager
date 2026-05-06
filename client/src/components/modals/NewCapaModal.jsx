// NewCapaModal.jsx — standalone CAPA creation, with source picker.
//
// Two source paths:
//   - "Proactive" — POST /api/capas with source_type='proactive'.
//   - "From an incident" — picks an open incident, POST /api/incidents/:id/create-capa.
//
// Investigation-source CAPAs still come from the investigation-detail flow
// (assign-capa); deliberately not exposed here to avoid two ways to do
// the same thing.

import { useState, useEffect, useMemo } from 'react';
import Icon from '../shared/Icon';
import ComboBox from '../shared/ComboBox';
import SmartTextarea from '../shared/SmartTextarea';
import { getUsers } from '../../api/users';
import { getIncidents } from '../../api/incidents';
import { createCapa, createCapaFromIncident } from '../../api/capas';

const todayPlus = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

// Severity → priority mapping for auto-fill from a selected incident.
// Loosely tracks the routing palette: S1/S2 → urgent CAPA, S3 → high signal,
// S4/S5 → routine. The user can override before submit.
const PRIORITY_FROM_SEVERITY = { 1: 'critical', 2: 'critical', 3: 'high', 4: 'medium', 5: 'low' };

export default function NewCapaModal({ onCancel, onCreated }) {
  const [source, setSource] = useState('proactive');
  const [users, setUsers] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [incidentSearch, setIncidentSearch] = useState('');
  const [incidentId, setIncidentId] = useState('');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('corrective');
  const [priority, setPriority] = useState('medium');
  const [ownerId, setOwnerId] = useState('');
  const [verifierId, setVerifierId] = useState('');
  const [dueDate, setDueDate] = useState(todayPlus(30));
  const [category, setCategory] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    getUsers().then(u => {
      setUsers(u);
      if (u[0]) setOwnerId(String(u[0].id));
      if (u[1]) setVerifierId(String(u[1].id));
    }).catch(() => {});
    getIncidents({ limit: 50 }).then(d => setIncidents(d.incidents || [])).catch(() => {});
  }, []);

  const filteredIncidents = useMemo(() => {
    const q = incidentSearch.trim().toLowerCase();
    if (!q) return incidents.slice(0, 25);
    return incidents.filter(i =>
      (i.incident_number || '').toLowerCase().includes(q) ||
      (i.title || '').toLowerCase().includes(q)
    ).slice(0, 25);
  }, [incidents, incidentSearch]);

  const selectedIncident = useMemo(
    () => incidents.find(i => String(i.id) === String(incidentId)) || null,
    [incidents, incidentId],
  );

  const incidentOpts = useMemo(() => filteredIncidents.map(i => ({
    value: String(i.id), label: `${i.incident_number} · ${i.title} · Sev ${i.severity}`
  })), [filteredIncidents]);
  const userOpts = useMemo(() => users.map(u => ({ value: String(u.id), label: `${u.name} (${u.role})` })), [users]);
  const verifierOpts = useMemo(() => userOpts.filter(o => o.value !== ownerId), [userOpts, ownerId]);
  const typeOpts = [{ value: 'corrective', label: 'Corrective' }, { value: 'preventive', label: 'Preventive' }];
  const priorityOpts = [{ value: 'critical', label: 'Critical' }, { value: 'high', label: 'High' }, { value: 'medium', label: 'Medium' }, { value: 'low', label: 'Low' }];

  // Auto-fill from the selected incident. Replaces title/description/priority
  // each time the user picks a different incident (predictable for demos —
  // no hidden "did you edit this?" tracking). Also reflects the selection
  // back into the search field so the chip shows what was picked even after
  // a re-render.
  useEffect(() => {
    if (!selectedIncident) return;
    setTitle(`Address: ${selectedIncident.title}`);
    setDescription(selectedIncident.description || '');
    setPriority(PRIORITY_FROM_SEVERITY[selectedIncident.severity] || 'medium');
    setIncidentSearch(`${selectedIncident.incident_number} · ${selectedIncident.title}`);
  }, [selectedIncident]);

  const canSubmit = (() => {
    if (!title.trim() || !ownerId || !verifierId || !dueDate) return false;
    if (ownerId === verifierId) return false;
    if (source === 'incident' && !incidentId) return false;
    return true;
  })();

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        type,
        priority,
        category: category.trim() || null,
        owner_id: Number(ownerId),
        verifier_id: Number(verifierId),
        due_date: dueDate,
      };
      const created = source === 'incident'
        ? await createCapaFromIncident(Number(incidentId), payload)
        : await createCapa({ ...payload, source_type: 'proactive' });
      onCreated && onCreated(created);
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to create CAPA');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-h">
          <div>
            <div className="modal-title">New CAPA</div>
            <div className="modal-sub">Corrective or preventive action — owner cannot self-verify</div>
          </div>
          <button className="icon-btn" onClick={onCancel}><Icon name="close" size={18}/></button>
        </div>
        <div className="modal-body">
          {/* Source picker */}
          <div className="field">
            <label className="label">Source</label>
            <div className="ncap-source-picker">
              <button
                type="button"
                className={`ncap-source-card ${source === 'proactive' ? 'is-on' : ''}`}
                onClick={() => setSource('proactive')}
              >
                <div className="ncap-source-icon"><Icon name="leaf" size={16}/></div>
                <div>
                  <div className="ncap-source-title">Proactive</div>
                  <div className="ncap-source-desc">Improvement not tied to a reported incident</div>
                </div>
              </button>
              <button
                type="button"
                className={`ncap-source-card ${source === 'incident' ? 'is-on' : ''}`}
                onClick={() => setSource('incident')}
              >
                <div className="ncap-source-icon"><Icon name="incidents" size={16}/></div>
                <div>
                  <div className="ncap-source-title">From an incident</div>
                  <div className="ncap-source-desc">Direct CAPA without a full investigation</div>
                </div>
              </button>
            </div>
          </div>

          {source === 'incident' && (
            <div className="field">
              <label className="label">Incident <span className="req">*</span></label>
              {selectedIncident ? (
                <div className="ncap-inc-chip">
                  <div className="ncap-inc-chip-icon"><Icon name="incidents" size={14}/></div>
                  <div className="ncap-inc-chip-body">
                    <div className="ncap-inc-chip-num">{selectedIncident.incident_number}</div>
                    <div className="ncap-inc-chip-title">{selectedIncident.title}</div>
                    <div className="ncap-inc-chip-meta">
                      Sev {selectedIncident.severity} · Track {selectedIncident.track}
                      {selectedIncident.site_name ? ` · ${selectedIncident.site_name}` : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="ncap-inc-chip-clear"
                    onClick={() => { setIncidentId(''); setIncidentSearch(''); }}
                    title="Pick a different incident"
                  >
                    <Icon name="close" size={14}/>
                  </button>
                </div>
              ) : (
                <ComboBox options={incidentOpts} value={incidentId} onChange={setIncidentId} placeholder="Search by number or title…" />
              )}
            </div>
          )}

          <div className="field">
            <label className="label">Title <span className="req">*</span></label>
            <input className="input" placeholder="What needs to happen" value={title} onChange={e => setTitle(e.target.value)}/>
          </div>

          <div className="field">
            <label className="label">Description</label>
            <SmartTextarea
              value={description}
              onChange={setDescription}
              examples={['Revise SOP to require dual sign-off on chemical transfers above 20L.', 'Install motion-activated lighting in warehouse aisle 6 to prevent trip hazards.', 'Schedule ergonomic assessment for all packing stations by end of month.']}
              chips={['Update SOP', 'Install engineering control', 'Schedule assessment', 'Retrain staff']}
            />
          </div>

          <div className="field-row">
            <div className="field">
              <label className="label">Type</label>
              <ComboBox options={typeOpts} value={type} onChange={setType} searchable={false} />
            </div>
            <div className="field">
              <label className="label">Priority</label>
              <ComboBox options={priorityOpts} value={priority} onChange={setPriority} searchable={false} />
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label className="label">Owner <span className="req">*</span></label>
              <ComboBox options={userOpts} value={ownerId} onChange={setOwnerId} placeholder="Search users…" />
            </div>
            <div className="field">
              <label className="label">Independent verifier <span className="req">*</span></label>
              <ComboBox options={verifierOpts} value={verifierId} onChange={setVerifierId} placeholder="Search users…" />
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label className="label">Due date <span className="req">*</span></label>
              <input className="input" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}/>
            </div>
            <div className="field">
              <label className="label">Category</label>
              <input className="input" placeholder="e.g. Engineering control" value={category} onChange={e => setCategory(e.target.value)}/>
            </div>
          </div>

          {error && <div className="ncap-error">{error}</div>}
        </div>
        <div className="modal-f">
          <button className="btn btn-secondary" onClick={onCancel} disabled={submitting}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={!canSubmit || submitting}>
            {submitting ? 'Creating…' : 'Create CAPA'}
          </button>
        </div>
      </div>
    </div>
  );
}
