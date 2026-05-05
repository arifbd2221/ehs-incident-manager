import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { listSites, createSite, updateSite, deleteSite } from '../../api/sites';
import Icon from '../../components/shared/Icon';
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
};

export default function Sites() {
  const { user } = useAuth();
  const canEdit = ELEVATED.has(user?.role);

  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null | 'new' | site object
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });

  const refresh = () => {
    setLoading(true);
    listSites().then(setSites).catch(() => setSites([])).finally(() => setLoading(false));
  };

  useEffect(refresh, []);

  const openNew = () => {
    setEditing('new');
    setForm(EMPTY);
    setMsg({ type: '', text: '' });
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
    });
    setMsg({ type: '', text: '' });
  };

  const close = () => {
    setEditing(null);
    setMsg({ type: '', text: '' });
  };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async (e) => {
    e?.preventDefault();
    if (!form.name.trim()) {
      setMsg({ type: 'error', text: 'Name is required' });
      return;
    }
    setSaving(true);
    setMsg({ type: '', text: '' });
    try {
      const payload = {
        ...form,
        annual_avg_employees: Number(form.annual_avg_employees) || 0,
        total_hours_worked: Number(form.total_hours_worked) || 0,
      };
      if (editing === 'new') {
        await createSite(payload);
      } else {
        await updateSite(editing.id, payload);
      }
      refresh();
      close();
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

  return (
    <div className="page sites-page">
      <div className="sites-header">
        <div>
          <h1 className="sites-title"><Icon name="factory" size={26} /> Sites</h1>
          <p className="sites-sub">Manage the sites your organization operates at.</p>
        </div>
        <div style={{ flex: 1 }} />
        {canEdit && (
          <button className="btn btn-primary" onClick={openNew}>
            <Icon name="plus" size={16} /> New site
          </button>
        )}
      </div>

      {loading && <div className="sites-loading">Loading…</div>}

      {!loading && sites.length === 0 && (
        <div className="sites-empty">No sites yet. {canEdit ? 'Click “New site” to add one.' : ''}</div>
      )}

      <div className="sites-grid">
        {sites.map(s => (
          <div key={s.id} className="site-card">
            <div className="site-card-h">
              <div className="site-flag">{s.country || '—'}</div>
              <div className="site-name">{s.name}</div>
            </div>
            <div className="site-meta">
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
              <div className="site-actions">
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

      {editing !== null && (
        <div className="sites-modal-backdrop" onClick={close}>
          <div className="sites-modal" onClick={e => e.stopPropagation()}>
            <div className="sites-modal-h">
              <h2>{editing === 'new' ? 'New site' : `Edit ${editing.name}`}</h2>
              <button className="icon-btn" onClick={close}><Icon name="close" size={18} /></button>
            </div>
            <form className="sites-modal-body" onSubmit={handleSave}>
              <div className="field">
                <label className="label">Name <span className="req">*</span></label>
                <input className="input" value={form.name} onChange={e => set('name', e.target.value)} autoFocus />
              </div>
              <div className="field">
                <label className="label">Address</label>
                <input className="input" value={form.address} onChange={e => set('address', e.target.value)} />
              </div>
              <div className="field-row-2">
                <div className="field">
                  <label className="label">Country</label>
                  <select className="input" value={form.country} onChange={e => set('country', e.target.value)}>
                    <option value="US">US</option>
                    <option value="UK">UK</option>
                    <option value="CA">CA</option>
                    <option value="AU">AU</option>
                    <option value="IN">IN</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
                <div className="field">
                  <label className="label">Time zone</label>
                  <select className="input" value={form.timezone} onChange={e => set('timezone', e.target.value)}>
                    <option value="America/New_York">America/New_York</option>
                    <option value="America/Chicago">America/Chicago</option>
                    <option value="America/Denver">America/Denver</option>
                    <option value="America/Los_Angeles">America/Los_Angeles</option>
                    <option value="Europe/London">Europe/London</option>
                    <option value="Europe/Berlin">Europe/Berlin</option>
                    <option value="Asia/Singapore">Asia/Singapore</option>
                    <option value="Asia/Kolkata">Asia/Kolkata</option>
                    <option value="Australia/Sydney">Australia/Sydney</option>
                  </select>
                </div>
              </div>
              <div className="field-row-2">
                <div className="field">
                  <label className="label">NAICS code (US)</label>
                  <input className="input" value={form.naics_code} onChange={e => set('naics_code', e.target.value)} placeholder="e.g. 325199" />
                </div>
                <div className="field">
                  <label className="label">OSHA establishment ID</label>
                  <input className="input" value={form.establishment_id} onChange={e => set('establishment_id', e.target.value)} />
                </div>
              </div>
              <div className="field">
                <label className="label">HSE establishment ID (UK)</label>
                <input className="input" value={form.hse_establishment_id} onChange={e => set('hse_establishment_id', e.target.value)} />
              </div>
              <div className="field-row-2">
                <div className="field">
                  <label className="label">Annual avg. employees</label>
                  <input className="input" type="number" min="0" value={form.annual_avg_employees}
                    onChange={e => set('annual_avg_employees', e.target.value)} />
                </div>
                <div className="field">
                  <label className="label">Total hours worked / yr</label>
                  <input className="input" type="number" min="0" value={form.total_hours_worked}
                    onChange={e => set('total_hours_worked', e.target.value)} />
                </div>
              </div>

              {msg.text && (
                <div className={`sites-msg sites-msg-${msg.type}`}>{msg.text}</div>
              )}

              <div className="sites-modal-actions">
                <button type="button" className="btn btn-secondary" onClick={close}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving…' : (editing === 'new' ? 'Create site' : 'Save changes')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
