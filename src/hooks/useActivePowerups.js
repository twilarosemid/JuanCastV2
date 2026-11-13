import { useEffect, useState } from 'react';
import { getJSON } from '../api';
import NunuLogo from '../assets/nunu_sa_punso_logo.webp';
import AgimatLogo from '../assets/agimat_ni_juan_logo.webp';
import ApolakiLogo from '../assets/apolaki_logo.webp';

// known powerups: full length in minutes (for the pie) and their picture
const INFO = {
  'nuno sa punso': { minutes: 30, image: NunuLogo },
  'agimat ni juan': { minutes: 60, image: AgimatLogo },
  apolaki: { minutes: 30, image: ApolakiLogo }
};
const norm = (value) => String(value || '').trim().toLowerCase();

// 1500000 ms -> "25:00", and "1:05:09" once there is more than an hour left
export const clock = (ms) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
};

// The powerups this account has running right now, each with live `left` (ms) and `pct` (0-100 of its time still left).
// Reads the same `powerups` list ({ name, multiplier, expiresAt }) that /api/users/me gives the Vote popup.
export default function useActivePowerups(email) {
  const [list, setList] = useState([]);
  const [now, setNow] = useState(Date.now());

  // ask the server on login, every minute, when the tab regains focus, and after the saved user changes (vote, purchase)
  useEffect(() => {
    if (!email) { setList([]); return undefined; }
    let alive = true;
    const load = () => getJSON(`/api/users/me?email=${encodeURIComponent(email)}`)
      .then((me) => {
        if (!alive) return;
        const next = (Array.isArray(me.powerups) ? me.powerups : [])
          .map((p) => {
            const end = p?.expiresAt ? new Date(p.expiresAt).getTime() : NaN;
            if (!Number.isFinite(end) || end <= Date.now()) return null;
            const key = norm(p.name || p.key);
            const info = INFO[key] || {};
            const start = new Date(p.startedAt || p.startsAt || p.activatedAt || NaN).getTime();
            const total = Number.isFinite(start) && end > start ? end - start : (info.minutes || 0) * 60000;
            return { key: `${key}-${end}`, name: p.name || p.key || 'Powerup', multiplier: p.multiplier, end, total, image: info.image };
          })
          .filter(Boolean);
        setNow(Date.now());
        setList(next);
      })
      .catch(() => {});
    load();
    const id = setInterval(load, 60000);
    window.addEventListener('focus', load);
    window.addEventListener('juancast-user-updated', load);
    return () => {
      alive = false;
      clearInterval(id);
      window.removeEventListener('focus', load);
      window.removeEventListener('juancast-user-updated', load);
    };
  }, [email]);

  // tick every second, but only while something is actually counting down
  const anyActive = list.some((p) => p.end > now);
  useEffect(() => {
    if (!anyActive) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [anyActive]);

  return list
    .filter((p) => p.end > now)
    .map((p) => {
      const left = p.end - now;
      return { ...p, left, pct: p.total ? Math.min(100, Math.max(0, (left / p.total) * 100)) : 100 };
    });
}
