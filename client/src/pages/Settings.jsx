import { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { changePassword, getSites } from '../api/auth';
import Icon from '../components/shared/Icon';
import ComboBox from '../components/shared/ComboBox';

const TABS = [
  { id: 'profile', label: 'Profile', icon: 'person' },
  { id: 'security', label: 'Security', icon: 'shield' },
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

const IdBadgeIllust = () => (
  <svg className="prof-illust" width="64" height="64" viewBox="0 0 52 52" fill="none">
    <rect x="10" y="7" width="32" height="38" rx="4" stroke="currentColor" strokeWidth="1.5"/>
    <circle cx="26" cy="20" r="6" stroke="currentColor" strokeWidth="1.5"/>
    <line x1="18" y1="32" x2="34" y2="32" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <line x1="21" y1="37" x2="31" y2="37" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <rect x="22" y="3" width="8" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
  </svg>
);

const BuildingIllust = () => (
  <svg className="prof-illust prof-illust-alt" width="64" height="64" viewBox="0 0 52 52" fill="none">
    <rect x="14" y="14" width="24" height="28" rx="2" stroke="currentColor" strokeWidth="1.5"/>
    <rect x="18" y="18" width="5" height="4" rx="1" fill="currentColor" opacity="0.3"/>
    <rect x="29" y="18" width="5" height="4" rx="1" fill="currentColor" opacity="0.3"/>
    <rect x="18" y="26" width="5" height="4" rx="1" fill="currentColor" opacity="0.3"/>
    <rect x="29" y="26" width="5" height="4" rx="1" fill="currentColor" opacity="0.3"/>
    <rect x="22" y="36" width="8" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M26 10l-10 4h20l-10-4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
  </svg>
);

const LockIllust = () => (
  <svg className="prof-illust" width="64" height="64" viewBox="0 0 52 52" fill="none">
    <rect x="15" y="24" width="22" height="18" rx="3" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M20 24v-6a6 6 0 0112 0v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <circle cx="26" cy="32" r="2.5" fill="currentColor" opacity="0.35"/>
    <line x1="26" y1="34.5" x2="26" y2="37" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

const ShieldIllust = () => (
  <svg className="prof-illust prof-illust-alt" width="64" height="64" viewBox="0 0 52 52" fill="none">
    <path d="M26 6L10 14v12c0 11 7 20 16 24 9-4 16-13 16-24V14L26 6z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    <path d="M19 26l5 5 9-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const InfoRow = ({ icon, color, label, children }) => (
  <div className="prof-row">
    <div className="prof-row-icon" style={{ '--ri-color': color }}>
      <Icon name={icon} size={14} />
    </div>
    <span className="prof-lbl">{label}</span>
    <span className="prof-val">{children}</span>
  </div>
);

export default function Profile() {
  const { user, updateUser, logout } = useAuth();
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
      {/* Hero header */}
      <div className="prof-hero">
        <div className="prof-hero-bg">
          <div className="prof-hero-shape prof-hs-1" />
          <div className="prof-hero-shape prof-hs-2" />
          <div className="prof-hero-shape prof-hs-3" />
        </div>
        <div className="prof-hero-content">
          <div className="prof-avatar-ring">
            <div className="prof-avatar">{user.initials || '??'}</div>
          </div>
          <div className="prof-identity">
            <h1 className="prof-name">{user.name}</h1>
            <p className="prof-meta">
              <span className="prof-role-badge">{user.role?.replace('_', ' ')}</span>
              {user.department && <span>· {user.department}</span>}
            </p>
            <p className="prof-email"><Icon name="mail" size={12} />{user.email}</p>
          </div>
          <div style={{ flex: 1 }} />
          <button className="btn btn-secondary btn-sm prof-logout" onClick={logout}>
            <Icon name="logout" size={16} />Sign out
          </button>
        </div>
      </div>

      {/* Quick stats */}
      <div className="prof-stats">
        <div className="prof-stat">
          <div className="prof-stat-icon" style={{ '--ps-color': 'var(--sds-brand-primary)' }}><Icon name="clock" size={18} /></div>
          <div>
            <div className="prof-stat-val">{joined}</div>
            <div className="prof-stat-lbl">Member since</div>
          </div>
        </div>
        <div className="prof-stat">
          <div className="prof-stat-icon" style={{ '--ps-color': 'var(--sds-success)' }}><Icon name="check" size={18} /></div>
          <div>
            <div className="prof-stat-val"><span className="prof-active-dot" />Active</div>
            <div className="prof-stat-lbl">Account status</div>
          </div>
        </div>
        <div className="prof-stat">
          <div className="prof-stat-icon" style={{ '--ps-color': '#F57C00' }}><Icon name="factory" size={18} /></div>
          <div>
            <div className="prof-stat-val">{siteName || '—'}</div>
            <div className="prof-stat-lbl">Assigned site</div>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="prof-tabs">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`prof-tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => { setTab(t.id); setMsg({ type: '', text: '' }); setPwMsg({ type: '', text: '' }); }}
          >
            <Icon name={t.icon} size={16} />
            {t.label}
          </button>
        ))}
      </div>

      {msg.text && <div className={`prof-msg ${msg.type}`}><Icon name={msg.type === 'ok' ? 'check' : 'warning'} size={14} />{msg.text}</div>}

      {/* Profile tab */}
      {tab === 'profile' && (
        <div className="prof-tab-content" key="profile">
          <section className="prof-section">
            <IdBadgeIllust />
            <div className="prof-sec-h">
              <div className="prof-sec-icon" style={{ '--si-color': '#626DF9' }}><Icon name="person" size={18} /></div>
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
                <div className="prof-field">
                  <label>Full name <span className="req">*</span></label>
                  <div className="auth-input-wrap">
                    <Icon name="person" size={16} />
                    <input className="auth-input" value={form.name} onChange={e => set('name', e.target.value)} />
                  </div>
                </div>
                <div className="prof-field-row">
                  <div className="prof-field">
                    <label>Job title</label>
                    <div className="auth-input-wrap">
                      <Icon name="briefcase" size={16} />
                      <input className="auth-input" value={form.job_title} onChange={e => set('job_title', e.target.value)} />
                    </div>
                  </div>
                  <div className="prof-field">
                    <label>Department</label>
                    <div className="auth-input-wrap">
                      <Icon name="factory" size={16} />
                      <input className="auth-input" value={form.department} onChange={e => set('department', e.target.value)} />
                    </div>
                  </div>
                </div>
                <div className="prof-field">
                  <label>Site</label>
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
                <InfoRow icon="person" color="#626DF9" label="Name">{user.name}</InfoRow>
                <InfoRow icon="mail" color="#0DB4F0" label="Email">{user.email}</InfoRow>
                <InfoRow icon="briefcase" color="#F57C00" label="Job title">{user.job_title || '—'}</InfoRow>
                <InfoRow icon="factory" color="#E91E63" label="Department">{user.department || '—'}</InfoRow>
                <InfoRow icon="location" color="#2E7D32" label="Site">{siteName || '—'}</InfoRow>
                <InfoRow icon="shield" color="#7C3AED" label="Role"><span className="prof-role">{user.role?.replace('_', ' ')}</span></InfoRow>
              </div>
            )}
          </section>

          <section className="prof-section" style={{ animationDelay: '100ms' }}>
            <BuildingIllust />
            <div className="prof-sec-h">
              <div className="prof-sec-icon" style={{ '--si-color': '#E91E63' }}><Icon name="factory" size={18} /></div>
              <div className="prof-sec-title">
                <span>Organization</span>
                <span className="prof-sec-sub">Company and compliance details</span>
              </div>
            </div>
            <div className="prof-info">
              <InfoRow icon="factory" color="#626DF9" label="Name">{user.org_name || '—'}</InfoRow>
              <InfoRow icon="globe" color="#0DB4F0" label="Country">{user.country || '—'}</InfoRow>
              <InfoRow icon="gear" color="#F57C00" label="Industry">{user.industry_sector || '—'}</InfoRow>
              <InfoRow icon="clipboard" color="#E91E63" label="Frameworks">{frameworkLabels(user.compliance_frameworks) || '—'}</InfoRow>
              <InfoRow icon="people" color="#2E7D32" label="Company size">{user.company_size || '—'}</InfoRow>
              {user.naics_code && <InfoRow icon="info" color="#7C3AED" label="NAICS">{user.naics_code}</InfoRow>}
            </div>
            {user.role === 'admin' && <OrgLogoWidget user={user} />}
          </section>
        </div>
      )}

      {/* Security tab */}
      {tab === 'security' && (
        <div className="prof-tab-content" key="security">
          <section className="prof-section">
            <LockIllust />
            <div className="prof-sec-h">
              <div className="prof-sec-icon" style={{ '--si-color': '#F57C00' }}><Icon name="shield" size={18} /></div>
              <div className="prof-sec-title">
                <span>Change password</span>
                <span className="prof-sec-sub">Keep your account secure with a strong password</span>
              </div>
            </div>

            {pwMsg.text && <div className={`prof-msg sm ${pwMsg.type}`}><Icon name={pwMsg.type === 'ok' ? 'check' : 'warning'} size={14} />{pwMsg.text}</div>}

            <form className="prof-pw" onSubmit={handlePwSubmit}>
              <div className="prof-field">
                <label>Current password</label>
                <div className="auth-input-wrap">
                  <Icon name="shield" size={16} />
                  <input className="auth-input" type={showCurrent ? 'text' : 'password'} value={pw.current} onChange={e => setPw(p => ({ ...p, current: e.target.value }))} />
                  <button type="button" className="auth-pw-toggle" onClick={() => setShowCurrent(v => !v)}>
                    <Icon name={showCurrent ? 'eyeOff' : 'eye'} size={16} />
                  </button>
                </div>
              </div>
              <div className="prof-field">
                <label>New password</label>
                <div className="auth-input-wrap">
                  <Icon name="shield" size={16} />
                  <input className="auth-input" type={showNew ? 'text' : 'password'} value={pw.next} onChange={e => setPw(p => ({ ...p, next: e.target.value }))} placeholder="Min. 8 characters" />
                  <button type="button" className="auth-pw-toggle" onClick={() => setShowNew(v => !v)}>
                    <Icon name={showNew ? 'eyeOff' : 'eye'} size={16} />
                  </button>
                </div>
              </div>
              <div className="prof-field">
                <label>Confirm new password</label>
                <div className="auth-input-wrap">
                  <Icon name="shield" size={16} />
                  <input className="auth-input" type="password" value={pw.confirm} onChange={e => setPw(p => ({ ...p, confirm: e.target.value }))} />
                </div>
              </div>
              <div className="prof-actions">
                <button className={`btn btn-primary btn-sm ${pwSaving ? 'auth-loading' : ''}`} type="submit" disabled={pwSaving}>
                  {pwSaving ? <><span className="login-spinner" />Changing...</> : 'Update password'}
                </button>
              </div>
            </form>
          </section>

          <section className="prof-section" style={{ animationDelay: '100ms' }}>
            <ShieldIllust />
            <div className="prof-sec-h">
              <div className="prof-sec-icon" style={{ '--si-color': '#2E7D32' }}><Icon name="info" size={18} /></div>
              <div className="prof-sec-title">
                <span>Account details</span>
                <span className="prof-sec-sub">Your account information and access level</span>
              </div>
            </div>
            <div className="prof-info">
              <InfoRow icon="clock" color="#626DF9" label="Account created">{joined}</InfoRow>
              <InfoRow icon="check" color="#2E7D32" label="Account status"><span className="prof-active-dot" />Active</InfoRow>
              <InfoRow icon="shield" color="#7C3AED" label="Role"><span className="prof-role">{user.role?.replace('_', ' ')}</span></InfoRow>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

// WI-01 carry-forward: organisation logo upload widget. Admin-only —
// rendered inside the Organization section by the parent. Posts to
// /api/auth/organization/logo (multer single file) and re-applies the
// returned JWT so the new logo_path is reflected immediately.
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
    <div className="prof-info" style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--sds-border)' }}>
      <div className="prof-row" style={{ alignItems: 'center' }}>
        <span className="prof-lbl">Logo on PDFs</span>
        <span className="prof-val" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {logoUrl ? (
            <img src={logoUrl} alt="Organisation logo" style={{ maxHeight: 36, maxWidth: 120, objectFit: 'contain', border: '1px solid var(--sds-border)', borderRadius: 4, padding: 2 }} />
          ) : (
            <span style={{ fontSize: 12, color: 'var(--sds-fg-tertiary)' }}>No logo set — PDFs use the org name only.</span>
          )}
          <input ref={fileRef} type="file" accept="image/png,image/jpeg" style={{ display: 'none' }} onChange={e => upload(e.target.files?.[0])} />
          <button className="btn btn-secondary btn-sm" type="button" disabled={busy} onClick={() => fileRef.current?.click()}>
            <Icon name="upload" size={13} />{logoUrl ? 'Replace' : 'Upload'}
          </button>
          {logoUrl && (
            <button className="btn btn-text btn-sm" type="button" disabled={busy} onClick={remove}>Remove</button>
          )}
        </span>
      </div>
      {msg.text && (
        <div className={`prof-msg sm ${msg.type}`} style={{ marginTop: 8 }}>
          <Icon name={msg.type === 'ok' ? 'check' : 'warning'} size={14} />{msg.text}
        </div>
      )}
    </div>
  );
}
