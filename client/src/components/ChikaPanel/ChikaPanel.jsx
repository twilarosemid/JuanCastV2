import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getJSON, img } from '../../api';
import badge from '../../assets/latest_chika_logo.webp';
import './ChikaPanel.css';

const bg = (url) => (url ? { backgroundImage: `url("${img(url)}")` } : undefined);
const onKey = (fn) => (e) => { if (e.key === 'Enter') fn(); };

export default function ChikaPanel() {
  const navigate = useNavigate();
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

  // each article has its own page; the original link opens from there
  const read = (article) => { if (article?._id) navigate(`/community/chika/${article._id}`); };

  const headline = articles.find((a) => a._id === headlineId) || articles[0];
  const rest = articles.filter((a) => a !== headline);

  if (loading) return <div className="chika" />;
  if (!headline) return <div className="chika"><div className="feed-empty">No chika yet. Check back soon!</div></div>;

  return (
    <div className="chika">
      <article
        className="chika-hero"
        tabIndex={0}
        role="link"
        onClick={() => read(headline)}
        onKeyDown={onKey(() => read(headline))}
      >
        <div className="chika-hero-media" style={headline.imageUrl ? { '--img': `url("${img(headline.imageUrl)}")` } : undefined}>
          {headline.imageUrl && <img className="chika-hero-img" src={img(headline.imageUrl)} alt="" />}
          <img className="chika-badge" src={badge} alt="Latest Chika" />
        </div>
        <div className="chika-hero-body">
          <h3>{headline.title}</h3>
          <p>{headline.description}</p>
          <span className="chika-read">Read more <b>→</b></span>
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
              role="link"
              onClick={() => read(c)}
              onKeyDown={onKey(() => read(c))}
            >
              <div className="chika-thumb" style={c.imageUrl ? { '--img': `url("${img(c.imageUrl)}")` } : undefined}><div style={bg(c.imageUrl)} /></div>
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
