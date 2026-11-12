import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getJSON, img } from '../../api';
import './ArtistsPanel.css';

// Home page: the artists of the group the admin featured (Admin → Fanbase → Feature)
export default function ArtistsPanel() {
  const [state, setState] = useState({ loading: true, fanbase: null, artists: [] });

  useEffect(() => {
    getJSON('/api/fanbases/featured/artists')
      .then((data) => setState({ loading: false, fanbase: data.fanbase || null, artists: Array.isArray(data.artists) ? data.artists : [] }))
      .catch((err) => {
        console.error('Error fetching featured artists:', err);
        setState({ loading: false, fanbase: null, artists: [] });
      });
  }, []);

  const { loading, fanbase, artists } = state;
  const viewAll = fanbase?._id ? `/community?tab=fanbase&artist=${fanbase._id}` : '/community?tab=fanbase';

  return (
    <>
      <div className="section-head">
        <h2 className="section-title" id="artists">Artists</h2>
        <Link to={viewAll}>View All <span aria-hidden="true">→</span></Link>
      </div>

      {loading ? (
        <div className="hart-grid" aria-busy="true">
          {[0, 1, 2].map((n) => <div className="hart-card skel" key={n} />)}
        </div>
      ) : artists.length === 0 ? (
        <div className="feed-empty">No featured artists yet. Check back soon!</div>
      ) : (
        <>
          {fanbase?.name && <p className="hart-group">{fanbase.name}</p>}
          <div className="hart-grid">
            {artists.map((artist, i) => (
              <Link
                key={artist.email || artist.username}
                to={`/profile/${encodeURIComponent(artist.username)}`}
                className="hart-card rise"
                style={{ '--d': `${Math.min(i, 8) * 60}ms` }}
                aria-label={`View ${artist.name}'s profile`}
              >
                <span className="hart-img" style={artist.avatar ? { backgroundImage: `url("${img(artist.avatar)}")` } : undefined} />
                {!artist.avatar && <span className="hart-initial" aria-hidden="true">{(artist.name || '?').charAt(0).toUpperCase()}</span>}
                <span className="hart-meta">
                  <strong>{artist.name}</strong>
                  <small>@{artist.username}</small>
                </span>
              </Link>
            ))}
          </div>
        </>
      )}
    </>
  );
}
