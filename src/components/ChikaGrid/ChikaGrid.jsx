import { useEffect, useState } from 'react';
import { getJSON, img } from '../../api';
import './ChikaGrid.css';

export default function ChikaGrid() {
  const [articles, setArticles] = useState([]);

  useEffect(() => {
    getJSON('/api/chika').then(setArticles).catch(console.error);
  }, []);

  return (
    <>
      <h2 className="section-title" id="chika">Latest Chika</h2>
      <div className="news">
        {articles.slice(0, 6).map((a) => (
          <article key={a._id}>
            {a.imageUrl && <img src={img(a.imageUrl)} alt="" />}
            <h3>{a.title}</h3>
            <p>{a.description}</p>
            {a.url && (
              <a href={a.url} target="_blank" rel="noreferrer">Read more</a>
            )}
          </article>
        ))}
      </div>
    </>
  );
}
