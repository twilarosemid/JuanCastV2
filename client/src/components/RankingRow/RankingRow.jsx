import { useEffect, useState } from 'react';
import { getJSON, img, getUser, castVote } from '../../api';
import './RankingRow.css';

// index = rank (0 = 1st place)
const TIERS = [
  { cls: 'gold', medal: '🥇' },
  { cls: 'silver', medal: '🥈' },
  { cls: 'bronze', medal: '🥉' }
];

const bg = (url) => (url ? { backgroundImage: `url("${img(url)}")` } : {});
const fmt = (n) => Number(n || 0).toLocaleString();

export default function RankingRow() {
  const [list, setList] = useState([]);
  const [title, setTitle] = useState('Top Rankings');
  const [group, setGroup] = useState('');

  useEffect(() => {
    (async () => {
      const [rankings, settings] = await Promise.all([
        getJSON('/api/rankings'),
        getJSON('/api/settings')
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
      setGroup(settings.featuredGroup || '');
      setList([...items].sort((a, b) => a.position - b.position).slice(0, 10));
    })().catch(console.error);
  }, []);

  const vote = async (item) => {
    const user = getUser();
    if (!user?.email) return alert('Please log in to vote.');
    try {
      const res = await castVote(item._id, user);
      setList((prev) =>
        prev.map((p) => (p._id === item._id ? { ...p, voteCount: res.ranking.voteCount } : p))
      );
    } catch (err) {
      alert(err.message);
    }
  };

  const leader = Math.max(1, list[0]?.voteCount || 1);
  const entries = list.slice(0, 3).map((item, rank) => ({ item, rank }));
  const ordered = [1, 0, 2].map((i) => entries[i]).filter(Boolean); // 2nd, 1st, 3rd
  const rest = list.slice(3);

  return (
    <section className="ranking">
      <div className="section-head">
        <div>
          <span className="eyebrow">{group ? `${group} · ` : ''}Live ranking</span>
          <h2 className="section-title" id="vote">{title}</h2>
        </div>
        <a href="#vote">View All</a>
      </div>

      <div className="spot" />
      <div className="podium">
        {ordered.map(({ item, rank }) => {
          const tier = TIERS[rank];
          return (
            <div key={item._id} className={`slot ${tier.cls} r${rank + 1}`}>
              <article className="poster" style={bg(item.imageUrl)}>
                <span className="medal">{tier.medal}</span>
                <div className="cap">
                  <h3>{item.name}</h3>
                  <small>{fmt(item.voteCount)} votes</small>
                </div>
              </article>
              <div className="step">
                <b>{rank + 1}</b>
                <button onClick={() => vote(item)}>CAST VOTE</button>
              </div>
            </div>
          );
        })}
      </div>

      {rest.length > 0 && (
        <ol className="others">
          {rest.map((item, i) => (
            <li key={item._id}>
              <span className="n">{i + 4}</span>
              <span className="av" style={bg(item.imageUrl)} />
              <span className="nm">{item.name}</span>
              <span className="bar">
                <i style={{ width: `${Math.round(((item.voteCount || 0) / leader) * 100)}%` }} />
              </span>
              <span className="vt">{fmt(item.voteCount)}</span>
              <button onClick={() => vote(item)}>Vote</button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
