import { useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { Navigate, useNavigate, Link } from 'react-router-dom';
import Icon from '../components/shared/Icon';
import ComboBox from '../components/shared/ComboBox';
import { OrgIllustration, ComplianceIllustration, FounderIllustration, SuccessIllustration } from '../components/shared/OnboardingIllustrations';

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

const COUNTRY_OPTS = [
  { value: '', label: 'Select country…' },
  { value: 'US', label: 'United States' },
  { value: 'UK', label: 'United Kingdom' },
  { value: 'AU', label: 'Australia' },
  { value: 'CA', label: 'Canada' },
  { value: 'IE', label: 'Ireland' },
  { value: 'OTHER', label: 'Other' },
];

const COUNTRY_LABELS = Object.fromEntries(COUNTRY_OPTS.filter(o => o.value).map(o => [o.value, o.label]));

const SECTOR_OPTS = [
  { value: '', label: 'Select sector…' },
  { value: 'Manufacturing', label: 'Manufacturing' },
  { value: 'Construction', label: 'Construction' },
  { value: 'Chemical', label: 'Chemical / Process' },
  { value: 'Healthcare', label: 'Healthcare' },
  { value: 'Logistics', label: 'Logistics / Warehousing' },
  { value: 'Energy', label: 'Energy / Utilities' },
  { value: 'Mining', label: 'Mining' },
  { value: 'Agriculture', label: 'Agriculture' },
  { value: 'Other', label: 'Other' },
];

const SIZE_OPTS = [
  { value: '', label: 'Select size…' },
  { value: '1-10', label: '1–10 employees' },
  { value: '11-50', label: '11–50 employees' },
  { value: '51-200', label: '51–200 employees' },
  { value: '201-1000', label: '201–1,000 employees' },
  { value: '1000+', label: '1,000+ employees' },
];

const FRAMEWORK_GROUPS = [
  {
    region: 'US', label: 'United States', icon: 'shield',
    frameworks: [
      { code: 'osha_300',  label: 'OSHA 300 Log',       sub: 'Recordable injury/illness log' },
      { code: 'osha_300a', label: 'OSHA 300A Summary',  sub: 'Annual summary, posted Feb–Apr' },
      { code: 'osha_301',  label: 'OSHA 301 Report',    sub: 'Per-incident detailed report' },
    ],
  },
  {
    region: 'UK', label: 'United Kingdom', icon: 'shield',
    frameworks: [
      { code: 'riddor_f2508', label: 'RIDDOR F2508', sub: 'HSE notifiable injury/disease form' },
    ],
  },
  {
    region: 'AU', label: 'Australia', icon: 'shield',
    frameworks: [
      { code: 'safework_nsw', label: 'SafeWork NSW', sub: 'NSW WHS Act notifiable incident' },
    ],
  },
  {
    region: 'UNIVERSAL', label: 'Universal', icon: 'leaf',
    frameworks: [
      { code: 'generic', label: 'Generic Report', sub: 'Works anywhere, no jurisdiction required' },
    ],
  },
];

const FRAMEWORK_DEFAULTS = {
  US: ['osha_300', 'osha_300a', 'osha_301'],
  UK: ['riddor_f2508'],
  AU: ['safework_nsw'],
  CA: ['generic'],
  IE: ['generic'],
  OTHER: ['generic'],
};

const STEP_META = [
  { title: 'Your organization', sub: 'Tell us about your company so we can tailor the experience' },
  { title: 'Compliance setup', sub: 'Select the regulatory frameworks you report against' },
  { title: 'Create your account', sub: 'Set up your founder account to get started' },
];

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const SAMPLE_ORGS = ['Apex Industries', 'NovaTech Solutions', 'Greenfield Manufacturing', 'Titan Energy Corp', 'SafeHarbor Logistics', 'Pinnacle Construction'];
const SAMPLE_NAMES = ['Jordan Mitchell', 'Sarah Chen', 'Marcus Rivera', 'Elena Petrova', 'James O\'Brien', 'Priya Sharma'];
const SAMPLE_TITLES = ['EHS Director', 'Safety Manager', 'HSE Lead', 'Compliance Officer', 'Operations Manager', 'Risk Analyst'];
const SAMPLE_DEPTS = ['Safety', 'Operations', 'EHS', 'Compliance', 'Risk Management', 'Engineering'];
function makeSampleForm() {
  const country = pick(['US', 'UK', 'AU', 'CA']);
  const name = pick(SAMPLE_NAMES);
  const slug = name.toLowerCase().replace(/[^a-z]/g, '').slice(0, 8);
  return {
    org_name: pick(SAMPLE_ORGS),
    country,
    industry_sector: pick(SECTOR_OPTS.filter(o => o.value)).value,
    company_size: pick(SIZE_OPTS.filter(o => o.value)).value,
    compliance_frameworks: FRAMEWORK_DEFAULTS[country] || ['generic'],
    naics_code: country === 'US' ? String(311000 + Math.floor(Math.random() * 15000)) : '',
    name,
    job_title: pick(SAMPLE_TITLES),
    department: pick(SAMPLE_DEPTS),
    email: `${slug}@demo.com`,
    password: 'Demo@1234',
    confirm: 'Demo@1234',
  };
}

export default function SignupOrg() {
  const { user, signupOrg } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [dir, setDir] = useState('fwd');
  const [done, setDone] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [form, setForm] = useState({
    org_name: '', country: '', industry_sector: '', company_size: '',
    compliance_frameworks: [], naics_code: '',
    name: '', job_title: '', department: '',
    email: '', password: '', confirm: '',
  });

  const autoFill = () => setForm(makeSampleForm());
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setCountry = (v) => setForm(f => ({
    ...f,
    country: v,
    compliance_frameworks: FRAMEWORK_DEFAULTS[v] || ['generic'],
    naics_code: v === 'US' ? f.naics_code : '',
  }));
  const toggleFramework = (code) => setForm(f => ({
    ...f,
    compliance_frameworks: f.compliance_frameworks.includes(code)
      ? f.compliance_frameworks.filter(c => c !== code)
      : [...f.compliance_frameworks, code],
  }));

  const strength = getStrength(form.password);
  const sl = STRENGTH_LEVELS[strength];
  const recommended = useMemo(() => new Set(FRAMEWORK_DEFAULTS[form.country] || ['generic']), [form.country]);

  if (user) return <Navigate to="/" replace />;

  const goStep2 = () => {
    setError('');
    if (!form.org_name.trim()) return setError('Organization name is required');
    if (!form.country) return setError('Country is required');
    if (!form.industry_sector) return setError('Industry sector is required');
    if (!form.company_size) return setError('Company size is required');
    setDir('fwd');
    setStep(2);
  };

  const goStep3 = () => {
    setError('');
    if (form.compliance_frameworks.length === 0) return setError('Select at least one compliance framework');
    setDir('fwd');
    setStep(3);
  };

  const goBack = (s) => { setError(''); setDir('back'); setStep(s); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) return setError('Full name is required');
    if (!form.email.trim()) return setError('Email is required');
    if (form.password.length < 8) return setError('Password must be at least 8 characters');
    if (form.password !== form.confirm) return setError('Passwords do not match');
    setLoading(true);
    try {
      const { confirm, ...data } = form;
      if (!data.naics_code) delete data.naics_code;
      await signupOrg(data);
      setDone(true);
      setTimeout(() => navigate('/onboarding/site', { replace: true }), 2000);
    } catch (err) {
      setError(err.response?.data?.error || 'Sign-up failed');
    } finally {
      setLoading(false);
    }
  };

  const showNaics = form.country === 'US';

  if (done) {
    return (
      <div className="auth-page">
        <div className="auth-brand">
          <div className="auth-brand-content">
            <div className="auth-brand-logo">
              <img src="/assets/sds-mark.svg" alt="SDS Manager" />
            </div>
            <h1 className="auth-brand-title">SDS Manager</h1>
            <p className="auth-brand-sub">Safelync · EHS Incident Management Platform</p>
          </div>
          <div className="auth-brand-orbs">
            <div className="auth-orb auth-orb-1" />
            <div className="auth-orb auth-orb-2" />
            <div className="auth-orb auth-orb-3" />
          </div>
        </div>
        <div className="auth-form-side">
          <div className="auth-card" style={{ textAlign: 'center' }}>
            <SuccessIllustration className="signup-success-illus" />
            <h2 className="signup-success-title">Welcome aboard!</h2>
            <p className="signup-success-sub">
              <strong>{form.org_name}</strong> is all set. Taking you to your first site setup…
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-brand">
        <div className="auth-brand-content">
          <div className="auth-brand-logo">
            <img src="/assets/sds-mark.svg" alt="SDS Manager" />
          </div>
          <h1 className="auth-brand-title">SDS Manager</h1>
          <p className="auth-brand-sub">Safelync · EHS Incident Management Platform</p>

          {/* Contextual illustration that changes per step */}
          <div className="signup-brand-illus">
            {step === 1 && <OrgIllustration className="signup-illus" />}
            {step === 2 && <ComplianceIllustration className="signup-illus" />}
            {step === 3 && <FounderIllustration className="signup-illus" />}
          </div>

          {/* Step context — shows what user selected in previous steps */}
          {step >= 2 && form.org_name && (
            <div className="signup-context">
              <div className="signup-context-item">
                <Icon name="factory" size={12} />
                <span>{form.org_name}</span>
              </div>
              {form.country && (
                <div className="signup-context-item">
                  <Icon name="location" size={12} />
                  <span>{COUNTRY_LABELS[form.country] || form.country}</span>
                </div>
              )}
              {step >= 3 && form.compliance_frameworks.length > 0 && (
                <div className="signup-context-item">
                  <Icon name="shield" size={12} />
                  <span>{form.compliance_frameworks.length} framework{form.compliance_frameworks.length > 1 ? 's' : ''}</span>
                </div>
              )}
            </div>
          )}

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
            <h2>{STEP_META[step - 1].title}</h2>
            <p>{STEP_META[step - 1].sub}</p>
          </div>

          <div className="auth-steps">
            <div className={`auth-step ${step >= 1 ? 'active' : ''} ${step > 1 ? 'done' : ''}`}>
              <span>{step > 1 ? <Icon name="check" size={12} /> : '1'}</span>
              Organization
            </div>
            <div className="auth-step-line"><div className={`auth-step-fill ${step >= 2 ? 'filled' : ''}`} /></div>
            <div className={`auth-step ${step >= 2 ? 'active' : ''} ${step > 2 ? 'done' : ''}`}>
              <span>{step > 2 ? <Icon name="check" size={12} /> : '2'}</span>
              Compliance
            </div>
            <div className="auth-step-line"><div className={`auth-step-fill ${step >= 3 ? 'filled' : ''}`} /></div>
            <div className={`auth-step ${step >= 3 ? 'active' : ''}`}>
              <span>3</span>
              Founder
            </div>
          </div>

          {error && <div className="auth-error" role="alert"><Icon name="warning" size={14} />{error}</div>}

          <form onSubmit={step === 3 ? handleSubmit : (e) => { e.preventDefault(); step === 1 ? goStep2() : goStep3(); }}>
            {/* Step 1: Organization */}
            <div className={`reg-panel ${step === 1 ? 'visible' : 'hidden'} ${dir}`}>
              <div className="auth-field">
                <label>Organization name <span className="req">*</span></label>
                <div className="auth-input-wrap">
                  <Icon name="factory" size={16} />
                  <input className="auth-input" value={form.org_name} onChange={e => set('org_name', e.target.value)} placeholder="e.g. Acme Manufacturing" autoFocus />
                </div>
              </div>
              <div className="reg-row">
                <div className="auth-field">
                  <label>Country <span className="req">*</span></label>
                  <ComboBox options={COUNTRY_OPTS} value={form.country} onChange={setCountry} searchable={false} />
                </div>
                <div className="auth-field">
                  <label>Company size <span className="req">*</span></label>
                  <ComboBox options={SIZE_OPTS} value={form.company_size} onChange={v => set('company_size', v)} searchable={false} />
                </div>
              </div>
              <div className="auth-field">
                <label>Industry sector <span className="req">*</span></label>
                <ComboBox options={SECTOR_OPTS} value={form.industry_sector} onChange={v => set('industry_sector', v)} searchable={false} />
              </div>
              <button className="btn btn-primary auth-submit" type="submit">
                Continue
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
              </button>
            </div>

            {/* Step 2: Compliance — grouped chip multi-select */}
            <div className={`reg-panel ${step === 2 ? 'visible' : 'hidden'} ${dir}`}>
              <div className="auth-field">
                <label>Compliance frameworks <span className="req">*</span></label>
                <div className="signup-fw-hint">
                  Select every framework you report against. Recommended ones are pre-selected based on your country.
                </div>
                {(() => {
                  let gi = 0;
                  return FRAMEWORK_GROUPS.map((group) => (
                    <div key={group.region} className="signup-fw-group">
                      <div className="signup-fw-group-hdr">
                        <Icon name={group.icon} size={13} />
                        <span>{group.label}</span>
                      </div>
                      <div className="signup-fw-chips">
                        {group.frameworks.map((fw) => {
                          const checked = form.compliance_frameworks.includes(fw.code);
                          const isRec = recommended.has(fw.code);
                          const idx = gi++;
                          return (
                            <button
                              key={fw.code}
                              type="button"
                              className={`signup-fw-chip${checked ? ' checked' : ''}`}
                              onClick={() => toggleFramework(fw.code)}
                              title={fw.sub}
                              style={{ animationDelay: `${idx * 30}ms` }}
                            >
                              {checked && <span className="signup-fw-chip-check"><Icon name="check" size={10} /></span>}
                              <span className="signup-fw-chip-label">{fw.label}</span>
                              {isRec && <span className="signup-fw-chip-rec">REC</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ));
                })()}

                <div className="signup-fw-selected">
                  <span className="signup-fw-selected-count">{form.compliance_frameworks.length}</span> selected
                </div>
              </div>
              {showNaics && (
                <div className="auth-field">
                  <label>NAICS code <span style={{ color: 'var(--sds-fg-tertiary)', fontWeight: 400 }}>(optional)</span></label>
                  <div className="auth-input-wrap">
                    <Icon name="info" size={16} />
                    <input className="auth-input" value={form.naics_code} onChange={e => set('naics_code', e.target.value)} placeholder="e.g. 325199" />
                  </div>
                </div>
              )}
              <div className="signup-nav-row">
                <button className="btn btn-secondary" type="button" onClick={() => goBack(1)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M14 7l-5 5 5 5V7z"/></svg>
                  Back
                </button>
                <button className="btn btn-primary auth-submit" type="submit" style={{ flex: 1 }}>
                  Continue
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
                </button>
              </div>
            </div>

            {/* Step 3: Founder account */}
            <div className={`reg-panel ${step === 3 ? 'visible' : 'hidden'} ${dir}`}>
              <div className="auth-field">
                <label>Full name <span className="req">*</span></label>
                <div className="auth-input-wrap">
                  <Icon name="person" size={16} />
                  <input className="auth-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Jane Smith" />
                </div>
              </div>
              <div className="reg-row">
                <div className="auth-field">
                  <label>Job title</label>
                  <div className="auth-input-wrap">
                    <Icon name="gear" size={16} />
                    <input className="auth-input" value={form.job_title} onChange={e => set('job_title', e.target.value)} placeholder="e.g. EHS Director" />
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
              <div className="auth-field">
                <label>Email <span className="req">*</span></label>
                <div className="auth-input-wrap">
                  <Icon name="person" size={16} />
                  <input className="auth-input" type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="you@company.com" autoComplete="email" />
                </div>
              </div>
              <div className="auth-field">
                <label>Password <span className="req">*</span></label>
                <div className="auth-input-wrap">
                  <Icon name="shield" size={16} />
                  <input className="auth-input" type={showPw ? 'text' : 'password'} value={form.password} onChange={e => set('password', e.target.value)} placeholder="Min. 8 characters" autoComplete="new-password" />
                  <button type="button" className="auth-pw-toggle" onClick={() => setShowPw(v => !v)} aria-label={showPw ? 'Hide password' : 'Show password'}>
                    <Icon name={showPw ? 'eyeOff' : 'eye'} size={16} />
                  </button>
                </div>
                {form.password && (
                  <div className="pw-strength">
                    <div className="pw-bar"><div className="pw-fill" style={{ width: `${sl.pct}%`, background: sl.color }} /></div>
                    <div className="pw-label" style={{ color: sl.color }}>{sl.label}</div>
                  </div>
                )}
              </div>
              <div className="auth-field">
                <label>Confirm password <span className="req">*</span></label>
                <div className="auth-input-wrap">
                  <Icon name="shield" size={16} />
                  <input className="auth-input" type={showConfirm ? 'text' : 'password'} value={form.confirm} onChange={e => set('confirm', e.target.value)} placeholder="Re-enter password" autoComplete="new-password" />
                  <button type="button" className="auth-pw-toggle" onClick={() => setShowConfirm(v => !v)} aria-label={showConfirm ? 'Hide password' : 'Show password'}>
                    <Icon name={showConfirm ? 'eyeOff' : 'eye'} size={16} />
                  </button>
                </div>
                {form.confirm && form.password && (
                  <div className="signup-pw-match">
                    {form.password === form.confirm
                      ? <><Icon name="check" size={12} color="#22c55e" /> Passwords match</>
                      : <><Icon name="warning" size={12} color="#ef4444" /> Passwords don't match</>
                    }
                  </div>
                )}
              </div>
              <div className="signup-nav-row">
                <button className="btn btn-secondary" type="button" onClick={() => goBack(2)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M14 7l-5 5 5 5V7z"/></svg>
                  Back
                </button>
                <button className={`btn btn-primary auth-submit ${loading ? 'auth-loading' : ''}`} type="submit" disabled={loading} style={{ flex: 1 }}>
                  {loading ? <><span className="login-spinner" />Creating…</> : 'Create organization'}
                </button>
              </div>
            </div>
          </form>

          <div className="auth-footer">
            Already have an organization? <Link to="/login">Sign in</Link>
          </div>
        </div>
      </div>

      <button type="button" className="autofill-fab" onClick={autoFill} title="Auto-fill with sample data">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
        </svg>
        Auto-fill
      </button>
    </div>
  );
}
