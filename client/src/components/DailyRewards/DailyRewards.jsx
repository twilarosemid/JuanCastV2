import { useState } from 'react';
import Modal from '../Modal/Modal';
import StarBanner from '../../assets/StarBanner.jpg';
import STAR1 from '../../assets/STAR1.png';
import STAR2 from '../../assets/STAR2.png';
import STAR3 from '../../assets/STAR3.png';
import STAR4 from '../../assets/STAR4.png';
import STAR5 from '../../assets/STAR5.png';
import STAR6 from '../../assets/STAR6.png';
import STAR7 from '../../assets/STAR7.png';
import './DailyRewards.css';

// Display only: the server decides the real amount for each streak day.
const REWARDS = [
  { day: 1, value: 50, icon: STAR1 },
  { day: 2, value: 100, icon: STAR2 },
  { day: 3, value: 250, icon: STAR3 },
  { day: 4, value: 400, icon: STAR4 },
  { day: 5, value: 650, icon: STAR5 },
  { day: 6, value: 800, icon: STAR6 },
  { day: 7, value: 1000, icon: STAR7 }
];

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

// What the check-in should show right now, matching how the server counts the streak:
// miss a day, or finish day 7, and the next claim starts again at Day 1.
export const dailyState = (user) => {
  const last = user?.lastClaimDate ? new Date(user.lastClaimDate) : null;
  const today = startOfDay(new Date());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const claimedToday = Boolean(last) && startOfDay(last) === today;
  const claimedYesterday = Boolean(last) && startOfDay(last) === yesterday.getTime();

  let streak = user?.dailyStreak || 0;
  if (!claimedToday && !claimedYesterday) streak = 0;
  if (!claimedToday && streak >= 7) streak = 0;
  return { streak, claimedToday };
};

// onClaim() -> Promise<{ ok: true, day, gained } | { ok: false, message }>
export default function DailyRewards({ open, onClose, streak = 0, claimedToday = false, onClaim }) {
  const [busy, setBusy] = useState(false);
  const [won, setWon] = useState(null);
  const [notice, setNotice] = useState('');

  const statusOf = (day) => {
    if (day <= streak) return 'claimed';
    if (day === streak + 1 && !claimedToday) return 'available';
    return 'locked';
  };

  const claim = async () => {
    if (busy) return;
    setBusy(true);
    setNotice('');
    const result = await onClaim();
    setBusy(false);
    if (result.ok) setWon(result);
    else setNotice(result.message || 'Could not claim your reward.');
  };

  const close = () => { setWon(null); setNotice(''); onClose(); };
  const wonReward = won ? REWARDS[Math.min(Math.max(won.day, 1), 7) - 1] : null;

  const Action = ({ status }) => (
    status === 'available'
      ? <button type="button" className="dr-btn claim" onClick={claim} disabled={busy}>{busy ? '...' : 'CLAIM'}</button>
      : <span className={`dr-btn ${status === 'claimed' ? 'done' : 'locked'}`}>{status === 'claimed' ? 'CLAIMED' : 'CLAIM'}</span>
  );

  return (
    <Modal open={open} onClose={close} label="Daily check-in" className="dr-modal">
      {won && wonReward ? (
        <div className="dr-win">
          <h2>Day {won.day} Claimed!</h2>
          <div className="dr-win-icon"><img src={wonReward.icon} alt="" /></div>
          <p className="dr-win-amount">+{won.gained.toLocaleString()} <span>STARS</span></p>
          <p className="dr-win-note">Awesome! Come back tomorrow to keep your streak alive.</p>
          <button type="button" className="btn-solid" onClick={close}>Continue</button>
        </div>
      ) : (
        <>
          <img className="dr-banner" src={StarBanner} alt="Claim your daily Stars" />
          <div className="dr-body">
            <header className="dr-head">
              <h2>Daily Check-In</h2>
              <p>Checked in for <strong>{streak}</strong> day{streak === 1 ? '' : 's'} this month</p>
            </header>

            <div className="dr-grid">
              {REWARDS.slice(0, 6).map((r) => {
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

            <div className={`dr-card dr-grand ${statusOf(7)}`}>
              <div className="dr-grand-info">
                <span className="dr-tag">GRAND PRIZE</span>
                <h3>Day 7</h3>
                <strong>1,000 STARS</strong>
              </div>
              <img src={STAR7} alt="" />
              <Action status={statusOf(7)} />
            </div>

            {notice && <p className="dr-notice" role="alert">{notice}</p>}
            <button type="button" className="btn-ghost dr-close" onClick={close}>Close</button>
          </div>
        </>
      )}
    </Modal>
  );
}
