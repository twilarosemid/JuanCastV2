import { useEffect, useState } from 'react';
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
  const [spinValues, setSpinValues] = useState([0, 0, 0]);
  const [message, setMessage] = useState('');
  const [spinning, setSpinning] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [packsOpen, setPacksOpen] = useState(false);
  const [purchaseMessage, setPurchaseMessage] = useState('');

  // stop the reels if the tab is hidden or restored from the back/forward cache
  useEffect(() => {
    const stopHidden = () => { if (document.visibilityState === 'hidden') setRolling(false); };
    const stopRestore = () => setRolling(false);
    document.addEventListener('visibilitychange', stopHidden);
    window.addEventListener('pageshow', stopRestore);
    return () => {
      document.removeEventListener('visibilitychange', stopHidden);
      window.removeEventListener('pageshow', stopRestore);
    };
  }, []);

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
    setRolling(true);
    setMessage('');
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

      await new Promise((resolve) => window.setTimeout(resolve, 900));
      setRolling(false);
      setSpinValues(result.symbols);
      setSpinStatus({ spinsRemaining: result.spinsRemaining, stars: result.stars, cooldownEndsAt: result.cooldownEndsAt });
      saveUser({ ...user, stars: result.stars });
      setMessage(result.reward > 0 ? `You won ${result.reward.toLocaleString()} Stars!` : 'No match this spin. Try again!');
    } catch (error) {
      setRolling(false);
      setMessage(error.message || 'Spin failed.');
    } finally {
      setRolling(false);
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

        <div className="spin-machine" aria-label="Three-slot Stars game">
          {spinValues.map((value, index) => (
            <div className={`spin-slot${rolling ? ' is-spinning' : ''}`} key={index} aria-label={`Slot ${index + 1}: ${value} Stars`}>
              {rolling ? <span className="spin-roll">{value}</span> : value}
            </div>
          ))}
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
