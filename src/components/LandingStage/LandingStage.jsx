import { useEffect, useRef, useState } from 'react';
import logoImg from '../../assets/juancast_logo.webp';
import card1 from '../../assets/landing/card-1.webp';
import card2 from '../../assets/landing/card-2.webp';
import card3 from '../../assets/landing/card-3.webp';
import card4 from '../../assets/landing/card-4.webp';
import { CloudArt, StarArt, SunArt } from './art';
import './LandingStage.css';

/*
  The landing banner, rebuilt from live elements instead of a looping video:
  - the pointer moves every layer a little (parallax) and lights up the grid
  - the logo "casts" music notes towards the crew (click it, or wait a few seconds)
  - each character card tilts in 3D, glares, and cheers when you tap it
  - stars pop, the sun flares, clouds puff
  Everything is DOM + CSS; the only JS is the pointer handling and spawning short-lived sparkles.
*/

const CARDS = [card1, card2, card3, card4];

// x / y = % of the stage, w = width in vw (x/y are the centre for stars + sun, the top-left corner for clouds)
const CLOUDS = [
  // top-left corner cluster
  { id: 'c1', x: -7, y: -11, w: 25, depth: 10, dur: 46, z: 1 },
  { id: 'c2', x: -2, y: 1, w: 14, depth: 16, dur: 38, flip: true, z: 2 },
  // bottom-right corner cluster
  { id: 'c3', x: 79, y: 75, w: 27, depth: 14, dur: 52, flip: true, z: 2 },
  { id: 'c4', x: 90, y: 64, w: 15, depth: 20, dur: 40, z: 1 },
  // under the sun
  { id: 'c5', x: -6, y: 85, w: 19, depth: 18, dur: 44, z: 2 },
  { id: 'c6', x: 7, y: 90, w: 14, depth: 24, dur: 36, flip: true, z: 2 },
  // small drifters
  { id: 'c7', x: 31, y: 7, w: 8.5, depth: 26, dur: 30, z: 1 },
  { id: 'c8', x: 49, y: 1, w: 10, depth: 30, dur: 34, flip: true, z: 1 },
  { id: 'c9', x: 57, y: 88, w: 9, depth: 28, dur: 32, z: 1 },
  { id: 'c10', x: 22, y: 76, w: 7, depth: 32, dur: 28, flip: true, z: 1 }
];

const STARS = [
  { id: 's1', x: 3.8, y: 17, w: 7.4, rot: -14, depth: 30, delay: 300 },
  { id: 's2', x: 12, y: 10.5, w: 4.7, rot: 12, depth: 38, delay: 420 },
  { id: 's3', x: 94.4, y: 85, w: 8.2, rot: 16, depth: 32, delay: 520 },
  { id: 's4', x: 15, y: 71, w: 2.5, rot: 10, depth: 44, delay: 640 },
  { id: 's5', x: 3.5, y: 63, w: 1.9, rot: -8, depth: 40, delay: 700 },
  { id: 's6', x: 90.5, y: 57, w: 2.3, rot: 20, depth: 42, delay: 760 },
  { id: 's7', x: 52, y: 15, w: 1.7, rot: -18, depth: 46, delay: 820 },
  { id: 's8', x: 38, y: 90, w: 1.9, rot: 14, depth: 40, delay: 880 }
];

// tiny background twinkles, generated once with a fixed seed so they never jump around between renders
const TWINKLES = (() => {
  let seed = 7;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  return Array.from({ length: 30 }, (_, i) => ({
    id: i,
    x: +(rand() * 100).toFixed(1),
    y: +(rand() * 100).toFixed(1),
    s: Math.round(9 + rand() * 15),
    o: +(0.14 + rand() * 0.2).toFixed(2),
    dur: +(2.6 + rand() * 3.4).toFixed(1),
    delay: +(rand() * 4).toFixed(1)
  }));
})();

const NOTES = ['♪', '♫', '♬', '♩'];
const MAX_PARTICLES = 160;

const rand = (a, b) => a + Math.random() * (b - a);
const replay = (el, cls) => {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth; // restart the CSS animation
  el.classList.add(cls);
};

export default function LandingStage({ children }) {
  const stageRef = useRef(null);
  const fxRef = useRef(null);
  const logoRef = useRef(null);
  const cardsRef = useRef(null);
  const sunRef = useRef(null);
  const reduced = useRef(false);
  const trail = useRef({ x: -999, y: -999, t: 0 });
  const raf = useRef(0);
  const pops = useRef(0);
  const [ping, setPing] = useState(0);

  useEffect(() => {
    reduced.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  // ---------- tiny particle helper: makes a short-lived element, removes it when its animation ends ----------
  const spawn = (kind, x, y, o = {}) => {
    const fx = fxRef.current;
    if (!fx || reduced.current || fx.childElementCount > MAX_PARTICLES) return;
    const el = document.createElement('span');
    el.className = `ls-p ls-p-${kind}`;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    const set = (k, v) => el.style.setProperty(k, v);
    set('--dx', `${o.dx ?? 0}px`);
    set('--dy', `${o.dy ?? 0}px`);
    set('--s', `${o.size ?? 14}px`);
    set('--rot', `${o.rot ?? 0}deg`);
    set('--dur', `${o.dur ?? 900}ms`);
    set('--delay', `${o.delay ?? 0}ms`);
    if (o.lift !== undefined) set('--lift', `${o.lift}px`);
    if (o.glyph) {
      const inner = document.createElement('i');
      inner.textContent = o.glyph;
      el.appendChild(inner);
    }
    el.addEventListener('animationend', (e) => { if (e.target === el) el.remove(); });
    fx.appendChild(el);
  };

  const centerOf = (el) => {
    const stage = stageRef.current.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2 - stage.left, y: r.top + r.height / 2 - stage.top, w: r.width, h: r.height };
  };

  const burst = (kind, x, y, count, dist = 90) => {
    for (let i = 0; i < count; i += 1) {
      const a = (i / count) * Math.PI * 2 + rand(-0.3, 0.3);
      const d = dist * rand(0.55, 1.25);
      spawn(kind, x, y, { dx: Math.cos(a) * d, dy: Math.sin(a) * d, size: rand(10, 22), rot: rand(-160, 160), dur: rand(650, 1150) });
    }
  };

  // a stream of music notes (and a couple of hearts) flowing from the logo towards the characters
  const cast = () => {
    if (!logoRef.current || !cardsRef.current || reduced.current) return;
    const logo = centerOf(logoRef.current);
    const cards = centerOf(cardsRef.current);
    const startX = logo.x + logo.w * 0.38;
    const dx = cards.x - startX - cards.w * 0.3;
    const dy = cards.y - logo.y;
    for (let i = 0; i < 12; i += 1) {
      const heart = i === 4 || i === 9;
      spawn('note', startX + rand(-12, 12), logo.y + rand(-14, 14), {
        glyph: heart ? '♥' : NOTES[i % NOTES.length],
        dx: dx + rand(-30, 30),
        dy: dy + rand(-60, 60),
        lift: rand(-90, -30),
        size: rand(18, 30),
        dur: rand(1500, 2200),
        delay: i * 120,
        rot: heart ? 1 : 0
      });
    }
  };

  const shower = () => {
    const stage = stageRef.current.getBoundingClientRect();
    for (let i = 0; i < 24; i += 1) {
      spawn('gold', rand(0, stage.width), -30, { dx: rand(-60, 60), dy: stage.height + 80, size: rand(14, 30), rot: rand(0, 360), dur: rand(1500, 2600), delay: rand(0, 900) });
    }
  };

  // ---------- pointer: parallax + spotlight + sparkle trail ----------
  const onPointerMove = (e) => {
    const stage = stageRef.current;
    if (!stage) return;
    const { clientX, clientY, pointerType } = e;
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const r = stage.getBoundingClientRect();
      const x = clientX - r.left;
      const y = clientY - r.top;
      stage.style.setProperty('--px', (((x / r.width) - 0.5) * 2).toFixed(3));
      stage.style.setProperty('--py', (((y / r.height) - 0.5) * 2).toFixed(3));
      stage.style.setProperty('--mx', `${x}px`);
      stage.style.setProperty('--my', `${y}px`);
      stage.classList.add('lit');

      if (pointerType === 'mouse') {
        const t = trail.current;
        const now = performance.now();
        if (now - t.t > 55 && Math.hypot(x - t.x, y - t.y) > 46) {
          trail.current = { x, y, t: now };
          spawn('spark', x + rand(-6, 6), y + rand(-6, 6), { dx: rand(-14, 14), dy: rand(10, 34), size: rand(7, 13), dur: rand(520, 800) });
        }
      }
    });
  };
  const onPointerLeave = () => {
    const stage = stageRef.current;
    cancelAnimationFrame(raf.current);
    if (!stage) return;
    stage.style.setProperty('--px', 0);
    stage.style.setProperty('--py', 0);
    stage.classList.remove('lit');
  };

  // the logo keeps casting on its own every few seconds, like the original animation
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const first = setTimeout(() => { if (!document.hidden) cast(); }, 1800);
    const loop = setInterval(() => { if (!document.hidden) cast(); }, 7000);
    return () => { clearTimeout(first); clearInterval(loop); cancelAnimationFrame(raf.current); };
  }, []);

  // ---------- element reactions ----------
  const onLogo = () => {
    setPing((n) => n + 1);
    cast();
  };

  const onCard = (e) => {
    const btn = e.currentTarget;
    replay(btn, 'hit');
    const c = centerOf(btn);
    burst('spark', c.x, c.y, 10, c.w * 0.55);
    for (let i = 0; i < 4; i += 1) {
      spawn('note', c.x + rand(-c.w * 0.3, c.w * 0.3), c.y - c.h * 0.1, { glyph: i % 2 ? '♥' : NOTES[i % 4], dx: rand(-50, 50), dy: rand(-170, -110), size: rand(18, 28), dur: rand(1000, 1500), delay: i * 90, lift: 0 });
    }
  };
  const tilt = (e) => {
    if (e.pointerType === 'touch') return;
    const btn = e.currentTarget;
    const r = btn.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    btn.style.setProperty('--rx', `${((0.5 - py) * 16).toFixed(2)}deg`);
    btn.style.setProperty('--ry', `${((px - 0.5) * 18).toFixed(2)}deg`);
    btn.style.setProperty('--gx', `${(px * 100).toFixed(1)}%`);
    btn.style.setProperty('--gy', `${(py * 100).toFixed(1)}%`);
  };
  const untilt = (e) => {
    const btn = e.currentTarget;
    btn.style.setProperty('--rx', '0deg');
    btn.style.setProperty('--ry', '0deg');
  };

  const onStar = (e) => {
    const hit = e.currentTarget;
    replay(hit, 'pop');
    const c = centerOf(hit);
    burst('gold', c.x, c.y, 12, c.w * 0.9);
    pops.current += 1;
    if (pops.current % 7 === 0) shower();
  };
  const onSun = (e) => {
    replay(sunRef.current, 'flare');
    const c = centerOf(e.currentTarget);
    spawn('ring', c.x, c.y, { size: c.w * 0.5, dur: 1100 });
    spawn('ring', c.x, c.y, { size: c.w * 0.5, dur: 1500, delay: 160 });
    burst('spark', c.x, c.y, 18, c.w * 0.55);
  };
  const onCloud = (e) => {
    const hit = e.currentTarget;
    replay(hit, 'puff');
    const c = centerOf(hit);
    burst('spark', c.x, c.y, 6, c.w * 0.45);
  };

  return (
    <div className="ls" ref={stageRef} onPointerMove={onPointerMove} onPointerLeave={onPointerLeave}>
      <div className="ls-bg ls-par" style={{ '--depth': 6 }} aria-hidden="true" />
      <div className="ls-light" aria-hidden="true" />

      <div className="ls-twinkles" aria-hidden="true">
        {TWINKLES.map((t) => (
          <i key={t.id} style={{ left: `${t.x}%`, top: `${t.y}%`, '--s': `${t.s}px`, '--o': t.o, '--dur': `${t.dur}s`, '--delay': `${t.delay}s` }} />
        ))}
      </div>

      {/* sun: rises from the bottom-left corner; hover = glows, click = flares */}
      <div className="ls-item ls-par ls-sun" style={{ '--x': 8, '--y': 88, '--w': 27, '--depth': 22, '--delay': '150ms', zIndex: 2 }} aria-hidden="true">
        <div className="ls-float" style={{ '--dur': '7s', '--amp': '6px' }}>
          <div className="ls-hit" ref={sunRef} onClick={onSun}>
            <SunArt />
          </div>
        </div>
      </div>

      {CLOUDS.map((c, i) => (
        <div key={c.id} className="ls-item ls-par ls-cloud" style={{ '--x': c.x, '--y': c.y, '--w': c.w, '--depth': c.depth, '--delay': `${120 + i * 70}ms`, zIndex: 2 + c.z }} aria-hidden="true">
          <div className="ls-drift" style={{ '--dur': `${c.dur}s`, animationDelay: `${-i * 4}s` }}>
            <div className="ls-hit" onPointerEnter={onCloud} onClick={onCloud}>
              <CloudArt id={c.id} flip={c.flip} />
            </div>
          </div>
        </div>
      ))}

      {STARS.map((s, i) => (
        <div key={s.id} className="ls-item ls-par ls-star" style={{ '--x': s.x, '--y': s.y, '--w': s.w, '--depth': s.depth, '--delay': `${s.delay}ms`, '--rot': `${s.rot}deg`, zIndex: 6 }} aria-hidden="true">
          <div className="ls-float" style={{ '--dur': `${4 + (i % 4)}s`, '--amp': `${5 + (i % 3) * 2}px`, animationDelay: `${-i * 0.7}s` }}>
            <div className="ls-hit" onClick={onStar}>
              <StarArt id={s.id} />
            </div>
          </div>
        </div>
      ))}

      <div className="ls-content">
        <div className="ls-left">
          <button type="button" className="ls-logo ls-rise" style={{ '--delay': '250ms' }} ref={logoRef} onClick={onLogo} onPointerEnter={() => setPing((n) => n + 1)} aria-label="JuanCast. Tap to send music to the crew">
            <img src={logoImg} alt="JuanCast" draggable="false" />
            <span key={ping} className="ls-ping" aria-hidden="true" />
          </button>
          <div className="ls-cta ls-rise" style={{ '--delay': '650ms' }}>{children}</div>
        </div>

        <ul className="ls-cards" ref={cardsRef}>
          {CARDS.map((src, i) => (
            <li key={src} className="ls-card-wrap ls-rise" style={{ '--delay': `${380 + i * 110}ms`, '--bob-delay': `${-i * 1.1}s` }}>
              <button type="button" className="ls-card" aria-label={`JuanCast character ${i + 1}. Tap to cheer`} onClick={onCard} onPointerMove={tilt} onPointerLeave={untilt}>
                <img src={src} alt="" draggable="false" />
                <span className="ls-glare" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="ls-fx" ref={fxRef} aria-hidden="true" />
    </div>
  );
}
