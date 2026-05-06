// ReferencedByCard.jsx — P3-L1 "Referenced by" surfacing.
//
// Drop-in card for any detail page. Given (entityType, entityId), pulls
// /api/links/references and renders four grouped sections (Incidents,
// Investigations, CAPAs, Documents) with click-through navigation.
// Empty groups are hidden; if everything is empty the whole card shows
// a single empty-state line. Any error from the BE collapses to a
// non-fatal empty card so a missing link doesn't break the page.
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from './Icon';
import { getReferences } from '../../api/links';

const PRIORITY_PILL = { critical: 'pill-err', high: 'pill-warn', medium: 'pill-info', low: 'pill-gray' };
const CAPA_STATUS_PILL = { pending: 'pill-gray', progress: 'pill-info', verify: 'pill-warn', closed: 'pill-success' };
const INV_STATUS_PILL = { pending: 'pill-gray', progress: 'pill-info', capa: 'pill-warn', closed: 'pill-success' };

const labelFor = {
  asset: 'asset',
  incident: 'incident',
  investigation: 'investigation',
  capa: 'CAPA',
  document: 'document',
};

export default function ReferencedByCard({ entityType, entityId }) {
  const navigate = useNavigate();
  const [refs, setRefs] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!entityType || !entityId) return;
    setLoading(true);
    getReferences(entityType, entityId)
      .then(setRefs)
      .catch(() => setRefs({ incidents: [], investigations: [], capas: [], documents: [], total: 0 }))
      .finally(() => setLoading(false));
  }, [entityType, entityId]);

  if (loading) return null;
  if (!refs) return null;

  const total = refs.total ?? (
    (refs.incidents?.length || 0) +
    (refs.investigations?.length || 0) +
    (refs.capas?.length || 0) +
    (refs.documents?.length || 0)
  );

  return (
    <div className="card card-pad refby-card">
      <div className="card-h">
        <Icon name="pulse" size={16} /> Referenced by
        <span className="refby-count">{total}</span>
      </div>

      {total === 0 && (
        <div className="refby-empty">
          Nothing references this {labelFor[entityType] || entityType} yet.
        </div>
      )}

      {refs.incidents && refs.incidents.length > 0 && (
        <div className="refby-group">
          <div className="refby-group-h">
            <Icon name="incidents" size={13} /> Incidents <span className="refby-group-count">{refs.incidents.length}</span>
          </div>
          <div className="refby-rows">
            {refs.incidents.map(r => (
              <div key={`i-${r.id}`} className="refby-row" onClick={() => navigate(`/incidents/${r.id}`)}>
                <div className="refby-num">{r.incident_number}</div>
                <div className="refby-main">
                  <div className="refby-title">{r.title}</div>
                  <div className="refby-meta">
                    {r.severity && <span className={`pill pill-sev-${r.severity}`}>S{r.severity}</span>}
                    {r.track && <span className={`pill pill-track-${r.track.toLowerCase()}`}>Track {r.track}</span>}
                    {r.site_name && <span className="refby-meta-text">{r.site_name}</span>}
                    {r.incident_datetime && <span className="refby-meta-text">{r.incident_datetime.slice(0, 10)}</span>}
                  </div>
                </div>
                <div className="refby-status">{r.status}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {refs.investigations && refs.investigations.length > 0 && (
        <div className="refby-group">
          <div className="refby-group-h">
            <Icon name="investigation" size={13} /> Investigations <span className="refby-group-count">{refs.investigations.length}</span>
          </div>
          <div className="refby-rows">
            {refs.investigations.map(r => (
              <div key={`v-${r.id}`} className="refby-row" onClick={() => navigate(`/investigations/${r.id}`)}>
                <div className="refby-num">{r.investigation_number}</div>
                <div className="refby-main">
                  <div className="refby-title">{r.incident_title || r.incident_number}</div>
                  <div className="refby-meta">
                    {r.track && <span className={`pill pill-track-${r.track.toLowerCase()}`}>Track {r.track}</span>}
                    {r.lead_name && <span className="refby-meta-text">Lead: {r.lead_initials || r.lead_name}</span>}
                    {r.due_date && <span className="refby-meta-text">due {r.due_date.slice(0, 10)}</span>}
                  </div>
                </div>
                <div className="refby-status">
                  <span className={`pill ${INV_STATUS_PILL[r.status] || 'pill-gray'}`}>{r.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {refs.capas && refs.capas.length > 0 && (
        <div className="refby-group">
          <div className="refby-group-h">
            <Icon name="capa" size={13} /> CAPAs <span className="refby-group-count">{refs.capas.length}</span>
          </div>
          <div className="refby-rows">
            {refs.capas.map(r => (
              <div key={`c-${r.id}`} className="refby-row" onClick={() => navigate(`/capas/${r.id}`)}>
                <div className="refby-num">{r.capa_number}</div>
                <div className="refby-main">
                  <div className="refby-title">{r.title}</div>
                  <div className="refby-meta">
                    {r.priority && <span className={`pill ${PRIORITY_PILL[r.priority] || 'pill-gray'}`}>{r.priority}</span>}
                    {r.type && <span className="refby-meta-text">{r.type}</span>}
                    {r.owner_name && <span className="refby-meta-text">Owner: {r.owner_initials || r.owner_name}</span>}
                    {r.due_date && <span className="refby-meta-text">due {r.due_date.slice(0, 10)}</span>}
                  </div>
                </div>
                <div className="refby-status">
                  <span className={`pill ${CAPA_STATUS_PILL[r.status] || 'pill-gray'}`}>{r.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {refs.documents && refs.documents.length > 0 && (
        <div className="refby-group">
          <div className="refby-group-h">
            <Icon name="file" size={13} /> Documents <span className="refby-group-count">{refs.documents.length}</span>
          </div>
          <div className="refby-rows">
            {refs.documents.map(r => (
              <div key={`d-${r.id}`} className="refby-row" onClick={() => navigate('/documents')}>
                <div className="refby-num">{r.document_number}</div>
                <div className="refby-main">
                  <div className="refby-title">{r.name}</div>
                  <div className="refby-meta">
                    {r.document_type && <span className="refby-meta-text">{r.document_type}</span>}
                    {r.uploader_name && <span className="refby-meta-text">by {r.uploader_initials || r.uploader_name}</span>}
                    {r.created_at && <span className="refby-meta-text">{r.created_at.slice(0, 10)}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
