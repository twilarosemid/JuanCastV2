import { useEffect, useState } from 'react';

// Average color of an image (drawn onto a 1x1 canvas)
export default function useDominantColor(src, fallback = '#0b4fd6') {
  const [color, setColor] = useState(fallback);
  useEffect(() => {
    if (!src) return;
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0, 1, 1);
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
        setColor(`rgb(${r},${g},${b})`);
      } catch {
        setColor(fallback);
      }
    };
    image.onerror = () => setColor(fallback);
    image.src = src;
  }, [src, fallback]);
  return color;
}
