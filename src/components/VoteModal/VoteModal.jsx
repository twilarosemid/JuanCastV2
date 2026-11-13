import { useEffect, useState } from 'react';
import Modal from '../Modal/Modal';
import { getJSON, img, getUser, saveUser, castVote } from '../../api';
import SunCurr from '../../assets/SunCurr.png';
import StarCurr from '../../assets/StarCurr.png';
import './VoteModal.css';

const digitsOnly = (value) => String(value).replace(/\D/g, '').replace(/^0+(?=\d)/, '');
const fmt = (n) => Number(n || 0).toLocaleString('en-US');

// time left on a powerup, e.g. "24 min left"
const timeLeft = (expiresAt) => {
  if (!expiresAt) return '';
  const ms = new Date(expiresAt) - Date.now();
  if (!(ms > 0)) return '';
  const min = Math.ceil(ms / 60000);
  return min >= 60 ? `${Math.floor(min / 60)}h ${min % 60}m left` : `${min} min left`;
};

// The "Cast Vote" dialog: artist photo + total votes, balance, active powerups, a numbers-only amount field
// (capped at your balance, with a MAX button), then a small confirmation pop-up, and the disclaimer.
// currency: 'stars' for polls, 'suns' for fan projects (polls with a goal)
export default function VoteModal({ open, artist, pollTitle = '', currency = 'stars', onClose, onVoted }) {
  const isSuns = currency === 'suns';
  const unit = isSuns ? 'Sun' : 'Star';
  const units = isSuns ? 'Suns' : 'Stars';
  const Curr = isSuns ? SunCurr : StarCurr;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [balance, setBalance] = useState(0);
  const [powerups, setPowerups] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // every time the dialog opens: start fresh, show the saved balance right away, then ask the server for the real one
  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    const user = getUser();
    setConfirmOpen(false);
    setAmount('');
    setError('');
    setSubmitting(false);
    setBalance(Number(isSuns ? user?.suns : user?.stars) || 0);
    setPowerups([]);
    if (user?.email) {
      getJSON(`/api/users/me?email=${encodeURIComponent(user.email)}`)
        .then((fresh) => {
          if (!alive) return;
          const bal = isSuns ? fresh.suns : fresh.stars;
          if (typeof bal === 'number') setBalance(bal);
          // powerups only show if the account actually has some that are still running
          const list = Array.isArray(fresh.powerups) ? fresh.powerups : [];
          setPowerups(list.filter((p) => p && (!p.expiresAt || new Date(p.expiresAt) > new Date())));
        })
        .catch(() => {});
    }
    return () => { alive = false; };
  }, [open, isSuns]);

  const max = Math.max(0, Math.floor(Number(balance) || 0));
  const num = amount === '' ? 0 : Number(amount);
  const left = max - num;

  // numbers only; typing more than you own snaps to your whole balance
  const onType = (e) => {
    let v = digitsOnly(e.target.value);
    if (v !== '' && Number(v) > max) v = String(max);
    setAmount(v === '0' ? '' : v);
  };

  // "Cast Vote" only opens a small confirmation pop-up; nothing is spent until it is confirmed
  const goConfirm = () => {
    if (num < 1) return;
    setError('');
    setConfirmOpen(true);
  };

  const confirm = async () => {
    if (!artist || num < 1 || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const user = getUser();
      const result = await castVote(artist._id || artist.id, user, num, isSuns ? 'suns' : 'stars');
      saveUser({
        ...user,
        suns: result.remainingSuns,
        ...(result.remainingStars !== undefined ? { stars: result.remainingStars } : {})
      });
      setConfirmOpen(false);
      onVoted?.({ artist, amount: num, result, currency: isSuns ? 'suns' : 'stars' });
    } catch (err) {
      setError(err.message || 'Could not cast your vote.');
    } finally {
      setSubmitting(false);
    }
  };

  const photo = artist?.imageUrl ? { backgroundImage: `url("${img(artist.imageUrl)}")` } : {};

  return (
    <>
    <Modal open={open} onClose={() => { if (!confirmOpen) onClose?.(); }} label="Cast your vote" className="vote-modal">
      <div className="vm-head">
        <div>
          <div className="vm-eyebrow">Cast Vote</div>
          {pollTitle && <div className="vm-poll">{pollTitle}</div>}
        </div>
        <button type="button" className="vm-close" onClick={onClose} aria-label="Close">×</button>
      </div>

      <div className="vm-artist">
        <div className="vm-photo" style={photo} role="img" aria-label={artist?.name || 'Artist'} />
        <div className="vm-artist-info">
          <h3 className="vm-name">{artist?.name}</h3>
          <div className="vm-total"><strong>{fmt(artist?.voteCount)}</strong><small>total votes</small></div>
        </div>
      </div>

      <div className="vm-balance">
        <span>Your balance</span>
        <b><img className="vm-star" src={Curr} alt="" />{fmt(max)}</b>
      </div>

      {powerups.length > 0 && (
        <div className="vm-powerups">
          <div className="vm-label">Active powerups</div>
          <ul>
            {powerups.map((p, i) => (
              <li key={`${p.name}-${i}`}>
                <b>{p.name || 'Powerup'}</b>
                {p.multiplier ? <span>×{p.multiplier}</span> : null}
                {timeLeft(p.expiresAt) ? <small>{timeLeft(p.expiresAt)}</small> : null}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="vm-body">
        <label className="vm-label" htmlFor="vote-amount">{units} to cast</label>
        <div className="vm-input">
          <img className="vm-star" src={Curr} alt="" />
          <input
            id="vote-amount"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            placeholder="0"
            value={amount}
            onChange={onType}
            onKeyDown={(e) => { if (e.key === 'Enter') goConfirm(); }}
            disabled={max < 1}
          />
          <button type="button" className="vm-max" onClick={() => setAmount(max > 0 ? String(max) : '')} disabled={max < 1}>MAX</button>
        </div>
        <div className="vm-quick">
          {[1, 5, 10, 50].filter((n) => n <= max).map((n) => (
            <button key={n} type="button" className={num === n ? 'on' : ''} onClick={() => setAmount(String(n))}>+{n}</button>
          ))}
        </div>
        <div className="vm-hint">
          <span>{max < 1 ? `You have no ${units} to cast.` : `Up to ${fmt(max)} ${units} · 1 ${unit} = 1 vote`}</span>
          <span>Left after: <b>{fmt(left)}</b></span>
        </div>
        <button type="button" className="btn-solid vm-cast" onClick={goConfirm} disabled={num < 1}>Cast Vote</button>
      </div>

      <div className="vm-disclaimer">
        <strong>Disclaimer</strong>
        <ul>
          <li>Votes cast cannot and will not be returned. Check your vote is correct before you cast it.</li>
          <li>Connectivity issues can affect your voting. We are not liable for any delayed casting of votes.</li>
          <li>Cast your votes in advance.</li>
        </ul>
      </div>
    </Modal>

    <Modal open={open && confirmOpen} onClose={() => { if (!submitting) setConfirmOpen(false); }} label="Confirm your vote" role="alertdialog" className="vote-confirm">
      <div className="center">
        <div className="vc-photo" style={photo} role="img" aria-label={artist?.name || 'Artist'} />
        <h3>Cast {fmt(num)} {num === 1 ? unit : units} for {artist?.name}?</h3>
        <p className="vc-text">
          <img className="vm-star" src={Curr} alt="" />{fmt(num)} {num === 1 ? unit : units} will be spent. Votes cast can't be returned.
        </p>
        {error && <p className="vm-error" role="alert">{error}</p>}
        <div className="vm-actions vc-actions">
          <button type="button" className="btn-ghost" onClick={() => setConfirmOpen(false)} disabled={submitting}>Cancel</button>
          <button type="button" className="btn-solid" onClick={confirm} disabled={submitting}>{submitting ? 'Casting…' : 'Confirm'}</button>
        </div>
      </div>
    </Modal>
    </>
  );
}
