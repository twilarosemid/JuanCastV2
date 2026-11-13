import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getJSON, img } from '../../api';
import './ArtistsPanel.css';

// one square card: the whole container is the group's picture, name at the bottom
function GroupCard({ fanbase, small = false, featured = false }) {
  const photo = fanbase.avatarUrl || fanbase.imageUrl;
  return (
    <Link to={`/community?tab=fanbase&artist=${fanbase._id}`} className={`hart-card rise${small ? ' small' : ''}${featured ? ' featured' : ''}`} aria-label={`Open ${fanbase.name}`}>
      {featured && <span className="hart-badge">★ Featured</span>}
      <span className="hart-img" style={photo ? { backgroundImage: `url("${img(photo)}")` } : undefined} />
      {!photo && <span className="hart-initial" aria-hidden="true">{(fanbase.name || '?').charAt(0).toUpperCase()}</span>}
      <span className="hart-info">
        <strong>{fanbase.name}</strong>
      </span>
    </Link>
  );
}

// Home page: a 2x2 grid of 4 groups. The featured group (Admin → Fanbase → Feature) sits top-left; 3 more fill the rest.
export default function ArtistsPanel() {
  const [state, setState] = useState({ loading: true, featured: null, more: [] });

  useEffect(() => {
    getJSON('/api/fanbases')
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        const featured = list.find((f) => f.featured) || null;
        setState({ loading: false, featured, more: list.filter((f) => f !== featured).slice(0, featured ? 3 : 4) });
      })
      .catch((err) => {
        console.error('Error fetching fanbases:', err);
        setState({ loading: false, featured: null, more: [] });
      });
  }, []);

  const { loading, featured, more } = state;

  return (
    <>
      <div className="section-head">
        <h2 className="section-title" id="artists">Artists</h2>
        <Link to="/community?tab=fanbase">View All <span aria-hidden="true">→</span></Link>
      </div>

      {loading ? (
        <div className="hart-card skel" aria-busy="true" />
      ) : !featured && !more.length ? (
        <div className="feed-empty">No featured artist yet. Check back soon!</div>
      ) : (
        <div className="hart-grid">
          {/* reading order: TOP-LEFT (featured), top-right, bottom-left, bottom-right */}
          {[featured, more[0], more[1], more[2]].filter(Boolean).map((fb) => (
            <GroupCard key={fb._id} fanbase={fb} small featured={fb === featured} />
          ))}
        </div>
      )}
    </>
  );
}
