import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../context/AuthContext';
import { getUsers, getSites, createUser, updateUser, resetUserPassword } from '../../api/users';
import Icon from '../../components/shared/Icon';
import ComboBox from '../../components/shared/ComboBox';

const ROLE_OPTS = [
  { value: 'worker', label: 'Worker' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'ehs_officer', label: 'EHS Officer' },
  { value: 'ehs_manager', label: 'EHS Manager' },
  { value: 'admin', label: 'Admin' },
];

const ROLE_LABELS = Object.fromEntries(ROLE_OPTS.map(r => [r.value, r.label]));

function rolePillClass(role) {
  if (role === 'admin') return 'pill pill-purple';
  if (role === 'ehs_manager' || role === 'ehs_officer') return 'pill pill-info';
  return 'pill pill-gray';
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
          {error && <div className="auth-error"><Icon name="warning" size={14} />{error}</div>}

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
          {error && <div className="auth-error"><Icon name="warning" size={14} />{error}</div>}
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

export default function Members() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [users, setUsers] = useState([]);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalMode, setModalMode] = useState(null);    // 'create' | 'edit' | null
  const [editTarget, setEditTarget] = useState(null);
  const [pwTarget, setPwTarget] = useState(null);
  const [toast, setToast] = useState('');

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

  const activeCount = users.filter(u => u.is_active).length;

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--sds-space-lg)' }}>
        <div>
          <h1 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 'var(--sds-space-sm)' }}>
            <Icon name="person" size={26} />Members
          </h1>
          <p style={{ margin: 'var(--sds-space-xs) 0 0', color: 'var(--sds-fg-secondary)' }}>
            {activeCount} active {activeCount === 1 ? 'member' : 'members'} in {user?.org_name || 'your organization'}
            {users.length > activeCount ? ` · ${users.length - activeCount} inactive` : ''}
          </p>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={openCreate}>
            <Icon name="plus" size={16} />Add member
          </button>
        )}
      </div>

      {toast && <div className="toast"><Icon name="check" size={16} />{toast}</div>}

      <div className="card card-pad">
        {loading && <div style={{ padding: 'var(--sds-space-lg)', textAlign: 'center', color: 'var(--sds-fg-tertiary)' }}>Loading…</div>}
        {!loading && users.length === 0 && (
          <div style={{ padding: 'var(--sds-space-lg)', textAlign: 'center', color: 'var(--sds-fg-tertiary)' }}>
            No members yet.
          </div>
        )}
        {!loading && users.length > 0 && (
          <table className="tbl">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Site</th>
                <th>Department</th>
                <th>Status</th>
                {isAdmin && <th style={{ textAlign: 'right' }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {users.map(u => {
                const isSelf = u.id === user?.id;
                const inactive = !u.is_active;
                return (
                  <tr key={u.id} style={inactive ? { opacity: 0.55 } : null}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sds-space-sm)' }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: '50%',
                          background: 'var(--sds-brand-primary-tint)',
                          color: 'var(--sds-brand-primary)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontWeight: 600, fontSize: 12, flexShrink: 0,
                        }}>{u.initials || '??'}</div>
                        <div>
                          <div style={{ fontWeight: 600 }}>
                            {u.name}
                            {isSelf && <span style={{ marginLeft: 'var(--sds-space-xs)', fontSize: 11, color: 'var(--sds-fg-tertiary)', fontWeight: 400 }}>(you)</span>}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--sds-fg-tertiary)' }}>{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td><span className={rolePillClass(u.role)}>{ROLE_LABELS[u.role] || u.role}</span></td>
                    <td>{u.site_name || <span style={{ color: 'var(--sds-fg-tertiary)' }}>—</span>}</td>
                    <td>{u.department || <span style={{ color: 'var(--sds-fg-tertiary)' }}>—</span>}</td>
                    <td>
                      {u.is_active
                        ? <span className="pill pill-success"><span className="dot" />Active</span>
                        : <span className="pill pill-gray">Inactive</span>}
                    </td>
                    {isAdmin && (
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button className="btn btn-tertiary btn-sm" onClick={() => openEdit(u)}>
                          <Icon name="edit" size={14} />Edit
                        </button>
                        {!isSelf && (
                          <>
                            <button className="btn btn-tertiary btn-sm" onClick={() => setPwTarget(u)}>
                              <Icon name="shield" size={14} />Reset PW
                            </button>
                            <button className="btn btn-tertiary btn-sm" onClick={() => toggleActive(u)}>
                              {u.is_active ? 'Deactivate' : 'Reactivate'}
                            </button>
                          </>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

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
    </div>
  );
}
