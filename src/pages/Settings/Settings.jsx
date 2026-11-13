import { useEffect, useRef, useState } from 'react';
import { Link, Route, Routes, useNavigate } from 'react-router-dom';
import { API, clearUser } from '../../api';
import Modal from '../../components/Modal/Modal';
import useUser from '../../hooks/useUser';
import { startTutorial } from '../../tutorialGate';
import { markStartupSeen } from '../../startupAdGate';
import Feedback from '../../components/Feedback/Feedback';
import TermsBody from './TermsBody';
import './Settings.css';

const svg = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
const Ico = {
  info: <svg {...svg}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>,
  doc: <svg {...svg}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></svg>,
  lock: <svg {...svg}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>,
  share: <svg {...svg}><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" /></svg>,
  help: <svg {...svg}><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01" /></svg>,
  flag: <svg {...svg}><path d="M5 21V4M5 4h11l-2 4 2 4H5" /></svg>,
  key: <svg {...svg}><circle cx="8" cy="15" r="4" /><path d="m11 12 9-9M16 7l3 3" /></svg>,
  shield: <svg {...svg}><path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6z" /><path d="m9 12 2 2 4-4" /></svg>,
  back: <svg {...svg}><path d="m15 5-7 7 7 7" /></svg>,
  chev: <svg {...svg}><path d="m9 5 7 7-7 7" /></svg>,
  down: <svg {...svg}><path d="m6 9 6 6 6-6" /></svg>
};

const MENU = [
  { label: 'Account & Security', icon: Ico.shield, to: 'account', needsLogin: true },
  { label: 'About Us', icon: Ico.info, soon: true },
  { label: 'Terms & Conditions', icon: Ico.doc, to: 'terms' },
  { label: 'Privacy Policy', icon: Ico.lock, soon: true },
  { label: 'Share JuanCast', icon: Ico.share, to: 'share' },
  { label: 'FAQs', icon: Ico.help, to: 'faq' },
  { label: 'Report an Issue', icon: Ico.flag, to: 'report' }
];

/* ---------- shared frame for every sub-page ---------- */
function Shell({ title, children, wide }) {
  const navigate = useNavigate();
  return (
    <main className="st-page">
      <div className={`st-inner${wide ? ' wide' : ''}`}>
        <header className="st-head rise">
          <button type="button" className="st-back" onClick={() => navigate('/settings')} aria-label="Back to Settings">{Ico.back}</button>
          <h1 className="st-title">{title}</h1>
        </header>
        <div className="rise" style={{ '--d': '80ms' }}>{children}</div>
      </div>
    </main>
  );
}

/* ---------- hub ---------- */
function Home() {
  const user = useUser();
  const navigate = useNavigate();
  return (
    <main className="st-page">
      <div className="st-inner">
        <header className="st-head rise">
          <h1 className="st-title">Settings</h1>
        </header>

        <nav className="st-card rise" style={{ '--d': '80ms' }} aria-label="Settings">
          {MENU.filter((item) => !item.needsLogin || user?.email).map((item) => {
            const inner = (
              <>
                <span className="st-ico">{item.icon}</span>
                <span className="st-label">{item.label}</span>
                {item.soon ? <span className="st-soon">Soon</span> : <span className="st-chev">{Ico.chev}</span>}
              </>
            );
            return item.soon
              ? <div key={item.label} className="st-row disabled" aria-disabled="true">{inner}</div>
              : <Link key={item.label} className="st-row" to={item.to}>{inner}</Link>;
          })}
        </nav>

        <div className="st-actions rise" style={{ '--d': '160ms' }}>
          {user?.email && (
            <button type="button" className="st-btn" onClick={() => { markStartupSeen(); /* no startup ad when replaying */ navigate('/'); setTimeout(startTutorial, 300); }}>{Ico.help} Replay Tutorial</button>
          )}
          {user?.email
            ? <Link className="st-btn" to="password">{Ico.key} Change Password</Link>
            : <Link className="st-btn" to="/forgot-password">{Ico.key} Forgot Password</Link>}
        </div>
      </div>
    </main>
  );
}

/* ---------- account: shared helper ---------- */
const accountCall = async (method, path, payload) => {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: method === 'GET' ? undefined : JSON.stringify(payload)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.message || 'Something went wrong. Please try again.'), { data });
  return data;
};
const offlineMessage = (err) => (err instanceof TypeError ? 'Cannot connect to the server. Please check your connection.' : err.message);

/* ---------- Change password (2FA on: a code is emailed first) ---------- */
function ChangePassword() {
  const user = useUser();
  const navigate = useNavigate();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [step, setStep] = useState('form');   // 'form' | 'code'
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [fb, setFb] = useState({ open: false, type: 'success', message: '' });

  if (!user?.email) {
    return (
      <Shell title="Change Password">
        <section className="st-card st-form">
          <p className="st-hint">Log in to change your password.</p>
          <Link className="st-submit st-link-btn" to="/login">Log In</Link>
        </section>
      </Shell>
    );
  }

  const send = async (withCode) => {
    setError('');
    if (next.length < 8) { setError('Your new password must be at least 8 characters.'); return; }
    if (next !== confirm) { setError('The new passwords do not match.'); return; }
    setBusy(true);
    try {
      const data = await accountCall('POST', '/api/account/change-password', {
        email: user.email, currentPassword: current, newPassword: next, ...(withCode ? { code: code.trim() } : {})
      });
      if (data.needsCode) { setStep('code'); setSentTo(data.sentTo || ''); setCode(''); return; }
      setFb({ open: true, type: 'success', message: 'Your password was changed.' });
    } catch (err) {
      setError(offlineMessage(err));
      if (err.data?.needsCode) setStep('code');
    } finally {
      setBusy(false);
    }
  };

  const submit = (e) => { e.preventDefault(); if (!busy) send(step === 'code'); };
  const resend = () => { setCode(''); send(false); };
  const closeFeedback = () => {
    const wasSuccess = fb.type === 'success';
    setFb((cur) => ({ ...cur, open: false }));
    if (wasSuccess) navigate('/settings');
  };

  return (
    <Shell title="Change Password">
      <form className="st-card st-form" onSubmit={submit}>
        {step === 'form' ? (
          <>
            <label className="st-field">
              <span>Current password</span>
              <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
            </label>
            <label className="st-field">
              <span>New password</span>
              <input type="password" autoComplete="new-password" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} required />
              <small className="st-hint">At least 8 characters.</small>
            </label>
            <label className="st-field">
              <span>Confirm new password</span>
              <input type="password" autoComplete="new-password" minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
            </label>
          </>
        ) : (
          <>
            <p className="st-hint">Your account has 2FA on. We sent a 6-digit code to <b>{sentTo || 'your email'}</b>. Enter it to finish changing your password.</p>
            <label className="st-field">
              <span>Verification code</span>
              <input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="st-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus required />
            </label>
            <button type="button" className="st-linkbtn" onClick={resend} disabled={busy}>Send a new code</button>
          </>
        )}
        {error && <p className="st-err" role="alert">{error}</p>}
        <button type="submit" className="st-submit" disabled={busy || (step === 'form' ? !current || !next || !confirm : code.length !== 6)}>
          {busy ? 'Please wait…' : step === 'form' ? 'Change Password' : 'Confirm'}
        </button>
      </form>
      <Feedback state={fb} onClose={closeFeedback} />
    </Shell>
  );
}

/* ---------- 6-box one-time code (OTP) input: type, paste or auto-fill from the email / SMS ---------- */
function OtpBoxes({ value, onChange, autoFocus }) {
  const refs = useRef([]);
  const digits = Array.from({ length: 6 }, (_, i) => value[i] || '');
  const focus = (i) => refs.current[Math.max(0, Math.min(5, i))]?.focus();
  const put = (i, raw) => {
    const typed = raw.replace(/\D/g, '');
    if (!typed) return;
    let add = typed;
    if (digits[i] && typed.length === 2) add = typed.replace(digits[i], '') || typed[1]; // box already had a digit: keep the new one
    const next = digits.slice();
    add.split('').slice(0, 6 - i).forEach((d, n) => { next[i + n] = d; });
    onChange(next.join(''));
    focus(i + add.length);
  };
  const key = (e, i) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const next = digits.slice();
      if (next[i]) next[i] = ''; else if (i > 0) { next[i - 1] = ''; focus(i - 1); }
      onChange(next.join(''));
    } else if (e.key === 'ArrowLeft') focus(i - 1);
    else if (e.key === 'ArrowRight') focus(i + 1);
  };
  return (
    <div className="st-otp" role="group" aria-label="6-digit verification code">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          className="st-otp-box"
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={6}
          value={d}
          autoFocus={autoFocus && i === 0}
          aria-label={`Digit ${i + 1}`}
          onChange={(e) => put(i, e.target.value)}
          onKeyDown={(e) => key(e, i)}
          onFocus={(e) => e.target.select()}
        />
      ))}
    </div>
  );
}

/* ---------- One reusable password (+ emailed code) confirmation ---------- */
function SecureModal({ title, intro, path, extra = {}, confirmLabel, danger, requireText, otpOnly, email, onClose, onSuccess }) {
  const [password, setPassword] = useState('');
  const [typed, setTyped] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState(otpOnly ? 'code' : 'password'); // otpOnly: no password, the emailed one-time code is the whole check
  const [sentTo, setSentTo] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (withCode) => {
    setError('');
    setBusy(true);
    try {
      const data = await accountCall('POST', path, { email, password, ...extra, ...(withCode ? { code: code.trim() } : {}) });
      if (data.needsCode) { setStep('code'); setSentTo(data.sentTo || ''); setCode(''); return; }
      onSuccess(data);
    } catch (err) {
      setError(offlineMessage(err));
      if (err.data?.needsCode) setStep('code');
    } finally {
      setBusy(false);
    }
  };
  // otpOnly: email the code as soon as the dialog opens
  const sentOnOpen = useRef(false); // React dev mode runs effects twice: only email one code
  useEffect(() => { if (otpOnly && !sentOnOpen.current) { sentOnOpen.current = true; run(false); } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const submit = (e) => { e.preventDefault(); if (!busy) run(step === 'code'); };
  const ready = step === 'password' ? password && (!requireText || typed.trim() === requireText) : code.length === 6;

  return (
    <Modal open onClose={busy ? undefined : onClose} label={title}>
      <form onSubmit={submit}>
        <h3 className={danger ? 'error' : undefined}>{title}</h3>
        {step === 'password' ? (
          <>
            <p>{intro}</p>
            <label htmlFor="sm-pass">Your password</label>
            <input id="sm-pass" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
            {requireText && (
              <>
                <label htmlFor="sm-type" style={{ marginTop: 12 }}>Type <b>{requireText}</b> to confirm</label>
                <input id="sm-type" type="text" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
              </>
            )}
          </>
        ) : (
          <>
            {otpOnly && <p>{intro}</p>}
            <p>{sentTo ? <>We sent a 6-digit one-time code (OTP) to <b>{sentTo}</b>. Enter it to continue.</> : (busy ? 'Sending a one-time code to your email…' : 'We could not send the code yet.')}</p>
            <label>One-time code</label>
            <OtpBoxes value={code} onChange={(v) => { setError(''); setCode(v); }} autoFocus />
            <button type="button" className="st-linkbtn" onClick={() => { setCode(''); run(false); }} disabled={busy}>{sentTo ? 'Send a new code' : 'Try sending again'}</button>
          </>
        )}
        {error && <p className="st-err" role="alert" style={{ margin: '12px 0 0' }}>{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className={`btn-solid${danger ? ' st-danger' : ''}`} disabled={busy || !ready}>{busy ? 'Please wait…' : confirmLabel}</button>
        </div>
      </form>
    </Modal>
  );
}

/* ---------- Account & Security: 2FA, deactivate, delete ---------- */
function Account() {
  const user = useUser();
  const navigate = useNavigate();
  const [email] = useState(user?.email || '');     // kept even after we log out below
  const [status, setStatus] = useState(null);      // { twoFactorEnabled, canDelete }
  const [dialog, setDialog] = useState(null);
  const [fb, setFb] = useState({ open: false, type: 'success', message: '', leave: false });
  const [pollAlerts, setPollAlerts] = useState(null); // null = loading

  useEffect(() => {
    if (!email) return undefined;
    let alive = true;
    fetch(`${API}/api/users/me?email=${encodeURIComponent(email)}`)
      .then((r) => r.json())
      .then((me) => { if (alive) setPollAlerts(me?.pollAlerts !== false); })
      .catch(() => { if (alive) setPollAlerts(true); });
    return () => { alive = false; };
  }, [email]);

  const togglePollAlerts = async () => {
    const next = !pollAlerts;
    setPollAlerts(next); // instant, rolled back if saving fails
    try {
      const r = await fetch(`${API}/api/users/poll-alerts`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, enabled: next }) });
      if (!r.ok) throw new Error();
    } catch { setPollAlerts(!next); }
  };

  useEffect(() => {
    if (!email) return;
    accountCall('GET', `/api/account/status?email=${encodeURIComponent(email)}`).then(setStatus).catch(() => setStatus({ twoFactorEnabled: false, canDelete: true, failed: true }));
  }, [email]);

  if (!email) {
    return (
      <Shell title="Account & Security">
        <section className="st-card st-form">
          <p className="st-hint">Log in to manage your account.</p>
          <Link className="st-submit st-link-btn" to="/login">Log In</Link>
        </section>
      </Shell>
    );
  }

  const tfa = Boolean(status?.twoFactorEnabled);
  const leave = (message) => { clearUser(); setDialog(null); setFb({ open: true, type: 'success', message, leave: true }); };
  const closeFeedback = () => {
    const leaving = fb.leave;
    setFb((cur) => ({ ...cur, open: false }));
    if (leaving) navigate('/', { replace: true });
  };
  const fmtDate = (value) => new Date(value).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const open2fa = () => setDialog({
    title: tfa ? 'Turn off 2FA' : 'Turn on 2FA',
    intro: tfa
      ? 'Enter your password. We will email you a code to confirm turning 2FA off.'
      : 'With 2FA on, we email you a 6-digit code before you can change your password or delete your account. To set it up, enter the one-time code we just emailed you.',
    path: '/api/account/2fa', extra: { enable: !tfa }, otpOnly: !tfa, confirmLabel: tfa ? 'Turn off' : 'Turn on',
    onSuccess: (data) => { setStatus((s) => ({ ...s, twoFactorEnabled: Boolean(data.twoFactorEnabled) })); setDialog(null); setFb({ open: true, type: 'success', message: data.message || 'Done.', leave: false }); }
  });
  const openDeactivate = () => setDialog({
    title: 'Deactivate account',
    intro: 'Your profile and posts are hidden from everyone. Nothing is deleted: log in again any time to turn your account back on.',
    path: '/api/account/deactivate', confirmLabel: 'Deactivate',
    onSuccess: (data) => leave(data.message)
  });
  const openDelete = () => setDialog({
    title: 'Delete account', danger: true, requireText: 'DELETE',
    intro: `Your account is hidden right away and permanently deleted after 30 days: profile, posts, vote history and followers all go. Log in before then to restore it.${tfa ? ' We will also email you a code.' : ''}`,
    path: '/api/account/delete', confirmLabel: 'Delete my account',
    onSuccess: (data) => leave(data.deletionAt ? `Your account is scheduled for deletion on ${fmtDate(data.deletionAt)}. Log in before then if you change your mind.` : data.message)
  });

  return (
    <Shell title="Account & Security">
      <section className="st-card">
        <div className="st-intro"><h2>Notifications</h2><p>Choose what gets sent to your bell.</p></div>
        <div className="st-opt">
          <div className="st-opt-text">
            <strong>Poll alerts</strong>
            <span>{pollAlerts === null ? 'Loading…' : pollAlerts ? 'On: we tell you when an artist or group on your Your Artists row is in a poll.' : 'Off: you will not be told when your artists are in a poll.'}</span>
          </div>
          <button type="button" className="st-pill" onClick={togglePollAlerts} disabled={pollAlerts === null}>{pollAlerts ? 'Turn off' : 'Turn on'}</button>
        </div>
      </section>

      <section className="st-card" style={{ marginTop: 18 }}>
        <div className="st-intro"><h2>Security</h2><p>Extra protection for your account.</p></div>
        <div className="st-opt">
          <div className="st-opt-text">
            <strong>Two-step verification (2FA)</strong>
            <span>{status ? (tfa ? 'On: we email you a code before sensitive changes.' : 'Off: sensitive changes only need your password.') : 'Loading…'}</span>
          </div>
          <button type="button" className="st-pill" onClick={open2fa} disabled={!status || status.failed}>{tfa ? 'Turn off' : 'Turn on'}</button>
        </div>
        <div className="st-opt">
          <div className="st-opt-text">
            <strong>Password</strong>
            <span>Change it any time. With 2FA on you will confirm with an emailed code.</span>
          </div>
          <Link className="st-pill" to="/settings/password">Change</Link>
        </div>
      </section>

      <section className="st-card" style={{ marginTop: 18 }}>
        <div className="st-intro"><h2>Your account</h2><p>Take a break or leave JuanCast.</p></div>
        <div className="st-opt">
          <div className="st-opt-text">
            <strong>Deactivate account</strong>
            <span>Hide your profile until you log in again.</span>
          </div>
          <button type="button" className="st-pill" onClick={openDeactivate} disabled={status?.canDelete === false}>Deactivate</button>
        </div>
        <div className="st-opt">
          <div className="st-opt-text">
            <strong>Delete account</strong>
            <span>Removed permanently after 30 days. Log in before then to restore it.</span>
          </div>
          <button type="button" className="st-pill danger" onClick={openDelete} disabled={status?.canDelete === false}>Delete</button>
        </div>
        {status?.canDelete === false && <p className="st-hint st-pad">Admin accounts can’t be deactivated or deleted here.</p>}
      </section>

      {dialog && <SecureModal key={dialog.title} email={email} onClose={() => setDialog(null)} {...dialog} />}
      <Feedback state={fb} onClose={closeFeedback} />
    </Shell>
  );
}

/* ---------- Terms ---------- */
function Terms() {
  return (
    <Shell title="Terms and Conditions" wide>
      <article className="st-card st-legal"><TermsBody /></article>
    </Shell>
  );
}

/* ---------- Share ---------- */
const SOCIALS = [
  { name: 'Facebook', url: 'https://www.facebook.com/JuanCastPH/', color: '#4d9bff', path: 'M22 12c0-5.52-4.48-10-10-10S2 6.48 2 12c0 4.84 3.44 8.87 8 9.8V15H8v-3h2V9.5C10 7.57 11.57 6 13.5 6c.86 0 1.8.15 2.5.25V9h-1.75c-1.36 0-1.75.68-1.75 1.5V12h3.5l-.5 3h-3v6.8C18.56 20.87 22 16.84 22 12z' },
  { name: 'X (Twitter)', url: 'https://x.com/NotJuanCastPH', color: '#f4f7ff', path: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 22.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z' },
  { name: 'YouTube', url: 'https://www.youtube.com/@JuanCastPHOfficial', color: '#ff4d4d', path: 'M21.58 7.19c-.23-.86-.91-1.54-1.77-1.77C18.25 5 12 5 12 5s-6.25 0-7.81.42c-.86.23-1.54.91-1.77 1.77C2 8.75 2 12 2 12s0 3.25.42 4.81c.23.86.91 1.54 1.77 1.77C5.75 19 12 19 12 19s6.25 0 7.81-.42c.86-.23 1.54-.91 1.77-1.77C22 15.25 22 12 22 12s0-3.25-.42-4.81zM10 15V9l5.2 3-5.2 3z' },
  { name: 'TikTok', url: 'https://www.tiktok.com/@juancast_official', color: '#25f4ee', path: 'M12.53.02C13.84 0 15.14.01 16.44 0c.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.12-3.44-3.17-3.64-5.46-.22-2.58.94-5.2 3.07-6.52 1.95-1.23 4.41-1.43 6.55-.65V10.2c-1.34-.36-2.76-.32-4.06.13-1.33.47-2.43 1.49-3.03 2.75-.58 1.25-.66 2.71-.24 4.02.43 1.3 1.34 2.41 2.54 3.03 1.31.68 2.89.78 4.28.32 1.55-.49 2.79-1.72 3.29-3.26.27-.85.34-1.75.34-2.65V.02h.02z' }
];

function Share() {
  return (
    <Shell title="Share JuanCast">
      <section className="st-card">
        <div className="st-intro">
          <h2>Follow Us</h2>
          <p>Stay updated with JuanCast across all our official platforms.</p>
        </div>
        {SOCIALS.map((s) => (
          <a key={s.name} className="st-row" href={s.url} target="_blank" rel="noopener noreferrer">
            <span className="st-ico" style={{ color: s.color }}><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={s.path} /></svg></span>
            <span className="st-label">{s.name}</span>
            <span className="st-chev">{Ico.chev}</span>
          </a>
        ))}
      </section>
    </Shell>
  );
}

/* ---------- FAQ ---------- */
const FAQS = [
  { q: 'How do I create an account?', a: <p>Click “Sign Up” on the home screen, enter your Full Name, Birthdate, Username, Email, Password and (optionally) Mobile number, then follow the prompts to complete the registration.</p> },
  { q: 'Didn’t receive the confirmation email?', a: <p>Check your spam or junk folder. If you still don’t see the email, try resending it from the app or contact our support team.</p> },
  { q: 'Can I change my personal information?', a: <p>You can update your Full Name, Username, profile photo and cover photo from Edit Profile. Your email and birth date cannot be changed after registration. To change your password, use Forgot Password in Settings.</p> },
  { q: 'What personal information does the app collect?', a: <p>We collect your Full Name, Birthdate, Username, Email, and Password during registration. This information is used to provide you with a personalized experience and to ensure the security of your account.</p> },
  { q: 'How is my data protected?', a: <p>We use security measures to protect your data. Additionally, we do not share your personal information with third parties without your consent, except for necessary legal purposes.</p> },
  {
    q: 'What are Stars and Suns?',
    a: (
      <>
        <p>Stars and Suns are the currency used inside JuanCast to vote in polls. Suns are used for major polls while Stars are used for minor polls.</p>
        <p>You can get Stars in the JuanCast Market:</p>
        <ol>
          <li>Buy a Stars package. Go to Market → Stars and pick a package with its price in pesos.</li>
          <li>Try your luck on the daily Spin. Go to Market → Spin. You get 15 spins every day, and matching values win Stars.</li>
        </ol>
        <p>You can also convert 1,800 Stars into 1 Sun. Go to Market → Suns to convert your balance.</p>
      </>
    )
  }
];

function FAQ() {
  const [open, setOpen] = useState(null);
  return (
    <Shell title="Frequently Asked Questions">
      <section className="st-card">
        {FAQS.map((item, i) => {
          const isOpen = open === i;
          return (
            <div key={item.q} className={`st-faq${isOpen ? ' open' : ''}`}>
              <button type="button" className="st-faq-q" aria-expanded={isOpen} aria-controls={`faq-${i}`} onClick={() => setOpen(isOpen ? null : i)}>
                <span>{item.q}</span>
                <span className="st-faq-chev">{Ico.down}</span>
              </button>
              <div className="st-faq-a" id={`faq-${i}`} role="region">
                <div className="st-faq-a-inner">{item.a}</div>
              </div>
            </div>
          );
        })}
      </section>
    </Shell>
  );
}

/* ---------- Report an issue ---------- */
const MAX_FILE = 8 * 1024 * 1024;

function Report() {
  const user = useUser();
  const navigate = useNavigate();
  const [subject, setSubject] = useState('');
  const [issue, setIssue] = useState('');
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState('');
  const [sending, setSending] = useState(false);
  const [fb, setFb] = useState({ open: false, type: 'success', message: '' });

  const pickFile = (e) => {
    const picked = e.target.files?.[0] || null;
    if (picked && picked.size > MAX_FILE) {
      setFile(null);
      setFileError('That file is too large. Please choose one under 8 MB.');
      e.target.value = '';
      return;
    }
    setFileError('');
    setFile(picked);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (sending) return;
    setSending(true);
    try {
      const body = new FormData();
      body.append('subject', subject.trim());
      body.append('issue', issue.trim());
      if (user?.email) body.append('email', user.email);
      if (file) body.append('file', file);

      const res = await fetch(`${API}/api/reports`, { method: 'POST', body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Failed to submit report. Please try again.');

      setSubject(''); setIssue(''); setFile(null); setFileError('');
      setFb({ open: true, type: 'success', message: 'Thank you for letting us know. We will look into this issue shortly. You will receive a notification in Mail if your report is resolved.' });
    } catch (err) {
      const offline = err instanceof TypeError;
      setFb({ open: true, type: 'error', message: offline ? 'Cannot connect to the server. Please check your connection.' : err.message });
    } finally {
      setSending(false);
    }
  };

  const closeFeedback = () => {
    const wasSuccess = fb.type === 'success';
    setFb((cur) => ({ ...cur, open: false }));
    if (wasSuccess) navigate('/settings');
  };

  return (
    <Shell title="Report an Issue">
      <form className="st-card st-form" onSubmit={submit}>
        <label className="st-field">
          <span>Subject</span>
          <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={120} required />
        </label>
        <label className="st-field">
          <span>Tell us about your issue</span>
          <textarea rows={6} value={issue} onChange={(e) => setIssue(e.target.value)} required />
        </label>
        <label className="st-field">
          <span>Attachment <em>(optional)</em></span>
          <input type="file" className="st-file" accept="image/*,video/*,.pdf" onChange={pickFile} />
          {file && <small className="st-hint">{file.name}</small>}
          {fileError && <small className="st-err" role="alert">{fileError}</small>}
        </label>
        <button type="submit" className="st-submit" disabled={sending || !subject.trim() || !issue.trim()}>
          {sending ? 'Sending…' : 'Submit'}
        </button>
      </form>
      <Feedback state={fb} onClose={closeFeedback} />
    </Shell>
  );
}

/* ---------- /settings/* ---------- */
export default function Settings() {
  return (
    <Routes>
      <Route index element={<Home />} />
      <Route path="terms" element={<Terms />} />
      <Route path="share" element={<Share />} />
      <Route path="faq" element={<FAQ />} />
      <Route path="report" element={<Report />} />
      <Route path="password" element={<ChangePassword />} />
      <Route path="account" element={<Account />} />
      <Route path="*" element={<Home />} />
    </Routes>
  );
}
