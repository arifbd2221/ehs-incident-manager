import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../context/AuthContext';
import { getUsers, getSites, createUser, updateUser, resetUserPassword, importUsers, userImportTemplateUrl } from '../../api/users';
import Icon from '../../components/shared/Icon';
import ComboBox from '../../components/shared/ComboBox';
import { TeamIllustration } from '../../components/shared/OnboardingIllustrations';
import '../../styles/members.css';

const ROLE_OPTS = [
  { value: 'worker', label: 'Worker' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'ehs_officer', label: 'EHS Officer' },
  { value: 'ehs_manager', label: 'EHS Manager' },
  { value: 'admin', label: 'Admin' },
];

const ROLE_LABELS = Object.fromEntries(ROLE_OPTS.map(r => [r.value, r.label]));
const ROLE_COLORS = {
  admin: { bg: 'rgba(98,109,249,0.08)', color: '#626DF9', border: 'rgba(98,109,249,0.2)' },
  ehs_manager: { bg: 'rgba(13,180,240,0.08)', color: '#0DB4F0', border: 'rgba(13,180,240,0.2)' },
  ehs_officer: { bg: 'rgba(13,180,240,0.08)', color: '#0DB4F0', border: 'rgba(13,180,240,0.2)' },
  supervisor: { bg: 'rgba(249,115,22,0.08)', color: '#f97316', border: 'rgba(249,115,22,0.2)' },
  worker: { bg: 'var(--sds-bg-surface-alt)', color: 'var(--sds-fg-secondary)', border: 'var(--sds-border)' },
};

const AVATAR_COLORS = ['#626DF9', '#4338ca', '#0DB4F0', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

function avatarColor(name) {
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function MemberModal({ mode, member, sites, onClose, onSaved, currentUserId }) {
  const isEdit = mode === 'edit';
  const [form, setForm] = useState(() => isEdit ? {
    name: member.name || '',
    email: member.email || '',
    role: member.role || 'worker',
    site_id: member.site_id ? String(member.site_id) : '',
    department: member.department || '',
    job_title: member.job_title || '',
    is_active: !!member.is_active,
  } : {
    name: '', email: '', password: '', role: 'worker',
    site_id: '', department: '', job_title: '',
    is_active: true,
  });
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const isSelf = isEdit && member.id === currentUserId;
  const siteOpts = useMemo(() => [
    { value: '', label: 'No site (org-wide)' },
    ...sites.map(s => ({ value: String(s.id), label: s.name })),
  ], [sites]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) return setError('Name is required');
    if (!form.email.trim()) return setError('Email is required');
    if (!isEdit && (!form.password || form.password.length < 8)) {
      return setError('Initial password must be at least 8 characters');
    }
    setSaving(true);
    try {
      if (isEdit) {
        const payload = {
          name: form.name,
          role: form.role,
          site_id: form.site_id ? Number(form.site_id) : null,
          department: form.department,
          job_title: form.job_title,
          is_active: form.is_active,
        };
        await updateUser(member.id, payload);
      } else {
        const payload = {
          email: form.email.trim(),
          password: form.password,
          name: form.name.trim(),
          role: form.role,
          site_id: form.site_id ? Number(form.site_id) : null,
          department: form.department || null,
          job_title: form.job_title || null,
        };
        await createUser(payload);
      }
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal modal-lg" onClick={e => e.stopPropagation()} onSubmit={handleSubmit}>
        <div className="modal-h">
          <div>
            <div className="modal-title">{isEdit ? 'Edit member' : 'Add member'}</div>
            <div className="modal-sub">
              {isEdit ? `${member.email}${isSelf ? ' (you)' : ''}` : 'Create a user with an initial password'}
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="modal-body">
          {error && <div className="auth-error" role="alert"><Icon name="warning" size={14} />{error}</div>}

          <div className="field">
            <label className="label">Full name <span className="req">*</span></label>
            <input className="input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Jane Smith" />
          </div>

          <div className="field">
            <label className="label">Email <span className="req">*</span></label>
            <input
              className="input"
              type="email"
              value={form.email}
              onChange={e => set('email', e.target.value)}
              placeholder="jane@company.com"
              disabled={isEdit}
            />
            {isEdit && <span className="helper">Email cannot be changed after creation.</span>}
          </div>

          {!isEdit && (
            <div className="field">
              <label className="label">Initial password <span className="req">*</span></label>
              <div style={{ display: 'flex', gap: 'var(--sds-space-sm)' }}>
                <input
                  className="input"
                  type={showPw ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => set('password', e.target.value)}
                  placeholder="Min. 8 characters"
                  style={{ flex: 1 }}
                />
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowPw(v => !v)}>
                  <Icon name="eye" size={14} />{showPw ? 'Hide' : 'Show'}
                </button>
              </div>
              <span className="helper">The user will sign in with this password and can change it from their profile.</span>
            </div>
          )}

          <div className="field-row">
            <div className="field">
              <label className="label">Role <span className="req">*</span></label>
              <ComboBox
                options={ROLE_OPTS}
                value={form.role}
                onChange={v => set('role', v)}
                searchable={false}
                disabled={isSelf}
              />
              {isSelf && <span className="helper">You cannot change your own role.</span>}
            </div>
            <div className="field">
              <label className="label">Site</label>
              <ComboBox
                options={siteOpts}
                value={form.site_id}
                onChange={v => set('site_id', v)}
                placeholder="No site"
              />
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label className="label">Job title</label>
              <input className="input" value={form.job_title} onChange={e => set('job_title', e.target.value)} placeholder="e.g. Press Operator" />
            </div>
            <div className="field">
              <label className="label">Department</label>
              <input className="input" value={form.department} onChange={e => set('department', e.target.value)} placeholder="e.g. Production" />
            </div>
          </div>

          {isEdit && !isSelf && (
            <div className="field">
              <label className="label" style={{ display: 'flex', alignItems: 'center', gap: 'var(--sds-space-sm)' }}>
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={e => set('is_active', e.target.checked)}
                  style={{ accentColor: 'var(--sds-brand-primary)' }}
                />
                <span>Active</span>
              </label>
              <span className="helper">Inactive members cannot sign in. Their data and history is preserved.</span>
            </div>
          )}
        </div>

        <div className="modal-f">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : (isEdit ? 'Save changes' : 'Create member')}
          </button>
        </div>
      </form>
    </div>
  );
}

function PasswordResetModal({ member, onClose, onSaved }) {
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (pw.length < 8) return setError('Password must be at least 8 characters');
    if (pw !== confirm) return setError('Passwords do not match');
    setSaving(true);
    try {
      await resetUserPassword(member.id, pw);
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Reset failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={e => e.stopPropagation()} onSubmit={handleSubmit}>
        <div className="modal-h">
          <div>
            <div className="modal-title">Reset password</div>
            <div className="modal-sub">{member.name} · {member.email}</div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="modal-body">
          {error && <div className="auth-error" role="alert"><Icon name="warning" size={14} />{error}</div>}
          <div className="field">
            <label className="label">New password <span className="req">*</span></label>
            <div style={{ display: 'flex', gap: 'var(--sds-space-sm)' }}>
              <input
                className="input"
                type={showPw ? 'text' : 'password'}
                value={pw}
                onChange={e => setPw(e.target.value)}
                placeholder="Min. 8 characters"
                style={{ flex: 1 }}
              />
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowPw(v => !v)}>
                <Icon name="eye" size={14} />{showPw ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
          <div className="field">
            <label className="label">Confirm new password <span className="req">*</span></label>
            <input
              className="input"
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="Re-enter password"
            />
          </div>
          <span className="helper">Hand the new password to the member out-of-band. They can change it later from their profile.</span>
        </div>

        <div className="modal-f">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Resetting…' : 'Reset password'}
          </button>
        </div>
      </form>
    </div>
  );
}

function ImportUsersModal({ onClose, onImported }) {
  const [csvText, setCsvText] = useState('');
  const [filename, setFilename] = useState('');
  const [report, setReport] = useState(null);   // dry-run result
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  // Don't let admin close mid-commit — BE finishes either way, but the list
  // wouldn't auto-refresh. We pin the close handlers behind !busy.
  const safeClose = () => { if (!busy) onClose(); };

  const downloadTemplate = async () => {
    try {
      const token = localStorage.getItem('token');
      const resp = await fetch(userImportTemplateUrl, { headers: { Authorization: `Bearer ${token}` } });
      if (!resp.ok) throw new Error('Template download failed');
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'users_template.csv';
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.message || 'Template download failed');
    }
  };

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setError(''); setReport(null);
    setFilename(f.name);
    const text = await f.text();
    setCsvText(text);
    // Clear the input value so picking the same file twice still fires onChange
    // (browsers skip the change event when the value didn't actually change).
    e.target.value = '';
    setBusy(true);
    try {
      const r = await importUsers(text, 'dry_run');
      setReport(r);
    } catch (err) {
      setError(err?.response?.data?.error || 'Could not parse CSV');
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    setBusy(true); setError('');
    try {
      const r = await importUsers(csvText, 'commit');
      if (r.error_count > 0) {
        setReport(r);
        setError('Some rows failed during commit. Nothing was saved.');
      } else {
        onImported(r.inserted_ids?.length || r.valid_count);
      }
    } catch (err) {
      setError(err?.response?.data?.error || 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setCsvText(''); setFilename(''); setReport(null); setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const canCommit = report && report.valid_count > 0 && report.error_count === 0;

  return (
    <div className="modal-backdrop" onClick={safeClose}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-h">
          <div>
            <div className="modal-title">Import users from CSV</div>
            <div className="modal-sub">Bulk-onboard your team. Strict template — headers must match exactly.</div>
          </div>
          <button className="icon-btn" onClick={safeClose} disabled={busy} aria-label="Close">
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="modal-body">
          {!report && (
            <>
              <div className="field">
                <label className="label">1. Download the template</label>
                <button type="button" className="btn btn-tertiary" onClick={downloadTemplate}>
                  <Icon name="download" size={14} />Download users_template.csv
                </button>
                <span className="helper">
                  Columns: email, name, role, department, job_title, site_name, password.
                  <br/>Roles: worker · supervisor · ehs_officer · ehs_manager · admin.
                  Leave department / job_title / site_name blank if not applicable.
                </span>
              </div>

              <div className="field">
                <label className="label">2. Upload your filled CSV</label>
                <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={onFile} disabled={busy} />
                {filename && <span className="helper">Selected: {filename}</span>}
              </div>

              {busy && <div style={{ color: 'var(--sds-fg-tertiary)', fontSize: 13 }}>Validating…</div>}
            </>
          )}

          {report && (
            <>
              <div style={{ display: 'flex', gap: 'var(--sds-space-md)', marginBottom: 'var(--sds-space-md)' }}>
                <span className="pill pill-success"><span className="dot"/>{report.valid_count} valid</span>
                {report.error_count > 0 && <span className="pill pill-err">{report.error_count} {report.error_count === 1 ? 'error' : 'errors'}</span>}
                <span className="pill pill-gray">{report.total} {report.total === 1 ? 'row' : 'rows'} total</span>
                <button type="button" className="btn btn-tertiary btn-sm" onClick={reset} style={{ marginLeft: 'auto' }}>
                  <Icon name="upload" size={13} />Choose another file
                </button>
              </div>

              {report.error_count > 0 && (
                <>
                  <div className="label">Errors — fix in your CSV and re-upload</div>
                  <table className="tbl" style={{ marginTop: 'var(--sds-space-xs)' }}>
                    <thead>
                      <tr>
                        <th style={{ width: 60 }}>Row</th>
                        <th style={{ width: 140 }}>Column</th>
                        <th>Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.errors.map((e, i) => (
                        <tr key={i}>
                          <td className="id">{e.row || '—'}</td>
                          <td>{e.column || <span style={{ color: 'var(--sds-fg-tertiary)' }}>—</span>}</td>
                          <td>{e.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}

              {canCommit && (
                <div className="helper" style={{ marginTop: 'var(--sds-space-md)' }}>
                  Ready to import. This is atomic — all {report.valid_count} users are created in one transaction. An audit trail row is written for each plus a summary row.
                </div>
              )}
            </>
          )}

          {error && <div style={{ color: 'var(--sds-error)', fontSize: 13, marginTop: 'var(--sds-space-sm)' }}>{error}</div>}
        </div>

        <div className="modal-f">
          <button type="button" className="btn btn-secondary" onClick={safeClose} disabled={busy}>Close</button>
          <button type="button" className="btn btn-primary" onClick={commit} disabled={!canCommit || busy}>
            {busy ? 'Importing…' : canCommit ? `Import ${report.valid_count} ${report.valid_count === 1 ? 'user' : 'users'}` : 'Import'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Members() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [users, setUsers] = useState([]);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalMode, setModalMode] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [pwTarget, setPwTarget] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  const refresh = async () => {
    setLoading(true);
    try {
      const [u, s] = await Promise.all([getUsers(), getSites()]);
      setUsers(Array.isArray(u) ? u : []);
      setSites(Array.isArray(s) ? s : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const flashToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  const openCreate = () => { setEditTarget(null); setModalMode('create'); };
  const openEdit = (u) => { setEditTarget(u); setModalMode('edit'); };
  const closeModal = () => { setModalMode(null); setEditTarget(null); };
  const onSaved = (msg) => { flashToast(msg); closeModal(); refresh(); };

  const closePwModal = () => setPwTarget(null);
  const onPwSaved = () => { flashToast('Password reset'); closePwModal(); };

  const toggleActive = async (u) => {
    const verb = u.is_active ? 'Deactivate' : 'Reactivate';
    if (!window.confirm(`${verb} ${u.name}?`)) return;
    try {
      await updateUser(u.id, { is_active: !u.is_active });
      flashToast(u.is_active ? 'Member deactivated' : 'Member reactivated');
      refresh();
    } catch (err) {
      alert(err.response?.data?.error || `${verb} failed`);
    }
  };

  const filtered = useMemo(() => {
    let list = users;
    if (roleFilter !== 'all') list = list.filter(u => u.role === roleFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(u =>
        u.name?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.department?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [users, roleFilter, search]);

  const activeCount = users.filter(u => u.is_active).length;
  const inactiveCount = users.length - activeCount;

  const roleCounts = useMemo(() => {
    const c = {};
    users.forEach(u => { c[u.role] = (c[u.role] || 0) + 1; });
    return c;
  }, [users]);

  return (
    <div className="page mbr-page">
      {/* Header */}
      <div className="mbr-header">
        <div className="mbr-header-left">
          <div className="mbr-header-icon">
            <Icon name="person" size={20} />
          </div>
          <div>
            <h1 className="mbr-title">Members</h1>
            <p className="mbr-subtitle">
              {activeCount} active member{activeCount !== 1 ? 's' : ''} in {user?.org_name || 'your organization'}
              {inactiveCount > 0 && <span className="mbr-inactive-tag"> · {inactiveCount} inactive</span>}
            </p>
          </div>
        </div>
        {isAdmin && (
          <div style={{ display: 'inline-flex', gap: 'var(--sds-space-sm)' }}>
            <button className="btn btn-secondary" onClick={() => setImportOpen(true)}>
              <Icon name="upload" size={16} />Import CSV
            </button>
            <button className="btn btn-primary" onClick={openCreate}>
              <Icon name="plus" size={16} />Add member
            </button>
          </div>
        )}
      </div>

      {/* Stat cards */}
      <div className="mbr-stats">
        <div className="mbr-stat" style={{ animationDelay: '50ms' }}>
          <div className="mbr-stat-icon" style={{ background: 'rgba(98,109,249,0.1)', color: '#626DF9' }}>
            <Icon name="person" size={16} />
          </div>
          <div className="mbr-stat-val">{users.length}</div>
          <div className="mbr-stat-lbl">Total</div>
        </div>
        <div className="mbr-stat" style={{ animationDelay: '100ms' }}>
          <div className="mbr-stat-icon" style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e' }}>
            <Icon name="check" size={16} />
          </div>
          <div className="mbr-stat-val">{activeCount}</div>
          <div className="mbr-stat-lbl">Active</div>
        </div>
        <div className="mbr-stat" style={{ animationDelay: '150ms' }}>
          <div className="mbr-stat-icon" style={{ background: 'rgba(98,109,249,0.1)', color: '#626DF9' }}>
            <Icon name="shield" size={16} />
          </div>
          <div className="mbr-stat-val">{(roleCounts.admin || 0) + (roleCounts.ehs_manager || 0) + (roleCounts.ehs_officer || 0)}</div>
          <div className="mbr-stat-lbl">Elevated</div>
        </div>
        <div className="mbr-stat" style={{ animationDelay: '200ms' }}>
          <div className="mbr-stat-icon" style={{ background: 'rgba(249,115,22,0.1)', color: '#f97316' }}>
            <Icon name="factory" size={16} />
          </div>
          <div className="mbr-stat-val">{sites.length}</div>
          <div className="mbr-stat-lbl">Sites</div>
        </div>
      </div>

      {/* Search + filter bar */}
      <div className="mbr-toolbar">
        <div className="mbr-search">
          <Icon name="search" size={15} />
          <input
            className="mbr-search-input"
            placeholder="Search by name, email, or department…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="mbr-search-clear" onClick={() => setSearch('')}>
              <Icon name="close" size={12} />
            </button>
          )}
        </div>
        <div className="mbr-filters">
          <button className={`mbr-filter-chip ${roleFilter === 'all' ? 'active' : ''}`} onClick={() => setRoleFilter('all')}>
            All <span className="mbr-chip-count">{users.length}</span>
          </button>
          {ROLE_OPTS.slice().reverse().map(r => (
            roleCounts[r.value] > 0 && (
              <button key={r.value} className={`mbr-filter-chip ${roleFilter === r.value ? 'active' : ''}`} onClick={() => setRoleFilter(r.value)}>
                {r.label} <span className="mbr-chip-count">{roleCounts[r.value]}</span>
              </button>
            )
          ))}
        </div>
      </div>

      {/* Members table/list */}
      <div className="card card-pad mbr-table-card">
        {loading && (
          <div className="mbr-skeleton">
            {[1,2,3,4].map(i => <div key={i} className="mbr-skeleton-row" style={{ animationDelay: `${i * 80}ms` }} />)}
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="mbr-empty">
            <TeamIllustration className="mbr-empty-illus" />
            <h3 className="mbr-empty-title">
              {search || roleFilter !== 'all' ? 'No members found' : 'No team members yet'}
            </h3>
            <p className="mbr-empty-sub">
              {search || roleFilter !== 'all'
                ? 'Try adjusting your search or filters.'
                : 'Add your first team member to get started.'}
            </p>
            {isAdmin && !search && roleFilter === 'all' && (
              <button className="btn btn-primary" onClick={openCreate}>
                <Icon name="plus" size={16} />Add first member
              </button>
            )}
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <table className="tbl mbr-tbl">
            <thead>
              <tr>
                <th>Member</th>
                <th>Role</th>
                <th>Site</th>
                <th>Department</th>
                <th>Status</th>
                {isAdmin && <th style={{ textAlign: 'right' }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((u, i) => {
                const isSelf = u.id === user?.id;
                const inactive = !u.is_active;
                const rc = ROLE_COLORS[u.role] || ROLE_COLORS.worker;
                const ac = avatarColor(u.name);
                return (
                  <tr key={u.id} className={`mbr-row ${inactive ? 'mbr-inactive' : ''}`} style={{ animationDelay: `${i * 30}ms` }}>
                    <td>
                      <div className="mbr-member-cell">
                        <div className="mbr-avatar" style={{ background: inactive ? 'var(--sds-bg-surface-alt)' : ac, color: inactive ? 'var(--sds-fg-muted)' : '#fff' }}>
                          {u.initials || '??'}
                        </div>
                        <div className="mbr-member-info">
                          <div className="mbr-member-name">
                            {u.name}
                            {isSelf && <span className="mbr-you-tag">you</span>}
                          </div>
                          <div className="mbr-member-email">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="mbr-role-badge" style={{ background: rc.bg, color: rc.color, borderColor: rc.border }}>
                        {ROLE_LABELS[u.role] || u.role}
                      </span>
                    </td>
                    <td className="mbr-site-cell">{u.site_name || <span className="mbr-dash">—</span>}</td>
                    <td className="mbr-dept-cell">{u.department || <span className="mbr-dash">—</span>}</td>
                    <td>
                      {u.is_active
                        ? <span className="mbr-status-active"><span className="mbr-status-dot" />Active</span>
                        : <span className="mbr-status-inactive">Inactive</span>}
                    </td>
                    {isAdmin && (
                      <td className="mbr-actions-cell">
                        <div className="mbr-actions">
                          <button className="mbr-act-btn" onClick={() => openEdit(u)} title="Edit member">
                            <Icon name="edit" size={14} />
                          </button>
                          {!isSelf && (
                            <>
                              <button className="mbr-act-btn" onClick={() => setPwTarget(u)} title="Reset password">
                                <Icon name="shield" size={14} />
                              </button>
                              <button className={`mbr-act-btn ${u.is_active ? 'mbr-act-danger' : 'mbr-act-success'}`} onClick={() => toggleActive(u)} title={u.is_active ? 'Deactivate' : 'Reactivate'}>
                                <Icon name={u.is_active ? 'close' : 'check'} size={14} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {toast && <div className="toast"><Icon name="check" size={16} />{toast}</div>}

      {modalMode && createPortal(
        <MemberModal
          mode={modalMode}
          member={editTarget}
          sites={sites}
          onClose={closeModal}
          onSaved={() => onSaved(modalMode === 'create' ? 'Member created' : 'Member updated')}
          currentUserId={user?.id}
        />,
        document.body,
      )}

      {pwTarget && createPortal(
        <PasswordResetModal
          member={pwTarget}
          onClose={closePwModal}
          onSaved={onPwSaved}
        />,
        document.body,
      )}

      {importOpen && createPortal(
        <ImportUsersModal
          onClose={() => setImportOpen(false)}
          onImported={(n) => {
            setImportOpen(false);
            flashToast(`Imported ${n} ${n === 1 ? 'user' : 'users'}`);
            refresh();
          }}
        />,
        document.body,
      )}
    </div>
  );
}
