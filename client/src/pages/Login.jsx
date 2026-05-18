import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Navigate, useNavigate, Link } from 'react-router-dom';
import Icon from '../components/shared/Icon';

const DEMO = [
  { email: 'priya@sdsmanager.com', label: 'Priya (Admin · COO)',     icon: 'factory' },
  { email: 'sarah@sdsmanager.com', label: 'Sarah (Admin · AU lead)', icon: 'location' },
  { email: 'acme@sdsmanager.com',  label: 'Aisha (Admin · empty)',   icon: 'gear' },
  { email: 'elena@sdsmanager.com', label: 'Elena (EHS Manager)',     icon: 'shield' },
  { email: 'james@sdsmanager.com', label: 'James (EHS Manager)',     icon: 'settings' },
  { email: 'mehta@sdsmanager.com', label: 'Dr. Mehta (EHS Officer)', icon: 'eye' },
  { email: 'marcus@sdsmanager.com', label: 'Marcus (Supervisor)',    icon: 'person' },
  { email: 'wendy@sdsmanager.com', label: 'Wendy (Worker)',          icon: 'pulse' },
];

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [activeDemo, setActiveDemo] = useState(null);
  const [success, setSuccess] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const doLogin = async (creds, demo = null) => {
    setError('');
    setLoading(true);
    if (demo) setActiveDemo(demo);
    try {
      await login(creds.email, creds.password);
      setSuccess(true);
      // Hold the success animation briefly so it lands before navigation
      await new Promise((r) => setTimeout(r, 600));
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
      setLoading(false);
      setActiveDemo(null);
      setSuccess(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    doLogin({ email, password });
  };

  const quickLogin = (d) => {
    const creds = { email: d.email, password: d.pw || 'password123' };
    setEmail(creds.email);
    setPassword(creds.password);
    doLogin(creds, d);
  };

  const demoFirstName = activeDemo ? activeDemo.label.split(' ')[0] : '';

  return (
    <div className="auth-page">
      <div className="auth-brand">
        <div className="auth-brand-content">
          <div className="auth-brand-logo">
            <img src="/assets/sds-mark.svg" alt="SDS Manager" />
          </div>
          <h1 className="auth-brand-title">SDS Manager</h1>
          <p className="auth-brand-sub">Safelync · EHS Incident Management Platform</p>

          <div className="auth-features">
            <div className="auth-feature">
              <div className="auth-feature-icon"><Icon name="shield" size={18} /></div>
              <div>
                <div className="auth-feature-title">Safety First</div>
                <div className="auth-feature-desc">Track incidents, investigations, and corrective actions in one place</div>
              </div>
            </div>
            <div className="auth-feature">
              <div className="auth-feature-icon"><Icon name="reports" size={18} /></div>
              <div>
                <div className="auth-feature-title">Regulatory Ready</div>
                <div className="auth-feature-desc">OSHA 300/300A/301 and RIDDOR reports generated automatically</div>
              </div>
            </div>
            <div className="auth-feature">
              <div className="auth-feature-icon"><Icon name="pulse" size={18} /></div>
              <div>
                <div className="auth-feature-title">Real-time Analytics</div>
                <div className="auth-feature-desc">Live dashboards with TRIR, DART, and custom KPIs</div>
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
        <div className={`auth-card ${loading ? 'auth-card-busy' : ''}`}>
          {loading && (
            <div className={`auth-overlay ${success ? 'is-success' : ''}`} aria-live="polite">
              <div className="auth-overlay-content">
                <svg className="auth-overlay-logo" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" aria-hidden="true">
                  <g fill="#FFC93C">
                    <rect className="logo-diamond logo-d1" x="14" y="14" width="14" height="14" transform="rotate(45 21 21)" />
                    <rect className="logo-diamond logo-d2" x="36" y="18" width="18" height="18" transform="rotate(45 45 27)" />
                    <rect className="logo-diamond logo-d3" x="58" y="14" width="14" height="14" transform="rotate(45 65 21)" />
                    <rect className="logo-diamond logo-d4" x="36" y="40" width="14" height="14" transform="rotate(45 43 47)" />
                  </g>
                  <path className="logo-check" d="M 18 62 L 42 86 L 92 36 L 82 26 L 42 66 L 28 52 Z" fill="#626DF9" />
                </svg>
                <div className="auth-overlay-text">
                  {success
                    ? (activeDemo ? `Welcome, ${demoFirstName}!` : 'Welcome back!')
                    : (activeDemo ? `Signing you in as ${demoFirstName}` : 'Signing you in')}
                </div>
                {!success && (
                  <div className="auth-overlay-dots" aria-hidden="true">
                    <span /><span /><span />
                  </div>
                )}
                {success && (
                  <div className="auth-overlay-check" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="auth-card-header">
            <h2>Welcome back</h2>
            <p>Sign in to your account</p>
          </div>

          {error && <div className="auth-error"><Icon name="warning" size={14} />{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="auth-field">
              <label>Email address</label>
              <div className="auth-input-wrap">
                <Icon name="person" size={16} />
                <input
                  className="auth-input"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                />
              </div>
            </div>
            <div className="auth-field">
              <label>Password</label>
              <div className="auth-input-wrap">
                <Icon name="shield" size={16} />
                <input
                  className="auth-input"
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                />
                <button type="button" className="auth-pw-toggle" onClick={() => setShowPw(v => !v)} aria-label={showPw ? 'Hide password' : 'Show password'}>
                  <Icon name={showPw ? 'eyeOff' : 'eye'} size={16} />
                </button>
              </div>
            </div>

            <button className={`btn btn-primary auth-submit ${loading ? 'auth-loading' : ''}`} type="submit" disabled={loading}>
              {loading ? <><span className="login-spinner" />Signing in...</> : 'Sign in'}
            </button>
          </form>

          <div className="auth-divider"><span>Quick access</span></div>

          <div className="auth-demo-grid">
            {DEMO.map(d => (
              <button
                key={d.email}
                className={`auth-demo-btn ${activeDemo?.email === d.email ? 'is-active' : ''}`}
                onClick={() => quickLogin(d)}
                disabled={loading}
                type="button"
              >
                <Icon name={d.icon} size={14} />
                <span>{d.label}</span>
                {activeDemo?.email === d.email && <span className="auth-demo-spinner" />}
              </button>
            ))}
            <div className="auth-demo-hint">Password: password123</div>
          </div>

          <div className="auth-footer">
            New here? <Link to="/signup">Create your organization</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
