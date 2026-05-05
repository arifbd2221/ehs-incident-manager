import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getAsset, updateAsset, deleteAsset } from '../../api/assets';
import { listSites } from '../../api/sites';
import { listAssetCategories, createAssetCategory } from '../../api/asset_categories';
import Icon from '../../components/shared/Icon';
import '../../styles/assets.css';

const ELEVATED = new Set(['supervisor', 'ehs_officer', 'ehs_manager', 'admin']);

export default function AssetDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canEdit = ELEVATED.has(user?.role);

  const [asset, setAsset] = useState(null);
  const [sites, setSites] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState('overview');

  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [newCatOpen, setNewCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatSaving, setNewCatSaving] = useState(false);

  const refresh = () => {
    setLoading(true);
    getAsset(id)
      .then(setAsset)
      .catch(e => setErr(e.response?.data?.error || 'Failed to load asset'))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, [id]);
  useEffect(() => {
    listSites().then(setSites).catch(() => setSites([]));
    listAssetCategories().then(setCategories).catch(() => setCategories([]));
  }, []);

  const openEdit = () => {
    setForm({
      name: asset.name || '',
      site_id: asset.site_id || '',
      asset_type: asset.asset_type || '',
      asset_category_id: asset.asset_category_id || '',
      location_description: asset.location_description || '',
      serial_number: asset.serial_number || '',
      description: asset.description || '',
    });
    setEditOpen(true);
    setMsg({ type: '', text: '' });
  };
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleCategoryChange = (val) => {
    if (val === '__new__') { setNewCatOpen(true); return; }
    if (val === '__custom__') { set('asset_category_id', ''); set('asset_type', ''); return; }
    const cat = categories.find(c => String(c.id) === String(val));
    set('asset_category_id', val);
    set('asset_type', cat?.name || '');
  };

  const handleNewCategorySave = async () => {
    if (!newCatName.trim()) return;
    setNewCatSaving(true);
    try {
      const cat = await createAssetCategory({ name: newCatName.trim() });
      const next = await listAssetCategories();
      setCategories(next);
      set('asset_category_id', cat.id);
      set('asset_type', cat.name);
      setNewCatOpen(false);
      setNewCatName('');
    } catch (e) {
      setMsg({ type: 'error', text: e.response?.data?.error || 'Category create failed' });
    } finally {
      setNewCatSaving(false);
    }
  };

  const handleSave = async (e) => {
    e?.preventDefault();
    if (!form.name?.trim()) return setMsg({ type: 'error', text: 'Name is required' });
    setSaving(true);
    setMsg({ type: '', text: '' });
    try {
      const payload = { ...form };
      if (!payload.asset_category_id) delete payload.asset_category_id;
      await updateAsset(asset.id, payload);
      setEditOpen(false);
      refresh();
    } catch (e) {
      setMsg({ type: 'error', text: e.response?.data?.error || 'Save failed' });
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    if (!window.confirm(`Archive "${asset.name}"?`)) return;
    try { await deleteAsset(asset.id); refresh(); }
    catch (e) { alert(e.response?.data?.error || 'Archive failed'); }
  };
  const handleRestore = async () => {
    try { await updateAsset(asset.id, { active: 1 }); refresh(); }
    catch (e) { alert(e.response?.data?.error || 'Restore failed'); }
  };

  if (loading) return <div className="page assets-page"><div className="assets-loading">Loading…</div></div>;
  if (err || !asset) return (
    <div className="page assets-page">
      <button className="btn btn-ghost btn-sm" onClick={() => navigate('/assets')}>
        <Icon name="arrowL" size={14} /> Back to assets
      </button>
      <div className="assets-empty">{err || 'Asset not found'}</div>
    </div>
  );

  return (
    <div className="page asset-detail-page">
      <button className="btn btn-ghost btn-sm asset-detail-back" onClick={() => navigate('/assets')}>
        <Icon name="arrowL" size={14} /> Back to assets
      </button>

      <div className="asset-detail-h">
        <div className="asset-detail-h-left">
          <div className="asset-detail-num">{asset.asset_number}</div>
          <h1 className="asset-detail-name">
            {asset.name}
            {!asset.active && <span className="asset-badge-archived">archived</span>}
          </h1>
          <div className="asset-detail-meta">
            <span className="asset-type-pill" style={{ background: asset.category_color || '#90A4AE' }}>
              {asset.asset_type || '—'}
            </span>
            <span><Icon name="factory" size={13} /> {asset.site_name || '—'}{asset.site_country ? ` · ${asset.site_country}` : ''}</span>
            {asset.location_description && <span><Icon name="location" size={13} /> {asset.location_description}</span>}
          </div>
        </div>
        {canEdit && (
          <div className="asset-detail-actions">
            <button className="btn btn-secondary btn-sm" onClick={openEdit}>
              <Icon name="edit" size={14} /> Edit
            </button>
            {asset.active
              ? <button className="btn btn-ghost btn-sm asset-archive" onClick={handleArchive}>Archive</button>
              : <button className="btn btn-ghost btn-sm" onClick={handleRestore}>Restore</button>}
          </div>
        )}
      </div>

      <div className="asset-detail-tabs">
        {[
          { id: 'overview', label: 'Overview' },
          { id: 'incidents', label: 'Linked incidents' },
          { id: 'documents', label: 'Documents' },
          { id: 'activity', label: 'Activity' },
        ].map(t => (
          <div key={t.id} className={`asset-detail-tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}>
            {t.label}
          </div>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="asset-detail-grid">
          <div className="card card-pad">
            <div className="card-h"><Icon name="info" size={16} /> Identification</div>
            <div className="kv"><div className="kv-k">Number</div><div className="kv-v">{asset.asset_number}</div></div>
            <div className="kv"><div className="kv-k">Name</div><div className="kv-v">{asset.name}</div></div>
            <div className="kv"><div className="kv-k">Type</div><div className="kv-v">{asset.asset_type || '—'}{asset.category_name ? '' : ' (custom)'}</div></div>
            <div className="kv"><div className="kv-k">Serial</div><div className="kv-v">{asset.serial_number || '—'}</div></div>
            <div className="kv"><div className="kv-k">Status</div><div className="kv-v">{asset.active ? 'Active' : 'Archived'}</div></div>
          </div>

          <div className="card card-pad">
            <div className="card-h"><Icon name="location" size={16} /> Location</div>
            <div className="kv"><div className="kv-k">Site</div><div className="kv-v">{asset.site_name || '—'}</div></div>
            <div className="kv"><div className="kv-k">Country</div><div className="kv-v">{asset.site_country || '—'}</div></div>
            <div className="kv"><div className="kv-k">Description</div><div className="kv-v">{asset.location_description || '—'}</div></div>
          </div>

          {asset.description && (
            <div className="card card-pad asset-detail-fullrow">
              <div className="card-h"><Icon name="file" size={16} /> Notes</div>
              <div className="asset-detail-notes">{asset.description}</div>
            </div>
          )}

          <div className="card card-pad">
            <div className="card-h"><Icon name="clock" size={16} /> Lifecycle</div>
            <div className="kv"><div className="kv-k">Created</div><div className="kv-v">{asset.created_at?.slice(0, 10) || '—'}</div></div>
            <div className="kv"><div className="kv-k">Updated</div><div className="kv-v">{asset.updated_at?.slice(0, 10) || '—'}</div></div>
          </div>
        </div>
      )}

      {tab === 'incidents' && (
        (asset.linked_incidents && asset.linked_incidents.length > 0) ? (
          <div className="card card-pad">
            <div className="card-h">
              <Icon name="incidents" size={16} /> {asset.linked_incidents.length} incident{asset.linked_incidents.length !== 1 ? 's' : ''} linked
            </div>
            <div className="asset-linked-list">
              {asset.linked_incidents.map(i => (
                <div key={i.id} className="asset-linked-row" onClick={() => navigate(`/incidents/${i.id}`)}>
                  <div className="asset-linked-num">{i.incident_number}</div>
                  <div className="asset-linked-main">
                    <div className="asset-linked-title">{i.title}</div>
                    <div className="asset-linked-meta">
                      <span className={`pill pill-sev-${i.severity || '5'}`}>S{i.severity}</span>
                      <span className={`pill pill-track-${(i.track || 'C').toLowerCase()}`}>Track {i.track}</span>
                      <span>{i.type}</span>
                      <span>{i.site_name}</span>
                      <span>{i.incident_datetime?.slice(0, 10)}</span>
                      {i.reporter_name && <span>by {i.reporter_initials || i.reporter_name}</span>}
                    </div>
                  </div>
                  <div className={`asset-linked-status status-${(i.status || 'New').toLowerCase().replace(/\s+/g, '-')}`}>{i.status}</div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="card card-pad asset-tab-empty">
            <Icon name="incidents" size={28} />
            <h3>No incidents linked to this asset yet</h3>
            <p>When workers report an incident and select this asset (or once the wizard's Site → Area → Asset cascade ships in F2.3), they'll show up here.</p>
          </div>
        )
      )}

      {tab === 'documents' && (
        <div className="card card-pad asset-tab-empty">
          <Icon name="file" size={28} />
          <h3>No documents linked</h3>
          <p>Manuals, SDS sheets, certificates, and other documents linked to this asset will appear here once the document library ships (T2.4).</p>
        </div>
      )}

      {tab === 'activity' && (
        <div className="card card-pad asset-tab-empty">
          <Icon name="pulse" size={28} />
          <h3>Activity log</h3>
          <p>Edits, archive/restore actions, and inspections will be tracked here.</p>
        </div>
      )}

      {editOpen && (
        <div className="assets-modal-backdrop" onClick={() => setEditOpen(false)}>
          <div className="assets-modal" onClick={e => e.stopPropagation()}>
            <div className="assets-modal-h">
              <h2>Edit {asset.name}</h2>
              <button className="icon-btn" onClick={() => setEditOpen(false)}><Icon name="close" size={18} /></button>
            </div>
            <form className="assets-modal-body" onSubmit={handleSave}>
              <div className="field">
                <label className="label">Name <span className="req">*</span></label>
                <input className="input" value={form.name || ''} onChange={e => set('name', e.target.value)} autoFocus />
              </div>
              <div className="field-row-2">
                <div className="field">
                  <label className="label">Site <span className="req">*</span></label>
                  <select className="input" value={form.site_id || ''} onChange={e => set('site_id', Number(e.target.value))}>
                    {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="label">Type</label>
                  {!newCatOpen ? (
                    <>
                      <select className="input"
                        value={form.asset_category_id || (form.asset_type ? '__custom__' : '')}
                        onChange={e => handleCategoryChange(e.target.value)}>
                        <option value="">Select type…</option>
                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        <option value="__custom__">Custom…</option>
                        {canEdit && <option value="__new__">+ Add new category…</option>}
                      </select>
                      {(!form.asset_category_id && form.asset_type !== '') && (
                        <input className="input" style={{ marginTop: 6 }} placeholder="Custom type"
                          value={form.asset_type || ''}
                          onChange={e => set('asset_type', e.target.value)} />
                      )}
                    </>
                  ) : (
                    <div className="newcat-row">
                      <input className="input" placeholder="New category" autoFocus
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
                <input className="input" value={form.location_description || ''} onChange={e => set('location_description', e.target.value)} />
              </div>
              <div className="field">
                <label className="label">Serial number</label>
                <input className="input" value={form.serial_number || ''} onChange={e => set('serial_number', e.target.value)} />
              </div>
              <div className="field">
                <label className="label">Description / notes</label>
                <textarea className="input" rows="4" value={form.description || ''} onChange={e => set('description', e.target.value)} />
              </div>

              {msg.text && <div className={`assets-msg assets-msg-${msg.type}`}>{msg.text}</div>}

              <div className="assets-modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setEditOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
