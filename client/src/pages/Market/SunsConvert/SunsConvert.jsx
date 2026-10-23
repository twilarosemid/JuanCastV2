import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { API, saveUser } from '../../../api';
import StarCurr from '../../../assets/StarCurr.png';
import SunCurr from '../../../assets/SunCurr.png';
import './SunsConvert.css';

const sunsToStarsRate = 1800;

export default function SunsConvert({ user }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [sunAmount, setSunAmount] = useState('');
  const [status, setStatus] = useState('');
  const [converting, setConverting] = useState(false);

  const stars = user?.stars || 0;
  const suns = user?.suns || 0;
  const sunsToConvert = Number(sunAmount);
  const totalStars = Number.isSafeInteger(sunsToConvert) && sunsToConvert > 0 ? sunsToConvert * sunsToStarsRate : 0;

  const convert = async (event) => {
    event.preventDefault();
    setStatus('');

    if (!user?.email) { navigate('/login', { state: { from: location.pathname + location.search } }); return; }
    if (!Number.isSafeInteger(sunsToConvert) || sunsToConvert < 1) {
      setStatus('Enter a whole number of Suns to convert.');
      return;
    }

    setConverting(true);
    try {
      const response = await fetch(`${API}/api/users/convert-suns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, suns: sunsToConvert })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Conversion failed.');

      saveUser({ ...user, stars: result.stars, suns: result.suns }); // updates the page, no reload
      setSunAmount('');
      setStatus(`Converted ${result.convertedSuns} Sun${result.convertedSuns === 1 ? '' : 's'}.`);
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
          <img src={SunCurr} alt="" /><strong>1</strong><span>=</span><strong>{sunsToStarsRate.toLocaleString()}</strong><img src={StarCurr} alt="" />
        </div>
        <label htmlFor="sun-conversion-amount">Number of Suns</label>
        <input
          id="sun-conversion-amount"
          type="number"
          min="1"
          step="1"
          inputMode="numeric"
          placeholder="Enter the number of Suns"
          value={sunAmount}
          onChange={(e) => setSunAmount(e.target.value)}
        />
        <div className="sc-result">
          <span>Total stars</span>
          <strong>{totalStars.toLocaleString()}</strong>
        </div>
        <button className="mk-btn" type="submit" disabled={converting}>
          {converting ? 'Converting...' : 'Convert Suns to Stars'}
        </button>
        {status && <p className="mk-status" role="status">{status}</p>}
      </form>

      <ul className="sc-rules">
        <li>Converted Stars cannot be converted back into Suns.</li>
        <li>Converted Stars are added to your balance immediately.</li>
      </ul>
    </>
  );
}
