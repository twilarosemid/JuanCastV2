import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import useUser from '../../hooks/useUser';
import useStartupState from '../../hooks/useStartupState';
import { markTutorialDone, setTutorialRunning, tutorialPending } from '../../tutorialGate';
import './Tutorial.css';

// Pages where the tour must not appear (full-screen or logged-out pages)
const BLOCKED = ['/landing', '/login', '/signup', '/forgot-password', '/admin'];

// Each step: an optional page to open, an optional [data-tour] target to spotlight (none = centered card).
// A target that is missing or hidden (e.g. the desktop balance on a phone) falls back to the next match or a centered card.
const STEPS = [
  { title: 'Welcome to JuanCast!', body: 'Let’s take a quick tour so you know where everything is. It takes less than a minute, and you can skip any time.', route: '/' },
  { target: 'balance', title: 'Suns and Stars', body: 'These are your two currencies. Stars are spent on votes, and Suns can be converted into Stars in the Market.' },
  { target: 'nav-vote', title: 'Vote', body: 'Pick a poll and spend Stars to vote for your favorite artists. Every vote moves them up the rankings.', route: '/polls' },
  { target: 'nav-community', title: 'Community', body: 'Chat with other fans, join an artist’s Fanbase, read the latest Chika and watch Content, all in one place.', route: '/community' },
  { target: 'nav-market', title: 'Market', body: 'Spin the wheel, grab powerups, convert Suns to Stars and shop for Stars.', route: '/market' },
  { target: 'bell', title: 'Notifications', body: 'Replies, poll updates and rewards show up here. A badge tells you when something is new.', route: '/' },
  { target: 'avatar', title: 'Your account', body: 'Tap your picture for your Profile, your Daily Check-in rewards, Transactions and Settings. Check in every day to build your streak!' },
  { title: 'You’re all set!', body: 'That’s the tour. Tip: you can replay it any time from Settings.' }
];

const PAD = 8;
const visible = (el) => {
  const r = el.getBoundingClientRect();
  const cs = window.getComputedStyle(el);
  return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
};
const findTarget = (name) => {
  if (!name) return null;
  return Array.from(document.querySelectorAll(`[data-tour="${name}"]`)).find(visible) || null;
};

export default function Tutorial() {
  const user = useUser();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const startupState = useStartupState();
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState(null);
  const [cardPos, setCardPos] = useState(null);
  const cardRef = useRef(null);
  const email = user?.email || '';

  const blocked = BLOCKED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  // on the home page wait for the startup popup ad to finish; elsewhere it can start straight away
  const adDone = startupState === 'done' || (startupState === 'idle' && pathname !== '/');

  // first visit: start by itself
  useEffect(() => {
    if (active || blocked || !adDone || !tutorialPending(user)) return undefined;
    const id = setTimeout(() => { setStep(0); setActive(true); }, 700);
    return () => clearTimeout(id);
  }, [active, blocked, adDone, user]);

  // replay from Settings
  useEffect(() => {
    const start = () => { if (email) { setStep(0); setActive(true); } };
    window.addEventListener('juancast-start-tutorial', start);
    return () => window.removeEventListener('juancast-start-tutorial', start);
  }, [email]);

  useEffect(() => {
    if (active) setTutorialRunning(true);
  }, [active]);

  const finish = useCallback(() => {
    setActive(false);
    setRect(null);
    markTutorialDone(email);
  }, [email]);

  // logging out (or opening a blocked page) ends the tour quietly
  useEffect(() => {
    if (active && (!email || blocked)) { setActive(false); setRect(null); setTutorialRunning(false); }
  }, [active, email, blocked]);

  const s = STEPS[step];

  // open the page this step is about
  useEffect(() => {
    if (!active || !s?.route) return;
    if (pathname !== s.route) navigate(s.route);
  }, [active, step]); // eslint-disable-line react-hooks/exhaustive-deps

  // follow the target while the page settles, scrolls or resizes
  useEffect(() => {
    if (!active) return undefined;
    const measure = () => {
      const el = findTarget(s.target);
      if (!el) { setRect(null); return; }
      const r = el.getBoundingClientRect();
      setRect((prev) => (prev && Math.abs(prev.top - r.top) < .5 && Math.abs(prev.left - r.left) < .5 && Math.abs(prev.width - r.width) < .5 && Math.abs(prev.height - r.height) < .5 ? prev : { top: r.top, left: r.left, width: r.width, height: r.height }));
    };
    measure();
    const timer = setInterval(measure, 150);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, { passive: true });
    return () => { clearInterval(timer); window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure); };
  }, [active, step, pathname, s]);

  // put the card next to the spotlight (below, else above), or in the middle when there is none
  useLayoutEffect(() => {
    if (!active) return;
    const card = cardRef.current;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = card?.offsetWidth || Math.min(360, vw - 24);
    const h = card?.offsetHeight || 220;
    if (!rect) { setCardPos({ top: Math.max(12, (vh - h) / 2), left: Math.max(12, (vw - w) / 2) }); return; }
    const gap = 16;
    const below = rect.top + rect.height + PAD + gap;
    const above = rect.top - PAD - gap - h;
    let top = below + h <= vh - 12 ? below : above >= 12 ? above : Math.max(12, Math.min(vh - h - 12, vh / 2 - h / 2));
    let left = rect.left + rect.width / 2 - w / 2;
    left = Math.max(12, Math.min(vw - w - 12, left));
    setCardPos({ top, left });
  }, [active, rect, step]);

  // keyboard: Esc skips, arrows move
  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') finish();
      if (e.key === 'ArrowRight' || e.key === 'Enter') setStep((n) => (n >= STEPS.length - 1 ? n : n + 1));
      if (e.key === 'ArrowLeft') setStep((n) => Math.max(0, n - 1));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [active, finish]);

  if (!active || blocked || !s) return null;

  const last = step === STEPS.length - 1;
  const next = () => (last ? finish() : setStep(step + 1));

  return createPortal(
    <div className="tut" role="dialog" aria-modal="true" aria-label="Website tutorial">
      {/* full-screen layer: the page behind can't be clicked during the tour */}
      <div className="tut-block" />
      {rect
        ? <div className="tut-spot" style={{ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }} />
        : <div className="tut-dim" />}

      <div className="tut-card" ref={cardRef} style={cardPos ? { top: cardPos.top, left: cardPos.left } : { visibility: 'hidden' }} key={step}>
        <div className="tut-top">
          <span className="tut-step">Step {step + 1} of {STEPS.length}</span>
          {!last && <button type="button" className="tut-skip" onClick={finish}>Skip</button>}
        </div>
        <h3>{s.title}</h3>
        <p>{s.body}</p>
        <div className="tut-dots" aria-hidden="true">
          {STEPS.map((_, i) => <i key={i} className={i === step ? 'on' : i < step ? 'past' : ''} />)}
        </div>
        <div className="tut-actions">
          {step > 0 ? <button type="button" className="tut-back" onClick={() => setStep(step - 1)}>Back</button> : <span />}
          <button type="button" className="tut-next" onClick={next} autoFocus>{last ? 'Start exploring' : step === 0 ? 'Let’s go' : 'Next'}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
