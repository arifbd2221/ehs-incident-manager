import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Navigate, useNavigate, Link } from 'react-router-dom';
import Icon from '../components/shared/Icon';

const DEMO = [
  { email: 'priya@sdsmanager.com', label: 'Priya (Admin)', icon: 'gear' },
  { email: 'elena@sdsmanager.com', label: 'Elena (EHS Lead)', icon: 'shield' },
  { email: 'marcus@sdsmanager.com', label: 'Marcus (Supervisor)', icon: 'person' },
  { email: 'james@sdsmanager.com', label: 'James (EHS Manager)', icon: 'settings' },
  { email: 'wendy@sdsmanager.com', label: 'Wendy (Worker)', icon: 'pulse' },
];

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const quickLogin = (demoEmail) => {
    setEmail(demoEmail);
    setPassword('password123');
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
        <div className="auth-card">
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
                <button type="button" className="auth-pw-toggle" onClick={() => setShowPw(v => !v)}>
                  <Icon name="eye" size={16} />
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
              <button key={d.email} className="auth-demo-btn" onClick={() => quickLogin(d.email)}>
                <Icon name={d.icon} size={14} />
                <span>{d.label}</span>
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
