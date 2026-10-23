import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getJSON, img } from '../../api';
import useBubble from '../../hooks/useBubble';
import Modal from '../../components/Modal/Modal';
import ChatPanel from '../../components/ChatPanel/ChatPanel';
import ChikaPanel from '../../components/ChikaPanel/ChikaPanel';
import './Community.css';

const SECTIONS = [
  { id: 'chat', label: 'Chat' },
  { id: 'chika', label: 'Chika' },
  { id: 'contents', label: 'Content' }
];
const PLATFORMS = ['YouTube', 'Facebook', 'X', 'TikTok'];

const embedUrl = (url) => {
  const match = (url || '').match(/(?:youtu\.be\/|youtube\.com\/(?:.*v=|.*\/|.*embed\/))([^&?]*)/);
  return match?.[1] ? `https://www.youtube.com/embed/${match[1]}?autoplay=1` : null;
};

const Chevron = ({ dir }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={dir === 'left' ? 'm15 5-7 7 7 7' : 'm9 5 7 7-7 7'} />
  </svg>
);
const PlayIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" /></svg>
);

// A horizontally swipeable row with a bare > / < that only appear when there is more to reveal
function Row({ children }) {
  const wrap = useRef(null);
  const [edge, setEdge] = useState({ left: false, right: false });
  const grid = () => wrap.current?.querySelector('.cm-row');

  const measure = useCallback(() => {
    const el = wrap.current?.querySelector('.cm-row');
    if (!el) return;
    const next = { left: el.scrollLeft > 8, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 8 };
    setEdge((prev) => (prev.left === next.left && prev.right === next.right ? prev : next));
  }, []);

  useEffect(() => { measure(); });
  useEffect(() => {
    const el = grid();
    el?.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      el?.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, [measure]);

  const scroll = (dir) => grid()?.scrollBy({ left: dir * grid().clientWidth * 0.8, behavior: 'smooth' });

  return (
    <div className="cm-row-wrap" ref={wrap}>
      {children}
      {edge.left && <button type="button" className="cm-arrow prev" onClick={() => scroll(-1)} aria-label="Scroll left"><Chevron dir="left" /></button>}
      {edge.right && <button type="button" className="cm-arrow next" onClick={() => scroll(1)} aria-label="Scroll right"><Chevron dir="right" /></button>}
    </div>
  );
}

function ContentSection() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(null);
  const [playerOpen, setPlayerOpen] = useState(false);

  useEffect(() => {
    getJSON('/api/videos?platform=all')
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch((err) => console.error('Error loading platform content:', err))
      .finally(() => setLoading(false));
  }, []);

  const byPlatform = PLATFORMS
    .map((name) => ({
      name,
      list: items.filter((i) => (i.platform || 'YouTube').toLowerCase() === name.toLowerCase())
    }))
    .filter((p) => p.list.length > 0);

  const openItem = (item) => {
    const embed = (item.platform || 'YouTube') === 'YouTube' ? embedUrl(item.youtubeUrl) : null;
    if (embed) { setPlaying({ title: item.title, src: embed }); setPlayerOpen(true); }
    else if (item.youtubeUrl) window.open(item.youtubeUrl, '_blank', 'noopener,noreferrer');
  };

  if (loading) {
    return (
      <div className="cm-skel-row">
        {[0, 1, 2].map((n) => <div key={n} className="feed-skel cm-skel" />)}
      </div>
    );
  }
  if (!byPlatform.length) return <div className="feed-empty">No content available yet.</div>;

  return (
    <div className="cm-stack">
      {byPlatform.map((p, pi) => (
        <section key={p.name} className="cm-platform rise" style={{ '--d': `${pi * 90}ms` }}>
          <h3>{p.name}</h3>
          <Row>
            <div className="cm-row">
              {p.list.map((item, i) => {
                const id = item._id || item.id;
                const canOpen = Boolean(item.youtubeUrl);
                return (
                  <article
                    key={id}
                    className={`cm-card${canOpen ? '' : ' static'}`}
                    style={{ '--i': i }}
                    tabIndex={canOpen ? 0 : -1}
                    onClick={() => openItem(item)}
                    onKeyDown={(e) => { if (e.key === 'Enter') openItem(item); }}
                  >
                    <div
                      className="cm-card-img"
                      style={{ backgroundImage: item.imageUrl ? `url("${img(item.imageUrl)}")` : undefined }}
                    />
                    {p.name === 'YouTube' && canOpen && <span className="cm-play"><PlayIcon /></span>}
                    <div className="cm-card-meta">
                      <h4>{item.title}</h4>
                      <p>{item.subtitle || `${p.name} content`}</p>
                    </div>
                  </article>
                );
              })}
            </div>
          </Row>
        </section>
      ))}

      <Modal open={playerOpen} onClose={() => setPlayerOpen(false)} label={playing?.title || 'Video player'} className="cm-wide">
        {playing && (
          <div className="cm-video">
            <iframe src={playing.src} title={playing.title || 'YouTube video player'} allow="autoplay; encrypted-media" allowFullScreen />
          </div>
        )}
      </Modal>
    </div>
  );
}

export default function Community() {
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const active = SECTIONS.some((s) => s.id === requested) ? requested : 'chat';
  const bubble = useBubble(active);

  const choose = (id) => setParams(id === 'chat' ? {} : { tab: id }, { replace: true });
  const title = SECTIONS.find((s) => s.id === active)?.label;

  return (
    <div className="community-page">
      <aside className="cm-sidebar rise">
        <nav className="cm-nav" aria-label="Community sections">
          {bubble.style && <span className="cm-bubble" style={bubble.style} />}
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              ref={bubble.setRef(s.id)}
              className={`cm-tab${active === s.id ? ' active' : ''}`}
              aria-current={active === s.id ? 'page' : undefined}
              onClick={() => choose(s.id)}
            >
              {s.label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="cm-main">
        <h1 className="cm-title" key={`t-${active}`}>{title}</h1>
        <div className="cm-section" key={active}>
          {active === 'chat' && <ChatPanel />}
          {active === 'chika' && <ChikaPanel />}
          {active === 'contents' && <ContentSection />}
        </div>
      </main>
    </div>
  );
}
