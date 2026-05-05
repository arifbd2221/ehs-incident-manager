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
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <img src="/assets/sds-mark.svg" alt="SDS Manager" />
          <h1>EHS Incident Management</h1>
          <p>Sign in to continue</p>
        </div>

        {error && <div className="login-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="login-field">
            <label>Email</label>
            <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div className="login-field" style={{ marginBottom: 20 }}>
            <label>Password</label>
            <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
          </div>
          <button className={`btn btn-primary login-btn ${loading ? 'login-loading' : ''}`} type="submit" disabled={loading}>
            {loading ? (
              <>
                <span className="login-spinner" />
                Signing in...
              </>
            ) : 'Sign in'}
          </button>
        </form>

        <div className="login-demo">
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
