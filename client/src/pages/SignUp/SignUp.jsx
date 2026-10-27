import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { API } from '../../api';
import useUser from '../../hooks/useUser';
import Feedback from '../../components/Feedback/Feedback';
import heroIcon from '../../assets/juancast_icon.webp';
import { COUNTRIES } from './countries';
import '../Login/Login.css';
import './SignUp.css';

const STEPS = ['Profile', 'Password', 'Contact', 'Verify'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[A-Za-z0-9_.]{3,24}$/;
const MIN_PASSWORD = 8; // same minimum the password-reset page enforces
const RESEND_SECONDS = 30;

const EyeIcon = ({ off }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
    <circle cx="12" cy="12" r="3" />
    {off && <path d="M3 3l18 18" />}
  </svg>
);

/* ---------- helpers ---------- */
const formatBirthdate = (raw) => {
  const d = raw.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
};

// MM/DD/YYYY -> an error message, or '' when it is a real date in the past
const birthdateError = (value) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!m) return 'Enter your birthdate as MM/DD/YYYY.';
  const [mm, dd, yyyy] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(yyyy, mm - 1, dd);
  const real = date.getFullYear() === yyyy && date.getMonth() === mm - 1 && date.getDate() === dd;
  if (!real) return 'That date does not exist.';
  if (yyyy < 1900 || date > new Date()) return 'Please enter a valid birthdate.';
  return '';
};

const fmtFor = (country, digits) =>
  country.placeholder.startsWith('0') && digits.length && !digits.startsWith('0')
    ? country.format.replace('#', '').trim()
    : country.format;

const formatPhone = (country, raw) => {
  const digits = raw.replace(/\D/g, '').slice(0, country.maxLength);
  const format = fmtFor(country, digits);
  let out = '';
  let i = 0;
  for (const ch of format) {
    if (i >= digits.length) break;
    if (ch === '#') out += digits[i++];
    else out += ch;
  }
  return out;
};

const phoneError = (country, formatted) => {
  const digits = formatted.replace(/\D/g, '');
  if (!digits.length) return '';
  const starts = country.validStarts || [];
  if (starts.length && !starts.some((p) => p.startsWith(digits) || digits.startsWith(p))) {
    return starts.length <= 2 ? `Number must start with ${starts.join(' or ')}.` : `Invalid starting number for ${country.name}.`;
  }
  if (digits.length < country.minLength) return 'Phone number is too short.';
  return '';
};

// "+63" + "09171234567" -> "+639171234567" (drop the national leading 0)
const toInternational = (country, formatted) => {
  let digits = formatted.replace(/\D/g, '');
  if (country.placeholder.startsWith('0') && digits.startsWith('0')) digits = digits.slice(1);
  return `${country.code}${digits}`;
};

const post = async (path, payload) => {
  let res;
  try {
    res = await fetch(`${API}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  } catch {
    throw new Error('Could not connect to the server.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || 'Something went wrong. Please try again.');
  return data;
};

/* ---------- country picker (custom, so the list matches the site) ---------- */
function CountryPicker({ index, onPick }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const country = COUNTRIES[index];

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  return (
    <div className="su-cc" ref={box}>
      <button type="button" className={`su-cc-btn${open ? ' open' : ''}`} aria-haspopup="listbox" aria-expanded={open} aria-label={`Country code ${country.code}, ${country.name}`} onClick={() => setOpen((o) => !o)}>
        <span>{country.code}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <ul className="su-cc-list" role="listbox" aria-label="Country code">
          {COUNTRIES.map((c, i) => (
            <li key={`${c.name}-${i}`} role="presentation">
              <button type="button" role="option" aria-selected={i === index} className={`su-cc-opt${i === index ? ' selected' : ''}`} onClick={() => { onPick(i); setOpen(false); }}>
                <b>{c.code}</b><span>{c.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------- page ---------- */
export default function SignUp() {
  const navigate = useNavigate();
  const user = useUser();

  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fb, setFb] = useState({ open: false, type: 'success', message: '' });

  // everything lives in memory only: nothing (especially the password) is written to storage
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [birthdate, setBirthdate] = useState('');
  const [gender, setGender] = useState('');
  const [terms, setTerms] = useState(false);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPass, setShowPass] = useState(false);

  const [email, setEmail] = useState('');
  const [countryIndex, setCountryIndex] = useState(0);
  const [phone, setPhone] = useState('');

  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const otpRefs = useRef([]);
  const [cooldown, setCooldown] = useState(0);
  const [notice, setNotice] = useState('');

  const country = COUNTRIES[countryIndex];

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  // already signed in: nothing to sign up for
  if (user?.email && !fb.open) return <Navigate to="/" replace />;

  const go = (next) => { setError(''); setNotice(''); setStep(next); };

  /* step 1 */
  const submitProfile = async (e) => {
    e.preventDefault();
    const name = fullName.trim();
    const handle = username.trim();
    if (name.length < 2) return setError('Please enter your full name.');
    if (!USERNAME_RE.test(handle)) return setError('Username must be 3–24 characters: letters, numbers, "_" or ".".');
    const bErr = birthdateError(birthdate);
    if (bErr) return setError(bErr);
    if (!gender) return setError('Please select your gender.');
    if (!terms) return setError('Please accept the Terms and Conditions to continue.');

    setBusy(true); setError('');
    try {
      await post('/api/check-username', { username: handle });
      setFullName(name); setUsername(handle);
      go(2);
    } catch (err) {
      setError(err.message === 'Username is already taken.' ? 'That username is already taken. Try another.' : err.message);
    } finally { setBusy(false); }
  };

  /* step 2 */
  const passwordOk = password.length >= MIN_PASSWORD;
  const matchOk = confirm.length > 0 && password === confirm;
  const submitPassword = (e) => {
    e.preventDefault();
    if (!passwordOk) return setError(`Password must be at least ${MIN_PASSWORD} characters.`);
    if (!matchOk) return setError('Passwords do not match.');
    go(3);
  };

  /* step 3 */
  const requestCode = async () => {
    await post('/api/request-otp', { email: email.trim().toLowerCase(), phone: toInternational(country, phone), password });
    setCooldown(RESEND_SECONDS);
  };

  const submitContact = async (e) => {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim())) return setError('Please enter a valid email address.');
    const pErr = phoneError(country, phone);
    if (pErr) return setError(pErr);
    if (phone.replace(/\D/g, '').length < country.minLength) return setError('Phone number is too short.');

    setBusy(true); setError('');
    try {
      await requestCode();
      setOtp(['', '', '', '', '', '']);
      go(4);
      window.setTimeout(() => otpRefs.current[0]?.focus(), 60);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  /* step 4 */
  const setDigit = (i, value) => {
    let digits = value.replace(/\D/g, '');
    // typing into a box that already holds a digit: keep only the new one (paste/autofill still fills forward)
    if (otp[i] && digits.length === 2) digits = digits.replace(otp[i], '') || digits[1];
    if (!digits) return;
    setError('');
    setOtp((cur) => {
      const next = [...cur];
      // typing one digit, or pasting/auto-filling several, fills forward from this box
      digits.split('').slice(0, 6 - i).forEach((d, n) => { next[i + n] = d; });
      return next;
    });
    otpRefs.current[Math.min(i + digits.length, 5)]?.focus();
  };

  const otpKey = (e, i) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      setError('');
      setOtp((cur) => { const next = [...cur]; if (next[i]) next[i] = ''; else if (i > 0) next[i - 1] = ''; return next; });
      if (!otp[i] && i > 0) otpRefs.current[i - 1]?.focus();
    } else if (e.key === 'ArrowLeft' && i > 0) otpRefs.current[i - 1]?.focus();
    else if (e.key === 'ArrowRight' && i < 5) otpRefs.current[i + 1]?.focus();
  };

  const verify = async (e) => {
    e.preventDefault();
    const code = otp.join('');
    if (code.length < 6) return setError('Enter the 6-digit code.');
    setBusy(true); setError('');
    try {
      await post('/api/verify-otp', { email: email.trim().toLowerCase(), otp: code, fullName, username, birthdate, gender });
      setFb({ open: true, type: 'success', message: 'Your account has been created. You can now log in.' });
    } catch (err) {
      if (/username/i.test(err.message)) { go(1); setError('That username was just taken. Please choose another.'); }
      else setError(err.message);
    } finally { setBusy(false); }
  };

  const resend = async () => {
    if (cooldown > 0 || busy) return;
    setBusy(true); setError(''); setNotice('');
    try { await requestCode(); setNotice('A new code is on its way.'); setOtp(['', '', '', '', '', '']); otpRefs.current[0]?.focus(); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  const closeFeedback = () => { setFb((c) => ({ ...c, open: false })); navigate('/login', { replace: true }); };

  const titles = {
    1: ['Create your account', 'Tell us a bit about yourself.'],
    2: ['Choose a password', `Use at least ${MIN_PASSWORD} characters.`],
    3: ['Contact details', 'We’ll email you a 6-digit code to verify it’s you.'],
    4: ['Enter verification code', `We sent a code to ${email.trim().toLowerCase()}.`]
  };

  return (
    <main className="login-page">
      <div className="login-card rise">
        <div className="login-art"><img src={heroIcon} alt="JuanCast" /></div>

        <div className="login-body">
          <ol className="su-steps" aria-label="Sign up progress">
            {STEPS.map((label, i) => {
              const n = i + 1;
              const state = n < step ? 'done' : n === step ? 'active' : '';
              return (
                <li key={label} className={`su-step ${state}`} aria-current={n === step ? 'step' : undefined}>
                  <span className="su-dot">{n < step ? '✓' : n}</span>
                  <span className="su-step-label">{label}</span>
                </li>
              );
            })}
          </ol>

          <div className="su-pane" key={step}>
            <h1 className="login-title">{titles[step][0]}</h1>
            <p className="login-sub su-sub">{titles[step][1]}</p>

            {step === 1 && (
              <form className="login-form" onSubmit={submitProfile} noValidate>
                <label className="login-field">
                  <span>Full name</span>
                  <input type="text" autoComplete="name" placeholder="Juan Dela Cruz" value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={60} required />
                </label>
                <label className="login-field">
                  <span>Username</span>
                  <input type="text" autoComplete="username" placeholder="juandelacruz" value={username} onChange={(e) => setUsername(e.target.value.replace(/\s/g, ''))} maxLength={24} required />
                </label>
                <label className="login-field">
                  <span>Birthdate</span>
                  <input type="text" inputMode="numeric" autoComplete="bday" placeholder="MM/DD/YYYY" value={birthdate} onChange={(e) => setBirthdate(formatBirthdate(e.target.value))} maxLength={10} required />
                </label>
                <div className="login-field" role="radiogroup" aria-label="Gender">
                  <span>Gender</span>
                  <div className="su-seg">
                    {[['male', 'Male'], ['female', 'Female'], ['other', 'Other']].map(([id, label]) => (
                      <button key={id} type="button" role="radio" aria-checked={gender === id} className={`su-seg-btn${gender === id ? ' active' : ''}`} onClick={() => { setGender(id); setError(''); }}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="su-terms">
                  <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
                  <span>I have read and accept the <Link to="/settings/terms" target="_blank" rel="noopener noreferrer" className="login-link">Terms and Conditions</Link>.</span>
                </label>
                <p className="login-error" role="alert">{error}</p>
                <button type="submit" className="login-btn" disabled={busy}>{busy ? 'Checking...' : 'Next'}</button>
              </form>
            )}

            {step === 2 && (
              <form className="login-form" onSubmit={submitPassword} noValidate>
                <label className="login-field">
                  <span>Password</span>
                  <div className="login-pass">
                    <input type={showPass ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={(e) => { setPassword(e.target.value); setError(''); }} required />
                    <button type="button" className="login-eye" aria-label={showPass ? 'Hide password' : 'Show password'} onClick={() => setShowPass((s) => !s)}><EyeIcon off={showPass} /></button>
                  </div>
                </label>
                <label className="login-field">
                  <span>Confirm password</span>
                  <input type={showPass ? 'text' : 'password'} autoComplete="new-password" value={confirm} onChange={(e) => { setConfirm(e.target.value); setError(''); }} required />
                </label>
                <ul className="su-checks" aria-live="polite">
                  <li className={passwordOk ? 'ok' : ''}>At least {MIN_PASSWORD} characters</li>
                  <li className={matchOk ? 'ok' : ''}>Passwords match</li>
                </ul>
                <p className="login-error" role="alert">{error}</p>
                <div className="su-actions">
                  <button type="button" className="su-ghost" onClick={() => go(1)}>Back</button>
                  <button type="submit" className="login-btn" disabled={!passwordOk || !matchOk}>Next</button>
                </div>
              </form>
            )}

            {step === 3 && (
              <form className="login-form" onSubmit={submitContact} noValidate>
                <label className="login-field">
                  <span>Email</span>
                  <input type="email" autoComplete="email" placeholder="juan@gmail.com" value={email} onChange={(e) => { setEmail(e.target.value); setError(''); }} required />
                </label>
                <div className="login-field">
                  <span>Mobile number</span>
                  <div className="su-phone">
                    <CountryPicker index={countryIndex} onPick={(i) => { setCountryIndex(i); setPhone(''); setError(''); }} />
                    <input type="tel" inputMode="tel" autoComplete="tel-national" placeholder={country.placeholder} value={phone} onChange={(e) => { setPhone(formatPhone(country, e.target.value)); setError(''); }} required />
                  </div>
                </div>
                <p className="login-error" role="alert">{error}</p>
                <div className="su-actions">
                  <button type="button" className="su-ghost" onClick={() => go(2)}>Back</button>
                  <button type="submit" className="login-btn" disabled={busy}>{busy ? 'Sending...' : 'Get code'}</button>
                </div>
              </form>
            )}

            {step === 4 && (
              <form className="login-form" onSubmit={verify}>
                <div className="su-otp" role="group" aria-label="6-digit verification code">
                  {otp.map((digit, i) => (
                    <input
                      key={i}
                      ref={(el) => { otpRefs.current[i] = el; }}
                      className="su-otp-box"
                      type="text"
                      inputMode="numeric"
                      autoComplete={i === 0 ? 'one-time-code' : 'off'}
                      maxLength={6}
                      value={digit}
                      aria-label={`Digit ${i + 1}`}
                      onChange={(e) => setDigit(i, e.target.value)}
                      onKeyDown={(e) => otpKey(e, i)}
                      onFocus={(e) => e.target.select()}
                    />
                  ))}
                </div>
                {notice && <p className="su-notice" role="status">{notice}</p>}
                <p className="login-error" role="alert">{error}</p>
                <p className="su-resend">
                  Didn’t get a code?{' '}
                  <button type="button" className="su-link" onClick={resend} disabled={cooldown > 0 || busy}>
                    {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend'}
                  </button>
                </p>
                <div className="su-actions">
                  <button type="button" className="su-ghost" onClick={() => go(3)}>Back</button>
                  <button type="submit" className="login-btn" disabled={busy || otp.some((d) => !d)}>{busy ? 'Verifying...' : 'Verify'}</button>
                </div>
              </form>
            )}
          </div>

          <p className="login-signup">Already have an account? <Link to="/login" className="login-link">Log in!</Link></p>
        </div>
      </div>
      <Feedback state={fb} onClose={closeFeedback} />
    </main>
  );
}
