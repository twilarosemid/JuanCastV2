import { useEffect, useState } from 'react';

// Dominant *vivid* color of an image. A plain average of the whole picture usually comes out muddy
// grey-brown, so this samples a small copy and favors saturated mid-tone pixels (the colors you
// actually notice), ignoring near-black / near-white.
export default function useDominantColor(src, fallback = '#0b4fd6') {
  const [color, setColor] = useState(fallback);
  useEffect(() => {
    if (!src) return;
    let cancelled = false; // a slow older image must not overwrite the current banner's color
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      if (cancelled) return;
      try {
        const size = 48;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(image, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);

        let r = 0, g = 0, b = 0, w = 0;
        let ar = 0, ag = 0, ab = 0, n = 0; // plain average, used if nothing is vivid
        for (let i = 0; i < data.length; i += 4) {
          const R = data[i], G = data[i + 1], B = data[i + 2];
          const max = Math.max(R, G, B), min = Math.min(R, G, B);
          const sat = max === 0 ? 0 : (max - min) / max;
          const light = (max + min) / 510;
          const weight = (0.1 + sat * sat * 3) * (1 - Math.abs(light - 0.5) * 1.4);
          r += R * weight; g += G * weight; b += B * weight; w += weight;
          ar += R; ag += G; ab += B; n += 1;
        }
        let out = w > 0.001 ? [r / w, g / w, b / w] : [ar / n, ag / n, ab / n];
        // push the color slightly away from grey so the page glow reads as the banner's color
        const grey = (out[0] + out[1] + out[2]) / 3;
        out = out.map((c) => Math.max(0, Math.min(255, Math.round(grey + (c - grey) * 1.25))));
        setColor(`rgb(${out[0]},${out[1]},${out[2]})`);
      } catch {
        setColor(fallback);
      }
    };
    image.onerror = () => { if (!cancelled) setColor(fallback); };
    image.src = src;
    return () => { cancelled = true; };
  }, [src, fallback]);
  return color;
}