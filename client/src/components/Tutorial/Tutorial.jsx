import { Component, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
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
  { title: 'Welcome to JuanCast!', body: 'Let’s take a quick tour so you know where everything is and how to vote. It takes about a minute, and you can skip any time.', route: '/' },
  { target: 'balance', title: 'Suns and Stars', body: 'These are your two currencies. Stars are spent on votes, and Suns can be converted into Stars in the Market.' },
  { target: 'rankings', tight: true, title: 'Top Rankings', body: 'The artists leading the current poll. Every vote moves them up the board.' },
  { target: 'cast-vote', title: 'Cast your vote', body: 'Tap Cast Vote on your favorite, choose how much to spend and confirm. Votes are paid with your Stars.' },
  { target: 'polls-carousel', title: 'Live polls', body: 'Swipe through the polls that are running right now. Tap one to see its artists and vote.' },
  { target: 'polls-filters', title: 'Find any poll', body: 'The Vote tab lists every poll. Search by name, or filter by type and category.', route: '/polls' },
  { target: 'poll-card', title: 'Open a poll', body: 'Tap a poll card to see its artists, the ranking and the Cast Vote buttons.' },
  { target: 'community-tabs', title: 'Community', body: 'Chat with other fans, join an artist’s Fanbase, read the latest Chika and watch Content.', route: '/community' },
  { target: 'chat-composer', title: 'Join the chat', body: 'Write a post, share a photo and reply or like other fans’ posts.' },
  { target: 'fanbase-list', title: 'Fanbase', body: 'Pick an artist to open their board. Subscribers unlock all posts and photos, and non-subscribers get a preview.', route: '/community?tab=fanbase' },
  { target: 'market-tabs', title: 'Market', body: 'Buy Stars, convert Suns to Stars, spin the wheel and grab powerups that boost your votes.', route: '/market' },
  { target: 'market-content', title: 'Spin and win', body: 'Try your luck on the spin wheel to earn Stars.', route: '/market?tab=spin' },
  { target: 'bell', title: 'Notifications', body: 'Replies, poll updates and rewards show up here. A badge tells you when something is new.', route: '/' },
  { target: 'avatar', title: 'Your account', body: 'Tap your picture for your Profile, your Daily Check-in rewards, Transactions and Settings. Check in every day to build your streak!' },
  { title: 'You’re all set!', body: 'That’s the tour. Tip: you can replay it any time from Settings.' }
];

const PAD = 8;   // glow around the lit target
const M = 12;    // margin kept between the card and the screen edge
const G = 14;    // gap between the lit target and the card
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const visible = (el) => {
  const r = el.getBoundingClientRect();
  const cs = window.getComputedStyle(el);
  return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
};
// things inside the fixed top bar never scroll, so the tour must not try to scroll them into view
const inFixedBar = (el) => {
  for (let n = el; n && n !== document.body; n = n.parentElement) {
    if (window.getComputedStyle(n).position === 'fixed') return true;
  }
  return false;
};
// on phones the Polls filters / Community tabs / Market tabs stick under the top bar while the page scrolls
const STICKY_BARS = '.polls-sidebar, .cm-sidebar, .mk-sidebar';
const inStickyBar = (el) => Boolean(el.closest(STICKY_BARS)) && window.getComputedStyle(el.closest(STICKY_BARS)).position === 'sticky';
const findTarget = (name) => {
  if (!name) return null;
  return Array.from(document.querySelectorAll(`[data-tour="${name}"]`)).find(visible) || null;
};

// The box to light up. Normally the element itself. With `tight`, only the part its visible children really
// fill, so a wide row with a few cards in the middle doesn't light up a big empty area.
const boxOf = (el, tight) => {
  const base = el.getBoundingClientRect();
  let t = base.top; let l = base.left; let b = base.bottom; let r = base.right;
  if (tight) {
    const kids = Array.from(el.children).filter(visible); // fade-in items still count, so the box doesn't jump
    if (kids.length) {
      t = Infinity; l = Infinity; b = -Infinity; r = -Infinity;
      kids.forEach((c) => {
        const k = c.getBoundingClientRect();
        t = Math.min(t, k.top); l = Math.min(l, k.left); b = Math.max(b, k.bottom); r = Math.max(r, k.right);
      });
      t = Math.max(t, base.top); l = Math.max(l, base.left); b = Math.min(b, base.bottom); r = Math.min(r, base.right);
    }
  }
  return { top: t, left: l, width: r - l, height: b - t };
};

// The part of the screen that is really free for the page: below the top bar (and any sticky filter bar that
// will stick under it) and above the phone tab bar / floating powerup button.
const getSafe = (target, box) => {
  const vh = window.innerHeight;
  let top = 0;
  let bottom = vh;
  const nav = document.querySelector('nav.site-nav');
  if (nav) {
    nav.querySelectorAll('.logo, .pill, .nav-status').forEach((el) => {
      if (!visible(el)) return;
      const r = el.getBoundingClientRect();
      if (r.top < vh / 2) top = Math.max(top, r.bottom);
    });
    nav.querySelectorAll('.links, .pu-btn').forEach((el) => {
      if (!visible(el) || window.getComputedStyle(el).position !== 'fixed') return;
      const r = el.getBoundingClientRect();
      if (r.top > vh / 2) bottom = Math.min(bottom, r.top);
    });
  }
  if (target && box) {
    document.querySelectorAll(STICKY_BARS).forEach((el) => {
      const cs = window.getComputedStyle(el);
      if (cs.position !== 'sticky' || !visible(el) || el.contains(target)) return;
      // only a bar above the target that spans over it (on wide screens the bars are a side column, so they never overlap)
      if (!(el.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING)) return;
      const r = el.getBoundingClientRect();
      if (Math.min(r.right, box.left + box.width) - Math.max(r.left, box.left) < 24) return;
      top = Math.max(top, (parseFloat(cs.top) || 0) + r.height);
    });
  }
  return { top: top + 4, bottom: bottom - 4 };
};

// Where can the card go so it never covers the lit box? Tries below, above, right, left - first inside the free
// area of the page, then anywhere on screen (the card may sit over a bar, never over the target).
const placeCard = (box, safe, w, h, vw, vh) => {
  const cx = clamp(box.left + (box.right - box.left) / 2 - w / 2, M, vw - w - M);
  const tiers = [{ top: safe.top, bottom: safe.bottom }, { top: M, bottom: vh - M }];
  for (const t of tiers) {
    const tall = box.bottom - box.top > h * 1.6;
    const cy = clamp(tall ? box.top + PAD : (box.top + box.bottom) / 2 - h / 2, t.top, Math.max(t.top, t.bottom - h));
    const leftX = Math.max(M, box.left - G - w);
    const options = [
      { fits: box.bottom + G + h <= t.bottom, card: { top: box.bottom + G, left: cx } },
      { fits: box.top - G - h >= t.top, card: { top: box.top - G - h, left: cx } },
      { fits: box.right + G + w <= vw - M, card: { top: cy, left: box.right + G } },
      { fits: leftX + w <= box.left, card: { top: cy, left: leftX } }
    ];
    const hit = options.find((o) => o.fits);
    if (hit) return hit.card;
  }
  return null;
};

function TutorialRunner() {
  const user = useUser();
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const startupState = useStartupState();
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState(null);
  const [layout, setLayout] = useState({ spot: null, card: null }); // where the spotlight and the card really go
  const [vpTick, setVpTick] = useState(0); // bumps on resize so the layout is recalculated
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
  // pages are remembered, so Back lands on the right page again
  const routeOf = (n) => { for (let i = n; i >= 0; i -= 1) if (STEPS[i].route) return STEPS[i].route; return null; };

  // open the page this step is about
  useEffect(() => {
    if (!active) return;
    const want = routeOf(step);
    if (want && `${pathname}${search}` !== want) navigate(want);
  }, [active, step]); // eslint-disable-line react-hooks/exhaustive-deps

  // the page can't be scrolled by hand during the tour (the spotlight does the scrolling)
  useEffect(() => {
    if (!active) return undefined;
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = 'hidden';
    return () => { html.style.overflow = prev; };
  }, [active]);

  // follow the target while the page settles, scrolls or resizes
  useEffect(() => {
    if (!active) return undefined;
    let tries = 0;
    let lastY = null;
    let prev = null;
    const measure = () => {
      const el = findTarget(s.target);
      if (!el) { setRect(null); return; }
      const box = boxOf(el, s.tight);
      const bar = inFixedBar(el);
      const sticky = !bar && inStickyBar(el);

      // Bring the target to a spot where it is fully visible AND the card has room beside/below it.
      // Fixed bars never move. Waits until the target stopped moving (pages lay out late), then a few tries at most.
      const settled = prev && Math.abs(prev.top - box.top) < 1 && Math.abs(prev.left - box.left) < 1 && Math.abs(prev.height - box.height) < 1;
      prev = box;
      if (!bar && settled && tries < 4) {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const card = cardRef.current;
        const w = card?.offsetWidth || Math.min(360, vw - 24);
        const h = card?.offsetHeight || 230;
        const safe = getSafe(el, box);
        const boxNow = { top: box.top - PAD, bottom: box.top + box.height + PAD, left: box.left - PAD, right: box.left + box.width + PAD };
        const inside = boxNow.top >= safe.top - 1 && boxNow.bottom <= safe.bottom + 1;
        const roomForCard = Boolean(placeCard(boxNow, safe, w, h, vw, vh));
        const good = inside && (roomForCard || sticky);
        // sticky bars only need to be on screen; everything else is lined up under the top bar
        const stuckOk = sticky && box.top >= safe.top && box.top + box.height <= safe.bottom;
        if (!good && !stuckOk) {
          const dy = box.top - (safe.top + PAD + 4);
          if (Math.abs(dy) > 4) {
            if (tries > 0 && lastY !== null && Math.abs(window.scrollY - lastY) < 1) {
              tries = 99; // the page can't scroll any further
            } else {
              tries += 1; lastY = window.scrollY;
              window.scrollBy({ top: dy, behavior: 'instant' });
            }
          }
        }
      }
      setRect((old) => (old && Math.abs(old.top - box.top) < .5 && Math.abs(old.left - box.left) < .5 && Math.abs(old.width - box.width) < .5 && Math.abs(old.height - box.height) < .5 && old.bar === bar ? old : { ...box, bar }));
    };
    measure();
    const timer = setInterval(measure, 150);
    const onResize = () => { measure(); setVpTick((n) => n + 1); };
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', measure, { passive: true });
    return () => { clearInterval(timer); window.removeEventListener('resize', onResize); window.removeEventListener('scroll', measure); };
  }, [active, step, pathname, s]);

  // Work out where the spotlight and the card go so the card NEVER covers what it is explaining.
  // The lit area is only the part of the target that is really free on screen (not under the top bar or the
  // phone tab bar). The card goes below, above, right or left of it. A target too big for any of those keeps the
  // card on the bottom (or top) edge, and the lit area is shortened so the two never overlap.
  useLayoutEffect(() => {
    if (!active) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const card = cardRef.current;
    const w = card?.offsetWidth || Math.min(360, vw - 24);
    const h = card?.offsetHeight || 230;
    const centered = { top: Math.max(M, (vh - h) / 2), left: Math.max(M, (vw - w) / 2) };
    if (!rect) { setLayout({ spot: null, card: centered }); return; }

    const el = findTarget(s.target);
    const safe = getSafe(el, rect);
    const clip = (lo, hi) => {
      const top = Math.max(rect.top, lo);
      const bottom = Math.min(rect.top + rect.height, hi);
      const left = Math.max(rect.left, PAD);                     // keep the glow inside the screen
      const right = Math.min(rect.left + rect.width, vw - PAD);
      return { top, bottom, left, right };
    };
    // a target inside the fixed top bar is lit where it is; anything else only where the page is free
    let c = rect.bar ? clip(0, vh) : clip(safe.top + PAD, safe.bottom - PAD);
    if (c.bottom - c.top < 8 && !rect.bar) c = clip(0, vh);     // not scrolled into place yet: show it where it is
    if (c.bottom - c.top < 8 || c.right - c.left < 8) { setLayout({ spot: null, card: centered }); return; }
    const spot = { top: c.top, left: c.left, width: c.right - c.left, height: c.bottom - c.top };
    const box = { top: c.top - PAD, bottom: c.bottom + PAD, left: c.left - PAD, right: c.right + PAD };

    const hit = placeCard(box, rect.bar ? { top: 0, bottom: vh } : safe, w, h, vw, vh);
    if (hit) { setLayout({ spot, card: hit }); return; }

    // nothing fits: keep the card on the bottom or the top edge and shrink the lit area so they never overlap
    const roomBottomCard = (vh - M - h - G - PAD) - spot.top;   // lit height if the card sits at the bottom
    const roomTopCard = c.bottom - (M + h + G + PAD);           // lit height if the card sits at the top
    const cardLeft = clamp(vw / 2 - w / 2, M, vw - w - M);
    if (roomBottomCard >= roomTopCard) {
      setLayout({ spot: { ...spot, height: Math.max(40, Math.min(spot.height, roomBottomCard)) }, card: { top: vh - h - M, left: cardLeft } });
    } else {
      const newTop = Math.max(spot.top, M + h + G + PAD);
      setLayout({ spot: { ...spot, top: newTop, height: Math.max(40, c.bottom - newTop) }, card: { top: M, left: cardLeft } });
    }
  }, [active, rect, step, vpTick]); // eslint-disable-line react-hooks/exhaustive-deps

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
      {layout.spot
        ? <div className="tut-spot" style={{ top: layout.spot.top - PAD, left: layout.spot.left - PAD, width: layout.spot.width + PAD * 2, height: layout.spot.height + PAD * 2 }} />
        : <div className="tut-dim" />}

      <div className="tut-card" ref={cardRef} style={layout.card ? { top: layout.card.top, left: layout.card.left } : { visibility: 'hidden' }} key={step}>
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

// If anything in the tour ever throws, drop the tour quietly instead of blanking the whole site.
class TutorialBoundary extends Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) { console.error('Tutorial crashed and was switched off:', error); setTutorialRunning(false); }
  render() { return this.state.failed ? null : this.props.children; }
}

export default function Tutorial() {
  return <TutorialBoundary><TutorialRunner /></TutorialBoundary>;
}
