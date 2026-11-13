import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { API, getUser, saveUser } from '../../api';
import useUser from '../../hooks/useUser';
import heroIcon from '../../assets/juancast_icon.webp';
import './Login.css';
import { resetStartupAd } from '../../startupAdGate';
import pkg from '../../../package.json';

const REMEMBER_KEY = 'juancast_remembered_email';

const EyeIcon = ({ off }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
    <circle cx="12" cy="12" r="3" />
    {off && <path d="M3 3l18 18" />}
  </svg>
);

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useUser();

  // where to go afterwards: the page that sent you here (e.g. the Market), otherwise Home
  const back = typeof location.state?.from === 'string' ? location.state.from : '/';

  const [email, setEmail] = useState(() => localStorage.getItem(REMEMBER_KEY) || '');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(() => Boolean(localStorage.getItem(REMEMBER_KEY)));
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingDeletion, setPendingDeletion] = useState(null); // date this account will be deleted, when it is waiting for deletion

  // already signed in: nothing to do here (skipped right after a login, which navigates itself)
  if (user?.email && !loading) return <Navigate to={back} replace />;

  // restore = true: the person chose to keep an account that was waiting to be deleted
  const doLogin = async (restore = false) => {
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${API}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, ...(restore ? { restore: true } : {}) })
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.code === 'PENDING_DELETION') {
          setPendingDeletion(data.deletionAt);
          setLoading(false);
          return;
        }
        setError(data.message || data.error || 'Login failed.');
        setLoading(false);
        return;
      }

      const isAdmin = Boolean(data.user?.isAdmin || data.user?.role === 'groupadmin' || data.user?.role === 'systemadmin' || data.user?.role === 'admin' || data.user?.role === 'superadmin');
      saveUser({ ...data.user, isAdmin, role: data.user?.role || (isAdmin ? 'groupadmin' : 'user'), loginAt: Date.now() });

      // only the email is remembered, never the password
      if (rememberMe) localStorage.setItem(REMEMBER_KEY, email);
      else localStorage.removeItem(REMEMBER_KEY);

      // show the startup popup ad again for this login (it comes before the daily check-in)
      resetStartupAd();

      // ask the navbar to pop the daily check-in once (admins skip it)
      if (!isAdmin) { try { sessionStorage.setItem('juancast_daily_prompt', '1'); } catch { /* ignore */ } }

      // admins only have the dashboard; everyone else goes back to where they were
      navigate(isAdmin ? '/admin' : back, { replace: true });
    } catch {
      setError('Could not connect to the server.');
      setLoading(false);
    }
  };
  const handleLogin = (e) => { e.preventDefault(); doLogin(false); };

  return (
    <main className="login-page">
      <div className="login-card rise">
        <div className="login-art">
          <img src={heroIcon} alt="JuanCast" />
        </div>

        <div className="login-body">
          {pendingDeletion ? (
            <>
              <h1 className="login-title">Account Scheduled for Deletion</h1>
              <p className="login-sub">
                This account will be permanently deleted on{' '}
                <b>{new Date(pendingDeletion).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</b>.
                Restore it to keep your profile, followers and posts.
              </p>
              <button type="button" className="login-btn" disabled={loading} onClick={() => doLogin(true)}>
                {loading ? 'Restoring...' : 'Restore my account'}
              </button>
              <p className="login-error" role="alert">{error}</p>
              <p className="login-signup">
                <button type="button" className="login-link" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', font: 'inherit' }} onClick={() => { setPendingDeletion(null); setPassword(''); }}>Not now</button>
              </p>
            </>
          ) : (
          <>
          <h1 className="login-title">Account Login</h1>
          <p className="login-sub">Welcome back. Sign in to vote, spin and climb the rankings.</p>

          <form className="login-form" onSubmit={handleLogin}>
            <label className="login-field">
              <span>Email</span>
              <input
                type="email"
                placeholder="jack.roberto@gmail.com"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>

            <label className="login-field">
              <span>Password</span>
              <div className="login-pass">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="login-eye"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword((s) => !s)}
                >
                  <EyeIcon off={showPassword} />
                </button>
              </div>
            </label>

            <div className="login-row">
              <label className="login-remember">
                <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
                Remember me
              </label>
              <Link to="/forgot-password" className="login-link">Forgot password?</Link>
            </div>

            <p className="login-error" role="alert">{error}</p>

            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? 'Logging in...' : 'Login'}
            </button>
          </form>

          <p className="login-signup">
            Don't have an account? <Link to="/signup" className="login-link">Sign Up!</Link>
          </p>
          </>
          )}

          <footer className="login-meta">
            <span>Data Privacy | <Link to="/settings/terms" className="login-link">Learn More</Link></span>
            <span>Version {pkg.version}</span>
          </footer>
        </div>
      </div>
    </main>
  );
}
