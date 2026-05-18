import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { getAsset, updateAsset, deleteAsset } from '../../api/assets';
import { listSites } from '../../api/sites';
import { listAssetCategories, createAssetCategory, listCategoryFields } from '../../api/asset_categories';
import Icon from '../../components/shared/Icon';
import SmartTextarea from '../../components/shared/SmartTextarea';
import CustomFieldsForm from '../../components/assets/CustomFieldsForm';
import CustomFieldsDisplay from '../../components/assets/CustomFieldsDisplay';
import ReferencedByCard from '../../components/shared/ReferencedByCard';
import MaintenanceTab from '../../components/maintenance/MaintenanceTab';
import AssetIllustration, { illustrationKind } from '../../components/assets/AssetIllustration';
import EmptyState, { EmptyAttachmentsIllustration } from '../../components/shared/EmptyState';
import { useConfirm, useAlert } from '../../components/shared/Dialog';
import { listSchedules } from '../../api/maintenance';
import { timeAgo } from '../../utils/time';
import '../../styles/assets.css';
import '../../styles/dashboard.css';

// Map activity_log action verbs to the existing dashboard icon set.
// Same shape Dashboard.jsx uses; falls back to a generic system icon.
const ACTION_ICON = {
  asset_created: { icon: 'plus', cls: 'act-create' },
  asset_updated: { icon: 'edit', cls: 'act-create' },
  asset_deleted: { icon: 'close', cls: 'act-system' },
  asset_restored: { icon: 'check', cls: 'act-create' },
  assets_imported: { icon: 'upload', cls: 'act-create' },
};

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
  const { openWizard } = useApp();
  const canEdit = ELEVATED.has(user?.role);
  const confirmDialog = useConfirm();
  const alertDialog = useAlert();

  const [asset, setAsset] = useState(null);
  const [sites, setSites] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState('overview');
  const [maintenanceCounts, setMaintenanceCounts] = useState({ total: 0, overdue: 0 });

  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [section, setSection] = useState('identity');
  const [newCatOpen, setNewCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatSaving, setNewCatSaving] = useState(false);
  const [editFieldDefs, setEditFieldDefs] = useState([]);

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

  // Maintenance counts for the tab badge — cheap separate call so the rest
  // of the asset detail isn't gated on it.
  const refreshMaintenanceCounts = () => {
    if (!id) return;
    Promise.all([
      listSchedules({ asset_id: id, active: 1 }),
      listSchedules({ asset_id: id, active: 1, status: 'overdue' }),
    ]).then(([all, od]) => {
      setMaintenanceCounts({ total: all.total || 0, overdue: od.total || 0 });
    }).catch(() => setMaintenanceCounts({ total: 0, overdue: 0 }));
  };
  useEffect(refreshMaintenanceCounts, [id]);

  const openEdit = () => {
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
    setEditOpen(true);
    setMsg({ type: '', text: '' });
    setSection('identity');
    setSuccess(false);
  };
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!editOpen || !form.asset_category_id) { setEditFieldDefs([]); return; }
    listCategoryFields(form.asset_category_id).then(setEditFieldDefs).catch(() => setEditFieldDefs([]));
  }, [editOpen, form.asset_category_id]);
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
    if (!form.name?.trim()) { setMsg({ type: 'error', text: 'Display name is required' }); setSection('identity'); return; }
    if (!form.display_id?.trim()) { setMsg({ type: 'error', text: 'Unique identifier is required' }); setSection('identity'); return; }
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
    const ok = await confirmDialog({
      title: `Archive asset "${asset.name}"?`,
      body: 'The asset will be hidden from active views but retained for audit history. You can restore it later from the Archived tab.',
      confirmLabel: 'Archive asset',
      danger: true,
    });
    if (!ok) return;
    try { await deleteAsset(asset.id); refresh(); }
    catch (e) {
      await alertDialog({
        title: "Couldn't archive asset",
        body: e.response?.data?.error || 'Archive failed',
        tone: 'error',
      });
    }
  };
  const handleRestore = async () => {
    try { await updateAsset(asset.id, { active: 1 }); refresh(); }
    catch (e) {
      await alertDialog({
        title: "Couldn't restore asset",
        body: e.response?.data?.error || 'Restore failed',
        tone: 'error',
      });
    }
  };

  const siteName = sites.find(s => String(s.id) === String(form.site_id))?.name;
  const catName = categories.find(c => String(c.id) === String(form.asset_category_id))?.name || form.asset_type;

  if (loading) return (
    <div className="page adp-page">
      <div className="adp-hero">
        <div className="adp-hero-banner adp-hero-skel" />
        <div className="adp-hero-content">
          <div className="adp-hero-avatar adp-hero-skel-avatar" />
          <div className="adp-hero-info">
            <div className="skel skel-pill" style={{ width: 120 }} />
            <div className="skel skel-title" style={{ marginTop: 10 }} />
            <div className="skel skel-row" style={{ marginTop: 8, width: '60%' }} />
          </div>
        </div>
      </div>
    </div>
  );
  if (err || !asset) return (
    <div className="page adp-page">
      <button className="adp-hero-back adp-hero-back-static" onClick={() => navigate('/assets')}>
        <Icon name="arrowL" size={13} /> <span>Assets</span>
      </button>
      <EmptyState
        illustration={<EmptyAttachmentsIllustration />}
        title={err || 'Asset not found'}
        body="This asset may have been removed or you don't have access."
        accent="warning"
        action={(
          <button className="btn btn-secondary" onClick={() => navigate('/assets')}>
            <Icon name="arrowL" size={14} /> Back to assets
          </button>
        )}
      />
    </div>
  );

  const heroColor = asset.category_color || '#626DF9';
  const initials = (asset.name || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const incidentCount = asset.linked_incidents?.length || 0;
  const activityCount = asset.activity?.length || 0;
  const kind = illustrationKind(asset);
  let cfValues = asset.custom_fields;
  if (typeof cfValues === 'string') {
    try { cfValues = JSON.parse(cfValues); } catch { cfValues = {}; }
  }

  const TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'incidents', label: 'Incidents', count: incidentCount },
    { id: 'maintenance', label: 'Maintenance', count: maintenanceCounts.total, overdue: maintenanceCounts.overdue },
    { id: 'documents', label: 'Documents' },
    { id: 'activity', label: 'Activity', count: activityCount },
  ];

  return (
    <div className="page adp-page">
      {/* Hero — illustration banner + avatar + identity + actions */}
      <section className="adp-hero">
        <div className="adp-hero-banner">
          <AssetIllustration kind={kind} tint={heroColor} />
          <div className="adp-hero-banner-overlay" />
          <button className="adp-hero-back" onClick={() => navigate('/assets')}>
            <Icon name="arrowL" size={13} /> <span>Assets</span>
          </button>
        </div>

        <div className="adp-hero-content">
          <div className="adp-hero-avatar" style={{ '--ah-color': heroColor }}>
            <div className="adp-hero-avatar-inner">{initials || '?'}</div>
          </div>

          <div className="adp-hero-info">
            <div className="adp-hero-id mono">
              {asset.display_id || asset.asset_number}
              {asset.display_id && asset.display_id !== asset.asset_number && (
                <span className="adp-hero-id-sys">· {asset.asset_number}</span>
              )}
            </div>
            <h1 className="adp-hero-title">{asset.name}</h1>
            <div className="adp-hero-meta">
              <span className="adp-type-pill" style={{ '--type-color': heroColor }}>
                <span className="adp-type-dot" />
                {asset.asset_type || 'Asset'}
              </span>
              <span className={`adp-status-pill adp-status-${asset.active ? 'ok' : 'archived'}`}>
                <span className="adp-status-dot" />
                {asset.active ? 'Active' : 'Archived'}
              </span>
              <span className="adp-hero-divider" />
              <span className="adp-hero-meta-item">
                <Icon name="factory" size={13} />
                {asset.site_name || '—'}{asset.site_country ? ` · ${asset.site_country}` : ''}
              </span>
              {asset.location_description && (
                <span className="adp-hero-meta-item">
                  <Icon name="location" size={13} />
                  {asset.location_description}
                </span>
              )}
              {asset.serial_number && (
                <span className="adp-hero-meta-item mono">
                  <Icon name="shield" size={13} />
                  {asset.serial_number}
                </span>
              )}
            </div>
          </div>

          {canEdit && (
            <div className="adp-hero-actions">
              {asset.active
                ? <button className="btn btn-ghost asset-archive" onClick={handleArchive}>Archive</button>
                : <button className="btn btn-ghost" onClick={handleRestore}>Restore</button>}
              <button className="btn btn-primary" onClick={openEdit}>
                <Icon name="edit" size={14} /> Edit
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Stat strip — only metrics we can back from data */}
      <section className="adp-stat-strip">
        <div className={`adp-stat-tile adp-stat-${asset.active ? 'ok' : 'neutral'}`}>
          <div className="adp-stat-label">Status</div>
          <div className="adp-stat-value">{asset.active ? 'Active' : 'Archived'}</div>
          <div className="adp-stat-sub">{asset.asset_type || 'Unclassified'}</div>
        </div>
        <div className={`adp-stat-tile ${incidentCount > 0 ? 'adp-stat-warn' : 'adp-stat-ok'}`}>
          <div className="adp-stat-label">Linked incidents</div>
          <div className="adp-stat-value">{incidentCount}</div>
          <div className="adp-stat-sub">{incidentCount === 0 ? 'None reported' : `${incidentCount} on file`}</div>
        </div>
        <div className={`adp-stat-tile ${maintenanceCounts.overdue > 0 ? 'adp-stat-crit' : maintenanceCounts.total > 0 ? 'adp-stat-brand' : 'adp-stat-neutral'}`}>
          <div className="adp-stat-label">Maintenance</div>
          <div className="adp-stat-value">{maintenanceCounts.total}</div>
          <div className="adp-stat-sub">
            {maintenanceCounts.overdue > 0
              ? `${maintenanceCounts.overdue} overdue`
              : maintenanceCounts.total > 0 ? 'On schedule' : 'No schedules'}
          </div>
        </div>
        <div className="adp-stat-tile adp-stat-neutral">
          <div className="adp-stat-label">Activity events</div>
          <div className="adp-stat-value">{activityCount}</div>
          <div className="adp-stat-sub">{activityCount === 0 ? 'No history' : 'Tracked changes'}</div>
        </div>
      </section>

      {/* Tabs */}
      <div className="adp-tabs">
        {TABS.map(t => (
          <button key={t.id} type="button"
            className={`adp-tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}>
            <span>{t.label}</span>
            {t.count != null && <span className="adp-tab-count">{t.count}</span>}
            {t.id === 'maintenance' && t.overdue > 0 && (
              <span className="adp-tab-overdue">{t.overdue}</span>
            )}
          </button>
        ))}
      </div>

      {/* OVERVIEW TAB — 2-col split */}
      {tab === 'overview' && (
        <div className="adp-overview-grid">
          <div className="adp-overview-main">
            <section className="adp-section">
              <header className="adp-section-head">
                <div className="adp-section-icon"><Icon name="info" size={14} /></div>
                <h2 className="adp-section-title">About this asset</h2>
                {canEdit && (
                  <button className="adp-section-action" onClick={openEdit}>
                    <Icon name="edit" size={12} /> Edit
                  </button>
                )}
              </header>
              <div className="adp-section-body">
                <div className="adp-kv-grid">
                  <div className="adp-kv">
                    <span className="adp-kv-k">Unique ID</span>
                    <span className="adp-kv-v mono">{asset.display_id || '—'}</span>
                  </div>
                  <div className="adp-kv">
                    <span className="adp-kv-k">System number</span>
                    <span className="adp-kv-v mono">{asset.asset_number}</span>
                  </div>
                  <div className="adp-kv">
                    <span className="adp-kv-k">Type</span>
                    <span className="adp-kv-v">
                      {asset.asset_type || '—'}
                      {!asset.category_name && asset.asset_type ? ' (custom)' : ''}
                    </span>
                  </div>
                  <div className="adp-kv">
                    <span className="adp-kv-k">Serial</span>
                    <span className="adp-kv-v mono">{asset.serial_number || '—'}</span>
                  </div>
                  <div className="adp-kv">
                    <span className="adp-kv-k">Site</span>
                    <span className="adp-kv-v">{asset.site_name || '—'}{asset.site_country ? ` · ${asset.site_country}` : ''}</span>
                  </div>
                  <div className="adp-kv">
                    <span className="adp-kv-k">Location</span>
                    <span className="adp-kv-v">{asset.location_description || '—'}</span>
                  </div>
                </div>
              </div>
            </section>

            {asset.description && (
              <section className="adp-section">
                <header className="adp-section-head">
                  <div className="adp-section-icon"><Icon name="file" size={14} /></div>
                  <h2 className="adp-section-title">Notes</h2>
                </header>
                <div className="adp-section-body">
                  <p className="adp-notes">{asset.description}</p>
                </div>
              </section>
            )}

            {asset.category_fields && asset.category_fields.length > 0 && (
              <section className="adp-section">
                <header className="adp-section-head">
                  <div className="adp-section-icon"><Icon name="gear" size={14} /></div>
                  <h2 className="adp-section-title">Custom fields</h2>
                </header>
                <div className="adp-section-body">
                  <CustomFieldsDisplay
                    fields={asset.category_fields}
                    values={cfValues}
                  />
                </div>
              </section>
            )}

            <section className="adp-section">
              <header className="adp-section-head">
                <div className="adp-section-icon"><Icon name="incidents" size={14} /></div>
                <h2 className="adp-section-title">
                  Linked incidents
                  <span className="adp-section-count">{incidentCount}</span>
                </h2>
              </header>
              <div className="adp-section-body">
                {incidentCount > 0 ? (
                  <div className="adp-inc-list">
                    {asset.linked_incidents.map(i => (
                      <button
                        key={i.id}
                        type="button"
                        className="adp-inc-row"
                        onClick={() => navigate(`/incidents/${i.id}`)}
                      >
                        <span className={`adp-inc-sev pill pill-sev-${i.severity || '5'}`}>S{i.severity}</span>
                        <div className="adp-inc-body">
                          <div className="adp-inc-title">{i.title}</div>
                          <div className="adp-inc-meta">
                            <span className="mono">{i.incident_number}</span>
                            <span>·</span>
                            <span>Track {i.track}</span>
                            <span>·</span>
                            <span>{i.type}</span>
                            <span>·</span>
                            <span>{i.incident_datetime?.slice(0, 10)}</span>
                          </div>
                        </div>
                        <span className={`adp-inc-status status-${(i.status || 'New').toLowerCase().replace(/\s+/g, '-')}`}>
                          {i.status}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="adp-tab-empty adp-tab-empty-sm">
                    <Icon name="incidents" size={22} />
                    <p>No incidents reported against this asset.</p>
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* Sidebar */}
          <aside className="adp-overview-side">
            <section className="adp-section">
              <header className="adp-section-head">
                <div className="adp-section-icon"><Icon name="pulse" size={14} /></div>
                <h2 className="adp-section-title">Quick actions</h2>
              </header>
              <div className="adp-section-body">
                <div className="adp-qa-list">
                  <button className="adp-qa" onClick={() => openWizard({ assetId: asset.id, siteId: asset.site_id })}>
                    <span className="adp-qa-icon adp-qa-icon-warn"><Icon name="warning" size={16} /></span>
                    <div className="adp-qa-text">
                      <div className="adp-qa-title">Report incident</div>
                      <div className="adp-qa-sub">Log a new event linked to this asset</div>
                    </div>
                    <Icon name="arrow" size={14} />
                  </button>
                  <button className="adp-qa" onClick={() => setTab('maintenance')}>
                    <span className="adp-qa-icon adp-qa-icon-brand"><Icon name="clock" size={16} /></span>
                    <div className="adp-qa-text">
                      <div className="adp-qa-title">Schedule maintenance</div>
                      <div className="adp-qa-sub">Open the maintenance tab</div>
                    </div>
                    <Icon name="arrow" size={14} />
                  </button>
                  {canEdit && (
                    <button className="adp-qa" onClick={openEdit}>
                      <span className="adp-qa-icon adp-qa-icon-ok"><Icon name="edit" size={16} /></span>
                      <div className="adp-qa-text">
                        <div className="adp-qa-title">Edit asset details</div>
                        <div className="adp-qa-sub">Update identity, location, or notes</div>
                      </div>
                      <Icon name="arrow" size={14} />
                    </button>
                  )}
                  {canEdit && asset.active && (
                    <button className="adp-qa" onClick={handleArchive}>
                      <span className="adp-qa-icon adp-qa-icon-neutral"><Icon name="close" size={16} /></span>
                      <div className="adp-qa-text">
                        <div className="adp-qa-title">Archive asset</div>
                        <div className="adp-qa-sub">Hide from active views, retain history</div>
                      </div>
                      <Icon name="arrow" size={14} />
                    </button>
                  )}
                  {canEdit && !asset.active && (
                    <button className="adp-qa" onClick={handleRestore}>
                      <span className="adp-qa-icon adp-qa-icon-ok"><Icon name="check" size={16} /></span>
                      <div className="adp-qa-text">
                        <div className="adp-qa-title">Restore asset</div>
                        <div className="adp-qa-sub">Return to active registry</div>
                      </div>
                      <Icon name="arrow" size={14} />
                    </button>
                  )}
                </div>
              </div>
            </section>

            <section className="adp-section">
              <header className="adp-section-head">
                <div className="adp-section-icon"><Icon name="clock" size={14} /></div>
                <h2 className="adp-section-title">Lifecycle</h2>
              </header>
              <div className="adp-section-body">
                <div className="adp-spec-list">
                  <div className="adp-spec"><span>Created</span><span>{asset.created_at?.slice(0, 10) || '—'}</span></div>
                  <div className="adp-spec"><span>Last updated</span><span>{asset.updated_at?.slice(0, 10) || '—'}</span></div>
                  <div className="adp-spec"><span>Status</span>
                    <span className={`adp-status-pill adp-status-${asset.active ? 'ok' : 'archived'}`}>
                      <span className="adp-status-dot" />
                      {asset.active ? 'Active' : 'Archived'}
                    </span>
                  </div>
                </div>
              </div>
            </section>

            <ReferencedByCard entityType="asset" entityId={asset.id} />
          </aside>
        </div>
      )}

      {/* INCIDENTS TAB */}
      {tab === 'incidents' && (
        <section className="adp-section">
          <header className="adp-section-head">
            <div className="adp-section-icon"><Icon name="incidents" size={14} /></div>
            <h2 className="adp-section-title">
              Incidents involving this asset
              <span className="adp-section-count">{incidentCount}</span>
            </h2>
          </header>
          <div className="adp-section-body">
            {incidentCount > 0 ? (
              <div className="adp-inc-list">
                {asset.linked_incidents.map(i => (
                  <button
                    key={i.id}
                    type="button"
                    className="adp-inc-row"
                    onClick={() => navigate(`/incidents/${i.id}`)}
                  >
                    <span className={`adp-inc-sev pill pill-sev-${i.severity || '5'}`}>S{i.severity}</span>
                    <div className="adp-inc-body">
                      <div className="adp-inc-title">{i.title}</div>
                      <div className="adp-inc-meta">
                        <span className="mono">{i.incident_number}</span>
                        <span>·</span>
                        <span>Track {i.track}</span>
                        <span>·</span>
                        <span>{i.type}</span>
                        <span>·</span>
                        <span>{i.site_name}</span>
                        <span>·</span>
                        <span>{i.incident_datetime?.slice(0, 10)}</span>
                        {i.reporter_name && (<><span>·</span><span>by {i.reporter_initials || i.reporter_name}</span></>)}
                      </div>
                    </div>
                    <span className={`adp-inc-status status-${(i.status || 'New').toLowerCase().replace(/\s+/g, '-')}`}>
                      {i.status}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="adp-tab-empty">
                <Icon name="incidents" size={28} />
                <h3>No incidents linked to this asset yet</h3>
                <p>When workers report an incident and select this asset, they'll show up here.</p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* MAINTENANCE TAB */}
      {tab === 'maintenance' && (
        <MaintenanceTab asset={asset} user={user} onRefresh={refreshMaintenanceCounts} />
      )}

      {/* DOCUMENTS TAB */}
      {tab === 'documents' && (
        <section className="adp-section">
          <header className="adp-section-head">
            <div className="adp-section-icon"><Icon name="file" size={14} /></div>
            <h2 className="adp-section-title">Documents</h2>
          </header>
          <div className="adp-section-body">
            <div className="adp-tab-empty">
              <Icon name="file" size={28} />
              <h3>No documents linked</h3>
              <p>Manuals, SDS sheets, certificates, and other documents linked to this asset will appear here.</p>
            </div>
          </div>
        </section>
      )}

      {/* ACTIVITY TAB */}
      {tab === 'activity' && (
        <section className="adp-section">
          <header className="adp-section-head">
            <div className="adp-section-icon"><Icon name="pulse" size={14} /></div>
            <h2 className="adp-section-title">
              Activity
              <span className="adp-section-count">{activityCount}</span>
            </h2>
          </header>
          <div className="adp-section-body">
            {activityCount > 0 ? (
              <div className="adp-actv-list">
                {asset.activity.map((e, i) => {
                  const mapped = ACTION_ICON[e.action] || { icon: 'bell', cls: 'act-system' };
                  return (
                    <div className="adp-actv" key={e.id || i}>
                      <div className="adp-actv-tl">
                        <div className={`adp-actv-dot ${mapped.cls}`}>
                          <Icon name={mapped.icon} size={13} />
                        </div>
                        {i !== asset.activity.length - 1 && <div className="adp-actv-line" />}
                      </div>
                      <div className="adp-actv-body">
                        <div className="adp-actv-head">
                          <span className="adp-actv-user">{e.user_name || 'System'}</span>
                          <span className="adp-actv-when">{timeAgo(e.created_at)}</span>
                        </div>
                        <div className="adp-actv-desc">{e.description}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="adp-tab-empty">
                <Icon name="pulse" size={28} />
                <h3>No activity yet</h3>
                <p>Edits, archive/restore actions, and audit events will appear here as they happen.</p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Edit modal */}
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
                  <div className="am-sys-banner" style={{ animationDelay: '0ms' }}>
                    <Icon name="shield" size={13}/>
                    <span>System fields — required regardless of asset type</span>
                  </div>

                  <div className="am-field-row" style={{ animationDelay: '40ms' }}>
                    <div className="am-field am-field-half">
                      <label className="am-label">Display name <span className="req">*</span></label>
                      <input className={`am-input${!form.name?.trim() && msg.type === 'error' ? ' am-input-err' : ''}`} value={form.name || ''} onChange={e => set('name', e.target.value)} autoFocus placeholder="e.g. Hydraulic Press #4" />
                    </div>
                    <div className="am-field am-field-half">
                      <label className="am-label">Unique identifier <span className="req">*</span></label>
                      <input className={`am-input${!form.display_id?.trim() && msg.type === 'error' ? ' am-input-err' : ''}`} value={form.display_id || ''} onChange={e => set('display_id', e.target.value)} placeholder="e.g. INV-PRESS-04" />
                    </div>
                  </div>

                  <div className="am-field" style={{ animationDelay: '80ms' }}>
                    <label className="am-label">Asset type</label>
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
                          <button type="button" className="am-btn-save" disabled={newCatSaving || !newCatName.trim()} onClick={handleNewCategorySave}><Icon name="check" size={13} />{newCatSaving ? '...' : 'Create'}</button>
                          <button type="button" className="am-btn-cancel" onClick={() => { setNewCatOpen(false); setNewCatName(''); }}>Cancel</button>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="am-field" style={{ animationDelay: '140ms' }}>
                    <label className="am-label">Manufacturer serial number <span className="am-label-hint">optional</span></label>
                    <input className="am-input" value={form.serial_number || ''} onChange={e => set('serial_number', e.target.value)} placeholder="e.g. SN-2024-04821" />
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
                    <SmartTextarea multiline={false} inputClassName="am-input" value={form.location_description || ''} onChange={v => set('location_description', v)} placeholder="e.g. Bay 3, production floor" />
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
                  {editFieldDefs.length > 0 && (
                    <CustomFieldsForm
                      fields={editFieldDefs}
                      values={form.custom_fields}
                      onChange={(v) => set('custom_fields', v)}
                    />
                  )}
                  <div className="am-field" style={{ animationDelay: '0ms' }}>
                    <label className="am-label">Description / notes</label>
                    <SmartTextarea rows={4} inputClassName="am-input am-textarea" value={form.description || ''} onChange={v => set('description', v)} placeholder="Specs, model details, maintenance notes..." />
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
                {saving ? <><span className="am-spinner" /> Saving...</> : <><Icon name="check" size={14} /> Save changes</>}
              </button>
            </div>
          </form>
        </div>,
        document.body
      )}
    </div>
  );
}
