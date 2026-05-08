import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { listSites, createSite, updateSite, deleteSite, importSites, siteImportTemplateUrl } from '../../api/sites';
import Icon from '../../components/shared/Icon';
import ComboBox from '../../components/shared/ComboBox';
import ImportModal from '../../components/shared/ImportModal';
import '../../styles/sites.css';

const ELEVATED = new Set(['supervisor', 'ehs_officer', 'ehs_manager', 'admin']);

const EMPTY = {
  name: '',
  address: '',
  country: 'US',
  naics_code: '',
  establishment_id: '',
  hse_establishment_id: '',
  annual_avg_employees: 0,
  total_hours_worked: 0,
  timezone: 'America/New_York',
  parent_id: '',
};

const COUNTRIES = [
  { code: 'US', label: 'United States', flag: '\u{1F1FA}\u{1F1F8}' },
  { code: 'UK', label: 'United Kingdom', flag: '\u{1F1EC}\u{1F1E7}' },
  { code: 'CA', label: 'Canada', flag: '\u{1F1E8}\u{1F1E6}' },
  { code: 'AU', label: 'Australia', flag: '\u{1F1E6}\u{1F1FA}' },
  { code: 'IN', label: 'India', flag: '\u{1F1EE}\u{1F1F3}' },
  { code: 'OTHER', label: 'Other', flag: '\u{1F310}' },
];

const TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern (New York)' },
  { value: 'America/Chicago', label: 'Central (Chicago)' },
  { value: 'America/Denver', label: 'Mountain (Denver)' },
  { value: 'America/Los_Angeles', label: 'Pacific (Los Angeles)' },
  { value: 'Europe/London', label: 'GMT (London)' },
  { value: 'Europe/Berlin', label: 'CET (Berlin)' },
  { value: 'Asia/Singapore', label: 'SGT (Singapore)' },
  { value: 'Asia/Kolkata', label: 'IST (Kolkata)' },
  { value: 'Australia/Sydney', label: 'AEST (Sydney)' },
];

const SECTIONS = [
  { key: 'general', icon: 'factory', label: 'General' },
  { key: 'location', icon: 'location', label: 'Location' },
  { key: 'compliance', icon: 'shield', label: 'Compliance' },
  { key: 'workforce', icon: 'person', label: 'Workforce' },
];

export default function Sites() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canEdit = ELEVATED.has(user?.role);

  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [activeSection, setActiveSection] = useState('general');
  const [success, setSuccess] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [toast, setToast] = useState('');
  const nameRef = useRef(null);

  const refresh = () => {
    setLoading(true);
    listSites().then(setSites).catch(() => setSites([])).finally(() => setLoading(false));
  };

  useEffect(refresh, []);

  const openNew = () => {
    setEditing('new');
    setForm(EMPTY);
    setMsg({ type: '', text: '' });
    setActiveSection('general');
    setSuccess(false);
    setTimeout(() => nameRef.current?.focus(), 150);
  };

  const openEdit = (site) => {
    setEditing(site);
    setForm({
      name: site.name || '',
      address: site.address || '',
      country: site.country || 'US',
      naics_code: site.naics_code || '',
      establishment_id: site.establishment_id || '',
      hse_establishment_id: site.hse_establishment_id || '',
      annual_avg_employees: site.annual_avg_employees ?? 0,
      total_hours_worked: site.total_hours_worked ?? 0,
      timezone: site.timezone || 'America/New_York',
      parent_id: site.parent_id || '',
    });
    setMsg({ type: '', text: '' });
    setActiveSection('general');
    setSuccess(false);
  };

  const close = () => {
    setEditing(null);
    setMsg({ type: '', text: '' });
    setSuccess(false);
  };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async (e) => {
    e?.preventDefault();
    if (!form.name.trim()) {
      setMsg({ type: 'error', text: 'Site name is required' });
      setActiveSection('general');
      nameRef.current?.focus();
      return;
    }
    setSaving(true);
    setMsg({ type: '', text: '' });
    try {
      const payload = {
        ...form,
        annual_avg_employees: Number(form.annual_avg_employees) || 0,
        total_hours_worked: Number(form.total_hours_worked) || 0,
        parent_id: form.parent_id ? Number(form.parent_id) : null,
      };
      if (editing === 'new') {
        await createSite(payload);
      } else {
        await updateSite(editing.id, payload);
      }
      setSuccess(true);
      setTimeout(() => { refresh(); close(); }, 600);
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'Save failed' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (site) => {
    if (!window.confirm(`Delete site "${site.name}"? This cannot be undone.`)) return;
    try {
      await deleteSite(site.id);
      refresh();
    } catch (err) {
      const data = err.response?.data;
      if (data?.references) {
        const refs = Object.entries(data.references)
          .filter(([, c]) => c > 0)
          .map(([k, c]) => `${c} ${k}`)
          .join(', ');
        alert(`Cannot delete: site has dependent records (${refs}).`);
      } else {
        alert(data?.error || 'Delete failed');
      }
    }
  };

  const countryObj = COUNTRIES.find(c => c.code === form.country) || COUNTRIES[0];
  const completeness = [form.name, form.address, form.country, form.timezone, form.naics_code || form.establishment_id || form.hse_establishment_id].filter(Boolean).length;
  const pct = Math.round((completeness / 5) * 100);

  // Parent options: exclude self + all descendants of self when editing.
  const editingId = editing && editing !== 'new' ? editing.id : null;
  const blockedParents = (() => {
    const blocked = new Set();
    if (!editingId) return blocked;
    blocked.add(editingId);
    let frontier = [editingId];
    while (frontier.length) {
      const next = [];
      for (const id of frontier) {
        for (const s of sites) {
          if (s.parent_id === id && !blocked.has(s.id)) {
            blocked.add(s.id);
            next.push(s.id);
          }
        }
      }
      frontier = next;
    }
    return blocked;
  })();
  const parentOptions = sites.filter(s => !blockedParents.has(s.id));
  const sitesById = new Map(sites.map(s => [s.id, s]));

  return (
    <div className="page sites-page">
      <div className="sites-header">
        <div>
          <h1 className="sites-title"><Icon name="factory" size={26} /> Sites</h1>
          <p className="sites-sub">Manage the sites your organization operates at.</p>
        </div>
        <div style={{ flex: 1 }} />
        {canEdit && (
          <div style={{ display: 'inline-flex', gap: 'var(--sds-space-sm)' }}>
            <button className="btn btn-secondary" onClick={() => setImportOpen(true)}>
              <Icon name="upload" size={16} /> Import CSV
            </button>
            <button className="btn btn-primary" onClick={openNew}>
              <Icon name="plus" size={16} /> New site
            </button>
          </div>
        )}
      </div>

      {toast && <div className="toast"><Icon name="check" size={16} />{toast}</div>}

      {loading && <div className="sites-loading">Loading...</div>}

      {!loading && sites.length === 0 && (
        <div className="sites-empty">No sites yet. {canEdit ? 'Click "New site" to add one.' : ''}</div>
      )}

      <div className="sites-grid">
        {sites.map(s => (
          <div
            key={s.id}
            className="site-card"
            role="button"
            tabIndex={0}
            onClick={() => navigate(`/admin/sites/${s.id}`)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/admin/sites/${s.id}`); } }}
          >
            <div className="site-card-h">
              <div className="site-flag">{s.country || '—'}</div>
              <div className="site-name">{s.name}</div>
            </div>
            <div className="site-meta">
              {s.parent_id && sitesById.get(s.parent_id) && (
                <div className="site-meta-row site-parent-row">
                  <Icon name="factory" size={12} /> Sub-site of <strong>{sitesById.get(s.parent_id).name}</strong>
                </div>
              )}
              {s.address && <div className="site-meta-row"><Icon name="location" size={14} /> {s.address}</div>}
              {s.naics_code && <div className="site-meta-row">NAICS {s.naics_code}</div>}
              {s.establishment_id && <div className="site-meta-row">OSHA est. {s.establishment_id}</div>}
              {s.hse_establishment_id && <div className="site-meta-row">HSE {s.hse_establishment_id}</div>}
            </div>
            <div className="site-stats">
              <div><span>{s.annual_avg_employees ?? 0}</span> employees</div>
              <div><span>{(s.total_hours_worked ?? 0).toLocaleString()}</span> hours/yr</div>
              <div><span>{s.timezone || '—'}</span></div>
            </div>
            {canEdit && (
              <div className="site-actions" onClick={e => e.stopPropagation()}>
                <button className="btn btn-secondary btn-sm" onClick={() => openEdit(s)}>
                  <Icon name="edit" size={14} /> Edit
                </button>
                <button className="btn btn-ghost btn-sm site-del" onClick={() => handleDelete(s)}>
                  Delete
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {editing !== null && createPortal(
        <div className="modal-backdrop" onClick={close}>
          <form className={`sm-modal${success ? ' sm-success' : ''}`} onClick={e => e.stopPropagation()} onSubmit={handleSave} role="dialog" aria-modal="true" aria-labelledby="site-modal-title">
            {/* Header */}
            <div className="sm-header">
              <div className="sm-header-icon">
                <Icon name="factory" size={20} />
              </div>
              <div className="sm-header-text">
                <h2 id="site-modal-title">{editing === 'new' ? 'New site' : `Edit ${editing.name}`}</h2>
                <p>{editing === 'new' ? 'Add a new site to your organization' : 'Update site details'}</p>
              </div>
              <button type="button" className="sm-close" onClick={close}>
                <Icon name="close" size={18} />
              </button>
            </div>

            {/* Progress bar */}
            <div className="sm-progress">
              <div className="sm-progress-bar" style={{ width: `${pct}%` }} />
              <span className="sm-progress-label">{pct}% complete</span>
            </div>

            {/* Section tabs */}
            <div className="sm-tabs">
              {SECTIONS.map(s => (
                <button
                  key={s.key}
                  type="button"
                  className={`sm-tab${activeSection === s.key ? ' active' : ''}`}
                  onClick={() => setActiveSection(s.key)}
                >
                  <Icon name={s.icon} size={16} />
                  <span>{s.label}</span>
                </button>
              ))}
            </div>

            {/* Body */}
            <div className="sm-body">
              {/* General */}
              {activeSection === 'general' && (
                <div className="sm-section" key="general">
                  <div className="sm-field" style={{ animationDelay: '0ms' }}>
                    <label className="sm-label">Site name <span className="req">*</span></label>
                    <input
                      ref={nameRef}
                      className={`sm-input${!form.name.trim() && msg.type === 'error' ? ' sm-input-err' : ''}`}
                      value={form.name}
                      onChange={e => set('name', e.target.value)}
                      placeholder="e.g. Cleveland Manufacturing Plant"
                    />
                  </div>
                  <div className="sm-field" style={{ animationDelay: '50ms' }}>
                    <label className="sm-label">Country</label>
                    <div className="sm-country-grid">
                      {COUNTRIES.map(c => (
                        <button
                          key={c.code}
                          type="button"
                          className={`sm-country-btn${form.country === c.code ? ' active' : ''}`}
                          onClick={() => set('country', c.code)}
                        >
                          <span className="sm-country-flag">{c.flag}</span>
                          <span className="sm-country-code">{c.code}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="sm-field" style={{ animationDelay: '100ms' }}>
                    <label className="sm-label">Time zone</label>
                    <ComboBox
                      options={TIMEZONES}
                      value={form.timezone}
                      onChange={v => set('timezone', v)}
                      placeholder="Search timezones…"
                    />
                  </div>
                  <div className="sm-field" style={{ animationDelay: '150ms' }}>
                    <label className="sm-label">
                      Parent site
                      <span className="sm-label-hint">optional · for hierarchical sites</span>
                    </label>
                    <select
                      className="sm-input"
                      value={form.parent_id}
                      onChange={e => set('parent_id', e.target.value)}
                    >
                      <option value="">(none — top-level site)</option>
                      {parentOptions.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Location */}
              {activeSection === 'location' && (
                <div className="sm-section" key="location">
                  <div className="sm-field" style={{ animationDelay: '0ms' }}>
                    <label className="sm-label">Street address</label>
                    <input
                      className="sm-input"
                      value={form.address}
                      onChange={e => set('address', e.target.value)}
                      placeholder="123 Industrial Blvd, Cleveland, OH 44114"
                    />
                  </div>
                  <div className="sm-location-preview" style={{ animationDelay: '50ms' }}>
                    <div className="sm-loc-icon"><Icon name="location" size={24} /></div>
                    <div className="sm-loc-details">
                      <span className="sm-loc-country">{countryObj.flag} {countryObj.label}</span>
                      <span className="sm-loc-addr">{form.address || 'No address provided'}</span>
                      <span className="sm-loc-tz"><Icon name="clock" size={12} /> {form.timezone}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Compliance */}
              {activeSection === 'compliance' && (
                <div className="sm-section" key="compliance">
                  <div className="sm-compliance-note" style={{ animationDelay: '0ms' }}>
                    <Icon name="info" size={16} />
                    <span>Compliance IDs are used for OSHA 300 Log and UK HSE RIDDOR reporting.</span>
                  </div>
                  <div className="sm-field" style={{ animationDelay: '50ms' }}>
                    <label className="sm-label">NAICS code <span className="sm-label-hint">US industry classification</span></label>
                    <input
                      className="sm-input"
                      value={form.naics_code}
                      onChange={e => set('naics_code', e.target.value)}
                      placeholder="e.g. 325199"
                    />
                  </div>
                  <div className="sm-row-2" style={{ animationDelay: '100ms' }}>
                    <div className="sm-field">
                      <label className="sm-label">OSHA establishment ID</label>
                      <input
                        className="sm-input"
                        value={form.establishment_id}
                        onChange={e => set('establishment_id', e.target.value)}
                        placeholder="e.g. 12-3456"
                      />
                    </div>
                    <div className="sm-field">
                      <label className="sm-label">HSE establishment ID <span className="sm-label-hint">UK</span></label>
                      <input
                        className="sm-input"
                        value={form.hse_establishment_id}
                        onChange={e => set('hse_establishment_id', e.target.value)}
                        placeholder="e.g. HSE-12345"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Workforce */}
              {activeSection === 'workforce' && (
                <div className="sm-section" key="workforce">
                  <div className="sm-row-2" style={{ animationDelay: '0ms' }}>
                    <div className="sm-field sm-field-stat">
                      <label className="sm-label">Annual avg. employees</label>
                      <div className="sm-stat-input">
                        <Icon name="person" size={18} />
                        <input
                          className="sm-input"
                          type="number"
                          min="0"
                          value={form.annual_avg_employees}
                          onChange={e => set('annual_avg_employees', e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="sm-field sm-field-stat">
                      <label className="sm-label">Total hours worked / yr</label>
                      <div className="sm-stat-input">
                        <Icon name="clock" size={18} />
                        <input
                          className="sm-input"
                          type="number"
                          min="0"
                          value={form.total_hours_worked}
                          onChange={e => set('total_hours_worked', e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                  {(Number(form.annual_avg_employees) > 0 && Number(form.total_hours_worked) > 0) && (
                    <div className="sm-workforce-calc" style={{ animationDelay: '50ms' }}>
                      <div className="sm-calc-item">
                        <span className="sm-calc-val">{Math.round(Number(form.total_hours_worked) / Number(form.annual_avg_employees)).toLocaleString()}</span>
                        <span className="sm-calc-lbl">hrs / employee</span>
                      </div>
                      <div className="sm-calc-divider" />
                      <div className="sm-calc-item">
                        <span className="sm-calc-val">{(Number(form.total_hours_worked) / 200000).toFixed(2)}</span>
                        <span className="sm-calc-lbl">OSHA rate factor</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {msg.text && (
                <div className={`sm-msg sm-msg-${msg.type}`}>
                  <Icon name={msg.type === 'error' ? 'warning' : 'check'} size={16} />
                  {msg.text}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="sm-footer">
              <button type="button" className="btn btn-tertiary" onClick={close}>Cancel</button>
              <button type="submit" className="btn btn-primary btn-lg" disabled={saving || success}>
                {success ? (
                  <><Icon name="check" size={16} /> Saved</>
                ) : saving ? (
                  <><span className="sm-spinner" /> Saving...</>
                ) : (
                  editing === 'new' ? 'Create site' : 'Save changes'
                )}
              </button>
            </div>
          </form>
        </div>,
        document.body
      )}

      {importOpen && createPortal(
        <ImportModal
          title="Import sites from CSV"
          subtitle="Bulk-create sites for a multi-location org. Strict template — headers must match exactly."
          helperText="Columns: name, country, address, naics_code, establishment_id, annual_avg_employees, total_hours_worked, timezone, parent_name. Required: name. Use parent_name to nest under another site (already-existing or earlier in the same file). Hierarchy depth limited to 5 levels."
          templateUrl={siteImportTemplateUrl}
          templateFilename="sites_template.csv"
          importFn={importSites}
          entityNoun={{ singular: 'site', plural: 'sites' }}
          onClose={() => setImportOpen(false)}
          onImported={(n) => {
            setImportOpen(false);
            setToast(`Imported ${n} ${n === 1 ? 'site' : 'sites'}`);
            setTimeout(() => setToast(''), 2500);
            refresh();
          }}
        />,
        document.body,
      )}
    </div>
  );
}
