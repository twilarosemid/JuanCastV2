import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getJSON, img } from '../../api';
import useBubble from '../../hooks/useBubble';
import './Polls.css';

const TYPES = ['All', 'Minor', 'Major'];

const SearchIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
  </svg>
);

// Live / Ended / Soon, worked out from the poll dates
const statusOf = (poll) => {
  const now = new Date();
  if (poll.fromDate && new Date(poll.fromDate) > now) return 'soon';
  if (poll.toDate && new Date(poll.toDate) < now) return 'ended';
  return 'live';
};
const STATUS_LABEL = { live: 'Live', ended: 'Ended', soon: 'Soon' };


const Chevron = ({ dir }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={dir === 'left' ? 'm15 5-7 7 7 7' : 'm9 5 7 7-7 7'} />
  </svg>
);

// Wraps one category's swipe row and adds a bare > (and < once you've scrolled) to reveal the rest
function ScrollRow({ single, count, children }) {
  const wrap = useRef(null);
  const [edge, setEdge] = useState({ left: false, right: false });
  const grid = () => wrap.current?.querySelector('.polls-grid');

  const measure = useCallback(() => {
    const el = wrap.current?.querySelector('.polls-grid');
    if (!el) return;
    const next = {
      left: el.scrollLeft > 8,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 8
    };
    setEdge((prev) => (prev.left === next.left && prev.right === next.right ? prev : next));
  }, []);

  // re-measure after every render: filters, search, and View All all change what fits in the row
  useEffect(() => { measure(); });

  useEffect(() => {
    const el = grid();
    el?.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      el?.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, [measure]);

  // a single category is shown as a wrapped grid, so there is nothing to swipe
  useEffect(() => {
    if (single) grid()?.scrollTo({ left: 0 });
  }, [single]);

  const scroll = (dir) => {
    const el = grid();
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' });
  };

  return (
    <div className="polls-wrap" ref={wrap}>
      {children}
      {!single && edge.left && (
        <button type="button" className="row-nav prev" onClick={() => scroll(-1)} aria-label="Scroll polls left"><Chevron dir="left" /></button>
      )}
      {!single && edge.right && (
        <button type="button" className="row-nav next" onClick={() => scroll(1)} aria-label="Scroll polls right"><Chevron dir="right" /></button>
      )}
    </div>
  );
}
// on phones the group filters are a swipeable row: bring the tapped one to the middle
const centerChip = (e) => e.currentTarget.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });

export default function AllPolls() {
  const navigate = useNavigate();
  const [polls, setPolls] = useState([]);
  const [pollGroups, setPollGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeGroup, setActiveGroup] = useState('All');
  const [activeType, setActiveType] = useState('All');

  // sliding white bubbles (same look as the navbar)
  const groupBubble = useBubble(activeGroup, pollGroups.length);
  const typeBubble = useBubble(activeType);

  useEffect(() => {
    Promise.all([
      getJSON('/api/polls')
        .then((data) => setPolls(Array.isArray(data) ? data : []))
        .catch((err) => console.error('Error fetching polls:', err)),
      getJSON('/api/poll-groups')
        .then((data) => setPollGroups(Array.isArray(data) ? data : []))
        .catch((err) => console.error('Error fetching poll groups:', err))
    ]).finally(() => setLoading(false));
  }, []);

  const filteredPolls = polls.filter((poll) => {
    const matchesSearch = (poll.title || '').toLowerCase().includes(search.toLowerCase());
    const matchesGroup = activeGroup === 'All' || (poll.group || 'PPMA') === activeGroup;
    const matchesType = activeType === 'All' || (poll.type || 'Minor') === activeType;
    return matchesSearch && matchesGroup && matchesType;
  });

  const groupNames = [...new Set([
    ...pollGroups.map((g) => g.name),
    ...polls.map((p) => p.group || 'PPMA')
  ])];
  const pollsByGroup = groupNames
    .map((name) => ({ name, polls: filteredPolls.filter((p) => (p.group || 'PPMA') === name) }))
    .filter((g) => g.polls.length > 0);

  const formatDate = (value) => {
    if (!value) return 'TBA';
    const date = new Date(value);
    if (isNaN(date.getTime())) return 'TBA';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="polls-page">
      <aside className="polls-sidebar rise">
        <div className="polls-search">
          <SearchIcon />
          <input
            type="text"
            placeholder="Search polls"
            aria-label="Search polls"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="seg" role="group" aria-label="Filter polls by type">
          {typeBubble.style && <span className="seg-bubble" style={typeBubble.style} />}
          {TYPES.map((type) => (
            <button
              key={type}
              type="button"
              ref={typeBubble.setRef(type)}
              className={activeType === type ? 'on' : ''}
              aria-pressed={activeType === type}
              onClick={() => setActiveType(type)}
            >
              {type}
            </button>
          ))}
        </div>

        <div className="polls-groups">
          {groupBubble.style && <span className="seg-bubble" style={groupBubble.style} />}
          <button
            ref={groupBubble.setRef('All')}
            className={`group-filter ${activeGroup === 'All' ? 'active' : ''}`}
            onClick={(e) => { setActiveGroup('All'); centerChip(e); }}
          >
            ALL
          </button>
          {pollGroups.map((group) => (
            <button
              key={group._id}
              ref={groupBubble.setRef(group.name)}
              className={`group-filter ${activeGroup === group.name ? 'active' : ''}`}
              onClick={(e) => { setActiveGroup(group.name); centerChip(e); }}
            >
              {group.imageUrl && <img src={img(group.imageUrl)} alt="" />}
              {group.name}
            </button>
          ))}
        </div>
      </aside>

      <main className="polls-main">
        {loading && (
          <section className="polls-section" aria-busy="true" aria-label="Loading polls">
            <div className="skeleton skeleton-title" />
            <div className="polls-grid collapsed">
              {[0, 1, 2].map((n) => (
                <div className="poll-card skeleton-card" key={n}>
                  <div className="skeleton skeleton-img" />
                  <div className="skeleton skeleton-line" />
                  <div className="skeleton skeleton-line short" />
                </div>
              ))}
            </div>
          </section>
        )}

        {pollsByGroup.map((group, gi) => {
          // one category picked -> show all of its polls as a wrapped grid; otherwise a swipe row per category
          const single = activeGroup !== 'All';
          const groupInfo = pollGroups.find((g) => g.name === group.name);
          return (
            <section className="polls-section rise" key={group.name} style={{ '--d': `${gi * 90}ms` }}>
              <div className="polls-section-head">
                <h2>
                  {groupInfo?.imageUrl && <img src={img(groupInfo.imageUrl)} alt="" />}
                  {group.name}
                </h2>
                {!single && (
                  <button
                    type="button"
                    className="view-all-pill"
                    onClick={() => setActiveGroup(group.name)}
                    aria-label={`View all ${group.name} polls`}
                  >
                    View All <b>→</b>
                  </button>
                )}
              </div>
              <ScrollRow single={single} count={group.polls.length}>
                <div className={`polls-grid ${single ? 'expanded' : 'collapsed'}`}>
                  {group.polls.map((poll, i) => {
                    const status = statusOf(poll);
                    return (
                      <article
                        key={poll._id || poll.id}
                        className="poll-card"
                        style={{ '--i': i }}
                        tabIndex={0}
                        onClick={() => navigate(`/polls/${poll._id || poll.id}`)}
                        onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/polls/${poll._id || poll.id}`); }}
                      >
                        <div className="poll-card-media">
                          <div
                            className="poll-card-image"
                            style={{ backgroundImage: poll.imageUrl ? `url("${img(poll.imageUrl)}")` : 'none' }}
                          />
                          <span className={`status-chip ${status}`}>
                            <i />{STATUS_LABEL[status]}
                          </span>
                        </div>
                        <div className="poll-card-info">
                          <h3>{poll.title || 'Untitled Poll'}</h3>
                          <p>{formatDate(poll.fromDate)} – {formatDate(poll.toDate)}</p>
                          <div className="poll-card-tags">
                            <span>{group.name}</span>
                            <span>{poll.type || 'Minor'}</span>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>

              </ScrollRow>
            </section>
          );
        })}

        {!loading && !pollsByGroup.length && (
          <div className="polls-empty rise">
            <span className="empty-orb" aria-hidden="true" />
            No polls match your filters.
          </div>
        )}
      </main>
    </div>
  );
}
