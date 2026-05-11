import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { createSite, listSites } from '../api/sites';
import Icon from '../components/shared/Icon';
import ComboBox from '../components/shared/ComboBox';
import { SiteIllustration, SuccessIllustration } from '../components/shared/OnboardingIllustrations';

const COUNTRY_OPTS = [
  { value: 'US', label: 'United States' },
  { value: 'UK', label: 'United Kingdom' },
  { value: 'AU', label: 'Australia' },
  { value: 'CA', label: 'Canada' },
  { value: 'IE', label: 'Ireland' },
  { value: 'OTHER', label: 'Other' },
];

export default function OnboardingFirstSite() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [redirecting, setRedirecting] = useState(true);

  useEffect(() => {
    listSites()
      .then(sites => {
        if (Array.isArray(sites) && sites.length > 0) {
          navigate('/admin/sites', { replace: true });
        } else {
          setRedirecting(false);
        }
      })
      .catch(() => setRedirecting(false));
  }, [navigate]);

  const [form, setForm] = useState({
    name: '',
    address: '',
    country: user?.country || 'US',
    naics_code: user?.naics_code || '',
    annual_avg_employees: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

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
      });
      setDone(true);
      setTimeout(() => navigate('/', { replace: true }), 2200);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create site');
    } finally {
      setSaving(false);
    }
  };

  if (redirecting) {
    return (
      <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div className="onb-loading">
          <span className="login-spinner" style={{ width: 20, height: 20 }} />
          <span>Checking your setup…</span>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="page onb-page">
        <div className="onb-card onb-done-card">
          <SuccessIllustration className="onb-done-illus" />
          <h2 className="onb-done-title">You're all set!</h2>
          <p className="onb-done-sub">
            <strong>{form.name}</strong> has been created. Taking you to your dashboard…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page onb-page">
      <div className="onb-card">
        {/* Progress indicator */}
        <div className="onb-progress">
          <div className="onb-progress-step done">
            <span className="onb-progress-dot"><Icon name="check" size={10} /></span>
            Organization
          </div>
          <div className="onb-progress-line" />
          <div className="onb-progress-step active">
            <span className="onb-progress-dot">2</span>
            First site
          </div>
        </div>

        {/* Hero section */}
        <div className="onb-hero">
          <SiteIllustration className="onb-illus" />
          <div className="onb-hero-text">
            <h1 className="onb-title">Welcome, {user?.name?.split(' ')[0] || 'there'}!</h1>
            <p className="onb-subtitle">
              Let's set up <strong>{user?.org_name || 'your organization'}</strong>'s first site.
              Sites are physical locations where incidents, assets, and people live.
            </p>
          </div>
        </div>

        {error && <div className="auth-error" role="alert" style={{ marginBottom: 'var(--sds-space-md)' }}><Icon name="warning" size={14} />{error}</div>}

        <form onSubmit={handleSubmit} className="onb-form">
          <div className="field">
            <label className="label">Site name <span className="req">*</span></label>
            <input className="input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Cleveland Plant" autoFocus />
          </div>

          <div className="field">
            <label className="label">Address</label>
            <input className="input" value={form.address} onChange={e => set('address', e.target.value)} placeholder="Street, city, state, ZIP" />
          </div>

          <div className="field-row">
            <div className="field">
              <label className="label">Country</label>
              <ComboBox options={COUNTRY_OPTS} value={form.country} onChange={v => set('country', v)} searchable={false} />
            </div>
            <div className="field">
              <label className="label">NAICS code</label>
              <input className="input" value={form.naics_code} onChange={e => set('naics_code', e.target.value)} placeholder="e.g. 325199" />
            </div>
          </div>

          <div className="field">
            <label className="label">Annual avg. employees</label>
            <input className="input" type="number" min="0" value={form.annual_avg_employees} onChange={e => set('annual_avg_employees', e.target.value)} placeholder="0" />
            <span className="helper">You can add work-hour periods (OSHA TRIR/DART denominator) on the site detail page after onboarding.</span>
          </div>

          <div className="onb-actions">
            <Link to="/" className="btn btn-text">Skip for now</Link>
            <div style={{ flex: 1 }} />
            <button className={`btn btn-primary ${saving ? 'auth-loading' : ''}`} type="submit" disabled={saving}>
              {saving ? <><span className="login-spinner" />Creating…</> : <><span>Create site & continue</span><Icon name="arrow" size={14} /></>}
            </button>
          </div>
        </form>

        <div className="onb-hint">
          <Icon name="info" size={13} />
          You can add more sites later from the <em>Sites</em> admin page.
        </div>
      </div>
    </div>
  );
}
