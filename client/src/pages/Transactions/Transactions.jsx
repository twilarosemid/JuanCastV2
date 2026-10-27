import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { API } from '../../api';
import useUser from '../../hooks/useUser';
import './Transactions.css';

const PAGE_SIZE = 10;

const TYPES = [
  { id: 'all', label: 'All activity' },
  { id: 'rewards', label: 'Rewards' },
  { id: 'conversion', label: 'Conversions' },
  { id: 'market spin', label: 'Market spins' },
  { id: 'voting', label: 'Votes' }
];

const RANGES = [
  { id: 'all', label: 'All time' },
  { id: '1', label: 'Past day' },
  { id: '7', label: 'Past 7 days' },
  { id: '30', label: 'Past 30 days' },
  { id: '365', label: 'Past year' }
];

const LABELS = { rewards: 'Reward', conversion: 'Conversion', 'market spin': 'Market spin', voting: 'Vote' };

const formatAmount = (c) => `${c.direction === 'credit' ? '+' : '−'}${Number(c.amount || 0).toLocaleString()} ${c.currency}`;

const formatDate = (value) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'Date unavailable';
  return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const slug = (category = '') => String(category).trim().toLowerCase().replace(/\s+/g, '-');

const Icon = ({ category }) => {
  const props = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
  switch (category) {
    case 'rewards': // gift
      return <svg {...props}><path d="M20 12v9H4v-9M2 7h20v5H2zM12 21V7M12 7H7.5a2.5 2.5 0 1 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 1 0 0-5C13 2 12 7 12 7z" /></svg>;
    case 'conversion': // swap arrows
      return <svg {...props}><path d="M17 3l4 4-4 4M21 7H8a4 4 0 0 0-4 4M7 21l-4-4 4-4M3 17h13a4 4 0 0 0 4-4" /></svg>;
    case 'market spin': // dice
      return <svg {...props}><rect x="3" y="3" width="18" height="18" rx="4" /><circle cx="8.5" cy="8.5" r="1" fill="currentColor" /><circle cx="15.5" cy="15.5" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /></svg>;
    case 'voting': // check in a box
      return <svg {...props}><rect x="3" y="3" width="18" height="18" rx="4" /><path d="m8 12.5 3 3 5-6" /></svg>;
    default:
      return <svg {...props}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
  }
};

export default function Transactions() {
  const user = useUser();
  const email = user?.email;

  const [items, setItems] = useState([]);
  const [loadedFor, setLoadedFor] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [type, setType] = useState('all');
  const [range, setRange] = useState('all');
  const [page, setPage] = useState(1);

  const load = useCallback(async (signal) => {
    if (!email) return;
    try {
      const res = await fetch(`${API}/api/users/transactions?email=${encodeURIComponent(email)}`, { signal });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || 'Could not load transactions.');
      if (!Array.isArray(data)) throw new Error('The transaction service returned an unexpected response.');
      setItems(data);
      setError('');
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message || 'Could not load transactions.');
    } finally {
      if (!signal?.aborted) { setLoadedFor(email); setRefreshing(false); }
    }
  }, [email]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  useEffect(() => { setPage(1); }, [type, range]);

  const loading = refreshing || Boolean(email && loadedFor !== email);

  const filtered = useMemo(() => {
    const now = Date.now();
    const span = range === 'all' ? 0 : Number(range) * 86_400_000;
    return items.filter((t) => {
      if (type !== 'all' && t.category !== type) return false;
      if (span && now - new Date(t.createdAt).getTime() > span) return false;
      return true;
    });
  }, [items, type, range]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const visible = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const refresh = () => { setRefreshing(true); setError(''); setPage(1); load(); };

  return (
    <main className="tx-page">
      <header className="tx-head rise">
        <div>
          <p className="tx-eyebrow">Account</p>
          <h1 className="tx-title">Transactions</h1>
          <p className="tx-sub">A record of your rewards, conversions, votes, and spins.</p>
        </div>
        {email && (
          <button type="button" className="tx-refresh" onClick={refresh} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        )}
      </header>

      {!email ? (
        <div className="tx-state rise" style={{ '--d': '80ms' }}>
          <h2>Sign in to view transactions</h2>
          <p>Your account activity will appear here.</p>
          <Link className="tx-btn" to="/login" state={{ from: '/transactions' }}>Log in</Link>
        </div>
      ) : (
        <>
          <div className="tx-controls rise" style={{ '--d': '80ms' }}>
            <div className="tx-chips" role="group" aria-label="Filter by type">
              {TYPES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`tx-chip${type === t.id ? ' active' : ''}`}
                  aria-pressed={type === t.id}
                  onClick={() => setType(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <select className="tx-select" value={range} onChange={(e) => setRange(e.target.value)} aria-label="Filter by date range">
              {RANGES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </div>

          <section className="tx-panel rise" style={{ '--d': '140ms' }} aria-live="polite">
            {loading ? (
              <div className="tx-skels" role="status" aria-label="Loading your activity">
                {[0, 1, 2, 3, 4].map((n) => <div key={n} className="feed-skel tx-skel" />)}
              </div>
            ) : error ? (
              <div className="tx-state" role="alert">
                <h2>Transactions couldn’t load</h2>
                <p>{error}</p>
                <button type="button" className="tx-btn" onClick={refresh}>Try again</button>
              </div>
            ) : filtered.length === 0 ? (
              <div className="tx-state">
                <h2>No transactions found</h2>
                <p>{items.length ? 'Adjust your filters or date range to see more activity.' : 'Vote, spin or convert Suns and your activity will show up here.'}</p>
              </div>
            ) : (
              <>
                <div className="tx-list-head" aria-hidden="true">
                  <span>Activity</span><span>Type</span><span>Amount</span>
                </div>
                <ul className="tx-list">
                  {visible.map((t, i) => (
                    <li key={t._id || `${t.createdAt}-${i}`} className="tx-row" style={{ '--i': i }}>
                      <span className={`tx-icon cat-${slug(t.category)}`}><Icon category={t.category} /></span>
                      <div className="tx-text">
                        <strong>{t.description}</strong>
                        {t.details && <span className="tx-details">{t.details}</span>}
                        <time className="tx-date" dateTime={new Date(t.createdAt).toString() === 'Invalid Date' ? undefined : new Date(t.createdAt).toISOString()}>
                          {formatDate(t.createdAt)}
                        </time>
                      </div>
                      <span className={`tx-tag cat-${slug(t.category)}`}>{LABELS[t.category] || t.category}</span>
                      <div className="tx-amounts">
                        {(t.changes || []).map((c, n) => (
                          <span key={`${c.currency}-${n}`} className={`tx-amount ${c.direction}`}>{formatAmount(c)}</span>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>

                {pages > 1 && (
                  <nav className="tx-pager" aria-label="Pagination">
                    <button type="button" onClick={() => setPage(current - 1)} disabled={current === 1}>‹ Prev</button>
                    <span>Page {current} of {pages}</span>
                    <button type="button" onClick={() => setPage(current + 1)} disabled={current === pages}>Next ›</button>
                  </nav>
                )}
              </>
            )}
          </section>

          <p className="tx-note">Showing your most recent recorded transactions. Activity from before tracking was added is not included.</p>
        </>
      )}
    </main>
  );
}
