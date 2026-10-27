import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { API } from '../../api';
import heroIcon from '../../assets/juancast_icon.webp';
import '../Login/Login.css';
import './ForgotPassword.css';

// Two modes in one page:
//   /forgot-password            -> ask for a reset link by email
//   /forgot-password?token=...  -> the link from that email: choose a new password
export default function ForgotPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const post = async (path, payload, fallback) => {
    const res = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || fallback);
    return data;
  };

  const run = async (task) => {
    setMessage(''); setError(''); setBusy(true);
    try { await task(); }
    catch (err) { setError(err instanceof TypeError ? 'Could not connect to the server.' : err.message); }
    finally { setBusy(false); }
  };

  const requestLink = (e) => {
    e.preventDefault();
    run(async () => {
      const data = await post('/api/forgot-password', { email: email.trim() }, 'Could not request a password reset.');
      setMessage(data.message || 'A password reset link has been sent.');
    });
  };

  const resetPassword = (e) => {
    e.preventDefault();
    if (password !== confirm) { setMessage(''); setError('Passwords do not match.'); return; }
    run(async () => {
      const data = await post('/api/reset-password', { token, password }, 'Could not reset the password.');
      setMessage(data.message || 'Your password has been updated.');
      setDone(true);
    });
  };

  return (
    <main className="login-page">
      <div className="login-card rise">
        <div className="login-art"><img src={heroIcon} alt="JuanCast" /></div>

        <div className="login-body">
          <h1 className="login-title">{token ? 'Choose a New Password' : 'Forgot Password?'}</h1>

          {token && done ? (
            <>
              <p className="fp-ok" role="status">{message}</p>
              <Link to="/login" className="login-btn fp-btn">Back to Login</Link>
            </>
          ) : token ? (
            <form className="login-form" onSubmit={resetPassword}>
              <p className="login-sub">Choose a new password with at least 8 characters.</p>
              <label className="login-field">
                <span>New password</span>
                <input type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
              </label>
              <label className="login-field">
                <span>Confirm new password</span>
                <input type="password" autoComplete="new-password" minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
              </label>
              <p className="login-error" role="alert">{error}</p>
              <button type="submit" className="login-btn" disabled={busy}>{busy ? 'Updating...' : 'Update Password'}</button>
            </form>
          ) : (
            <form className="login-form" onSubmit={requestLink}>
              <p className="login-sub">Enter your account email and we’ll send you a link to reset your password.</p>
              <label className="login-field">
                <span>Email</span>
                <input type="email" placeholder="jack.roberto@gmail.com" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </label>
              {message && <p className="fp-ok" role="status">{message}</p>}
              <p className="login-error" role="alert">{error}</p>
              <button type="submit" className="login-btn" disabled={busy}>{busy ? 'Sending...' : 'Send Reset Link'}</button>
            </form>
          )}

          {!(token && done) && <p className="login-signup"><Link to="/login" className="login-link">Back to Login</Link></p>}
        </div>
      </div>
    </main>
  );
}
