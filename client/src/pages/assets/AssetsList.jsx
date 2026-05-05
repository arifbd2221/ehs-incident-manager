import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { listAssets, createAsset, updateAsset, deleteAsset } from '../../api/assets';
import { listSites } from '../../api/sites';
import { listAssetCategories, createAssetCategory } from '../../api/asset_categories';
import Icon from '../../components/shared/Icon';
import CategoryFieldsModal from '../../components/modals/CategoryFieldsModal';
import '../../styles/assets.css';

const ELEVATED = new Set(['supervisor', 'ehs_officer', 'ehs_manager', 'admin']);

const EMPTY = {
  name: '',
  site_id: '',
  asset_type: '',
  asset_category_id: '',
  location_description: '',
  serial_number: '',
  description: '',
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
  const [showCategoryFields, setShowCategoryFields] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('active');
  const [siteFilter, setSiteFilter] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [search, setSearch] = useState('');

  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [section, setSection] = useState('identity');

  const [newCatOpen, setNewCatOpen] = useState(false);
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
    setForm({
      name: asset.name || '',
      site_id: asset.site_id || '',
      asset_type: asset.asset_type || '',
      asset_category_id: asset.asset_category_id || '',
      location_description: asset.location_description || '',
      serial_number: asset.serial_number || '',
      description: asset.description || '',
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
      setMsg({ type: 'error', text: 'Name is required' });
      setSection('identity');
      return;
    }
    if (!form.site_id) {
      setMsg({ type: 'error', text: 'Site is required' });
      setSection('location');
      return;
    }
    if (!form.asset_type.trim() && !form.asset_category_id) {
      setMsg({ type: 'error', text: 'Type is required' });
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
      <div className="assets-header">
        <div>
          <h1 className="assets-title"><Icon name="factory" size={26} /> Assets</h1>
          <p className="assets-sub">Equipment, vehicles, areas, and other registered assets.</p>
        </div>
        <div style={{ flex: 1 }} />
        {canEdit && (
          <button
            className="btn btn-secondary"
            onClick={() => setShowCategoryFields(true)}
            style={{ marginRight: 8 }}
            title="Define custom fields per category"
          >
            <Icon name="settings" size={14} /> Category fields
          </button>
        )}
        {canEdit && (
          <button className="btn btn-primary" onClick={openNew}>
            <Icon name="plus" size={16} /> New asset
          </button>
        )}
      </div>

      <div className="assets-tabs">
        {[
          { id: 'active', label: 'Active' },
          { id: 'archived', label: 'Archived' },
          { id: 'all', label: 'All' },
        ].map(t => (
          <div key={t.id} className={`assets-tab ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => setActiveTab(t.id)}>
            {t.label}
          </div>
        ))}
      </div>

      <div className="assets-toolbar">
        <div className="assets-search">
          <Icon name="search" size={16} />
          <input className="input" placeholder="Search by name, number, serial, location, type…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="input assets-filter" value={siteFilter} onChange={e => setSiteFilter(e.target.value)}>
          <option value="">All sites</option>
          {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className="input assets-filter" value={catFilter} onChange={e => setCatFilter(e.target.value)}>
          <option value="">All types</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {loading && <div className="assets-loading">Loading…</div>}

      {!loading && filtered.length === 0 && (
        <div className="assets-empty">
          {assets.length === 0
            ? (canEdit ? 'No assets yet. Click "New asset" to add one.' : 'No assets registered yet.')
            : 'No assets match your filters.'}
        </div>
      )}

      <div className="assets-grid">
        {filtered.map(a => (
          <div key={a.id} className={`asset-card ${!a.active ? 'archived' : ''}`}
            onClick={() => navigate(`/assets/${a.id}`)}>
            <div className="asset-card-h">
              <div className="asset-type-pill" style={{ background: a.category_color || '#90A4AE' }}>
                {a.asset_type || '—'}
              </div>
              {!a.active && <span className="asset-badge-archived">archived</span>}
            </div>
            <div className="asset-name">{a.name}</div>
            <div className="asset-num">{a.asset_number}</div>
            <div className="asset-meta">
              <div className="asset-meta-row"><Icon name="factory" size={13} /> {a.site_name || '—'}</div>
              {a.location_description && <div className="asset-meta-row"><Icon name="location" size={13} /> {a.location_description}</div>}
              {a.serial_number && <div className="asset-meta-row">SN: {a.serial_number}</div>}
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
        ))}
      </div>

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
                  <div className="am-field" style={{ animationDelay: '0ms' }}>
                    <label className="am-label">Asset name <span className="req">*</span></label>
                    <input
                      ref={nameRef}
                      className={`am-input${!form.name.trim() && msg.type === 'error' ? ' am-input-err' : ''}`}
                      value={form.name}
                      onChange={e => set('name', e.target.value)}
                      placeholder="e.g. Hydraulic Press #4"
                    />
                  </div>

                  <div className="am-field" style={{ animationDelay: '60ms' }}>
                    <label className="am-label">Type / category <span className="req">*</span></label>
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
                            placeholder="Or type a custom category…"
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
                            <Icon name="check" size={13} />{newCatSaving ? 'Saving…' : 'Create'}
                          </button>
                          <button type="button" className="am-btn-cancel" onClick={() => { setNewCatOpen(false); setNewCatName(''); }}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="am-field" style={{ animationDelay: '120ms' }}>
                    <label className="am-label">Serial number <span className="am-label-hint">optional</span></label>
                    <input
                      className="am-input"
                      value={form.serial_number}
                      onChange={e => set('serial_number', e.target.value)}
                      placeholder="e.g. SN-2024-04821"
                    />
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
                  <div className="am-field" style={{ animationDelay: '0ms' }}>
                    <label className="am-label">Description / notes</label>
                    <textarea
                      className="am-input am-textarea"
                      rows={4}
                      value={form.description}
                      onChange={e => set('description', e.target.value)}
                      placeholder="Specs, model details, maintenance notes, safety considerations…"
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
                  <><span className="am-spinner" /> Saving…</>
                ) : (
                  <><Icon name="check" size={14} /> {editing === 'new' ? 'Create asset' : 'Save changes'}</>
                )}
              </button>
            </div>
          </form>
        </div>,
        document.body
      )}

      {showCategoryFields && createPortal(
        <CategoryFieldsModal
          onClose={() => {
            setShowCategoryFields(false);
            // Refresh categories in case anything was renamed (defensive — we
            // don't currently rename here but listAssetCategories is cheap).
            listAssetCategories().then(setCategories).catch(() => {});
          }}
        />,
        document.body
      )}
    </div>
  );
}
