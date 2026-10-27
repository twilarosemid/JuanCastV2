import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getJSON, img } from '../../api';
import './PollsCarousel.css';

// Film-strip layout: the center frame is full size, every other frame is the SAME smaller size,
// evenly spaced (distance is in card widths, per distance from the center card).
const SIDE_SCALE = 0.72;
const POS = [0, 92, 170, 248];   // 248 = just past the edge, where hidden frames wait
const FADE = [1, 0.6, 0.3, 0];
const AUTOPLAY_MS = 5000;

const fmt = (d) =>
  new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export default function PollsCarousel() {
  const navigate = useNavigate();
  const [polls, setPolls] = useState([]);
  const [groups, setGroups] = useState([]);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  // where each card was after the last render, so we can spot a card that wraps around the strip
  const prevOffsets = useRef({});
  const prevIndex = useRef(0);
  const touchStart = useRef(null);

  useEffect(() => {
    Promise.all([getJSON('/api/polls'), getJSON('/api/poll-groups')])
      .then(([p, g]) => { setPolls(p); setGroups(g); })
      .catch(console.error);
  }, []);

  // no arrows now: advance on a timer (pauses while hovering) or click a side card
  useEffect(() => {
    if (polls.length < 2 || paused) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % polls.length), AUTOPLAY_MS);
    return () => clearInterval(timer);
  }, [polls.length, paused, index]);

  const len = polls.length;
  const half = Math.floor(len / 2);
  // signed distance from the active card, wrapping around
  const offset = (n) => ((n - index + len + half) % len) - half;

  // remember positions after each render
  useLayoutEffect(() => {
    const next = {};
    polls.forEach((p, n) => { next[p._id] = ((n - index + len + half) % len) - half; });
    prevOffsets.current = next;
    prevIndex.current = index;
  });

  if (!polls.length) return null;

  return (
    <section>
      <div className="section-head">
        <h2 className="section-title" id="polls">Polls</h2>
        <Link to="/polls">View All</Link>
      </div>
      <div
        className="carousel"
        // mouse only: on a phone a tap fires "mouseenter" and would leave autoplay paused forever
        onPointerEnter={(e) => e.pointerType === 'mouse' && setPaused(true)}
        onPointerLeave={(e) => e.pointerType === 'mouse' && setPaused(false)}
        // swipe left / right to change poll
        onTouchStart={(e) => { touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; setPaused(true); }}
        onTouchEnd={(e) => {
          const s = touchStart.current; touchStart.current = null; setPaused(false);
          if (!s) return;
          const dx = e.changedTouches[0].clientX - s.x;
          const dy = e.changedTouches[0].clientY - s.y;
          if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.3) setIndex((i) => (i + (dx < 0 ? 1 : -1) + len) % len);
        }}
        onTouchCancel={() => { touchStart.current = null; setPaused(false); }}
      >
        <div className="stage">
          {polls.map((poll, n) => {
            const off = offset(n);
            const dist = Math.abs(off);
            const far = dist > 2; // only 5 cards show
            // a card that wraps from one end of the strip to the other must not slide across the middle
            const before = prevOffsets.current[poll._id];
            // how far the strip just moved (shortest way round); a card is only "wrapping" if it did NOT
            // end up where that movement would have taken it. Normal 1- or 2-step moves slide smoothly.
            const delta = ((index - prevIndex.current + len + half) % len) - half;
            const wrapped = before !== undefined && delta !== 0 && before - delta !== off;
            const side = Math.sign(off) || 1;
            const ended = new Date(poll.toDate) < new Date();
            const title = ended && !/\(ended\)/i.test(poll.title) ? `${poll.title} (ENDED)` : poll.title;
            const group = groups.find((g) => g.name === poll.group);
            return (
              <article
                key={poll._id}
                className={`poll ${off === 0 ? 'active' : ''}`}
                style={{
                  transform: `translateX(calc(-50% + ${side * POS[Math.min(dist, 3)]}%)) scale(${off === 0 ? 1 : SIDE_SCALE})`,
                  opacity: FADE[Math.min(dist, 3)],
                  // wrapping cards jump while barely visible, then fade in at their new spot
                  transition: wrapped ? 'none' : undefined,
                  animation: wrapped ? `${index % 2 ? 'pollEnterA' : 'pollEnterB'} .7s ease backwards` : undefined,
                  zIndex: 10 - dist,
                  pointerEvents: far ? 'none' : 'auto'
                }}
                onClick={() => (off === 0 ? navigate(`/polls/${poll._id}`) : setIndex(n))}
              >
                <div className="cover" style={{ backgroundImage: poll.imageUrl ? `url("${img(poll.imageUrl)}")` : 'none' }} />
                <div className="meta">
                  <h3>{title}</h3>
                  <p>{fmt(poll.fromDate)} – {fmt(poll.toDate)}</p>
                  <div className="foot">
                    <span className="group">
                      {group?.imageUrl && <img src={img(group.imageUrl)} alt="" />}
                      {poll.group}
                    </span>
                    <span>{poll.type}</span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
      {/* fills over the autoplay interval; hidden while hovering (autoplay is paused) */}
      {polls.length > 1 && (
        <div className="progress" aria-hidden="true">
          {!paused && <span key={index} style={{ animationDuration: `${AUTOPLAY_MS}ms` }} />}
        </div>
      )}
    </section>
  );
}
