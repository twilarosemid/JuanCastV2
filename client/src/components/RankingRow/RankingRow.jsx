import { useEffect, useState } from 'react';
import { getJSON, img, getUser, castVote } from '../../api';
import './RankingRow.css';

const bg = (url) => (url ? { backgroundImage: `url("${img(url)}")` } : {});
const fmt = (n) => Number(n || 0).toLocaleString();

export default function RankingRow() {
  const [list, setList] = useState([]);
  const [title, setTitle] = useState('Top Rankings');

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

  const entries = list.slice(0, 3).map((item, rank) => ({ item, rank }));
  const ordered = [1, 0, 2].map((i) => entries[i]).filter(Boolean); // 2nd, 1st, 3rd
  const rest = list.slice(3);

  return (
    <section>
      <div className="section-head">
        <h2 className="section-title" id="vote">{title}</h2>
        <a href="#vote">View All</a>
      </div>

      <div className="podium">
        {ordered.map(({ item, rank }) => (
          <div key={item._id} className={`slot r${rank + 1}`}>
            <div className="poster" style={bg(item.imageUrl)}>
              <span className="rank">#{rank + 1}</span>
            </div>
            <div className="info">
              <div>
                <h3>{item.name}</h3>
                <small>{fmt(item.voteCount)} votes</small>
              </div>
              <button className="vote" onClick={() => vote(item)}>Vote</button>
            </div>
          </div>
        ))}
      </div>

      {rest.length > 0 && (
        <ol className="others">
          {rest.map((item, i) => (
            <li key={item._id}>
              <span className="n">{i + 4}</span>
              <span className="av" style={bg(item.imageUrl)} />
              <span className="nm">{item.name}</span>
              <span className="vt">{fmt(item.voteCount)}</span>
              <button className="vote" onClick={() => vote(item)}>Vote</button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
