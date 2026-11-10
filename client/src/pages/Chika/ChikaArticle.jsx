import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getJSON, img } from '../../api';
import badge from '../../assets/latest_chika_logo.webp';
import './ChikaArticle.css';

const when = (value) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' });
};
const host = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };

export default function ChikaArticle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState({ loading: true, articles: [] });

  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    getJSON('/api/chika')
      .then((data) => { if (alive) setState({ loading: false, articles: Array.isArray(data) ? data : [] }); })
      .catch(() => { if (alive) setState({ loading: false, articles: [] }); });
    return () => { alive = false; };
  }, [id]);

  const back = () => navigate('/community?tab=chika');
  const article = state.articles.find((a) => a._id === id);
  const more = state.articles.filter((a) => a._id !== id).slice(0, 6);

  if (state.loading) return <main className="ck-page" aria-busy="true" />;

  if (!article) {
    return (
      <main className="ck-page">
        <button type="button" className="ck-back" onClick={back}>← Chika</button>
        <div className="ck-missing">
          <h1>Article not found</h1>
          <p>It may have been removed. Head back to Chika for the latest stories.</p>
          <button type="button" className="btn-solid" onClick={back}>Back to Chika</button>
        </div>
      </main>
    );
  }

  const site = host(article.url);

  return (
    <main className="ck-page">
      <button type="button" className="ck-back" onClick={back}>← Chika</button>

      <article className="ck-article">
        {article.imageUrl && (
          <div className="ck-media" style={{ '--img': `url("${img(article.imageUrl)}")` }}>
            <img className="ck-img" src={img(article.imageUrl)} alt="" />
            <img className="ck-badge" src={badge} alt="" />
          </div>
        )}
        <div className="ck-body">
          {when(article.createdAt) && <time className="ck-date" dateTime={article.createdAt}>{when(article.createdAt)}</time>}
          <h1>{article.title}</h1>
          <p>{article.description}</p>

          {article.url && (
            <div className="ck-cta">
              <a className="btn-solid" href={article.url} target="_blank" rel="noopener noreferrer">Read full story</a>
              {site && <small>Opens {site} in a new tab</small>}
            </div>
          )}
        </div>
      </article>

      {more.length > 0 && (
        <section className="ck-more">
          <h2>More chika</h2>
          <div className="ck-more-grid">
            {more.map((a) => (
              <Link key={a._id} className="ck-card" to={`/community/chika/${a._id}`}>
                <span className="ck-card-img" style={a.imageUrl ? { backgroundImage: `url("${img(a.imageUrl)}")` } : undefined} />
                <span className="ck-card-meta">
                  <strong>{a.title}</strong>
                  {when(a.createdAt) && <small>{when(a.createdAt)}</small>}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
