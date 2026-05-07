import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { createSite } from '../api/sites';
import Icon from '../components/shared/Icon';

export default function OnboardingFirstSite() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: '',
    address: '',
    country: user?.country || 'US',
    naics_code: user?.naics_code || '',
    annual_avg_employees: '',
    total_hours_worked: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) return setError('Site name is required');
    setSaving(true);
    try {
      await createSite({
        ...form,
        annual_avg_employees: Number(form.annual_avg_employees) || 0,
        total_hours_worked: Number(form.total_hours_worked) || 0,
      });
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create site');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <div className="card card-pad" style={{ maxWidth: 720, margin: '0 auto' }}>
        <div className="card-h">
          <Icon name="factory" size={20} color="var(--sds-brand-primary)" />
          <span>Welcome, {user?.name?.split(' ')[0] || 'there'}!</span>
        </div>
        <p style={{ color: 'var(--sds-fg-secondary)', marginTop: 'var(--sds-space-xs)', marginBottom: 'var(--sds-space-lg)' }}>
          Let's set up <strong>{user?.org_name || 'your organization'}</strong>'s first site.
          Sites are physical locations where incidents, assets, and people live —
          you can add more later from the <em>Sites</em> admin.
        </p>

        {error && <div className="auth-error" style={{ marginBottom: 'var(--sds-space-md)' }}><Icon name="warning" size={14} />{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label className="label">Site name <span className="req">*</span></label>
            <input className="input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Cleveland Plant" />
          </div>

          <div className="field">
            <label className="label">Address</label>
            <input className="input" value={form.address} onChange={e => set('address', e.target.value)} placeholder="Street, city, state, ZIP" />
          </div>

          <div className="field-row">
            <div className="field">
              <label className="label">Country</label>
              <input className="input" value={form.country} onChange={e => set('country', e.target.value)} placeholder="US, UK, AU…" />
            </div>
            <div className="field">
              <label className="label">NAICS code</label>
              <input className="input" value={form.naics_code} onChange={e => set('naics_code', e.target.value)} placeholder="e.g. 325199" />
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label className="label">Annual avg. employees</label>
              <input className="input" type="number" min="0" value={form.annual_avg_employees} onChange={e => set('annual_avg_employees', e.target.value)} placeholder="0" />
            </div>
            <div className="field">
              <label className="label">Total hours worked / year</label>
              <input className="input" type="number" min="0" value={form.total_hours_worked} onChange={e => set('total_hours_worked', e.target.value)} placeholder="0" />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 'var(--sds-space-sm)', marginTop: 'var(--sds-space-lg)', alignItems: 'center' }}>
            <Link to="/" className="btn btn-text">Skip for now</Link>
            <div style={{ flex: 1 }} />
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? 'Creating…' : 'Create site & continue'}
              <Icon name="arrow" size={14} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
