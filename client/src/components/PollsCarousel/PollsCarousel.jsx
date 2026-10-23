import { useEffect, useState } from 'react';
import { getJSON, img } from '../../api';
import './PollsCarousel.css';

// per distance from the center card: how far it sits, how big, how faded
const POS = [0, 92, 158];
const SCALE = [1, 0.74, 0.54];
const FADE = [1, 0.5, 0.25];

const fmt = (d) =>
  new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export default function PollsCarousel() {
  const [polls, setPolls] = useState([]);
  const [groups, setGroups] = useState([]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    Promise.all([getJSON('/api/polls'), getJSON('/api/poll-groups')])
      .then(([p, g]) => { setPolls(p); setGroups(g); })
      .catch(console.error);
  }, []);

  if (!polls.length) return null;

  const len = polls.length;
  const half = Math.floor(len / 2);
  // signed distance from the active card, wrapping around
  const offset = (n) => ((n - index + len + half) % len) - half;
  const go = (step) => setIndex((i) => (i + step + len) % len);

  return (
    <section>
      <div className="section-head">
        <h2 className="section-title" id="polls">Polls</h2>
        <a href="#polls">View All</a>
      </div>
      <div className="carousel">
        <button className="arrow left" onClick={() => go(-1)} aria-label="Previous poll">‹</button>
        <div className="stage">
          {polls.map((poll, n) => {
            const off = offset(n);
            const dist = Math.abs(off);
            const far = dist > 2;
            const ended = new Date(poll.toDate) < new Date();
            const title = ended && !/\(ended\)/i.test(poll.title) ? `${poll.title} (ENDED)` : poll.title;
            const group = groups.find((g) => g.name === poll.group);
            return (
              <article
                key={poll._id}
                className={`poll ${off === 0 ? 'active' : ''}`}
                style={{
                  transform: far
                    ? 'translateX(-50%) scale(.4)'
                    : `translateX(calc(-50% + ${Math.sign(off) * POS[dist]}%)) scale(${SCALE[dist]})`,
                  opacity: far ? 0 : FADE[dist],
                  zIndex: 10 - dist,
                  pointerEvents: far ? 'none' : 'auto'
                }}
                onClick={() => setIndex(n)}
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
        <button className="arrow right" onClick={() => go(1)} aria-label="Next poll">›</button>
      </div>
    </section>
  );
}
