// AddLinkModal.jsx — picker for creating polymorphic entity_links from any
// detail page. Mounted from <ReferencedByCard> when the user clicks "+ Link".
//
// Flow: pick a target type (incident/investigation/capa/asset/document/inspection
// — self type is excluded), search the matching list endpoint with debounce,
// click a result to POST /api/links and bubble back to the card so it can refresh.
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';
import api from '../../api/client';
import { createLink } from '../../api/links';

const TYPES = [
  { id: 'incident',      label: 'Incident',      icon: 'incidents',     api: '/incidents',      key: 'incidents',      numField: 'incident_number',      titleField: 'title' },
  { id: 'investigation', label: 'Investigation', icon: 'investigation', api: '/investigations', key: 'investigations', numField: 'investigation_number', titleField: 'incident_title' },
  { id: 'capa',          label: 'CAPA',          icon: 'capa',          api: '/capas',          key: 'capas',          numField: 'capa_number',          titleField: 'title' },
  { id: 'asset',         label: 'Asset',         icon: 'factory',       api: '/assets',         key: 'assets',         numField: 'asset_number',         titleField: 'name' },
  { id: 'document',      label: 'Document',      icon: 'file',          api: '/documents',      key: 'documents',      numField: 'document_number',      titleField: 'name' },
  { id: 'inspection',    label: 'Inspection',    icon: 'check',         api: '/inspections',    key: 'inspections',    numField: 'inspection_number',    titleField: 'title' },
];

export default function AddLinkModal({ entityType, entityId, onClose, onCreated }) {
  const types = TYPES.filter(t => t.id !== entityType);
  const [type, setType] = useState(types[0].id);
  const typeMeta = TYPES.find(t => t.id === type);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [linkingId, setLinkingId] = useState(null);
  const [error, setError] = useState(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    setError(null);
    setLoading(true);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      // List endpoints are inconsistent: incidents/investigations/capas/inspections
      // accept `search`, while assets + documents accept `q`. Send both so the
      // right one wins per endpoint.
      const params = { limit: 30 };
      const term = search.trim();
      if (term) { params.search = term; params.q = term; }
      api.get(typeMeta.api, { params })
        .then(r => setResults(r.data?.[typeMeta.key] || []))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 200);
    return () => clearTimeout(debounceRef.current);
  }, [type, search, typeMeta.api, typeMeta.key]);

  const link = async (target) => {
    setLinkingId(target.id);
    setError(null);
    try {
      await createLink({
        source_type: entityType,
        source_id: entityId,
        target_type: type,
        target_id: target.id,
      });
      onCreated();
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to create link.');
    } finally {
      setLinkingId(null);
    }
  };

  return createPortal(
    <div className="alm-backdrop" onClick={onClose}>
      <div className="alm-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="alm-title">
        <div className="alm-header">
          <div>
            <div className="alm-title" id="alm-title">Link to another record</div>
            <div className="alm-sub">Pick a type, search for the entity, click to link.</div>
          </div>
          <button className="alm-close" onClick={onClose}><Icon name="close" size={16}/></button>
        </div>

        <div className="alm-types">
          {types.map(t => (
            <button
              key={t.id}
              className={`alm-type-chip${t.id === type ? ' is-active' : ''}`}
              onClick={() => { setType(t.id); setSearch(''); }}
            >
              <Icon name={t.icon} size={13}/>{t.label}
            </button>
          ))}
        </div>

        <div className="alm-search">
          <Icon name="search" size={14}/>
          <input
            className="alm-search-input"
            placeholder={`Search ${typeMeta.label.toLowerCase()}s by number or title…`}
            value={search}
            autoFocus
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {error && <div className="alm-error">{error}</div>}

        <div className="alm-results">
          {loading && <div className="alm-empty">Searching…</div>}
          {!loading && results.length === 0 && <div className="alm-empty">No matches.</div>}
          {!loading && results.map(r => (
            <button
              key={r.id}
              className="alm-result"
              disabled={linkingId !== null}
              onClick={() => link(r)}
            >
              <span className="alm-result-num">{r[typeMeta.numField] || `#${r.id}`}</span>
              <span className="alm-result-title">{r[typeMeta.titleField] || ''}</span>
              <span className="alm-result-cta">
                {linkingId === r.id ? 'Linking…' : <><Icon name="plus" size={13}/>Link</>}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
