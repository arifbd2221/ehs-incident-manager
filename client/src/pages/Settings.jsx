import { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { changePassword, getSites } from '../api/auth';
import Icon from '../components/shared/Icon';
import ComboBox from '../components/shared/ComboBox';

const TABS = [
  { id: 'profile', label: 'Profile', icon: 'person' },
  { id: 'appearance', label: 'Appearance', icon: 'eye' },
  { id: 'security', label: 'Security', icon: 'shield' },
];

const THEME_OPTIONS = [
  {
    id: 'light',
    label: 'Light',
    desc: 'Bright surfaces, default look.',
    swatches: ['#FFFFFF', '#F2F5F7', '#626DF9', '#1A1A1A'],
  },
  {
    id: 'dark',
    label: 'Dark',
    desc: 'Easier on the eyes in low light.',
    swatches: ['#1A1D24', '#0F1218', '#7A85FF', '#F2F4F8'],
  },
  {
    id: 'system',
    label: 'System',
    desc: 'Match your operating system preference.',
    swatches: ['#FFFFFF', '#1A1D24', '#626DF9', '#7A85FF'],
  },
];

const FRAMEWORK_LABELS = {
  osha_300: 'OSHA 300 Log',
  osha_300a: 'OSHA 300A Annual Summary',
  osha_301: 'OSHA 301 Incident Report',
  riddor_f2508: 'RIDDOR F2508',
  safework_nsw: 'SafeWork NSW Incident Notification',
  generic: 'Generic Incident Report',
};

function frameworkLabels(codes) {
  if (!Array.isArray(codes) || codes.length === 0) return '';
  return codes.map(c => FRAMEWORK_LABELS[c] || c).join(', ');
}

const InfoRow = ({ icon, label, children }) => (
  <div className="prof-row">
    <div className="prof-row-icon"><Icon name={icon} size={14} /></div>
    <span className="prof-lbl">{label}</span>
    <span className="prof-val">{children}</span>
  </div>
);

export default function Profile() {
  const { user, updateUser, logout } = useAuth();
  const { theme, resolved, setTheme } = useTheme();
  const [sites, setSites] = useState([]);
  const [tab, setTab] = useState('profile');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [form, setForm] = useState({ name: '', department: '', job_title: '', site_id: '' });

  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState({ type: '', text: '' });
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  useEffect(() => { getSites().then(d => setSites(d.sites || [])).catch(() => {}); }, []);

  useEffect(() => {
    if (user) setForm({ name: user.name || '', department: user.department || '', job_title: user.job_title || '', site_id: user.site_id || '' });
  }, [user]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const siteOpts = useMemo(() => [{ value: '', label: 'No site' }, ...sites.map(s => ({ value: String(s.id), label: s.name }))], [sites]);

  const handleSave = async () => {
    if (!form.name.trim()) return setMsg({ type: 'error', text: 'Name is required' });
    setSaving(true);
    setMsg({ type: '', text: '' });
    try {
      await updateUser(form);
      setMsg({ type: 'ok', text: 'Profile updated successfully' });
      setEditing(false);
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'Update failed' });
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditing(false);
    setMsg({ type: '', text: '' });
    if (user) setForm({ name: user.name || '', department: user.department || '', job_title: user.job_title || '', site_id: user.site_id || '' });
  };

  const handlePwSubmit = async (e) => {
    e.preventDefault();
    setPwMsg({ type: '', text: '' });
    if (pw.next.length < 8) return setPwMsg({ type: 'error', text: 'New password must be at least 8 characters' });
    if (pw.next !== pw.confirm) return setPwMsg({ type: 'error', text: 'Passwords do not match' });
    setPwSaving(true);
    try {
      await changePassword(pw.current, pw.next);
      setPwMsg({ type: 'ok', text: 'Password changed successfully' });
      setPw({ current: '', next: '', confirm: '' });
    } catch (err) {
      setPwMsg({ type: 'error', text: err.response?.data?.error || 'Password change failed' });
    } finally {
      setPwSaving(false);
    }
  };

  if (!user) return null;
  const siteName = sites.find(s => s.id === user.site_id)?.name;
  const joined = user.created_at ? new Date(user.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '—';

  return (
    <div className="page prof-page">
      {/* Hero — gradient cover with floating shapes, avatar overlaps cover */}
      <div className="prof-hero">
        <div className="prof-cover">
          <div className="prof-cover-shape prof-cover-shape-1" />
          <div className="prof-cover-shape prof-cover-shape-2" />
          <div className="prof-cover-shape prof-cover-shape-3" />
        </div>
        <div className="prof-hero-content">
          <div className="prof-avatar-ring">
            <div className="prof-avatar">{user.initials || '??'}</div>
          </div>
          <div className="prof-identity">
            <h1 className="prof-name">{user.name}</h1>
            <p className="prof-meta">
              <span className="prof-role-badge">{user.role?.replace('_', ' ')}</span>
              {user.department && (
                <>
                  <span className="prof-meta-dot">·</span>
                  <span className="prof-meta-dept">{user.department}</span>
                </>
              )}
              <span className="prof-meta-dot">·</span>
              <span className="prof-meta-email">
                <Icon name="mail" size={12} />{user.email}
              </span>
            </p>
          </div>
          <button className="btn btn-secondary btn-sm prof-logout" onClick={logout}>
            <Icon name="logout" size={16} />Sign out
          </button>
        </div>
      </div>

      {/* Quick stats */}
      <div className="prof-stats">
        <div className="prof-stat prof-stat-primary">
          <div className="prof-stat-icon"><Icon name="clock" size={16} /></div>
          <div>
            <div className="prof-stat-val">{joined}</div>
            <div className="prof-stat-lbl">Member since</div>
          </div>
        </div>
        <div className="prof-stat prof-stat-success">
          <div className="prof-stat-icon"><Icon name="check" size={16} /></div>
          <div>
            <div className="prof-stat-val"><span className="prof-active-dot" />Active</div>
            <div className="prof-stat-lbl">Account status</div>
          </div>
        </div>
        <div className="prof-stat prof-stat-warning">
          <div className="prof-stat-icon"><Icon name="factory" size={16} /></div>
          <div>
            <div className="prof-stat-val">{siteName || '—'}</div>
            <div className="prof-stat-lbl">Assigned site</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="prof-tabs" role="tablist">
        {TABS.map(t => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`prof-tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => { setTab(t.id); setMsg({ type: '', text: '' }); setPwMsg({ type: '', text: '' }); }}
          >
            <Icon name={t.icon} size={16} />
            {t.label}
          </button>
        ))}
      </div>

      {msg.text && (
        <div className={`prof-msg ${msg.type}`}>
          <Icon name={msg.type === 'ok' ? 'check' : 'warning'} size={14} />{msg.text}
        </div>
      )}

      {/* Profile tab — Profile + Organization sections */}
      {tab === 'profile' && (
        <div className="prof-tab-content" key="profile">
          <section className="prof-section">
            <div className="prof-sec-h">
              <div className="prof-sec-icon prof-sec-icon-primary"><Icon name="person" size={18} /></div>
              <div className="prof-sec-title">
                <span>Personal information</span>
                <span className="prof-sec-sub">Your profile details and contact info</span>
              </div>
              {!editing && (
                <button className="btn btn-tertiary btn-sm" onClick={() => setEditing(true)}>
                  <Icon name="edit" size={14} />Edit
                </button>
              )}
            </div>

            {editing ? (
              <div className="prof-fields">
                <div className="field">
                  <label className="label">Full name <span className="req">*</span></label>
                  <input className="input" value={form.name} onChange={e => set('name', e.target.value)} />
                </div>
                <div className="field-row">
                  <div className="field">
                    <label className="label">Job title</label>
                    <input className="input" value={form.job_title} onChange={e => set('job_title', e.target.value)} />
                  </div>
                  <div className="field">
                    <label className="label">Department</label>
                    <input className="input" value={form.department} onChange={e => set('department', e.target.value)} />
                  </div>
                </div>
                <div className="field">
                  <label className="label">Site</label>
                  <ComboBox options={siteOpts} value={String(form.site_id || '')} onChange={v => set('site_id', v)} placeholder="Search sites…" />
                </div>
                <div className="prof-actions">
                  <button className="btn btn-secondary btn-sm" onClick={handleCancel}>Cancel</button>
                  <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
                    {saving ? <><span className="login-spinner" />Saving...</> : 'Save changes'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="prof-info">
                <InfoRow icon="person" label="Name">{user.name}</InfoRow>
                <InfoRow icon="mail" label="Email">{user.email}</InfoRow>
                <InfoRow icon="briefcase" label="Job title">{user.job_title || '—'}</InfoRow>
                <InfoRow icon="factory" label="Department">{user.department || '—'}</InfoRow>
                <InfoRow icon="location" label="Site">{siteName || '—'}</InfoRow>
                <InfoRow icon="shield" label="Role"><span className="prof-role">{user.role?.replace('_', ' ')}</span></InfoRow>
              </div>
            )}
          </section>

          <section className="prof-section">
            <div className="prof-sec-h">
              <div className="prof-sec-icon prof-sec-icon-info"><Icon name="factory" size={18} /></div>
              <div className="prof-sec-title">
                <span>Organization</span>
                <span className="prof-sec-sub">Company and compliance details</span>
              </div>
            </div>
            <div className="prof-info">
              <InfoRow icon="factory" label="Name">{user.org_name || '—'}</InfoRow>
              <InfoRow icon="globe" label="Country">{user.country || '—'}</InfoRow>
              <InfoRow icon="gear" label="Industry">{user.industry_sector || '—'}</InfoRow>
              <InfoRow icon="clipboard" label="Frameworks">{frameworkLabels(user.compliance_frameworks) || '—'}</InfoRow>
              <InfoRow icon="people" label="Company size">{user.company_size || '—'}</InfoRow>
              {user.naics_code && <InfoRow icon="info" label="NAICS">{user.naics_code}</InfoRow>}
            </div>
            {user.role === 'admin' && <OrgLogoWidget user={user} />}
          </section>
        </div>
      )}

      {/* Appearance tab */}
      {tab === 'appearance' && (
        <div className="prof-tab-content" key="appearance">
          <section className="prof-section">
            <div className="prof-sec-h">
              <div className="prof-sec-icon prof-sec-icon-primary"><Icon name="eye" size={18} /></div>
              <div className="prof-sec-title">
                <span>Theme</span>
                <span className="prof-sec-sub">
                  Choose how the app looks. {theme === 'system' && <em>Currently following system ({resolved}).</em>}
                </span>
              </div>
            </div>

            <div className="theme-grid">
              {THEME_OPTIONS.map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  className={`theme-tile ${theme === opt.id ? 'is-active' : ''}`}
                  onClick={() => setTheme(opt.id)}
                  aria-pressed={theme === opt.id}
                >
                  <div className="theme-tile-preview" data-preview={opt.id}>
                    {opt.swatches.map((c, i) => (
                      <span key={i} className="theme-tile-swatch" style={{ background: c }} />
                    ))}
                  </div>
                  <div className="theme-tile-body">
                    <div className="theme-tile-title">
                      {opt.label}
                      {theme === opt.id && <span className="theme-tile-check"><Icon name="check" size={12} /></span>}
                    </div>
                    <div className="theme-tile-desc">{opt.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* Security tab */}
      {tab === 'security' && (
        <div className="prof-tab-content" key="security">
          <section className="prof-section">
            <div className="prof-sec-h">
              <div className="prof-sec-icon prof-sec-icon-warning"><Icon name="shield" size={18} /></div>
              <div className="prof-sec-title">
                <span>Change password</span>
                <span className="prof-sec-sub">Keep your account secure with a strong password</span>
              </div>
            </div>

            {pwMsg.text && (
              <div className={`prof-msg sm ${pwMsg.type}`}>
                <Icon name={pwMsg.type === 'ok' ? 'check' : 'warning'} size={14} />{pwMsg.text}
              </div>
            )}

            <form className="prof-pw" onSubmit={handlePwSubmit}>
              <div className="field">
                <label className="label">Current password</label>
                <div className="prof-pw-input">
                  <input
                    className="input"
                    type={showCurrent ? 'text' : 'password'}
                    value={pw.current}
                    onChange={e => setPw(p => ({ ...p, current: e.target.value }))}
                  />
                  <button type="button" className="prof-pw-toggle" onClick={() => setShowCurrent(v => !v)}>
                    <Icon name={showCurrent ? 'eyeOff' : 'eye'} size={16} />
                  </button>
                </div>
              </div>
              <div className="field">
                <label className="label">New password</label>
                <div className="prof-pw-input">
                  <input
                    className="input"
                    type={showNew ? 'text' : 'password'}
                    value={pw.next}
                    onChange={e => setPw(p => ({ ...p, next: e.target.value }))}
                    placeholder="Min. 8 characters"
                  />
                  <button type="button" className="prof-pw-toggle" onClick={() => setShowNew(v => !v)}>
                    <Icon name={showNew ? 'eyeOff' : 'eye'} size={16} />
                  </button>
                </div>
              </div>
              <div className="field">
                <label className="label">Confirm new password</label>
                <input
                  className="input"
                  type="password"
                  value={pw.confirm}
                  onChange={e => setPw(p => ({ ...p, confirm: e.target.value }))}
                />
              </div>
              <div className="prof-actions">
                <button className={`btn btn-primary btn-sm ${pwSaving ? 'auth-loading' : ''}`} type="submit" disabled={pwSaving}>
                  {pwSaving ? <><span className="login-spinner" />Changing...</> : 'Update password'}
                </button>
              </div>
            </form>
          </section>

          <section className="prof-section">
            <div className="prof-sec-h">
              <div className="prof-sec-icon prof-sec-icon-success"><Icon name="info" size={18} /></div>
              <div className="prof-sec-title">
                <span>Account details</span>
                <span className="prof-sec-sub">Your account information and access level</span>
              </div>
            </div>
            <div className="prof-info">
              <InfoRow icon="clock" label="Account created">{joined}</InfoRow>
              <InfoRow icon="check" label="Account status"><span className="prof-active-dot" />Active</InfoRow>
              <InfoRow icon="shield" label="Role"><span className="prof-role">{user.role?.replace('_', ' ')}</span></InfoRow>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function OrgLogoWidget({ user }) {
  const { updateUserFromToken } = useAuth();
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });

  const logoUrl = user.logo_path ? `/uploads/${user.logo_path}` : null;

  const upload = async (file) => {
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      return setMsg({ type: 'error', text: 'Logo must be PNG or JPG.' });
    }
    setBusy(true);
    setMsg({ type: '', text: '' });
    try {
      const fd = new FormData();
      fd.append('logo', file);
      const resp = await fetch('/api/auth/organization/logo', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: fd,
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error || `Upload failed: ${resp.status}`);
      }
      const data = await resp.json();
      if (data.token) updateUserFromToken?.(data.token, data.user);
      setMsg({ type: 'ok', text: 'Logo updated. It will appear on the next PDF download.' });
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'Upload failed' });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const remove = async () => {
    setBusy(true);
    setMsg({ type: '', text: '' });
    try {
      const resp = await fetch('/api/auth/organization/logo', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error || `Remove failed: ${resp.status}`);
      }
      const data = await resp.json();
      if (data.token) updateUserFromToken?.(data.token, data.user);
      setMsg({ type: 'ok', text: 'Logo removed.' });
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'Remove failed' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="prof-logo-block">
      <div className="prof-row">
        <span className="prof-lbl">Logo on PDFs</span>
        <span className="prof-val prof-logo-val">
          {logoUrl ? (
            <img className="prof-logo-img" src={logoUrl} alt="Organisation logo" />
          ) : (
            <span className="prof-logo-empty">No logo set — PDFs use the org name only.</span>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg"
            className="prof-logo-input"
            onChange={e => upload(e.target.files?.[0])}
          />
          <button className="btn btn-secondary btn-sm" type="button" disabled={busy} onClick={() => fileRef.current?.click()}>
            <Icon name="upload" size={13} />{logoUrl ? 'Replace' : 'Upload'}
          </button>
          {logoUrl && (
            <button className="btn btn-text btn-sm" type="button" disabled={busy} onClick={remove}>Remove</button>
          )}
        </span>
      </div>
      {msg.text && (
        <div className={`prof-msg sm ${msg.type}`}>
          <Icon name={msg.type === 'ok' ? 'check' : 'warning'} size={14} />{msg.text}
        </div>
      )}
    </div>
  );
}
