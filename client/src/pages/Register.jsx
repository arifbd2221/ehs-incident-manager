import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Navigate, useNavigate, Link } from 'react-router-dom';
import { getSites } from '../api/auth';

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

  if (user) return <Navigate to="/" replace />;
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
    <div className="login-page">
      <div className="login-card reg-card">
        <div className="login-logo">
          <img src="/assets/sds-mark.svg" alt="SDS Manager" />
          <h1>Create your account</h1>
          <p>Join EHS Incident Management</p>
        </div>

        <div className="reg-steps">
          <div className={`reg-step ${step >= 1 ? 'active' : ''}`}><span>1</span>Credentials</div>
          <div className="reg-step-line"><div className={`reg-step-fill ${step >= 2 ? 'filled' : ''}`} /></div>
          <div className={`reg-step ${step >= 2 ? 'active' : ''}`}><span>2</span>Profile</div>
        </div>

        {error && <div className="login-error">{error}</div>}

        <form onSubmit={step === 1 ? (e) => { e.preventDefault(); goStep2(); } : handleSubmit}>
          <div className={`reg-panel ${step === 1 ? 'visible' : 'hidden'} ${dir}`}>
            <div className="login-field">
              <label>Email address</label>
              <input className="input" type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="you@company.com" />
            </div>
            <div className="login-field">
              <label>Password</label>
              <input className="input" type="password" value={form.password} onChange={e => set('password', e.target.value)} placeholder="Min. 8 characters" />
              {form.password && (
                <div className="pw-strength">
                  <div className="pw-bar"><div className="pw-fill" style={{ width: `${sl.pct}%`, background: sl.color }} /></div>
                  <div className="pw-label" style={{ color: sl.color }}>{sl.label}</div>
                </div>
              )}
            </div>
            <div className="login-field" style={{ marginBottom: 20 }}>
              <label>Confirm password</label>
              <input className="input" type="password" value={form.confirm} onChange={e => set('confirm', e.target.value)} placeholder="Re-enter password" />
            </div>
            <button className="btn btn-primary login-btn" type="submit">
              Continue
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
            </button>
          </div>

          <div className={`reg-panel ${step === 2 ? 'visible' : 'hidden'} ${dir}`}>
            <div className="login-field">
              <label>Full name <span className="req">*</span></label>
              <input className="input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="John Smith" />
            </div>
            <div className="reg-row">
              <div className="login-field">
                <label>Job title</label>
                <input className="input" value={form.job_title} onChange={e => set('job_title', e.target.value)} placeholder="e.g. EHS Officer" />
              </div>
              <div className="login-field">
                <label>Department</label>
                <input className="input" value={form.department} onChange={e => set('department', e.target.value)} placeholder="e.g. Safety" />
              </div>
            </div>
            <div className="reg-row">
              <div className="login-field">
                <label>Role</label>
                <select className="input" value={form.role} onChange={e => set('role', e.target.value)}>
                  <option value="worker">Worker</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="ehs_lead">EHS Lead</option>
                  <option value="manager">Manager</option>
                </select>
              </div>
              <div className="login-field">
                <label>Site</label>
                <select className="input" value={form.site_id} onChange={e => set('site_id', e.target.value)}>
                  <option value="">Select site...</option>
                  {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button className="btn btn-secondary login-btn" type="button" onClick={goStep1} style={{ flex: '0 0 auto', width: 'auto', padding: '0 20px' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M14 7l-5 5 5 5V7z"/></svg>
                Back
              </button>
              <button className={`btn btn-primary login-btn ${loading ? 'login-loading' : ''}`} type="submit" disabled={loading}>
                {loading ? <><span className="login-spinner" />Creating...</> : 'Create account'}
              </button>
            </div>
          </div>
        </form>

        <div className="reg-footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </div>
      </div>
    </div>
  );
}
