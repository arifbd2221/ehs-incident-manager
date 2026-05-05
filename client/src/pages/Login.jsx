import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('elena@sdsmanager.com');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--sds-bg-page)' }}>
      <div style={{ width: 400, padding: 32, background: '#fff', borderRadius: 12, boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <img src="/assets/sds-mark.svg" alt="SDS Manager" style={{ width: 48, marginBottom: 12 }} />
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>EHS Incident Management</h1>
          <p style={{ fontSize: 13, color: 'var(--sds-fg-secondary)', marginTop: 4 }}>Sign in to continue</p>
        </div>

        {error && <div className="alert alert-err" style={{ marginBottom: 16 }}><div className="body"><div className="desc">{error}</div></div></div>}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Email</label>
            <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} style={{ width: '100%' }} required />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Password</label>
            <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} style={{ width: '100%' }} required />
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <div style={{ marginTop: 20, padding: 12, background: 'var(--sds-bg-surface-alt)', borderRadius: 8, fontSize: 11, color: 'var(--sds-fg-tertiary)' }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Demo accounts:</div>
          <div>elena@sdsmanager.com (EHS Lead)</div>
          <div>marcus@sdsmanager.com (Supervisor)</div>
          <div>james@sdsmanager.com (EHS Manager)</div>
          <div style={{ marginTop: 2 }}>Password: password123</div>
        </div>
      </div>
    </div>
  );
}
