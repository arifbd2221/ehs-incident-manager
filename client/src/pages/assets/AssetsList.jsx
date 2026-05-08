import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { listAssets, createAsset, updateAsset, deleteAsset, importAssets, assetImportTemplateUrl } from '../../api/assets';
import ImportModal from '../../components/shared/ImportModal';
import { listSites } from '../../api/sites';
import { listAssetCategories, createAssetCategory, listCategoryFields } from '../../api/asset_categories';
import Icon from '../../components/shared/Icon';
import AssetTypesModal from '../../components/modals/AssetTypesModal';
import CustomFieldsForm from '../../components/assets/CustomFieldsForm';
import '../../styles/assets.css';

const ELEVATED = new Set(['supervisor', 'ehs_officer', 'ehs_manager', 'admin']);

const EMPTY = {
  name: '',
  display_id: '',
  site_id: '',
  asset_type: '',
  asset_category_id: '',
  location_description: '',
  serial_number: '',
  description: '',
  custom_fields: {},
};

const MODAL_SECTIONS = [
  { key: 'identity', label: 'Identity', icon: 'factory' },
  { key: 'location', label: 'Location', icon: 'location' },
  { key: 'details', label: 'Details', icon: 'info' },
];

export default function AssetsList() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canEdit = ELEVATED.has(user?.role);

  const [assets, setAssets] = useState([]);
  const [sites, setSites] = useState([]);
  const [categories, setCategories] = useState([]);
  const [showAssetTypes, setShowAssetTypes] = useState(false);
  const [categoryFieldDefs, setCategoryFieldDefs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('active');
  const [siteFilter, setSiteFilter] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState('grid');
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef(null);

  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [section, setSection] = useState('identity');

  const [newCatOpen, setNewCatOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importToast, setImportToast] = useState('');
  const [newCatName, setNewCatName] = useState('');
  const [newCatSaving, setNewCatSaving] = useState(false);

  const nameRef = useRef(null);

  const refreshCategories = () => listAssetCategories().then(setCategories).catch(() => setCategories([]));
  const refreshAssets = () => {
    setLoading(true);
    const params = {};
    if (activeTab === 'active') params.active = 1;
    else if (activeTab === 'archived') params.active = 0;
    if (siteFilter) params.site_id = siteFilter;
    if (catFilter) params.asset_category_id = catFilter;
    listAssets(params)
      .then(d => setAssets(d.assets || []))
      .catch(() => setAssets([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    listSites().then(setSites).catch(() => setSites([]));
    refreshCategories();
  }, []);
  useEffect(refreshAssets, [activeTab, siteFilter, catFilter]);

  useEffect(() => {
    if (!filterOpen) return;
    const handler = (e) => {
      if (filterRef.current && !filterRef.current.contains(e.target)) setFilterOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [filterOpen]);

  const activeFilterCount = (siteFilter ? 1 : 0) + (catFilter ? 1 : 0);
  const activeSiteName = sites.find(s => String(s.id) === String(siteFilter))?.name;
  const activeCatObj = categories.find(c => String(c.id) === String(catFilter));

  const filtered = useMemo(() => {
    if (!search.trim()) return assets;
    const q = search.toLowerCase();
    return assets.filter(a =>
      (a.name || '').toLowerCase().includes(q) ||
      (a.asset_number || '').toLowerCase().includes(q) ||
      (a.serial_number || '').toLowerCase().includes(q) ||
      (a.location_description || '').toLowerCase().includes(q) ||
      (a.asset_type || '').toLowerCase().includes(q)
    );
  }, [assets, search]);

  const stats = useMemo(() => {
    const total = assets.length;
    const active = assets.filter(a => a.active).length;
    const archived = total - active;
    const types = new Set(assets.map(a => a.asset_type).filter(Boolean)).size;
    return { total, active, archived, types };
  }, [assets]);

  const openNew = () => {
    setEditing('new');
    setForm({
      ...EMPTY,
      site_id: sites[0]?.id || '',
      asset_category_id: categories[0]?.id || '',
      asset_type: categories[0]?.name || '',
    });
    setMsg({ type: '', text: '' });
    setSection('identity');
    setSuccess(false);
    setTimeout(() => nameRef.current?.focus(), 200);
  };

  const openEdit = (asset) => {
    setEditing(asset);
    let cf = asset.custom_fields;
    if (typeof cf === 'string') {
      try { cf = JSON.parse(cf); } catch { cf = {}; }
    }
    setForm({
      name: asset.name || '',
      display_id: asset.display_id || '',
      site_id: asset.site_id || '',
      asset_type: asset.asset_type || '',
      asset_category_id: asset.asset_category_id || '',
      location_description: asset.location_description || '',
      serial_number: asset.serial_number || '',
      description: asset.description || '',
      custom_fields: cf || {},
    });
    setMsg({ type: '', text: '' });
    setSection('identity');
    setSuccess(false);
  };

  const close = () => {
    setEditing(null);
    setNewCatOpen(false);
    setNewCatName('');
    setMsg({ type: '', text: '' });
    setSuccess(false);
  };
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!form.asset_category_id) { setCategoryFieldDefs([]); return; }
    listCategoryFields(form.asset_category_id).then(setCategoryFieldDefs).catch(() => setCategoryFieldDefs([]));
  }, [form.asset_category_id]);

  const handleCategoryChange = (val) => {
    if (val === '__new__') {
      setNewCatOpen(true);
      return;
    }
    if (val === '__custom__') {
      set('asset_category_id', '');
      set('asset_type', '');
      return;
    }
    const cat = categories.find(c => String(c.id) === String(val));
    set('asset_category_id', val);
    set('asset_type', cat?.name || '');
  };

  const handleNewCategorySave = async () => {
    if (!newCatName.trim()) return;
    setNewCatSaving(true);
    try {
      const cat = await createAssetCategory({ name: newCatName.trim() });
      await refreshCategories();
      set('asset_category_id', cat.id);
      set('asset_type', cat.name);
      setNewCatOpen(false);
      setNewCatName('');
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'Failed to create category' });
    } finally {
      setNewCatSaving(false);
    }
  };

  const pct = (() => {
    let filled = 0;
    let total = 3;
    if (form.name.trim()) filled++;
    if (form.site_id) filled++;
    if (form.asset_type || form.asset_category_id) filled++;
    if (form.location_description) { total++; filled++; }
    if (form.serial_number) { total++; filled++; }
    if (form.description) { total++; filled++; }
    return Math.round((filled / total) * 100);
  })();

  const handleSave = async (e) => {
    e?.preventDefault();
    if (!form.name.trim()) {
      setMsg({ type: 'error', text: 'Display name is required' });
      setSection('identity');
      return;
    }
    if (!form.display_id.trim()) {
      setMsg({ type: 'error', text: 'Unique identifier is required' });
      setSection('identity');
      return;
    }
    if (!form.site_id) {
      setMsg({ type: 'error', text: 'Site is required' });
      setSection('location');
      return;
    }
    if (!form.asset_type.trim() && !form.asset_category_id) {
      setMsg({ type: 'error', text: 'Asset type is required' });
      setSection('identity');
      return;
    }
    setSaving(true);
    setMsg({ type: '', text: '' });
    try {
      const payload = { ...form };
      if (!payload.asset_category_id) delete payload.asset_category_id;
      if (editing === 'new') {
        await createAsset(payload);
      } else {
        await updateAsset(editing.id, payload);
      }
      setSuccess(true);
      setTimeout(() => { refreshAssets(); close(); }, 600);
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'Save failed' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (asset, e) => {
    e?.stopPropagation();
    if (!window.confirm(`Archive "${asset.name}"? It will be hidden from active views.`)) return;
    try {
      await deleteAsset(asset.id);
      refreshAssets();
    } catch (err) {
      alert(err.response?.data?.error || 'Archive failed');
    }
  };

  const handleRestore = async (asset, e) => {
    e?.stopPropagation();
    try {
      await updateAsset(asset.id, { active: 1 });
      refreshAssets();
    } catch (err) {
      alert(err.response?.data?.error || 'Restore failed');
    }
  };

  const siteName = sites.find(s => String(s.id) === String(form.site_id))?.name;
  const catName = categories.find(c => String(c.id) === String(form.asset_category_id))?.name || form.asset_type;

  return (
    <div className="page assets-page">
      {/* Hero header with stats */}
      <div className="assets-hero">
        <div className="assets-hero-row">
          <div className="assets-hero-icon">
            <Icon name="factory" size={24} />
          </div>
          <div className="assets-hero-text">
            <h1 className="assets-title">Assets</h1>
            <p className="assets-sub">Equipment, vehicles, areas, and other registered assets</p>
          </div>
          <div className="assets-hero-actions">
            {canEdit && (
              <button
                className="btn btn-secondary"
                onClick={() => setShowAssetTypes(true)}
                title="Define asset types and their custom fields"
              >
                <Icon name="settings" size={14} /> Asset types
              </button>
            )}
            {canEdit && (
              <button className="btn btn-secondary" onClick={() => setImportOpen(true)}>
                <Icon name="upload" size={14} /> Import CSV
              </button>
            )}
            {canEdit && (
              <button className="btn btn-primary" onClick={openNew}>
                <Icon name="plus" size={16} /> New asset
              </button>
            )}
          </div>
        </div>
        <div className="assets-stats">
          <div className="assets-stat" style={{ '--as-color': '#626DF9' }}>
            <div className="assets-stat-icon"><Icon name="factory" size={16} /></div>
            <div>
              <div className="assets-stat-val">{stats.total}</div>
              <div className="assets-stat-lbl">Total</div>
            </div>
          </div>
          <div className="assets-stat" style={{ '--as-color': '#2E7D32' }}>
            <div className="assets-stat-icon"><Icon name="check" size={16} /></div>
            <div>
              <div className="assets-stat-val">{stats.active}</div>
              <div className="assets-stat-lbl">Active</div>
            </div>
          </div>
          <div className="assets-stat" style={{ '--as-color': '#ED6C02' }}>
            <div className="assets-stat-icon"><Icon name="clock" size={16} /></div>
            <div>
              <div className="assets-stat-val">{stats.archived}</div>
              <div className="assets-stat-lbl">Archived</div>
            </div>
          </div>
          <div className="assets-stat" style={{ '--as-color': '#8b5cf6' }}>
            <div className="assets-stat-icon"><Icon name="gear" size={16} /></div>
            <div>
              <div className="assets-stat-val">{stats.types}</div>
              <div className="assets-stat-lbl">Types</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="assets-tabs">
        {[
          { id: 'active', label: 'Active', count: stats.active },
          { id: 'archived', label: 'Archived', count: stats.archived },
          { id: 'all', label: 'All', count: stats.total },
        ].map(t => (
          <div key={t.id} className={`assets-tab ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => setActiveTab(t.id)}>
            {t.label}
            <span className="assets-tab-count">{t.count}</span>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="assets-toolbar">
        <div className="assets-search">
          <Icon name="search" size={16} />
          <input className="input" placeholder="Search assets..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="af-wrap" ref={filterRef}>
          <button
            className={`af-trigger ${filterOpen ? 'is-open' : ''} ${activeFilterCount ? 'has-filters' : ''}`}
            onClick={() => setFilterOpen(o => !o)}
          >
            <Icon name="filter" size={14} />
            Filters
            {activeFilterCount > 0 && <span className="af-badge">{activeFilterCount}</span>}
          </button>
          {filterOpen && (
            <div className="af-dropdown">
              <div className="af-section">
                <div className="af-section-label">Site</div>
                <div className="af-option-list">
                  <button
                    className={`af-option ${!siteFilter ? 'active' : ''}`}
                    onClick={() => setSiteFilter('')}
                  >
                    All sites
                  </button>
                  {sites.map(s => (
                    <button
                      key={s.id}
                      className={`af-option ${String(siteFilter) === String(s.id) ? 'active' : ''}`}
                      onClick={() => { setSiteFilter(String(s.id)); }}
                    >
                      <Icon name="factory" size={12} />
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>
              <div className="af-divider" />
              <div className="af-section">
                <div className="af-section-label">Type</div>
                <div className="af-option-list">
                  <button
                    className={`af-option ${!catFilter ? 'active' : ''}`}
                    onClick={() => setCatFilter('')}
                  >
                    All types
                  </button>
                  {categories.map(c => (
                    <button
                      key={c.id}
                      className={`af-option ${String(catFilter) === String(c.id) ? 'active' : ''}`}
                      onClick={() => { setCatFilter(String(c.id)); }}
                    >
                      <span className="af-dot" style={{ background: c.color || '#626DF9' }} />
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>
              {activeFilterCount > 0 && (
                <>
                  <div className="af-divider" />
                  <button className="af-clear" onClick={() => { setSiteFilter(''); setCatFilter(''); }}>
                    <Icon name="close" size={12} /> Clear all filters
                  </button>
                </>
              )}
            </div>
          )}
        </div>
        <div className="assets-view-toggle">
          <button
            className={`assets-view-btn ${viewMode === 'grid' ? 'active' : ''}`}
            onClick={() => setViewMode('grid')}
            title="Grid view"
          >
            <Icon name="dashboard" size={15} />
          </button>
          <button
            className={`assets-view-btn ${viewMode === 'table' ? 'active' : ''}`}
            onClick={() => setViewMode('table')}
            title="Table view"
          >
            <Icon name="sort" size={15} />
          </button>
        </div>
      </div>

      {/* Active filter chips */}
      {activeFilterCount > 0 && (
        <div className="af-chips">
          {activeSiteName && (
            <span className="af-chip">
              <Icon name="factory" size={11} /> {activeSiteName}
              <button className="af-chip-x" onClick={() => setSiteFilter('')}><Icon name="close" size={10} /></button>
            </span>
          )}
          {activeCatObj && (
            <span className="af-chip">
              <span className="af-dot" style={{ background: activeCatObj.color || '#626DF9' }} />
              {activeCatObj.name}
              <button className="af-chip-x" onClick={() => setCatFilter('')}><Icon name="close" size={10} /></button>
            </span>
          )}
        </div>
      )}

      {/* Skeleton loading */}
      {loading && (
        <div className="assets-skel-grid">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="assets-skel-card" style={{ animationDelay: `${i * 60}ms` }}>
              <div className="skel skel-pill" />
              <div className="skel skel-title" />
              <div className="skel skel-id" />
              <div className="skel skel-row" />
              <div className="skel skel-row" style={{ width: '55%' }} />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <div className="card card-pad empty-state">
          <div className="empty-state-icon">
            <Icon name="factory" size={28} />
          </div>
          <div className="empty-state-title">
            {assets.length === 0 ? 'No assets registered yet' : 'No assets match your filters'}
          </div>
          <div className="empty-state-desc">
            {assets.length === 0
              ? 'Register equipment, vehicles, and areas to track them across incidents and inspections.'
              : 'Try adjusting your search or filter criteria.'}
          </div>
          {assets.length === 0 && canEdit && (
            <button className="btn btn-primary" onClick={openNew}>
              <Icon name="plus" size={16} /> Add your first asset
            </button>
          )}
        </div>
      )}

      {/* Grid view */}
      {!loading && filtered.length > 0 && viewMode === 'grid' && (
        <div className="assets-grid">
          {filtered.map(a => {
            const color = a.category_color || '#90A4AE';
            const initials = (a.name || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
            return (
              <div key={a.id}
                className={`asset-card ${!a.active ? 'archived' : ''} ${!canEdit ? 'asset-card-bottom-pad' : ''}`}
                style={{ '--ac-color': color }}
                onClick={() => navigate(`/assets/${a.id}`)}
              >
                <div className="asset-card-top">
                  <div className="asset-card-avatar">{initials || '?'}</div>
                  <div className="asset-card-info">
                    <div className="asset-card-name">{a.name}</div>
                    <div className="asset-card-id">{a.display_id || a.asset_number}</div>
                  </div>
                  <div className="asset-card-h">
                    <div className="asset-type-pill" style={{ background: color }}>
                      {a.asset_type || '—'}
                    </div>
                    {!a.active && <span className="asset-badge-archived">archived</span>}
                  </div>
                </div>

                <div className="asset-card-meta">
                  <span className="asset-card-meta-item"><Icon name="factory" size={12} /> {a.site_name || '—'}</span>
                  {a.location_description && (
                    <span className="asset-card-meta-item"><Icon name="location" size={12} /> {a.location_description}</span>
                  )}
                  {a.serial_number && (
                    <span className="asset-card-meta-item"><Icon name="shield" size={12} /> {a.serial_number}</span>
                  )}
                </div>

                {/* Hover-expand details */}
                <div className="asset-card-expand">
                  <div className="asset-card-expand-inner">
                    <div className="asset-card-expand-sep" />
                    {a.description && (
                      <div className="asset-card-desc">{a.description}</div>
                    )}
                    <div className="asset-card-detail-row">
                      <div className="asset-card-detail">
                        <Icon name="clock" size={11} /> Created {a.created_at?.slice(0, 10) || '—'}
                      </div>
                      {a.updated_at && a.updated_at !== a.created_at && (
                        <div className="asset-card-detail">
                          <Icon name="edit" size={11} /> Updated {a.updated_at?.slice(0, 10)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {canEdit && (
                  <div className="asset-actions">
                    <button className="btn btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); openEdit(a); }}>
                      <Icon name="edit" size={13} /> Edit
                    </button>
                    {a.active
                      ? <button className="btn btn-ghost btn-sm asset-archive" onClick={(e) => handleDelete(a, e)}>Archive</button>
                      : <button className="btn btn-ghost btn-sm" onClick={(e) => handleRestore(a, e)}>Restore</button>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Table view */}
      {!loading && filtered.length > 0 && viewMode === 'table' && (
        <div className="assets-table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Name</th>
                <th>ID</th>
                <th>Type</th>
                <th>Site</th>
                <th>Location</th>
                <th>Status</th>
                {canEdit && <th style={{ width: 100 }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map(a => (
                <tr key={a.id} onClick={() => navigate(`/assets/${a.id}`)} style={{ opacity: a.active ? 1 : 0.6 }}>
                  <td>
                    <span className="asset-tbl-name">{a.name}</span>
                  </td>
                  <td>
                    <span className="asset-tbl-id">{a.display_id || a.asset_number}</span>
                  </td>
                  <td>
                    <span className="asset-type-pill" style={{ background: a.category_color || '#90A4AE' }}>
                      {a.asset_type || '—'}
                    </span>
                  </td>
                  <td>{a.site_name || '—'}</td>
                  <td>{a.location_description || '—'}</td>
                  <td>
                    <span className="asset-tbl-status">
                      <span className="asset-tbl-dot" style={{ background: a.active ? '#2E7D32' : '#90A4AE' }} />
                      {a.active ? 'Active' : 'Archived'}
                    </span>
                  </td>
                  {canEdit && (
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); openEdit(a); }}>
                          <Icon name="edit" size={12} />
                        </button>
                        {a.active
                          ? <button className="btn btn-ghost btn-sm asset-archive" onClick={(e) => handleDelete(a, e)} title="Archive">
                              <Icon name="close" size={12} />
                            </button>
                          : <button className="btn btn-ghost btn-sm" onClick={(e) => handleRestore(a, e)} title="Restore">
                              <Icon name="check" size={12} />
                            </button>}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing !== null && createPortal(
        <div className="am-backdrop" onClick={close}>
          <form className={`am-modal${success ? ' am-success' : ''}`} onClick={e => e.stopPropagation()} onSubmit={handleSave}>
            {/* Header */}
            <div className="am-header">
              <div className="am-header-icon">
                <Icon name="factory" size={20} />
              </div>
              <div className="am-header-text">
                <h2>{editing === 'new' ? 'New asset' : `Edit ${editing.name}`}</h2>
                <p>{editing === 'new' ? 'Register a new asset for your organization' : 'Update asset details and location'}</p>
              </div>
              <button type="button" className="am-close" onClick={close}>
                <Icon name="close" size={18} />
              </button>
            </div>

            {/* Progress */}
            <div className="am-progress">
              <div className="am-progress-bar" style={{ width: `${pct}%` }} />
              <span className="am-progress-label">{pct}% complete</span>
            </div>

            {/* Tabs */}
            <div className="am-tabs">
              {MODAL_SECTIONS.map(s => (
                <button
                  key={s.key}
                  type="button"
                  className={`am-tab${section === s.key ? ' active' : ''}`}
                  onClick={() => setSection(s.key)}
                >
                  <Icon name={s.icon} size={16} />
                  <span>{s.label}</span>
                </button>
              ))}
            </div>

            {/* Body */}
            <div className="am-body">
              {section === 'identity' && (
                <div className="am-section" key="identity">
                  <div className="am-sys-banner" style={{ animationDelay: '0ms' }}>
                    <Icon name="shield" size={13}/>
                    <span>System fields — required regardless of asset type</span>
                  </div>

                  <div className="am-field-row" style={{ animationDelay: '40ms' }}>
                    <div className="am-field am-field-half">
                      <label className="am-label">Display name <span className="req">*</span></label>
                      <input
                        ref={nameRef}
                        className={`am-input${!form.name.trim() && msg.type === 'error' ? ' am-input-err' : ''}`}
                        value={form.name}
                        onChange={e => set('name', e.target.value)}
                        placeholder="e.g. Hydraulic Press #4"
                      />
                      <span className="am-helper">How the asset appears in lists and reports</span>
                    </div>
                    <div className="am-field am-field-half">
                      <label className="am-label">Unique identifier <span className="req">*</span></label>
                      <input
                        className={`am-input${!form.display_id.trim() && msg.type === 'error' ? ' am-input-err' : ''}`}
                        value={form.display_id}
                        onChange={e => set('display_id', e.target.value)}
                        placeholder="e.g. INV-PRESS-04"
                      />
                      <span className="am-helper">Your inventory tag, asset code, or sticker number</span>
                    </div>
                  </div>

                  <div className="am-field" style={{ animationDelay: '80ms' }}>
                    <label className="am-label">Asset type <span className="req">*</span></label>
                    {!newCatOpen ? (
                      <>
                        <div className="am-cat-grid">
                          {categories.map(c => (
                            <button
                              key={c.id}
                              type="button"
                              className={`am-cat-btn${String(form.asset_category_id) === String(c.id) ? ' active' : ''}`}
                              onClick={() => { set('asset_category_id', c.id); set('asset_type', c.name); }}
                              style={{ '--cat-color': c.color || '#626DF9' }}
                            >
                              <span className="am-cat-dot" style={{ background: c.color || '#626DF9' }} />
                              {c.name}
                            </button>
                          ))}
                          <button
                            type="button"
                            className="am-cat-btn am-cat-add"
                            onClick={() => setNewCatOpen(true)}
                          >
                            <Icon name="plus" size={12} />
                            New
                          </button>
                        </div>
                        {(!form.asset_category_id && form.asset_type !== undefined) && (
                          <input
                            className="am-input"
                            style={{ marginTop: 8 }}
                            placeholder="Or type a custom category..."
                            value={form.asset_type}
                            onChange={e => set('asset_type', e.target.value)}
                          />
                        )}
                      </>
                    ) : (
                      <div className="am-newcat">
                        <input
                          className="am-input"
                          placeholder="New category name"
                          autoFocus
                          value={newCatName}
                          onChange={e => setNewCatName(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleNewCategorySave(); } }}
                        />
                        <div className="am-newcat-actions">
                          <button type="button" className="am-btn-save" disabled={newCatSaving || !newCatName.trim()} onClick={handleNewCategorySave}>
                            <Icon name="check" size={13} />{newCatSaving ? 'Saving...' : 'Create'}
                          </button>
                          <button type="button" className="am-btn-cancel" onClick={() => { setNewCatOpen(false); setNewCatName(''); }}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="am-field" style={{ animationDelay: '140ms' }}>
                    <label className="am-label">Manufacturer serial number <span className="am-label-hint">optional</span></label>
                    <input
                      className="am-input"
                      value={form.serial_number}
                      onChange={e => set('serial_number', e.target.value)}
                      placeholder="e.g. SN-2024-04821"
                    />
                    <span className="am-helper">Different from the unique identifier above — this is the OEM serial</span>
                  </div>
                </div>
              )}

              {section === 'location' && (
                <div className="am-section" key="location">
                  <div className="am-field" style={{ animationDelay: '0ms' }}>
                    <label className="am-label">Site <span className="req">*</span></label>
                    <div className="am-site-grid">
                      {sites.map(s => (
                        <button
                          key={s.id}
                          type="button"
                          className={`am-site-btn${String(form.site_id) === String(s.id) ? ' active' : ''}`}
                          onClick={() => set('site_id', s.id)}
                        >
                          <Icon name="factory" size={14} />
                          <span>{s.name}</span>
                          {s.country && <span className="am-site-country">{s.country}</span>}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="am-field" style={{ animationDelay: '60ms' }}>
                    <label className="am-label">Location description</label>
                    <input
                      className="am-input"
                      value={form.location_description}
                      onChange={e => set('location_description', e.target.value)}
                      placeholder="e.g. Bay 3, production floor"
                    />
                  </div>

                  {(siteName || form.location_description) && (
                    <div className="am-location-preview" style={{ animationDelay: '120ms' }}>
                      <div className="am-loc-icon"><Icon name="location" size={22} /></div>
                      <div className="am-loc-details">
                        <span className="am-loc-site">{siteName || 'No site selected'}</span>
                        <span className="am-loc-desc">{form.location_description || 'No specific location'}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {section === 'details' && (
                <div className="am-section" key="details">
                  {categoryFieldDefs.length > 0 && (
                    <CustomFieldsForm
                      fields={categoryFieldDefs}
                      values={form.custom_fields}
                      onChange={(v) => set('custom_fields', v)}
                    />
                  )}

                  <div className="am-field" style={{ animationDelay: '0ms' }}>
                    <label className="am-label">Description / notes</label>
                    <textarea
                      className="am-input am-textarea"
                      rows={4}
                      value={form.description}
                      onChange={e => set('description', e.target.value)}
                      placeholder="Specs, model details, maintenance notes, safety considerations..."
                    />
                  </div>

                  {/* Summary card */}
                  <div className="am-summary" style={{ animationDelay: '60ms' }}>
                    <div className="am-summary-title">
                      <Icon name="check" size={14} /> Asset summary
                    </div>
                    <div className="am-summary-rows">
                      <div className="am-summary-row">
                        <span className="am-summary-k">Name</span>
                        <span className="am-summary-v">{form.name || '—'}</span>
                      </div>
                      <div className="am-summary-row">
                        <span className="am-summary-k">Type</span>
                        <span className="am-summary-v">{catName || '—'}</span>
                      </div>
                      <div className="am-summary-row">
                        <span className="am-summary-k">Site</span>
                        <span className="am-summary-v">{siteName || '—'}</span>
                      </div>
                      {form.location_description && (
                        <div className="am-summary-row">
                          <span className="am-summary-k">Location</span>
                          <span className="am-summary-v">{form.location_description}</span>
                        </div>
                      )}
                      {form.serial_number && (
                        <div className="am-summary-row">
                          <span className="am-summary-k">Serial</span>
                          <span className="am-summary-v mono">{form.serial_number}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Error */}
            {msg.text && (
              <div className={`am-msg am-msg-${msg.type}`}>
                <Icon name={msg.type === 'error' ? 'warning' : 'check'} size={14} />
                {msg.text}
              </div>
            )}

            {/* Footer */}
            <div className="am-footer">
              <button type="button" className="am-btn-secondary" onClick={close}>Cancel</button>
              <button type="submit" className="am-btn-primary" disabled={saving}>
                {saving ? (
                  <><span className="am-spinner" /> Saving...</>
                ) : (
                  <><Icon name="check" size={14} /> {editing === 'new' ? 'Create asset' : 'Save changes'}</>
                )}
              </button>
            </div>
          </form>
        </div>,
        document.body
      )}

      {showAssetTypes && createPortal(
        <AssetTypesModal
          onClose={() => {
            setShowAssetTypes(false);
            listAssetCategories().then(setCategories).catch(() => {});
          }}
        />,
        document.body
      )}

      {importOpen && createPortal(
        <ImportModal
          title="Import assets from CSV"
          subtitle="Bulk-import an equipment register. Strict template — headers must match exactly."
          helperText="Columns: name, display_id, site_name, asset_type, location_description, serial_number, description. Required: name, display_id, site_name, asset_type. asset_type matches an existing asset type if the name lines up; otherwise it's stored as a free-text type. Custom fields per asset type aren't imported in v1 — fill those in via Edit after import."
          templateUrl={assetImportTemplateUrl}
          templateFilename="assets_template.csv"
          importFn={importAssets}
          entityNoun={{ singular: 'asset', plural: 'assets' }}
          onClose={() => setImportOpen(false)}
          onImported={(n) => {
            setImportOpen(false);
            setImportToast(`Imported ${n} ${n === 1 ? 'asset' : 'assets'}`);
            setTimeout(() => setImportToast(''), 2500);
            refreshAssets();
          }}
        />,
        document.body,
      )}

      {importToast && <div className="toast"><Icon name="check" size={16} />{importToast}</div>}
    </div>
  );
}
