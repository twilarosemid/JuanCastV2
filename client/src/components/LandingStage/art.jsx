// Vector art for the landing stage. Everything is plain SVG so it stays sharp at any size and can be animated with CSS.

// ---------- faceted five-point star (two-tone like the banner) ----------
const STAR_OUTER = 50;
const STAR_INNER = 21;
const starPoints = () => {
  const pts = [];
  for (let i = 0; i < 10; i += 1) {
    const r = i % 2 === 0 ? STAR_OUTER : STAR_INNER;
    const a = (-90 + i * 36) * (Math.PI / 180);
    pts.push([+(50 + r * Math.cos(a)).toFixed(2), +(50 + r * Math.sin(a)).toFixed(2)]);
  }
  return pts;
};
const STAR_PTS = starPoints();

export function StarArt({ id }) {
  const light = `${id}-l`;
  const dark = `${id}-d`;
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={light} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff07a" />
          <stop offset="1" stopColor="#ffc400" />
        </linearGradient>
        <linearGradient id={dark} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffd21f" />
          <stop offset="1" stopColor="#f0a000" />
        </linearGradient>
      </defs>
      {/* ten facets: every tip is split into a light and a shaded half */}
      {STAR_PTS.map((p, i) => {
        const next = STAR_PTS[(i + 1) % 10];
        return <polygon key={i} points={`50,50 ${p[0]},${p[1]} ${next[0]},${next[1]}`} fill={`url(#${i % 2 === 0 ? light : dark})`} stroke="#ffe27a" strokeWidth=".5" strokeLinejoin="round" />;
      })}
    </svg>
  );
}

// ---------- the sun from the Philippine flag: 8 long rays + 8 short rays + a glowing disc ----------
const blade = (angle, length, width, base = 38) => {
  const rad = (angle * Math.PI) / 180;
  const perp = rad + Math.PI / 2;
  const tip = [Math.cos(rad) * length, Math.sin(rad) * length];
  const left = [Math.cos(rad) * base + Math.cos(perp) * width, Math.sin(rad) * base + Math.sin(perp) * width];
  const right = [Math.cos(rad) * base - Math.cos(perp) * width, Math.sin(rad) * base - Math.sin(perp) * width];
  const mid = [Math.cos(rad) * base, Math.sin(rad) * base];
  const f = (n) => n.toFixed(1);
  return {
    a: `${f(mid[0])},${f(mid[1])} ${f(left[0])},${f(left[1])} ${f(tip[0])},${f(tip[1])}`,
    b: `${f(mid[0])},${f(mid[1])} ${f(right[0])},${f(right[1])} ${f(tip[0])},${f(tip[1])}`
  };
};

const LONG = Array.from({ length: 8 }, (_, i) => blade(i * 45, 240, 20));
const SHORT = Array.from({ length: 8 }, (_, i) => blade(i * 45 + 22.5, 165, 13));

export function SunArt() {
  return (
    <svg viewBox="-250 -250 500 500" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="sun-disc" cx=".42" cy=".38" r=".75">
          <stop offset="0" stopColor="#fff6a8" />
          <stop offset=".55" stopColor="#ffd629" />
          <stop offset="1" stopColor="#f6ab00" />
        </radialGradient>
        <radialGradient id="sun-glow" cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#fff7b0" stopOpacity=".95" />
          <stop offset=".45" stopColor="#ffe45a" stopOpacity=".38" />
          <stop offset="1" stopColor="#ffe45a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle className="sun-glow" r="250" fill="url(#sun-glow)" />
      <g className="sun-hit">
      <g className="sun-rays">
        {SHORT.map((r, i) => (
          <g key={`s${i}`}>
            <polygon points={r.a} fill="#ffe14a" />
            <polygon points={r.b} fill="#f4b400" />
          </g>
        ))}
        {LONG.map((r, i) => (
          <g key={`l${i}`}>
            <polygon points={r.a} fill="#ffe96b" />
            <polygon points={r.b} fill="#f6b800" />
          </g>
        ))}
      </g>
      </g>
      <circle className="sun-disc" r="64" fill="url(#sun-disc)" stroke="#ffe27a" strokeWidth="3" />
      <circle r="50" fill="none" stroke="#fff6b8" strokeWidth="2" strokeOpacity=".55" />
    </svg>
  );
}

// ---------- fluffy cloud: a white body over a pale-blue offset shadow, like the banner ----------
export function CloudArt({ id, flip = false }) {
  const body = `${id}-b`;
  return (
    <svg viewBox="0 0 400 220" aria-hidden="true" focusable="false" style={flip ? { transform: 'scaleX(-1)' } : undefined}>
      <defs>
        <linearGradient id={body} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset=".7" stopColor="#f2f7ff" />
          <stop offset="1" stopColor="#d9e8ff" />
        </linearGradient>
      </defs>
      {/* blue shadow puffs, shifted up-left */}
      <g fill="#8cc5f6" opacity=".95" transform="translate(-14 -16)">
        <circle cx="96" cy="136" r="58" />
        <circle cx="170" cy="96" r="76" />
        <circle cx="252" cy="108" r="64" />
        <circle cx="318" cy="142" r="52" />
        <rect x="60" y="138" width="300" height="56" rx="28" />
      </g>
      {/* white body */}
      <g fill={`url(#${body})`}>
        <circle cx="96" cy="136" r="56" />
        <circle cx="170" cy="96" r="74" />
        <circle cx="252" cy="108" r="62" />
        <circle cx="318" cy="142" r="50" />
        <rect x="58" y="136" width="300" height="56" rx="28" />
      </g>
    </svg>
  );
}
