import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getJSON, img } from '../../api';
import Reveal from '../Reveal/Reveal';
import CountUp from '../CountUp/CountUp';
import './RankingRow.css';

const bg = (url) => (url ? { backgroundImage: `url("${img(url)}")` } : {});

export default function RankingRow() {
  const [list, setList] = useState([]);
  const [title, setTitle] = useState('Top Rankings');
  const navigate = useNavigate();
  const [pollId, setPollId] = useState(null);

  useEffect(() => {
    (async () => {
      const [rankings, settings, polls] = await Promise.all([
        getJSON('/api/rankings'),
        getJSON('/api/settings'),
        getJSON('/api/polls').catch(() => [])
      ]);
      let items = rankings;
      if (settings.featuredCategory) {
        setTitle(settings.featuredCategory);
        items = rankings.filter(
          (r) =>
            r.category === settings.featuredCategory &&
            (!settings.featuredGroup || r.group === settings.featuredGroup)
        );
      }
      // the poll these rankings belong to (same match PollDetail uses: poll.title = category, poll.group = group)
      const first = items[0];
      const matches = polls.filter(
        (p) => p.title === (settings.featuredCategory || first?.category) &&
               (!(settings.featuredGroup || first?.group) || p.group === (settings.featuredGroup || first?.group))
      );
      const now = new Date();
      const live = matches.find((p) => new Date(p.fromDate) <= now && now <= new Date(p.toDate));
      const poll = live || matches[matches.length - 1];
      setPollId(poll ? poll._id || poll.id : null);
      // podium only: top 3
      setList([...items].sort((a, b) => a.position - b.position).slice(0, 3));
    })().catch(console.error);
  }, []);

  // Vote opens the poll these rankings belong to, where the actual voting happens
  const openPoll = () => navigate(pollId ? `/polls/${pollId}` : '/polls');

  const entries = list.map((item, rank) => ({ item, rank }));
  const ordered = [1, 0, 2].map((i) => entries[i]).filter(Boolean); // 2nd, 1st, 3rd

  return (
    <section>
      <div className="section-head">
        <h2 className="section-title" id="vote">{title}</h2>
        <Link to={pollId ? `/polls/${pollId}` : '/polls'}>View All</Link>
      </div>

      <div className="podium">
        {ordered.map(({ item, rank }, n) => (
          <Reveal key={item._id} className={`slot r${rank + 1}`} delay={n * 130}>
            <div className="poster" style={bg(item.imageUrl)}>
              <span className="rank">#{rank + 1}</span>
            </div>
            <div className="info">
              <div>
                <h3>{item.name}</h3>
                <small><CountUp value={item.voteCount} /> votes</small>
              </div>
              <button className="vote" onClick={openPoll}>Vote</button>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
