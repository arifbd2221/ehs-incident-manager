import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getAsset, updateAsset, deleteAsset } from '../../api/assets';
import { listSites } from '../../api/sites';
import { listAssetCategories, createAssetCategory } from '../../api/asset_categories';
import Icon from '../../components/shared/Icon';
import '../../styles/assets.css';

const ELEVATED = new Set(['supervisor', 'ehs_officer', 'ehs_manager', 'admin']);

const MODAL_SECTIONS = [
  { key: 'identity', label: 'Identity', icon: 'factory' },
  { key: 'location', label: 'Location', icon: 'location' },
  { key: 'details', label: 'Details', icon: 'info' },
];

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
  const [success, setSuccess] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [section, setSection] = useState('identity');
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
    setSection('identity');
    setSuccess(false);
  };
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const closeEdit = () => {
    setEditOpen(false);
    setNewCatOpen(false);
    setNewCatName('');
    setSuccess(false);
  };

  const handleCategoryChange = (val) => {
    if (val === '__new__') { setNewCatOpen(true); return; }
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

  const pct = (() => {
    let filled = 0, total = 3;
    if ((form.name || '').trim()) filled++;
    if (form.site_id) filled++;
    if (form.asset_type || form.asset_category_id) filled++;
    if (form.location_description) { total++; filled++; }
    if (form.serial_number) { total++; filled++; }
    if (form.description) { total++; filled++; }
    return Math.round((filled / total) * 100);
  })();

  const handleSave = async (e) => {
    e?.preventDefault();
    if (!form.name?.trim()) { setMsg({ type: 'error', text: 'Name is required' }); setSection('identity'); return; }
    setSaving(true);
    setMsg({ type: '', text: '' });
    try {
      const payload = { ...form };
      if (!payload.asset_category_id) delete payload.asset_category_id;
      await updateAsset(asset.id, payload);
      setSuccess(true);
      setTimeout(() => { closeEdit(); refresh(); }, 600);
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

  const siteName = sites.find(s => String(s.id) === String(form.site_id))?.name;
  const catName = categories.find(c => String(c.id) === String(form.asset_category_id))?.name || form.asset_type;

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
            <p>When workers report an incident and select this asset, they'll show up here.</p>
          </div>
        )
      )}

      {tab === 'documents' && (
        <div className="card card-pad asset-tab-empty">
          <Icon name="file" size={28} />
          <h3>No documents linked</h3>
          <p>Manuals, SDS sheets, certificates, and other documents linked to this asset will appear here.</p>
        </div>
      )}

      {tab === 'activity' && (
        <div className="card card-pad asset-tab-empty">
          <Icon name="pulse" size={28} />
          <h3>Activity log</h3>
          <p>Edits, archive/restore actions, and inspections will be tracked here.</p>
        </div>
      )}

      {editOpen && createPortal(
        <div className="am-backdrop" onClick={closeEdit}>
          <form className={`am-modal${success ? ' am-success' : ''}`} onClick={e => e.stopPropagation()} onSubmit={handleSave}>
            <div className="am-header">
              <div className="am-header-icon"><Icon name="factory" size={20} /></div>
              <div className="am-header-text">
                <h2>Edit {asset.name}</h2>
                <p>Update asset details and location</p>
              </div>
              <button type="button" className="am-close" onClick={closeEdit}><Icon name="close" size={18} /></button>
            </div>

            <div className="am-progress">
              <div className="am-progress-bar" style={{ width: `${pct}%` }} />
              <span className="am-progress-label">{pct}% complete</span>
            </div>

            <div className="am-tabs">
              {MODAL_SECTIONS.map(s => (
                <button key={s.key} type="button" className={`am-tab${section === s.key ? ' active' : ''}`} onClick={() => setSection(s.key)}>
                  <Icon name={s.icon} size={16} /><span>{s.label}</span>
                </button>
              ))}
            </div>

            <div className="am-body">
              {section === 'identity' && (
                <div className="am-section" key="identity">
                  <div className="am-field" style={{ animationDelay: '0ms' }}>
                    <label className="am-label">Asset name <span className="req">*</span></label>
                    <input className={`am-input${!form.name?.trim() && msg.type === 'error' ? ' am-input-err' : ''}`} value={form.name || ''} onChange={e => set('name', e.target.value)} autoFocus />
                  </div>
                  <div className="am-field" style={{ animationDelay: '60ms' }}>
                    <label className="am-label">Type / category</label>
                    {!newCatOpen ? (
                      <div className="am-cat-grid">
                        {categories.map(c => (
                          <button key={c.id} type="button" className={`am-cat-btn${String(form.asset_category_id) === String(c.id) ? ' active' : ''}`} onClick={() => handleCategoryChange(String(c.id))} style={{ '--cat-color': c.color || '#626DF9' }}>
                            <span className="am-cat-dot" style={{ background: c.color || '#626DF9' }} />{c.name}
                          </button>
                        ))}
                        <button type="button" className="am-cat-btn am-cat-add" onClick={() => setNewCatOpen(true)}><Icon name="plus" size={12} />New</button>
                      </div>
                    ) : (
                      <div className="am-newcat">
                        <input className="am-input" placeholder="New category" autoFocus value={newCatName} onChange={e => setNewCatName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleNewCategorySave(); } }} />
                        <div className="am-newcat-actions">
                          <button type="button" className="am-btn-save" disabled={newCatSaving || !newCatName.trim()} onClick={handleNewCategorySave}><Icon name="check" size={13} />{newCatSaving ? '…' : 'Create'}</button>
                          <button type="button" className="am-btn-cancel" onClick={() => { setNewCatOpen(false); setNewCatName(''); }}>Cancel</button>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="am-field" style={{ animationDelay: '120ms' }}>
                    <label className="am-label">Serial number <span className="am-label-hint">optional</span></label>
                    <input className="am-input" value={form.serial_number || ''} onChange={e => set('serial_number', e.target.value)} />
                  </div>
                </div>
              )}

              {section === 'location' && (
                <div className="am-section" key="location">
                  <div className="am-field" style={{ animationDelay: '0ms' }}>
                    <label className="am-label">Site <span className="req">*</span></label>
                    <div className="am-site-grid">
                      {sites.map(s => (
                        <button key={s.id} type="button" className={`am-site-btn${String(form.site_id) === String(s.id) ? ' active' : ''}`} onClick={() => set('site_id', s.id)}>
                          <Icon name="factory" size={14} /><span>{s.name}</span>{s.country && <span className="am-site-country">{s.country}</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="am-field" style={{ animationDelay: '60ms' }}>
                    <label className="am-label">Location description</label>
                    <input className="am-input" value={form.location_description || ''} onChange={e => set('location_description', e.target.value)} placeholder="e.g. Bay 3, production floor" />
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
                    <textarea className="am-input am-textarea" rows={4} value={form.description || ''} onChange={e => set('description', e.target.value)} placeholder="Specs, model details, maintenance notes…" />
                  </div>
                  <div className="am-summary" style={{ animationDelay: '60ms' }}>
                    <div className="am-summary-title"><Icon name="check" size={14} /> Asset summary</div>
                    <div className="am-summary-rows">
                      <div className="am-summary-row"><span className="am-summary-k">Name</span><span className="am-summary-v">{form.name || '—'}</span></div>
                      <div className="am-summary-row"><span className="am-summary-k">Type</span><span className="am-summary-v">{catName || '—'}</span></div>
                      <div className="am-summary-row"><span className="am-summary-k">Site</span><span className="am-summary-v">{siteName || '—'}</span></div>
                      {form.location_description && <div className="am-summary-row"><span className="am-summary-k">Location</span><span className="am-summary-v">{form.location_description}</span></div>}
                      {form.serial_number && <div className="am-summary-row"><span className="am-summary-k">Serial</span><span className="am-summary-v mono">{form.serial_number}</span></div>}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {msg.text && (
              <div className={`am-msg am-msg-${msg.type}`}>
                <Icon name={msg.type === 'error' ? 'warning' : 'check'} size={14} />{msg.text}
              </div>
            )}

            <div className="am-footer">
              <button type="button" className="am-btn-secondary" onClick={closeEdit}>Cancel</button>
              <button type="submit" className="am-btn-primary" disabled={saving}>
                {saving ? <><span className="am-spinner" /> Saving…</> : <><Icon name="check" size={14} /> Save changes</>}
              </button>
            </div>
          </form>
        </div>,
        document.body
      )}
    </div>
  );
}
