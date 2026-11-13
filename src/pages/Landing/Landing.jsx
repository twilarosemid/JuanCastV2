import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getJSON } from '../../api';
import { markEntered } from '../../landingGate';
import Reveal from '../../components/Reveal/Reveal';
import LandingStage from '../../components/LandingStage/LandingStage';
import ScrollHint from '../../components/ScrollHint/ScrollHint';
import './Landing.css';

const Svg = ({ children, size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">{children}</svg>
);
const LoginIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><path d="m10 17 5-5-5-5" /><path d="M15 12H3" />
  </svg>
);
const PlayIcon = () => <Svg><path d="M5 3.6v16.8a1 1 0 0 0 1.5.86l14-8.4a1 1 0 0 0 0-1.72l-14-8.4A1 1 0 0 0 5 3.6z" /></Svg>;
const PinIcon = () => <Svg size={18}><path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" /></Svg>;
const PhoneIcon = () => <Svg size={18}><path d="M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25c1.1.37 2.3.57 3.6.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z" /></Svg>;
const MailIcon = () => <Svg size={18}><path d="M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm9 7.2L4.5 7v.1L12 12.4 19.5 7.1V7L12 12.2z" /></Svg>;

// Used when no Play Store link has been set in Admin > Settings, so the button always works
const DEFAULT_PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.JuanCast.myapplication&hl=en-US';

const SOCIALS = [
  { key: 'facebookUrl', label: 'Facebook', icon: <Svg size={22}><path d="M13.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.5 1.6-1.5h1.5V4.4c-.3 0-1.2-.1-2.2-.1-2.3 0-3.9 1.4-3.9 4v2.2H7.9v3h2.6V21h3z" /></Svg> },
  { key: 'xUrl', label: 'X (Twitter)', icon: <Svg size={20}><path d="M17.8 3h3.1l-6.8 7.7L22 21h-6.2l-4.9-6.4L5.3 21H2.2l7.2-8.3L1.9 3h6.4l4.4 5.8L17.8 3zm-1.1 16.2h1.7L7.3 4.7H5.5l11.2 14.5z" /></Svg> },
  { key: 'youtubeUrl', label: 'YouTube', icon: <Svg size={24}><path d="M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.5 2.5 0 0 0 2.4 7.2C2 8.8 2 12 2 12s0 3.2.4 4.8a2.5 2.5 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8c.4-1.6.4-4.8.4-4.8s0-3.2-.4-4.8zM10 15V9l5.2 3L10 15z" /></Svg> },
  { key: 'tiktokUrl', label: 'TikTok', icon: <Svg size={22}><path d="M16.6 3c.3 2.3 1.6 3.7 3.9 3.9v3a7 7 0 0 1-3.8-1.2v5.5a5.6 5.6 0 1 1-5.6-5.6c.3 0 .6 0 .9.1v3.1a2.6 2.6 0 1 0 1.7 2.4V3h2.9z" /></Svg> }
];

export default function Landing() {
  const [links, setLinks] = useState({});

  useEffect(() => {
    document.body.classList.add('lp-bare');
    return () => document.body.classList.remove('lp-bare');
  }, []);

  useEffect(() => {
    document.title = 'JuanCast | Every Juan’s Choice';
    getJSON('/api/settings').then(setLinks).catch(() => setLinks({}));
  }, []);

  const socials = SOCIALS.filter((s) => links[s.key]);
  const playStoreUrl = links.playStoreUrl || DEFAULT_PLAY_STORE_URL;

  return (
    <>
      <ScrollHint />
      <section className="lp-hero" aria-label="JuanCast">
        <div className="lp-frame">
          <h1 className="lp-sr">JuanCast: Every Juan’s Choice</h1>
          {/* the old looping video is now live, interactive elements (sun, clouds, stars, the four characters) */}
          <LandingStage>
            {/* Login opens the login page; markEntered makes "/" show the real homepage afterwards instead of this page */}
            <Link to="/login" onClick={markEntered} className="lp-btn primary">
              <LoginIcon /> Login
            </Link>
            <a href={playStoreUrl} target="_blank" rel="noopener noreferrer" className="lp-btn glass">
              <PlayIcon /> Play Store
            </a>
          </LandingStage>
        </div>
      </section>

      <main className="lp-sheet">
        <Reveal>
          <div className="lp-panel">
            <div className="lp-company">
              <h2>EMBM Services OPC.</h2>
              <p><PinIcon /> 2E Glory of God Bldg., General Lim St., Brgy. San Antonio, Pasig City</p>
              <p><PhoneIcon /> <a href="tel:010680055">010-680-055</a></p>
              <p><MailIcon /> <a href="mailto:juancast.info@gmail.com">juancast.info@gmail.com</a></p>
            </div>
            <div className="lp-social">
              <h2>Social Media</h2>
              <p>Follow us on social media for updates, announcements, and new features. JuanCast — Every Juan’s Choice.</p>
              {socials.length > 0 && (
                <div className="lp-icons">
                  {socials.map((s) => (
                    <a key={s.key} href={links[s.key]} target="_blank" rel="noopener noreferrer" aria-label={s.label} title={s.label}>{s.icon}</a>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Reveal>

        <Reveal delay={80}>
          <div className="lp-legal">
            <span>© {new Date().getFullYear()} JuanCast. All rights reserved.</span>
            <nav aria-label="Legal">
              <Link to="/settings/terms">Terms Of Service</Link>
              <Link to="/settings">Privacy Policy</Link>
            </nav>
          </div>
        </Reveal>
      </main>
    </>
  );
}
