import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { API, saveUser } from '../../../api';
import StarCurr from '../../../assets/StarCurr.png';
import SunCurr from '../../../assets/SunCurr.png';
import './SunsConvert.css';

const starsPerSun = 1800;

export default function SunsConvert({ user }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [sunAmount, setSunAmount] = useState('');
  const [status, setStatus] = useState('');
  const [converting, setConverting] = useState(false);

  const stars = user?.stars || 0;
  const suns = user?.suns || 0;
  const sunsToGet = Number(sunAmount);
  const starCost = Number.isSafeInteger(sunsToGet) && sunsToGet > 0 ? sunsToGet * starsPerSun : 0;

  const convert = async (event) => {
    event.preventDefault();
    setStatus('');

    if (!user?.email) { navigate('/login', { state: { from: location.pathname + location.search } }); return; }
    if (!Number.isSafeInteger(sunsToGet) || sunsToGet < 1) {
      setStatus('Enter a whole number of Suns to get.');
      return;
    }
    if (starCost > stars) {
      setStatus('Not enough Stars for this conversion.');
      return;
    }

    setConverting(true);
    try {
      const response = await fetch(`${API}/api/users/convert-stars`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, suns: sunsToGet })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Conversion failed.');

      saveUser({ ...user, stars: result.stars, suns: result.suns }); // updates the page, no reload
      setSunAmount('');
      setStatus(`Converted ${result.spentStars.toLocaleString()} Stars into ${result.addedSuns} Sun${result.addedSuns === 1 ? '' : 's'}.`);
    } catch (error) {
      setStatus(error.message || 'Conversion failed.');
    } finally {
      setConverting(false);
    }
  };

  return (
    <>
      <div className="sc-balances">
        <span><img src={SunCurr} alt="" /> {suns.toLocaleString()} Suns</span>
        <span><img src={StarCurr} alt="" /> {stars.toLocaleString()} Stars</span>
      </div>

      <form className="mk-panel sc-form" onSubmit={convert}>
        <div className="sc-rate">
          <img src={StarCurr} alt="" /><strong>{starsPerSun.toLocaleString()}</strong><span>=</span><strong>1</strong><img src={SunCurr} alt="" />
        </div>
        <label htmlFor="sun-conversion-amount">Number of Suns you want</label>
        <input
          id="sun-conversion-amount"
          type="number"
          min="1"
          step="1"
          inputMode="numeric"
          placeholder="Enter the number of Suns you want"
          value={sunAmount}
          onChange={(e) => setSunAmount(e.target.value)}
        />
        <div className="sc-result">
          <span>Stars to spend</span>
          <strong>{starCost.toLocaleString()}</strong>
        </div>
        <button className="mk-btn" type="submit" disabled={converting}>
          {converting ? 'Converting...' : 'Convert Stars to Suns'}
        </button>
        {status && <p className="mk-status" role="status">{status}</p>}
      </form>

      <ul className="sc-rules">
        <li>Converted Suns cannot be converted back into Stars.</li>
        <li>Converted Suns are added to your balance immediately.</li>
      </ul>
    </>
  );
}
