import useScrollFade from '../../hooks/useScrollFade';
import './ScrollWash.css';

// Fades the hero image into a gradient tinted with the banner's color
export default function ScrollWash() {
  const opacity = useScrollFade();
  return <div className="tintwash" style={{ opacity }} />;
}
