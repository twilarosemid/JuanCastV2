import { useEffect, useState } from 'react';
import { getJSON, img } from '../../api';
import badge from '../../assets/latest_chika_logo.webp';
import './ChikaPanel.css';

const open = (url) => { if (url) window.open(url, '_blank', 'noopener,noreferrer'); };
const bg = (url) => (url ? { backgroundImage: `url("${img(url)}")` } : undefined);
const onKey = (url) => (e) => { if (e.key === 'Enter') open(url); };

export default function ChikaPanel() {
  const [articles, setArticles] = useState([]);
  const [headlineId, setHeadlineId] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await getJSON('/api/chika');
        setArticles(Array.isArray(data) ? data : []);
        // the admin can pick which article is the headline
        getJSON('/api/settings').then((s) => setHeadlineId(s.featuredChikaId || '')).catch(() => {});
      } catch (err) {
        console.error('Error fetching Chika articles:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const headline = articles.find((a) => a._id === headlineId) || articles[0];
  const rest = articles.filter((a) => a !== headline);

  if (loading) {
    return (
      <div className="chika">
        <div className="feed-skel tall" />
        <div className="feed-skel" />
        <div className="feed-skel" />
      </div>
    );
  }
  if (!headline) return <div className="chika"><div className="feed-empty">No chika yet. Check back soon!</div></div>;

  return (
    <div className="chika">
      <article
        className="chika-hero"
        tabIndex={0}
        onClick={() => open(headline.url)}
        onKeyDown={onKey(headline.url)}
      >
        <div className="chika-hero-img" style={bg(headline.imageUrl)} />
        <img className="chika-badge" src={badge} alt="Latest Chika" />
        <div className="chika-hero-body">
          <h3>{headline.title}</h3>
          <p>{headline.description}</p>
          {headline.url && <span className="chika-read">Read more <b>→</b></span>}
        </div>
      </article>

      {rest.length > 0 && (
        <div className="chika-rows">
          {rest.map((c, i) => (
            <article
              key={c._id || c.id || i}
              className="chika-row rise"
              style={{ '--d': `${Math.min(i, 8) * 60}ms` }}
              tabIndex={0}
              onClick={() => open(c.url)}
              onKeyDown={onKey(c.url)}
            >
              <div className="chika-thumb"><div style={bg(c.imageUrl)} /></div>
              <div className="chika-row-text">
                <h4>{c.title}</h4>
                <p>{c.description}</p>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
