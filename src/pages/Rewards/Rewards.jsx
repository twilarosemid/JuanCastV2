import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { API, mergeUser, saveUser } from '../../api';
import useUser from '../../hooks/useUser';
import useBubble from '../../hooks/useBubble';
import Feedback from '../../components/Feedback/Feedback';
import Modal from '../../components/Modal/Modal';
import { dailyState } from '../../components/DailyRewards/DailyRewards';
import AgimatLogo from '../../assets/agimat_ni_juan_logo.webp';
import Spins20Image from '../../assets/20spins.png';
import AdsImage from '../../assets/ads.png';
import StarCurr from '../../assets/StarCurr.png';
import STAR1 from '../../assets/STAR1.png';
import STAR2 from '../../assets/STAR2.png';
import STAR3 from '../../assets/STAR3.png';
import STAR4 from '../../assets/STAR4.png';
import STAR5 from '../../assets/STAR5.png';
import STAR6 from '../../assets/STAR6.png';
import STAR7 from '../../assets/STAR7.png';
import './Rewards.css';

const wheelPrizes = [
  { key: 'stars', title: '500,000 Stars', detail: 'Star reward', image: StarCurr },
  null,
  { key: 'agimat', title: 'Agimat ni Juan', detail: '30-minute voting boost', image: AgimatLogo },
  null,
  { key: 'spins', title: '+20 Spins', detail: 'Extra roulette spins', image: Spins20Image, imageWide: true },
  null,
  { key: 'reset-ads', title: 'Reset Ads', detail: 'Ad counter reset', image: AdsImage, imageWide: true },
  null,
  { key: 'agimat', title: 'Agimat ni Juan', detail: '30-minute voting boost', image: AgimatLogo },
  null,
  { key: 'spins', title: '+20 Spins', detail: 'Extra roulette spins', image: Spins20Image, imageWide: true },
  null,
  { key: 'save-ads', title: 'Save Ads', detail: 'Ad reward', image: AdsImage, imageWide: true },
  null,
  { key: 'agimat', title: 'Agimat ni Juan', detail: '30-minute voting boost', image: AgimatLogo },
  null,
  null,
  null
];

// Display only: the server decides the real amount for each streak day.
const DAILY = [
  { day: 1, value: 50, icon: STAR1 },
  { day: 2, value: 100, icon: STAR2 },
  { day: 3, value: 250, icon: STAR3 },
  { day: 4, value: 400, icon: STAR4 },
  { day: 5, value: 650, icon: STAR5 },
  { day: 6, value: 800, icon: STAR6 },
  { day: 7, value: 1000, icon: STAR7 }
];

const SECTIONS = [
  { id: 'bayong', label: 'Bayong', title: 'Your Items' },
  { id: 'daily', label: 'Daily Stars', title: 'Daily Stars' },
  { id: 'swerte', label: 'Swerte', title: 'Swerte' },
  { id: 'events', label: 'Events', title: 'Events' }
];

const parseApiResponse = async (response) => {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error('The Swerte spin service returned an unexpected response.');
  }
  return response.json();
};

/* ---------- Daily Stars (the check-in, inline) ---------- */
function DailyStars({ user, onLogin }) {
  const { streak, claimedToday } = dailyState(user);
  const [busy, setBusy] = useState(false);
  const [won, setWon] = useState(null);
  const [winOpen, setWinOpen] = useState(false);
  const [notice, setNotice] = useState('');

  const statusOf = (day) => {
    if (day <= streak) return 'claimed';
    if (day === streak + 1 && !claimedToday) return 'available';
    return 'locked';
  };

  const claim = async () => {
    if (busy) return;
    if (!user?.email) { onLogin(); return; }
    setBusy(true);
    setNotice('');
    try {
      const res = await fetch(`${API}/api/users/daily-claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || data.error || 'Failed to claim reward.');
      const gained = Math.max(0, (data.stars || 0) - (user.stars || 0));
      saveUser(mergeUser(user, data));
      setWon({ day: data.dailyStreak, gained });
      setWinOpen(true);
    } catch (error) {
      setNotice(error.message || 'Server error. Please try again later.');
    } finally {
      setBusy(false);
    }
  };

  const Action = ({ status }) => (
    status === 'available'
      ? <button type="button" className="dr-btn claim" onClick={claim} disabled={busy}>{busy ? '...' : 'CLAIM'}</button>
      : <span className={`dr-btn ${status === 'claimed' ? 'done' : 'locked'}`}>{status === 'claimed' ? 'CLAIMED' : 'CLAIM'}</span>
  );

  const wonReward = won ? DAILY[Math.min(Math.max(won.day, 1), 7) - 1] : null;

  return (
    <section className="rw-daily-page">
      <p className="rw-daily-sub">{user?.email ? <>Checked in for <strong>{streak}</strong> day{streak === 1 ? '' : 's'} this month</> : 'Log in to start your streak.'}</p>

      <div className="dr-grid">
        {DAILY.slice(0, 6).map((r) => {
          const status = statusOf(r.day);
          return (
            <div key={r.day} className={`dr-card ${status}`}>
              <h3>Day {r.day}</h3>
              <img src={r.icon} alt="" />
              <strong>{r.value.toLocaleString()} <span>STARS</span></strong>
              <Action status={status} />
            </div>
          );
        })}
      </div>

      <div className={`dr-card rw-grand ${statusOf(7)}`}>
        <span className="dr-tag">GRAND PRIZE</span>
        <h3>Day 7</h3>
        <img src={STAR7} alt="" />
        <strong>1,000 <span>STARS</span></strong>
        <Action status={statusOf(7)} />
      </div>

      {notice && <p className="dr-notice" role="alert">{notice}</p>}

      <Modal open={winOpen} onClose={() => setWinOpen(false)} label="Daily Stars claimed" className="dr-modal rw-win-modal">
        {won && wonReward && (
          <div className="dr-win">
            <h2>Day {won.day} Claimed!</h2>
            <div className="dr-win-icon"><img src={wonReward.icon} alt="" /></div>
            <p className="dr-win-amount">+{won.gained.toLocaleString()} <span>STARS</span></p>
            <p className="dr-win-note">Awesome! Come back tomorrow to keep your streak alive.</p>
            <button type="button" className="btn-solid" onClick={() => setWinOpen(false)}>Continue</button>
          </div>
        )}
      </Modal>
    </section>
  );
}

export default function Rewards() {
  const navigate = useNavigate();
  const user = useUser();
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const active = SECTIONS.some((s) => s.id === requested) ? requested : 'bayong';
  const bubble = useBubble(active);
  const choose = (id) => setParams(id === 'bayong' ? {} : { tab: id }, { replace: true });
  const title = SECTIONS.find((s) => s.id === active)?.title;

  const [inventory, setInventory] = useState([]);
  const [swerteSpinsRemaining, setSwerteSpinsRemaining] = useState(null);
  const [wheelRotation, setWheelRotation] = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);
  const [redeemingRewardId, setRedeemingRewardId] = useState(null);
  const [feedback, setFeedback] = useState({ open: false, type: 'success', message: '' });
  const email = user?.email;
  const storageKey = `juancast_rewards_${encodeURIComponent(email || 'guest')}`;
  const hasSpunToday = swerteSpinsRemaining === 0;

  const say = (type, message) => setFeedback({ open: true, type, message });
  const goLogin = () => navigate('/login', { state: { from: '/rewards' } });

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
      setInventory(Array.isArray(saved.inventory) ? saved.inventory : []);
      setWheelRotation(Number(saved.wheelRotation) || 0);
    } catch {
      setInventory([]);
      setWheelRotation(0);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!email) { setSwerteSpinsRemaining(null); return undefined; }
    const controller = new AbortController();
    fetch(`${API}/api/users/swerte-spin-status?email=${encodeURIComponent(email)}`, { signal: controller.signal })
      .then(async (response) => {
        const result = await parseApiResponse(response);
        if (!response.ok) throw new Error(result.message || 'Could not load Swerte spins.');
        setSwerteSpinsRemaining(result.spinsRemaining);
      })
      .catch((error) => {
        if (error.name !== 'AbortError') say('error', error.message || 'Could not load Swerte spins.');
      });
    return () => controller.abort();
  }, [email]);

  const saveRewardState = (nextInventory, nextRotation) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ inventory: nextInventory, wheelRotation: nextRotation }));
    } catch { /* storage full: keep it in memory for this visit */ }
    setInventory(nextInventory);
    setWheelRotation(nextRotation);
  };

  const spinWheel = async () => {
    if (!email) { goLogin(); return; }
    if (isSpinning || swerteSpinsRemaining !== 1) return;

    setIsSpinning(true);
    try {
      const response = await fetch(`${API}/api/users/swerte-spin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const result = await parseApiResponse(response);
      if (!response.ok) {
        if (Number.isInteger(result.spinsRemaining)) setSwerteSpinsRemaining(result.spinsRemaining);
        throw new Error(result.message || 'Could not use your Swerte spin.');
      }

      setSwerteSpinsRemaining(result.spinsRemaining);
      const prizeIndexes = wheelPrizes.reduce((list, prize, index) => (prize ? [...list, index] : list), []);
      const prizeIndex = prizeIndexes[Math.floor(Math.random() * prizeIndexes.length)];
      const prize = wheelPrizes[prizeIndex];
      const prizeCenter = prizeIndex * (360 / wheelPrizes.length);
      const adjustment = (360 - ((wheelRotation + prizeCenter) % 360)) % 360;
      const nextRotation = wheelRotation + 360 * 6 + adjustment;

      setWheelRotation(nextRotation);
      await new Promise((resolve) => window.setTimeout(resolve, 5200));

      const wonItem = {
        ...prize,
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        receivedAt: new Date().toISOString(),
        used: false
      };
      saveRewardState([wonItem, ...inventory], nextRotation);
      say('success', `${prize.title} added to your Bayong.`);
    } catch (error) {
      say('error', error.message || 'Could not use your Swerte spin.');
    } finally {
      setIsSpinning(false);
    }
  };

  const handleUseReward = async (item) => {
    if (item.used || redeemingRewardId) return;

    if (item.key === 'spins') {
      if (!email) { goLogin(); return; }
      setRedeemingRewardId(item.id);
      try {
        const response = await fetch(`${API}/api/users/market-spin-bonus`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, rewardId: item.id })
        });
        const result = await parseApiResponse(response);
        if (!response.ok) throw new Error(result.message || 'Could not add Market spins.');

        window.dispatchEvent(new CustomEvent('juancast-market-spin-updated', {
          detail: { email, spinsRemaining: result.spinsRemaining }
        }));
        say('success', `20 Market spins added. You now have ${result.spinsRemaining} spins.`);
      } catch (error) {
        say('error', error.message || 'Could not add Market spins.');
        return;
      } finally {
        setRedeemingRewardId(null);
      }
    }

    saveRewardState(inventory.map((r) => (r.id === item.id ? { ...r, used: true } : r)), wheelRotation);
  };

  const renderSection = () => {
    if (active === 'daily') return <DailyStars user={user} onLogin={goLogin} />;

    if (active === 'swerte') {
      return (
        <section className="rw-swerte">
          <div className="rw-wheel-stage">
            <div className="rw-pointer" aria-hidden="true" />
            <div className="rw-wheel-shell">
            <div className={`rw-wheel${isSpinning ? ' is-spinning' : ''}`} style={{ transform: `rotate(${wheelRotation}deg)` }} aria-label="Swerte prize wheel">
              {wheelPrizes.map((prize, index) => {
                if (!prize) return null;
                const angle = index * (360 / wheelPrizes.length);
                const rad = (angle * Math.PI) / 180;
                return (
                  <div
                    className={`rw-wheel-label${prize.key === 'stars' ? ' stars' : ''}`}
                    key={`${prize.key}-${index}`}
                    style={{
                      left: `${50 + Math.sin(rad) * 39}%`,
                      top: `${50 - Math.cos(rad) * 39}%`,
                      transform: `translate(-50%, -50%) rotate(${angle + 90}deg)`
                    }}
                  >
                    <img className={prize.imageWide ? 'wide' : ''} src={prize.image} alt="" />
                    {prize.key === 'stars' && <strong>500K</strong>}
                  </div>
                );
              })}
              <div className="rw-hub" aria-hidden="true">✦</div>
            </div>
            </div>
          </div>
          <p className="rw-wheel-count">
            {email
              ? swerteSpinsRemaining === null
                ? 'Loading daily Swerte spin...'
                : hasSpunToday
                  ? '0 Swerte spins left. Come back tomorrow.'
                  : `${swerteSpinsRemaining} Swerte spin left. Refreshes daily at midnight Pacific Time.`
              : 'Log in to see your daily Swerte spin.'}
          </p>
          <button
            className="btn-solid rw-spin"
            type="button"
            onClick={spinWheel}
            disabled={isSpinning || (Boolean(email) && swerteSpinsRemaining !== 1)}
          >
            {!email ? 'Log in to Spin' : isSpinning ? 'Spinning...' : swerteSpinsRemaining === null ? 'Loading Spins...' : hasSpunToday ? 'Already Spun Today' : 'Spin the Wheel'}
          </button>
        </section>
      );
    }

    if (active === 'events') {
      return (
        <section className="rw-empty">
          <span aria-hidden="true">◇</span>
          <h2>No active events</h2>
          <p>Event rewards will appear here when available.</p>
        </section>
      );
    }

    return (
      <section className="rw-inventory">
        {inventory.length ? inventory.map((item) => (
          <article className="rw-item" key={item.id}>
            <div className="rw-item-icon"><img className={item.imageWide ? 'wide' : ''} src={item.image} alt="" /></div>
            <div className="rw-item-copy">
              <h2>{item.title}</h2>
              <p>{item.detail}</p>
              <span>{new Date(item.receivedAt).toLocaleDateString()}</span>
            </div>
            <button className="rw-item-action" type="button" disabled={item.used || redeemingRewardId === item.id} onClick={() => handleUseReward(item)}>
              {item.used ? (item.key === 'spins' ? 'Added to Market' : 'Used') : redeemingRewardId === item.id ? 'Adding spins...' : item.key === 'spins' ? 'Add to Market' : 'Use Now'}
            </button>
          </article>
        )) : (
          <div className="rw-empty">
            <span aria-hidden="true">▣</span>
            <h2>Your Bayong is empty</h2>
            <p>Spin the Swerte wheel to collect rewards.</p>
            <button className="btn-ghost" type="button" onClick={() => choose('swerte')}>Go to Swerte</button>
          </div>
        )}
      </section>
    );
  };

  return (
    <div className="community-page rewards-page">
      <aside className="cm-sidebar rise">
        <nav className="cm-nav" aria-label="Rewards sections">
          {bubble.style && <span className="cm-bubble" style={bubble.style} />}
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              ref={bubble.setRef(s.id)}
              className={`cm-tab${active === s.id ? ' active' : ''}`}
              aria-current={active === s.id ? 'page' : undefined}
              onClick={() => choose(s.id)}
            >
              {s.label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="cm-main">
        <div className="rw-head">
          <button type="button" className="rw-back" onClick={() => navigate('/profile')} aria-label="Back to Profile">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 5-7 7 7 7" /></svg>
            <span>Profile</span>
          </button>
          <h1 className="cm-title" key={`t-${active}`}>{title}</h1>
        </div>
        <div className="cm-section cm-scroll" key={active}>{renderSection()}</div>
      </main>

      <Feedback state={feedback} onClose={() => setFeedback((f) => ({ ...f, open: false }))} />
    </div>
  );
}
