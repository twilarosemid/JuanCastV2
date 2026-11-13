import { useEffect, useRef, useState } from 'react';
import Modal from '../Modal/Modal';
import { API, mergeUser, saveUser } from '../../api';
import StarCurr from '../../assets/StarCurr.png';
import SunCurr from '../../assets/SunCurr.png';
import './PromoCode.css';

// Popup with a promo code box. The server decides what a code is worth and who may use it.
export default function PromoCode({ open, onClose, user, onLogin }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [won, setWon] = useState(null); // { stars, suns } once a code works
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    setCode('');
    setError('');
    setWon(null);
    const t = window.setTimeout(() => inputRef.current?.focus(), 150);
    return () => window.clearTimeout(t);
  }, [open]);

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    if (!user?.email) { onLogin?.(); return; }
    const value = code.trim();
    if (!value) { setError('Enter a promo code.'); return; }

    setBusy(true);
    setError('');
    try {
      const res = await fetch(`${API}/api/users/redeem-promo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, code: value })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Could not redeem the code.');
      saveUser(mergeUser(user, data));
      setWon({ stars: data.promoReward?.stars || 0, suns: data.promoReward?.suns || 0 });
    } catch (err) {
      setError(err.message || 'Server error. Please try again later.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} label="Promo code" className="promo-modal">
      {won ? (
        <div className="promo-win">
          <h3>Code redeemed!</h3>
          <div className="promo-rewards">
            {won.stars > 0 && <span className="promo-reward"><img src={StarCurr} alt="" />+{won.stars.toLocaleString()} <small>STARS</small></span>}
            {won.suns > 0 && <span className="promo-reward"><img src={SunCurr} alt="" />+{won.suns.toLocaleString()} <small>SUNS</small></span>}
          </div>
          <p>The reward has been added to your account.</p>
          <button type="button" className="btn-solid" onClick={onClose}>Continue</button>
        </div>
      ) : (
        <form onSubmit={submit} noValidate>
          <h3>Promo Code</h3>
          <p>Got a code? Enter it to claim your reward.</p>
          <label htmlFor="promo-code-input">Promo code</label>
          <input
            id="promo-code-input"
            ref={inputRef}
            className="promo-input"
            type="text"
            value={code}
            maxLength={30}
            placeholder="ENTER CODE"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            onChange={(e) => { setCode(e.target.value); if (error) setError(''); }}
          />
          {error && <p className="promo-error" role="alert">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="btn-solid" disabled={busy || !code.trim()}>{busy ? 'Checking…' : 'Redeem'}</button>
          </div>
        </form>
      )}
    </Modal>
  );
}
