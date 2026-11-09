import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { API, saveUser } from '../../../api';
import Modal from '../../../components/Modal/Modal';
import './Spin.css';

const SPIN_COOLDOWN_MS = 30_000;

const spinPackages = [
  { spins: 40, price: 100 },
  { spins: 70, price: 150 },
  { spins: 100, price: 200 }
];

// the numbers on the reels (same set the server draws from)
const SET = [0, 5, 10, 25, 50, 100];
const L = SET.length;
const REPEAT = 3;                       // strip = the set repeated, so the reel can wrap without a visible jump
const CELL_PCT = 100 / (L * REPEAT);    // one cell, as a % of the strip height (the window shows 3 cells)
// reels rest on random numbers before the first spin (never three of a kind, so it doesn't look like a win)
const pickRest = () => {
  const rest = Array.from({ length: 3 }, () => Math.floor(Math.random() * L));
  if (rest[0] === rest[1] && rest[1] === rest[2]) rest[2] = (rest[2] + 1 + Math.floor(Math.random() * (L - 1))) % L;
  return rest;
};
const SPIN_SPEED = 20;                  // cells per second at full speed
const MIN_SPIN_MS = 1400;               // reels spin at least this long before the first one starts to stop
const STOP_GAP_MS = 650;                // each next reel stops this much later (left to right)
const mod = (n, m) => ((n % m) + m) % m;

const parseApiResponse = async (response) => {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    if (response.status === 404) {
      throw new Error('Spin API route not found. Restart the backend to load the latest routes.');
    }
    throw new Error('The spin service returned an unexpected response.');
  }
  return response.json();
};

export default function Spin({ user }) {
  const navigate = useNavigate();
  const location = useLocation();
  const email = user?.email;
  const [spinStatus, setSpinStatus] = useState({ spinsRemaining: 15, stars: 0, cooldownEndsAt: null });
  const [restIdx] = useState(pickRest);
  const [spinValues, setSpinValues] = useState(() => restIdx.map((i) => SET[i]));
  const [message, setMessage] = useState('');
  const [spinning, setSpinning] = useState(false);
  const [phases, setPhases] = useState(['idle', 'idle', 'idle']); // per reel: idle | spin | landed
  const [winSlots, setWinSlots] = useState([]);
  const [now, setNow] = useState(Date.now());
  const [packsOpen, setPacksOpen] = useState(false);
  const [purchaseMessage, setPurchaseMessage] = useState('');

  // ---- reel engine: each reel is a vertical strip moved by requestAnimationFrame (no re-render per frame) ----
  const stripRefs = useRef([]);
  const pos = useRef([...restIdx]);
  const reels = useRef([0, 1, 2].map(() => ({ mode: 'idle' })));
  const frame = useRef(0);
  const landedCount = useRef(0);
  const allLanded = useRef(null);

  const setPhase = (i, value) => setPhases((cur) => cur.map((p, n) => (n === i ? value : p)));

  const paint = (i) => {
    const el = stripRefs.current[i];
    if (!el) return;
    const c = mod(pos.current[i], L) + L; // keep the centre cell in the middle copy of the strip
    el.style.transform = `translate3d(0, ${-(c - 1) * CELL_PCT}%, 0)`;
  };

  useLayoutEffect(() => {
    [0, 1, 2].forEach(paint);
    return () => cancelAnimationFrame(frame.current);
  }, []);

  const tick = (t) => {
    let busy = false;
    reels.current.forEach((a, i) => {
      if (a.mode === 'spin') {
        const dt = Math.min(0.05, Math.max(0, (t - a.last) / 1000));
        a.last = t;
        a.speed = Math.min(SPIN_SPEED, a.speed + (SPIN_SPEED * dt) / 0.4); // wind up to full speed
        pos.current[i] += a.speed * dt;
        if (a.stopAt && t >= a.stopAt) {
          // brake: ease-out that starts at the current speed and lands exactly on the result
          let dist = mod(a.target - pos.current[i], L);
          while (dist < 5) dist += L;
          a.mode = 'stop';
          a.p0 = pos.current[i];
          a.dist = dist;
          a.t0 = t;
          a.dur = ((3 * dist) / Math.max(a.speed, 4)) * 1000;
        }
        busy = true;
      } else if (a.mode === 'stop') {
        const u = Math.min(1, (t - a.t0) / a.dur);
        pos.current[i] = a.p0 + a.dist * (1 - Math.pow(1 - u, 3));
        if (u >= 1) {
          a.mode = 'idle';
          pos.current[i] = a.target;
          setPhase(i, 'landed');
          landedCount.current += 1;
          if (landedCount.current >= 3) allLanded.current?.();
        } else {
          busy = true;
        }
      }
      paint(i);
    });
    frame.current = busy ? requestAnimationFrame(tick) : 0;
  };

  const startReels = () => {
    landedCount.current = 0;
    const t = performance.now();
    reels.current = [0, 1, 2].map(() => ({ mode: 'spin', last: t, speed: 0, stopAt: 0, target: 0 }));
    setPhases(['spin', 'spin', 'spin']);
    if (!frame.current) frame.current = requestAnimationFrame(tick);
  };

  const snapReels = () => {
    reels.current = [0, 1, 2].map(() => ({ mode: 'idle' }));
    pos.current = pos.current.map((v) => Math.round(v));
    [0, 1, 2].forEach(paint);
    setPhases(['idle', 'idle', 'idle']);
  };

  // load spins left + cooldown
  useEffect(() => {
    if (!email) {
      setSpinStatus({ spinsRemaining: 0, stars: 0, cooldownEndsAt: null });
      return undefined;
    }
    const controller = new AbortController();
    fetch(`${API}/api/users/spin-status?email=${encodeURIComponent(email)}`, { signal: controller.signal })
      .then(async (response) => {
        const result = await parseApiResponse(response);
        if (!response.ok) throw new Error(result.message || 'Could not load spins.');
        setSpinStatus({
          spinsRemaining: result.spinsRemaining,
          stars: result.stars,
          cooldownEndsAt: result.lastSpinAt ? new Date(Date.parse(result.lastSpinAt) + SPIN_COOLDOWN_MS).toISOString() : null
        });
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setMessage(error.message || 'Could not load spins.');
      });
    return () => controller.abort();
  }, [email]);

  // bonus spins from the Swerte reward elsewhere on the site
  useEffect(() => {
    const onBonus = (event) => {
      if (event.detail?.email?.toLowerCase() !== email?.toLowerCase()) return;
      setSpinStatus((cur) => ({ ...cur, spinsRemaining: event.detail.spinsRemaining }));
    };
    window.addEventListener('juancast-market-spin-updated', onBonus);
    return () => window.removeEventListener('juancast-market-spin-updated', onBonus);
  }, [email]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  const cooldownRemaining = spinStatus.cooldownEndsAt
    ? Math.max(0, Math.ceil((Date.parse(spinStatus.cooldownEndsAt) - now) / 1000))
    : 0;

  const spin = async () => {
    if (!email) { navigate('/login', { state: { from: location.pathname + location.search } }); return; }
    if (spinning || cooldownRemaining > 0 || spinStatus.spinsRemaining < 1) return;

    setSpinning(true);
    setMessage('');
    setWinSlots([]);
    const startedAt = performance.now();
    startReels(); // the reels start spinning right away while the server picks the result
    try {
      const response = await fetch(`${API}/api/users/spin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const result = await parseApiResponse(response);
      if (!response.ok) {
        if (result.cooldownEndsAt) setSpinStatus((cur) => ({ ...cur, cooldownEndsAt: result.cooldownEndsAt }));
        throw new Error(result.message || 'Spin failed.');
      }

      const targets = result.symbols.map((v) => Math.max(0, SET.indexOf(Number(v))));
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      if (reduced) {
        reels.current = [0, 1, 2].map(() => ({ mode: 'idle' }));
        targets.forEach((target, i) => { pos.current[i] = target; paint(i); });
        setPhases(['idle', 'idle', 'idle']);
      } else {
        const landed = new Promise((resolve) => { allLanded.current = resolve; });
        const base = Math.max(performance.now(), startedAt + MIN_SPIN_MS);
        reels.current.forEach((reel, i) => { reel.target = targets[i]; reel.stopAt = base + i * STOP_GAP_MS; });
        await landed; // reels stop one by one, left to right
        await new Promise((resolve) => window.setTimeout(resolve, 250));
      }

      setSpinValues(result.symbols);
      setSpinStatus({ spinsRemaining: result.spinsRemaining, stars: result.stars, cooldownEndsAt: result.cooldownEndsAt });
      saveUser({ ...user, stars: result.stars });
      if (result.reward > 0) {
        setWinSlots(result.symbols.map((v, i) => (result.symbols.filter((x) => x === v).length > 1 ? i : -1)).filter((i) => i >= 0));
      }
      setMessage(result.reward > 0 ? `You won ${result.reward.toLocaleString()} Stars!` : 'No match this spin. Try again!');
    } catch (error) {
      snapReels();
      setMessage(error.message || 'Spin failed.');
    } finally {
      setSpinning(false);
    }
  };

  const spinDisabled = spinning || cooldownRemaining > 0 || (Boolean(email) && spinStatus.spinsRemaining < 1);

  return (
    <>
      <div className="mk-panel spin-panel">
        <div className="spin-toolbar">
          <p><strong>Spins Left:</strong> {email ? spinStatus.spinsRemaining : '—'}</p>
          <button type="button" className="spin-more" onClick={() => { setPurchaseMessage(''); setPacksOpen(true); }}>
            More Spins <span>+</span>
          </button>
        </div>

        <div className={`spin-machine${spinning ? ' running' : ''}`} aria-label="Three-slot Stars game">
          {[0, 1, 2].map((i) => (
            <div
              className={`spin-slot is-${phases[i]}${winSlots.includes(i) ? ' win' : ''}`}
              key={i}
              role="img"
              aria-label={`Slot ${i + 1}: ${spinValues[i]} Stars`}
            >
              <div className="spin-strip" ref={(el) => { stripRefs.current[i] = el; }}>
                {Array.from({ length: L * REPEAT }, (_, k) => (
                  <span className="spin-cell" key={k}>{SET[k % L]}</span>
                ))}
              </div>
            </div>
          ))}
          <div className="spin-payline" aria-hidden="true" />
        </div>

        <button className="mk-btn spin-go" type="button" onClick={spin} disabled={spinDisabled}>
          {!email ? 'Log in to Spin' : spinning ? 'Spinning...' : cooldownRemaining > 0 ? `Spin in ${cooldownRemaining}s` : 'Spin'}
        </button>
        {message && <p className="spin-message" role="status">{message}</p>}
        {!email && <p className="spin-message">Log in to play and earn Stars.</p>}

        <details className="spin-details" open>
          <summary>Game Instructions</summary>
          <ul>
            <li>Press the Spin button to play. It becomes available after the cooldown.</li>
            <li>The reels show 0, 5, 10, 25, 50 and 100.</li>
            <li>Two matching values win that value in Stars.</li>
            <li>Three matching values win double that value in Stars.</li>
            <li>Your total Stars are added to your account balance.</li>
            <li>You receive 15 spins each day, refreshing at midnight Pacific Time.</li>
          </ul>
        </details>
        <details className="spin-details" open>
          <summary>Disclaimer</summary>
          <ul>
            <li>Advertisements shown are not connected to JuanCast.</li>
            <li>Rewards are credited after each spin.</li>
            <li>All Stars awarded will expire at the end of each month.</li>
          </ul>
        </details>
      </div>

      <Modal open={packsOpen} onClose={() => setPacksOpen(false)} label="Buy more spins" className="spin-modal">
        <h3>Buy More Spins</h3>
        <p className="spin-note"><strong>Note:</strong> Bought spins will not be retained during spin count reset at 12:00 am</p>
        <div className="spin-packs">
          {spinPackages.map(({ spins, price }) => (
            <button
              className="spin-pack"
              type="button"
              key={spins}
              onClick={() => setPurchaseMessage('Spin checkout is not available yet.')}
            >
              <strong className="spin-pack-amount">+{spins}</strong>
              <span className="spin-pack-label">spins</span>
              <strong className="spin-pack-price">PHP {price}</strong>
            </button>
          ))}
        </div>
        {purchaseMessage && <p className="spin-purchase" role="status">{purchaseMessage}</p>}
      </Modal>
    </>
  );
}
