import { useEffect, useState } from 'react';
import Modal from '../Modal/Modal';
import { getJSON, img, getUser, saveUser, castVote } from '../../api';
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

// The "Cast Vote" dialog: artist photo + total votes, star balance, active powerups, a numbers-only amount field
// (capped at your balance, with a MAX button), a review/verification step and the disclaimer.
export default function VoteModal({ open, artist, pollTitle = '', onClose, onVoted }) {
  const [step, setStep] = useState('enter'); // enter -> verify
  const [amount, setAmount] = useState('');
  const [balance, setBalance] = useState(0);
  const [powerups, setPowerups] = useState([]);
  const [agree, setAgree] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // every time the dialog opens: start fresh, show the saved balance right away, then ask the server for the real one
  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    const user = getUser();
    setStep('enter');
    setAmount('');
    setAgree(false);
    setError('');
    setSubmitting(false);
    setBalance(Number(user?.stars) || 0);
    setPowerups([]);
    if (user?.email) {
      getJSON(`/api/users/me?email=${encodeURIComponent(user.email)}`)
        .then((fresh) => {
          if (!alive) return;
          if (typeof fresh.stars === 'number') setBalance(fresh.stars);
          // powerups only show if the account actually has some that are still running
          const list = Array.isArray(fresh.powerups) ? fresh.powerups : [];
          setPowerups(list.filter((p) => p && (!p.expiresAt || new Date(p.expiresAt) > new Date())));
        })
        .catch(() => {});
    }
    return () => { alive = false; };
  }, [open]);

  const max = Math.max(0, Math.floor(Number(balance) || 0));
  const num = amount === '' ? 0 : Number(amount);
  const left = max - num;

  // numbers only; typing more than you own snaps to your whole balance
  const onType = (e) => {
    let v = digitsOnly(e.target.value);
    if (v !== '' && Number(v) > max) v = String(max);
    setAmount(v === '0' ? '' : v);
  };

  const goVerify = () => {
    if (num < 1) return;
    setError('');
    setAgree(false);
    setStep('verify');
  };

  const confirm = async () => {
    if (!artist || num < 1 || !agree || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const user = getUser();
      const result = await castVote(artist._id || artist.id, user, num);
      saveUser({
        ...user,
        stars: result.remainingStars,
        ...(result.remainingSuns !== undefined ? { suns: result.remainingSuns } : {})
      });
      onVoted?.({ artist, amount: num, result });
    } catch (err) {
      setError(err.message || 'Could not cast your vote.');
    } finally {
      setSubmitting(false);
    }
  };

  const photo = artist?.imageUrl ? { backgroundImage: `url("${img(artist.imageUrl)}")` } : {};

  return (
    <Modal open={open} onClose={onClose} label="Cast your vote" className="vote-modal">
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
        <b><img className="vm-star" src={StarCurr} alt="" />{fmt(max)}</b>
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

      {step === 'enter' ? (
        <div className="vm-body">
          <label className="vm-label" htmlFor="vote-amount">Stars to cast</label>
          <div className="vm-input">
            <img className="vm-star" src={StarCurr} alt="" />
            <input
              id="vote-amount"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              placeholder="0"
              value={amount}
              onChange={onType}
              onKeyDown={(e) => { if (e.key === 'Enter') goVerify(); }}
              disabled={max < 1}
            />
            <button type="button" className="vm-max" onClick={() => setAmount(max > 0 ? String(max) : '')} disabled={max < 1}>MAX</button>
          </div>
          <div className="vm-hint">
            <span>{max < 1 ? 'You have no stars to cast.' : `Up to ${fmt(max)} stars`}</span>
            <span>Left after: <b>{fmt(left)}</b></span>
          </div>
          <button type="button" className="btn-solid vm-cast" onClick={goVerify} disabled={num < 1}>Cast Vote</button>
        </div>
      ) : (
        <div className="vm-body">
          <div className="vm-label">Check before you cast</div>
          <dl className="vm-review">
            <div><dt>Voting for</dt><dd>{artist?.name}</dd></div>
            <div><dt>Stars to cast</dt><dd><img className="vm-star" src={StarCurr} alt="" />{fmt(num)}</dd></div>
            <div><dt>Balance after</dt><dd><img className="vm-star" src={StarCurr} alt="" />{fmt(left)}</dd></div>
          </dl>
          <label className="vm-agree">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span>I checked my vote. I understand stars cast can't be returned.</span>
          </label>
          {error && <p className="vm-error" role="alert">{error}</p>}
          <div className="vm-actions">
            <button type="button" className="btn-ghost" onClick={() => setStep('enter')} disabled={submitting}>Back</button>
            <button type="button" className="btn-solid" onClick={confirm} disabled={!agree || submitting}>
              {submitting ? 'Casting…' : 'Confirm & Cast'}
            </button>
          </div>
        </div>
      )}

      <div className="vm-disclaimer">
        <strong>Disclaimer</strong>
        <ul>
          <li>Votes cast cannot and will not be returned. Check your vote is correct before you cast it.</li>
          <li>Connectivity issues can affect your voting. We are not liable for any delayed casting of votes.</li>
          <li>Cast your votes in advance.</li>
        </ul>
      </div>
    </Modal>
  );
}
