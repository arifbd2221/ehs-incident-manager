import { useAuth } from '../context/AuthContext';
import { Navigate, Link } from 'react-router-dom';
import Icon from '../components/shared/Icon';

// Public registration is closed. New users come from org sign-up (this slice)
// or invitations (slice 2). This page exists so existing /register links still
// resolve, with two clear next steps for the visitor.
export default function Register() {
  const { user } = useAuth();
  if (user) return <Navigate to="/" replace />;

  return (
    <div className="auth-page">
      <div className="auth-brand">
        <div className="auth-brand-content">
          <div className="auth-brand-logo">
            <img src="/assets/sds-mark.svg" alt="SDS Manager" />
          </div>
          <h1 className="auth-brand-title">Safelync</h1>
          <p className="auth-brand-sub">by SDS Manager</p>

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
              <div className="auth-feature-icon"><Icon name="reports" size={18} /></div>
              <div>
                <div className="auth-feature-title">Regulator Ready</div>
                <div className="auth-feature-desc">OSHA, RIDDOR, and Safe Work Australia reports built-in</div>
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
            <h2>Joining an existing organization?</h2>
            <p>Ask your administrator to send you an invite</p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sds-space-md)', marginTop: 'var(--sds-space-md)' }}>
            <Link to="/signup" className="btn btn-primary auth-submit">
              <Icon name="plus" size={16} />Create a new organization
            </Link>
            <Link to="/login" className="btn btn-secondary auth-submit">
              <Icon name="person" size={16} />Sign in to your account
            </Link>
          </div>

          <div className="auth-footer">
            Self-serve registration is invite-only. Contact your EHS admin if you need access.
          </div>
        </div>
      </div>
    </div>
  );
}
