import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { listAssets, createAsset, updateAsset, deleteAsset } from '../../api/assets';
import { listSites } from '../../api/sites';
import { listAssetCategories, createAssetCategory } from '../../api/asset_categories';
import Icon from '../../components/shared/Icon';
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

export default function AssetsList() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canEdit = ELEVATED.has(user?.role);

  const [assets, setAssets] = useState([]);
  const [sites, setSites] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('active');
  const [siteFilter, setSiteFilter] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [search, setSearch] = useState('');

  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });

  const [newCatOpen, setNewCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatSaving, setNewCatSaving] = useState(false);

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
  };

  const close = () => {
    setEditing(null);
    setNewCatOpen(false);
    setNewCatName('');
    setMsg({ type: '', text: '' });
  };
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleCategoryChange = (val) => {
    if (val === '__new__') {
      setNewCatOpen(true);
      return;
    }
    if (val === '__custom__') {
      // user wants to type a custom one-off
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

  const handleSave = async (e) => {
    e?.preventDefault();
    if (!form.name.trim()) return setMsg({ type: 'error', text: 'Name is required' });
    if (!form.site_id) return setMsg({ type: 'error', text: 'Site is required' });
    if (!form.asset_type.trim() && !form.asset_category_id) {
      return setMsg({ type: 'error', text: 'Type is required' });
    }
    setSaving(true);
    setMsg({ type: '', text: '' });
    try {
      const payload = { ...form };
      // If category id is set, it wins; otherwise asset_type carries the custom value.
      if (!payload.asset_category_id) delete payload.asset_category_id;
      if (editing === 'new') {
        await createAsset(payload);
      } else {
        await updateAsset(editing.id, payload);
      }
      refreshAssets();
      close();
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

  return (
    <div className="page assets-page">
      <div className="assets-header">
        <div>
          <h1 className="assets-title"><Icon name="factory" size={26} /> Assets</h1>
          <p className="assets-sub">Equipment, vehicles, areas, and other registered assets.</p>
        </div>
        <div style={{ flex: 1 }} />
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

      {editing !== null && (
        <div className="assets-modal-backdrop" onClick={close}>
          <div className="assets-modal" onClick={e => e.stopPropagation()}>
            <div className="assets-modal-h">
              <h2>{editing === 'new' ? 'New asset' : `Edit ${editing.name}`}</h2>
              <button className="icon-btn" onClick={close}><Icon name="close" size={18} /></button>
            </div>
            <form className="assets-modal-body" onSubmit={handleSave}>
              <div className="field">
                <label className="label">Name <span className="req">*</span></label>
                <input className="input" value={form.name} onChange={e => set('name', e.target.value)} autoFocus />
              </div>
              <div className="field-row-2">
                <div className="field">
                  <label className="label">Site <span className="req">*</span></label>
                  <select className="input" value={form.site_id} onChange={e => set('site_id', Number(e.target.value))}>
                    <option value="">Select site…</option>
                    {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="label">Type <span className="req">*</span></label>
                  {!newCatOpen ? (
                    <>
                      <select className="input" value={form.asset_category_id || (form.asset_type ? '__custom__' : '')}
                        onChange={e => handleCategoryChange(e.target.value)}>
                        <option value="">Select type…</option>
                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        <option value="__custom__">Custom…</option>
                        {canEdit && <option value="__new__">+ Add new category…</option>}
                      </select>
                      {(!form.asset_category_id && form.asset_type !== '') && (
                        <input className="input" style={{ marginTop: 6 }}
                          placeholder="Custom type (one-off)"
                          value={form.asset_type}
                          onChange={e => set('asset_type', e.target.value)} />
                      )}
                    </>
                  ) : (
                    <div className="newcat-row">
                      <input className="input" placeholder="New category name" autoFocus
                        value={newCatName} onChange={e => setNewCatName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleNewCategorySave(); } }} />
                      <button type="button" className="btn btn-primary btn-sm"
                        disabled={newCatSaving || !newCatName.trim()}
                        onClick={handleNewCategorySave}>
                        {newCatSaving ? '…' : 'Save'}
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm"
                        onClick={() => { setNewCatOpen(false); setNewCatName(''); }}>Cancel</button>
                    </div>
                  )}
                </div>
              </div>
              <div className="field">
                <label className="label">Location description</label>
                <input className="input" value={form.location_description}
                  onChange={e => set('location_description', e.target.value)}
                  placeholder="e.g. Bay 3 production floor" />
              </div>
              <div className="field-row-2">
                <div className="field">
                  <label className="label">Serial number</label>
                  <input className="input" value={form.serial_number}
                    onChange={e => set('serial_number', e.target.value)}
                    placeholder="optional" />
                </div>
              </div>
              <div className="field">
                <label className="label">Description / notes</label>
                <textarea className="input" rows="3" value={form.description}
                  onChange={e => set('description', e.target.value)}
                  placeholder="Specs, model details, maintenance notes…" />
              </div>

              {msg.text && <div className={`assets-msg assets-msg-${msg.type}`}>{msg.text}</div>}

              <div className="assets-modal-actions">
                <button type="button" className="btn btn-secondary" onClick={close}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving…' : (editing === 'new' ? 'Create asset' : 'Save changes')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
