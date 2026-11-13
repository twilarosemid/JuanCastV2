import { useMemo } from 'react';
import { makeQR } from '../../utils/qr';

// Renders a scannable QR code as one SVG path. Always dark-on-white so phone cameras read it reliably.
export default function QRCode({ value, className = '', label = 'QR code' }) {
  const matrix = useMemo(() => {
    try { return makeQR(value); } catch { return null; }
  }, [value]);
  if (!matrix) return null;

  const quiet = 3;
  const size = matrix.length + quiet * 2;
  let d = '';
  matrix.forEach((row, r) => {
    let c = 0;
    while (c < row.length) {
      if (!row[c]) { c++; continue; }
      const start = c;
      while (c < row.length && row[c]) c++;
      d += `M${start + quiet} ${r + quiet}h${c - start}v1h-${c - start}z`;
    }
  });

  return (
    <svg className={className} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width={size} height={size} fill="#ffffff" />
      <path d={d} fill="#0b1530" />
    </svg>
  );
}
