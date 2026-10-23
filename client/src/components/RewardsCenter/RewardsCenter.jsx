import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API } from '../../api';
import Modal from '../Modal/Modal';
import Feedback from '../Feedback/Feedback';
import AgimatLogo from '../../assets/agimat_ni_juan_logo.webp';
import Spins20Image from '../../assets/20spins.png';
import AdsImage from '../../assets/ads.png';
import StarCurr from '../../assets/StarCurr.png';
import './RewardsCenter.css';

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

const rewardTabs = [
  { id: 'bayong', label: 'Bayong', icon: '▣' },
  { id: 'daily', label: 'Daily Stars', icon: '✦' },
  { id: 'swerte', label: 'Swerte', icon: '◉' },
  { id: 'events', label: 'Events', icon: '◇' }
];

const parseApiResponse = async (response) => {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error('The Swerte spin service returned an unexpected response.');
  }
  return response.json();
};

function RewardsBody({ user, dailyStreak, onClose, onOpenDaily }) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('bayong');
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

  const goLogin = () => { onClose(); navigate('/login', { state: { from: '/profile' } }); };

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

  const renderTab = () => {
    if (activeTab === 'daily') {
      return (
        <section className="rw-daily">
          <div className="rw-daily-summary">
            <img src={StarCurr} alt="" />
            <div>
              <h2>Daily Stars</h2>
              <p>{dailyStreak} day{dailyStreak === 1 ? '' : 's'} checked in this month</p>
            </div>
          </div>
          <button className="rw-primary" type="button" onClick={onOpenDaily}>Open Daily Check-In</button>
        </section>
      );
    }

    if (activeTab === 'swerte') {
      return (
        <section className="rw-swerte">
          <div className="rw-wheel-stage">
            <div className="rw-pointer" aria-hidden="true" />
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
            className="rw-primary"
            type="button"
            onClick={spinWheel}
            disabled={isSpinning || (Boolean(email) && swerteSpinsRemaining !== 1)}
          >
            {!email ? 'Log in to Spin' : isSpinning ? 'Spinning...' : swerteSpinsRemaining === null ? 'Loading Spins...' : hasSpunToday ? 'Already Spun Today' : 'Spin the Wheel'}
          </button>
        </section>
      );
    }

    if (activeTab === 'events') {
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
            <button className="rw-secondary" type="button" onClick={() => setActiveTab('swerte')}>Go to Swerte</button>
          </div>
        )}
      </section>
    );
  };

  const activeLabel = rewardTabs.find((t) => t.id === activeTab)?.label || 'Bayong';

  return (
    <div className="rw-layout">
      <aside className="rw-nav">
        <div className="rw-brand"><span aria-hidden="true">✦</span><strong>Rewards</strong></div>
        <nav aria-label="Rewards categories">
          {rewardTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`rw-tab${activeTab === tab.id ? ' active' : ''}`}
              aria-current={activeTab === tab.id ? 'page' : undefined}
              onClick={() => setActiveTab(tab.id)}
            >
              <span aria-hidden="true">{tab.icon}</span>{tab.label}
            </button>
          ))}
        </nav>
      </aside>
      <main className="rw-main">
        <header className="rw-header">
          <div>
            <p>Rewards</p>
            <h1>{activeTab === 'bayong' ? 'Your Items' : activeLabel}</h1>
          </div>
          <button className="rw-close" type="button" aria-label="Close Rewards" onClick={onClose}>×</button>
        </header>
        <div key={activeTab} className="rw-view">{renderTab()}</div>
      </main>
      <Feedback state={feedback} onClose={() => setFeedback((f) => ({ ...f, open: false }))} />
    </div>
  );
}

// Modal wrapper: RewardsBody only mounts (and loads its data) while the dialog is open
export default function RewardsCenter({ open, onClose, user, dailyStreak = 0, onOpenDaily }) {
  return (
    <Modal open={open} onClose={onClose} label="Rewards" className="rw-modal">
      <RewardsBody user={user} dailyStreak={dailyStreak} onClose={onClose} onOpenDaily={onOpenDaily} />
    </Modal>
  );
}
