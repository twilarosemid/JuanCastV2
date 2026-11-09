import { useEffect, useState } from 'react';
import { getJSON, getUser } from '../../../api';
import NunuLogo from '../../../assets/nunu_sa_punso_logo.webp';
import AgimatLogo from '../../../assets/agimat_ni_juan_logo.webp';
import ApolakiLogo from '../../../assets/apolaki_logo.webp';
import './Powerups.css';

const powerups = [
  { name: 'Nuno sa Punso', detail: 'Stars voted will be multiplied 3x', duration: '30 min', minutes: 30, price: 5999, image: NunuLogo },
  { name: 'Agimat ni Juan', detail: 'Stars voted will be multiplied 2x', duration: '60 min', minutes: 60, price: 1499, image: AgimatLogo },
  { name: 'Apolaki', detail: 'Suns voted will be multiplied 2x', duration: '30 min', minutes: 30, price: 2999, image: ApolakiLogo }
];

const norm = (value) => String(value || '').trim().toLowerCase();

// 1500000 ms -> "25:00", and "1:05:09" once there is more than an hour left
const clock = (ms) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
};

export default function Powerups() {
  const [expiries, setExpiries] = useState({}); // powerup name -> time it ends (ms)
  const [now, setNow] = useState(Date.now());

  // ask the server which powerups this account has running; ask again when the tab regains focus (e.g. after buying one)
  useEffect(() => {
    let alive = true;
    const load = () => {
      const user = getUser();
      if (!user?.email) return;
      getJSON(`/api/users/me?email=${encodeURIComponent(user.email)}`)
        .then((me) => {
          if (!alive) return;
          const next = {};
          (Array.isArray(me.powerups) ? me.powerups : []).forEach((p) => {
            const end = p?.expiresAt ? new Date(p.expiresAt).getTime() : NaN;
            if (!Number.isFinite(end) || end <= Date.now()) return;
            const key = norm(p.name || p.key);
            next[key] = Math.max(next[key] || 0, end);
          });
          setNow(Date.now());
          setExpiries(next);
        })
        .catch(() => {});
    };
    load();
    window.addEventListener('focus', load);
    return () => { alive = false; window.removeEventListener('focus', load); };
  }, []);

  // tick once a second, but only while something is actually counting down
  const anyActive = Object.values(expiries).some((end) => end > now);
  useEffect(() => {
    if (!anyActive) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [anyActive]);

  return (
    <>
      <div className="powerup-grid">
        {powerups.map(({ name, detail, duration, minutes, price, image }, i) => {
          const left = (expiries[norm(name)] || 0) - now;
          const active = left > 0;
          const locked = anyActive && !active; // one powerup at a time: can't buy or activate another until it ends
          const pct = Math.min(100, (left / (minutes * 60000)) * 100);
          return (
            <article className={`mk-card powerup-card${active ? ' is-active' : ''}${locked ? ' is-locked' : ''}`}
              aria-disabled={locked || undefined} key={name} style={{ '--i': i }}>
              {active ? (
                <>
                  <span className="powerup-badge">Active</span>
                  <span className="powerup-duration is-live" role="timer" aria-label={`${clock(left)} remaining`}><i aria-hidden="true" />{clock(left)}</span>
                </>
              ) : (
                <span className="powerup-duration">{duration}</span>
              )}
              {locked && <span className="powerup-lock">Unavailable while a powerup is active</span>}
              <img className="powerup-icon" src={image} alt="" />
              <h2>{name}</h2>
              <p>{detail}</p>
              {active && <div className="powerup-bar" aria-hidden="true"><span style={{ width: `${pct}%` }} /></div>}
              <strong className="mk-price">PHP {price.toLocaleString()}</strong>
            </article>
          );
        })}
      </div>
      {anyActive && <p className="mk-note">You already have a powerup running. You can buy or activate another one once it ends.</p>}
      <p className="mk-note">Powerup checkout is not available yet.</p>
    </>
  );
}
