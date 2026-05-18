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
import Drawer from './Drawer';
import { getReferences, deleteLink } from '../../api/links';
import { useAuth } from '../../context/AuthContext';
import AddLinkModal from './AddLinkModal';
import { useConfirm } from './Dialog';

const ELEVATED_ROLES = new Set(['supervisor', 'ehs_officer', 'ehs_manager', 'admin']);

const PRIORITY_PILL = { critical: 'pill-err', high: 'pill-warn', medium: 'pill-info', low: 'pill-gray' };
const CAPA_STATUS_PILL = { pending: 'pill-gray', progress: 'pill-info', verify: 'pill-warn', closed: 'pill-success' };
const INV_STATUS_PILL = { pending: 'pill-gray', progress: 'pill-info', capa: 'pill-warn', closed: 'pill-success' };

const labelFor = {
  asset: 'asset',
  incident: 'incident',
  investigation: 'investigation',
  capa: 'CAPA',
  document: 'document',
  inspection: 'inspection',
  risk: 'risk',
};

const INSPECTION_STATUS_PILL = { in_progress: 'pill-info', completed: 'pill-success', abandoned: 'pill-gray' };

export default function ReferencedByCard({ entityType, entityId, compact = false }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canEdit = ELEVATED_ROLES.has(user?.role);
  const [refs, setRefs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const confirmDialog = useConfirm();

  useEffect(() => {
    if (!entityType || !entityId) return;
    setLoading(true);
    getReferences(entityType, entityId)
      .then(setRefs)
      .catch(() => setRefs({ incidents: [], investigations: [], capas: [], documents: [], inspections: [], assets: [], risks: [], total: 0 }))
      .finally(() => setLoading(false));
  }, [entityType, entityId, tick]);

  const refresh = () => setTick(t => t + 1);

  const unlink = async (linkId, e) => {
    e.stopPropagation();
    if (!linkId) return;
    const ok = await confirmDialog({
      title: 'Remove this link?',
      body: 'The two records will no longer be connected. You can re-link them later if needed.',
      confirmLabel: 'Remove link',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteLink(linkId);
      refresh();
    } catch {
      // Surface failure on next render via getReferences refetch — silent here.
    }
  };

  if (loading) return compact ? null : null;
  if (!refs) return null;

  const Unlink = ({ linkId }) => (canEdit && linkId ? (
    <button className="refby-unlink" onClick={(e) => unlink(linkId, e)} title="Remove link">
      <Icon name="close" size={11}/>
    </button>
  ) : null);

  const total = refs.total ?? (
    (refs.incidents?.length || 0) +
    (refs.investigations?.length || 0) +
    (refs.capas?.length || 0) +
    (refs.documents?.length || 0) +
    (refs.inspections?.length || 0) +
    (refs.assets?.length || 0) +
    (refs.risks?.length || 0)
  );

  const inlineEmpty = (
    <div className="refby-empty">
      Nothing references this {labelFor[entityType] || entityType} yet.{canEdit ? ' Use "+ Link" to attach one.' : ''}
    </div>
  );

  const drawerEmpty = (
    <div className="refby-empty-hero">
      <svg viewBox="0 0 200 140" className="refby-empty-svg" aria-hidden="true">
        <g className="refby-empty-lines" stroke="var(--sds-brand-primary)" strokeWidth="1.2" strokeDasharray="2 3" strokeLinecap="round" fill="none" opacity="0.35">
          <line x1="100" y1="70" x2="40" y2="36" />
          <line x1="100" y1="70" x2="160" y2="36" />
          <line x1="100" y1="70" x2="100" y2="118" />
        </g>

        <g className="refby-empty-ghost refby-empty-ghost-1">
          <rect x="22" y="22" width="36" height="28" rx="6" fill="rgba(98,109,249,0.08)" stroke="rgba(98,109,249,0.32)" strokeWidth="1" strokeDasharray="3 2" />
          <rect x="28" y="29" width="20" height="2.5" rx="1.25" fill="rgba(98,109,249,0.55)" />
          <rect x="28" y="34" width="14" height="2" rx="1" fill="rgba(98,109,249,0.32)" />
          <rect x="28" y="38" width="16" height="2" rx="1" fill="rgba(98,109,249,0.32)" />
        </g>
        <g className="refby-empty-ghost refby-empty-ghost-2">
          <rect x="142" y="22" width="36" height="28" rx="6" fill="rgba(98,109,249,0.08)" stroke="rgba(98,109,249,0.32)" strokeWidth="1" strokeDasharray="3 2" />
          <rect x="148" y="29" width="20" height="2.5" rx="1.25" fill="rgba(98,109,249,0.55)" />
          <rect x="148" y="34" width="14" height="2" rx="1" fill="rgba(98,109,249,0.32)" />
          <rect x="148" y="38" width="16" height="2" rx="1" fill="rgba(98,109,249,0.32)" />
        </g>
        <g className="refby-empty-ghost refby-empty-ghost-3">
          <rect x="82" y="104" width="36" height="28" rx="6" fill="rgba(98,109,249,0.08)" stroke="rgba(98,109,249,0.32)" strokeWidth="1" strokeDasharray="3 2" />
          <rect x="88" y="111" width="20" height="2.5" rx="1.25" fill="rgba(98,109,249,0.55)" />
          <rect x="88" y="116" width="14" height="2" rx="1" fill="rgba(98,109,249,0.32)" />
          <rect x="88" y="120" width="16" height="2" rx="1" fill="rgba(98,109,249,0.32)" />
        </g>

        <circle cx="100" cy="70" r="28" fill="none" stroke="var(--sds-brand-primary)" strokeWidth="1.2" className="refby-empty-pulse" />
        <circle cx="100" cy="70" r="22" fill="rgba(98,109,249,0.12)" />
        <circle cx="100" cy="70" r="16" fill="var(--sds-brand-primary)" />
        <path d="M100 63 V77 M93 70 H107" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
      <div className="refby-empty-title">No links yet</div>
      <div className="refby-empty-sub">
        Connect this {labelFor[entityType] || entityType} to incidents, CAPAs, documents, or other records to give it context.
      </div>
      {canEdit && (
        <button className="btn btn-primary refby-empty-cta" onClick={() => setAddOpen(true)}>
          <Icon name="plus" size={13}/> Link a record
        </button>
      )}
    </div>
  );

  const fullContent = (
    <>
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
                <Unlink linkId={r.link_id}/>
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
                <Unlink linkId={r.link_id}/>
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
                <Unlink linkId={r.link_id}/>
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
              <div key={`d-${r.id}`} className="refby-row" onClick={() => navigate(r.folder_id ? `/documents?folder=${r.folder_id}` : '/documents')}>
                <div className="refby-num">{r.document_number}</div>
                <div className="refby-main">
                  <div className="refby-title">{r.name}</div>
                  <div className="refby-meta">
                    {r.document_type && <span className="refby-meta-text">{r.document_type}</span>}
                    {r.uploader_name && <span className="refby-meta-text">by {r.uploader_initials || r.uploader_name}</span>}
                    {r.created_at && <span className="refby-meta-text">{r.created_at.slice(0, 10)}</span>}
                  </div>
                </div>
                <Unlink linkId={r.link_id}/>
              </div>
            ))}
          </div>
        </div>
      )}

      {refs.inspections && refs.inspections.length > 0 && (
        <div className="refby-group">
          <div className="refby-group-h">
            <Icon name="check" size={13} /> Inspections <span className="refby-group-count">{refs.inspections.length}</span>
          </div>
          <div className="refby-rows">
            {refs.inspections.map(r => (
              <div key={`ins-${r.id}`} className="refby-row" onClick={() => navigate(r.status === 'completed' ? `/inspections/${r.id}/report` : `/inspections/${r.id}`)}>
                <div className="refby-num">{r.inspection_number}</div>
                <div className="refby-main">
                  <div className="refby-title">{r.title}</div>
                  <div className="refby-meta">
                    {r.template_name && <span className="refby-meta-text">{r.template_name}</span>}
                    {r.location && <span className="refby-meta-text">{r.location}</span>}
                    {r.started_by_name && <span className="refby-meta-text">by {r.started_by_initials || r.started_by_name}</span>}
                    {r.conducted_on && <span className="refby-meta-text">{r.conducted_on.slice(0, 10)}</span>}
                  </div>
                </div>
                <div className="refby-status">
                  <span className={`pill ${INSPECTION_STATUS_PILL[r.status] || 'pill-gray'}`}>{r.status?.replace('_', ' ')}</span>
                </div>
                <Unlink linkId={r.link_id}/>
              </div>
            ))}
          </div>
        </div>
      )}

      {refs.assets && refs.assets.length > 0 && (
        <div className="refby-group">
          <div className="refby-group-h">
            <Icon name="factory" size={13} /> Assets <span className="refby-group-count">{refs.assets.length}</span>
          </div>
          <div className="refby-rows">
            {refs.assets.map(r => (
              <div key={`a-${r.id}`} className="refby-row" onClick={() => navigate(`/assets/${r.id}`)}>
                <div className="refby-num">{r.asset_number}</div>
                <div className="refby-main">
                  <div className="refby-title">{r.name}</div>
                  <div className="refby-meta">
                    {r.asset_type && <span className="refby-meta-text">{r.asset_type}</span>}
                    {r.site_name && <span className="refby-meta-text">{r.site_name}</span>}
                    {r.location_description && <span className="refby-meta-text">{r.location_description}</span>}
                    {r.serial_number && <span className="refby-meta-text">SN {r.serial_number}</span>}
                  </div>
                </div>
                <div className="refby-status">
                  <span className={`pill ${r.active === 0 ? 'pill-gray' : 'pill-success'}`}>{r.active === 0 ? 'inactive' : 'active'}</span>
                </div>
                <Unlink linkId={r.link_id}/>
              </div>
            ))}
          </div>
        </div>
      )}

      {refs.risks && refs.risks.length > 0 && (
        <div className="refby-group">
          <div className="refby-group-h">
            <Icon name="fire" size={13} /> Risks <span className="refby-group-count">{refs.risks.length}</span>
          </div>
          <div className="refby-rows">
            {refs.risks.map(r => (
              <div key={`rsk-${r.id}`} className="refby-row" onClick={() => navigate(`/risks/${r.id}`)}>
                <div className="refby-num">{r.risk_number}</div>
                <div className="refby-main">
                  <div className="refby-title">{r.title}</div>
                  <div className="refby-meta">
                    {r.category && <span className="refby-meta-text">{r.category}</span>}
                    {r.inherent_risk_level && <span className={`pill pill-${r.inherent_risk_level === 'crit' ? 'err' : r.inherent_risk_level === 'high' ? 'warn' : r.inherent_risk_level === 'med' ? 'warn' : 'success'}`}>{r.inherent_risk_level}</span>}
                    {r.site_name && <span className="refby-meta-text">{r.site_name}</span>}
                  </div>
                </div>
                <div className="refby-status">{r.status}</div>
                <Unlink linkId={r.link_id}/>
              </div>
            ))}
          </div>
        </div>
      )}

    </>
  );

  const addLinkPortal = addOpen && (
    <AddLinkModal
      entityType={entityType}
      entityId={entityId}
      onClose={() => setAddOpen(false)}
      onCreated={() => { setAddOpen(false); refresh(); }}
    />
  );

  if (compact) {
    return (
      <>
        <div className="refby-compact" onClick={() => setDrawerOpen(true)}>
          <span className="refby-compact-label">
            <Icon name="pulse" size={13}/>Referenced by
          </span>
          <span className="refby-compact-right">
            {total > 0 && <span className="refby-compact-count">{total}</span>}
            {canEdit && (
              <button className="refby-compact-add" onClick={(e) => { e.stopPropagation(); setAddOpen(true); }} title="Link to another record">
                <Icon name="plus" size={11}/>
              </button>
            )}
            <Icon name="arrow" size={12} color="var(--sds-fg-tertiary)"/>
          </span>
        </div>
        <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} width={560} className="refby-drawer">
          <div className="drawer-h">
            <div>
              <div className="drawer-title">
                <Icon name="pulse" size={16} color="var(--sds-brand-primary)"/> Referenced by
              </div>
              <div className="drawer-sub">{total} linked record{total !== 1 ? 's' : ''}</div>
            </div>
            <button className="icon-btn" onClick={() => setDrawerOpen(false)} aria-label="Close"><Icon name="close" size={18}/></button>
          </div>
          <div className="drawer-body refby-drawer-body">
            {total === 0 ? drawerEmpty : fullContent}
          </div>
          {canEdit && (
            <div className="drawer-f">
              <button className="btn btn-primary" onClick={() => setAddOpen(true)}>
                <Icon name="plus" size={12}/> Link record
              </button>
            </div>
          )}
        </Drawer>
        {addLinkPortal}
      </>
    );
  }

  return (
    <div className="card card-pad refby-card">
      <div className="card-h refby-card-h">
        <Icon name="pulse" size={16} /> Referenced by
        <span className="refby-count">{total}</span>
        {canEdit && (
          <button className="refby-add" onClick={() => setAddOpen(true)} title="Link to another record">
            <Icon name="plus" size={12}/>Link
          </button>
        )}
      </div>
      {total === 0 ? inlineEmpty : fullContent}
      {addLinkPortal}
    </div>
  );
}
