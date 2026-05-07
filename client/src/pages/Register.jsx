import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { Navigate, useNavigate, Link } from 'react-router-dom';
import { getSites } from '../api/auth';
import Icon from '../components/shared/Icon';
import ComboBox from '../components/shared/ComboBox';

const STRENGTH_LEVELS = [
  { label: 'Too short', color: '#94a3b8', pct: 0 },
  { label: 'Weak', color: '#ef4444', pct: 25 },
  { label: 'Fair', color: '#f59e0b', pct: 50 },
  { label: 'Good', color: '#3b82f6', pct: 75 },
  { label: 'Strong', color: '#22c55e', pct: 100 },
];

function getStrength(pw) {
  if (!pw) return 0;
  if (pw.length < 8) return 0;
  let s = 1;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^a-zA-Z0-9]/.test(pw)) s++;
  return s;
}

export default function Register() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [sites, setSites] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [dir, setDir] = useState('fwd');

  const [form, setForm] = useState({
    email: '', password: '', confirm: '',
    name: '', role: 'worker', department: '', job_title: '', site_id: '',
  });

  useEffect(() => { getSites().then(d => setSites(d.sites || [])).catch(() => {}); }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const roleOpts = [{ value: 'worker', label: 'Worker' }, { value: 'supervisor', label: 'Supervisor' }, { value: 'ehs_lead', label: 'EHS Lead' }, { value: 'manager', label: 'Manager' }];
  const siteOpts = useMemo(() => [{ value: '', label: 'Select site…' }, ...sites.map(s => ({ value: String(s.id), label: s.name }))], [sites]);

  if (user) return <Navigate to="/" replace />;
  const strength = getStrength(form.password);
  const sl = STRENGTH_LEVELS[strength];

  const goStep2 = () => {
    setError('');
    if (!form.email || !form.password || !form.confirm) return setError('All fields are required');
    if (form.password.length < 8) return setError('Password must be at least 8 characters');
    if (form.password !== form.confirm) return setError('Passwords do not match');
    setDir('fwd');
    setStep(2);
  };

  const goStep1 = () => { setDir('back'); setStep(1); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) return setError('Full name is required');
    setLoading(true);
    try {
      const { confirm, ...data } = form;
      await register({ ...data, site_id: data.site_id || undefined });
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-brand">
        <div className="auth-brand-content">
          <div className="auth-brand-logo">
            <img src="/assets/sds-mark.svg" alt="SDS Manager" />
          </div>
          <h1 className="auth-brand-title">SDS Manager</h1>
          <p className="auth-brand-sub">EHS Incident Management Platform</p>

          <div className="auth-features">
            <div className="auth-feature">
              <div className="auth-feature-icon"><Icon name="incidents" size={18} /></div>
              <div>
                <div className="auth-feature-title">Incident Tracking</div>
                <div className="auth-feature-desc">Report and manage workplace incidents with severity routing</div>
              </div>
            </div>
            <div className="auth-feature">
              <div className="auth-feature-icon"><Icon name="capa" size={18} /></div>
              <div>
                <div className="auth-feature-title">CAPA Workflow</div>
                <div className="auth-feature-desc">Corrective and preventive actions with verification cycles</div>
              </div>
            </div>
            <div className="auth-feature">
              <div className="auth-feature-icon"><Icon name="clipboard" size={18} /></div>
              <div>
                <div className="auth-feature-title">Inspections</div>
                <div className="auth-feature-desc">Custom templates with conditional logic and scoring</div>
              </div>
            </div>
          </div>

          <div className="auth-brand-footer">
            <span>Trusted by safety teams worldwide</span>
          </div>
        </div>
        <div className="auth-brand-orbs">
          <div className="auth-orb auth-orb-1" />
          <div className="auth-orb auth-orb-2" />
          <div className="auth-orb auth-orb-3" />
        </div>
      </div>

      <div className="auth-form-side">
        <div className="auth-card auth-card-register">
          <div className="auth-card-header">
            <h2>Create your account</h2>
            <p>Join EHS Incident Management</p>
          </div>

          <div className="auth-steps">
            <div className={`auth-step ${step >= 1 ? 'active' : ''} ${step > 1 ? 'done' : ''}`}>
              <span>{step > 1 ? <Icon name="check" size={12} /> : '1'}</span>
              Credentials
            </div>
            <div className="auth-step-line"><div className={`auth-step-fill ${step >= 2 ? 'filled' : ''}`} /></div>
            <div className={`auth-step ${step >= 2 ? 'active' : ''}`}>
              <span>2</span>
              Profile
            </div>
          </div>

          {error && <div className="auth-error"><Icon name="warning" size={14} />{error}</div>}

          <form onSubmit={step === 1 ? (e) => { e.preventDefault(); goStep2(); } : handleSubmit}>
            <div className={`reg-panel ${step === 1 ? 'visible' : 'hidden'} ${dir}`}>
              <div className="auth-field">
                <label>Email address</label>
                <div className="auth-input-wrap">
                  <Icon name="person" size={16} />
                  <input className="auth-input" type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="you@company.com" />
                </div>
              </div>
              <div className="auth-field">
                <label>Password</label>
                <div className="auth-input-wrap">
                  <Icon name="shield" size={16} />
                  <input className="auth-input" type="password" value={form.password} onChange={e => set('password', e.target.value)} placeholder="Min. 8 characters" />
                </div>
                {form.password && (
                  <div className="pw-strength">
                    <div className="pw-bar"><div className="pw-fill" style={{ width: `${sl.pct}%`, background: sl.color }} /></div>
                    <div className="pw-label" style={{ color: sl.color }}>{sl.label}</div>
                  </div>
                )}
              </div>
              <div className="auth-field">
                <label>Confirm password</label>
                <div className="auth-input-wrap">
                  <Icon name="shield" size={16} />
                  <input className="auth-input" type="password" value={form.confirm} onChange={e => set('confirm', e.target.value)} placeholder="Re-enter password" />
                </div>
              </div>
              <button className="btn btn-primary auth-submit" type="submit">
                Continue
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
              </button>
            </div>

            <div className={`reg-panel ${step === 2 ? 'visible' : 'hidden'} ${dir}`}>
              <div className="auth-field">
                <label>Full name <span className="req">*</span></label>
                <div className="auth-input-wrap">
                  <Icon name="person" size={16} />
                  <input className="auth-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="John Smith" />
                </div>
              </div>
              <div className="reg-row">
                <div className="auth-field">
                  <label>Job title</label>
                  <div className="auth-input-wrap">
                    <Icon name="gear" size={16} />
                    <input className="auth-input" value={form.job_title} onChange={e => set('job_title', e.target.value)} placeholder="e.g. EHS Officer" />
                  </div>
                </div>
                <div className="auth-field">
                  <label>Department</label>
                  <div className="auth-input-wrap">
                    <Icon name="factory" size={16} />
                    <input className="auth-input" value={form.department} onChange={e => set('department', e.target.value)} placeholder="e.g. Safety" />
                  </div>
                </div>
              </div>
              <div className="reg-row">
                <div className="auth-field">
                  <label>Role</label>
                  <ComboBox options={roleOpts} value={form.role} onChange={v => set('role', v)} searchable={false} />
                </div>
                <div className="auth-field">
                  <label>Site</label>
                  <ComboBox options={siteOpts} value={form.site_id} onChange={v => set('site_id', v)} placeholder="Search sites…" />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button className="btn btn-secondary" type="button" onClick={goStep1} style={{ padding: '0 20px', gap: 4 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M14 7l-5 5 5 5V7z"/></svg>
                  Back
                </button>
                <button className={`btn btn-primary auth-submit ${loading ? 'auth-loading' : ''}`} type="submit" disabled={loading} style={{ flex: 1 }}>
                  {loading ? <><span className="login-spinner" />Creating...</> : 'Create account'}
                </button>
              </div>
            </div>
          </form>

          <div className="auth-footer">
            Already have an account? <Link to="/login">Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
