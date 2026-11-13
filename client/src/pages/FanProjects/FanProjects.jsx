import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { API, getJSON, getUser } from '../../api';
import useBubble from '../../hooks/useBubble';
import '../Community/Community.css';
import './FanProjects.css';

const SECTIONS = [
  { id: 'submit', label: 'Submit' },
  { id: 'gallery', label: 'Gallery' },
  { id: 'history', label: 'History' }
];

const PROJECT_TYPES = ['LED Billboard Ad', 'Fan Project Budget', 'Fan Project Goods/Items', 'Charity Event'];
const TYPE_ICON = {
  'LED Billboard Ad': '📺',
  'Fan Project Budget': '💰',
  'Fan Project Goods/Items': '🎁',
  'Charity Event': '💙'
};
const STATUS_LABEL = { pending: 'For Approval', approved: 'Approved', rejected: 'Declined' };

const todayISO = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
// dates are stored as plain days (UTC midnight), so show them in UTC to avoid sliding a day
const fmtDate = (value) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
};
const range = (a, b) => `${fmtDate(a)} - ${fmtDate(b)}`;

const EMPTY = { artistName: '', projectType: '', reason: '', initiative: '', targetDate: todayISO(), pollStart: todayISO(), pollEnd: todayISO() };

function SubmitForm({ onDone }) {
  const user = getUser();
  const [form, setForm] = useState({
    name: user?.fullName || user?.username || '',
    email: user?.email || '',
    cellphone: '',
    ...EMPTY
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (form.pollEnd < form.pollStart) { setError('The poll end date can’t be before its start date.'); return; }
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`${API}/api/fan-projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Could not submit your request.');
      setSent(true);
      onDone?.();
    } catch (err) {
      setError(err.message || 'Could not submit your request.');
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="fp-card fp-done">
        <h2>Request submitted</h2>
        <p>Thank you! Your fan project is now <b>For Approval</b>. You can follow it under History.</p>
        <div className="fp-done-actions">
          <Link className="btn-solid" to="/polls/fan-projects?tab=history">View History</Link>
          <button type="button" className="btn-ghost" onClick={() => { setSent(false); setForm((f) => ({ ...f, ...EMPTY })); }}>
            Submit another
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="fp-card fp-form" onSubmit={submit} noValidate>
      <h2>Fan Project Request Form</h2>
      <label>Name:
        <input type="text" value={form.name} onChange={set('name')} placeholder="Enter Name" autoComplete="name" required />
      </label>
      <label>Email:
        <input type="email" value={form.email} onChange={set('email')} placeholder="Enter Email" autoComplete="email" required />
      </label>
      <label>Cellphone Number:
        <input type="tel" inputMode="tel" value={form.cellphone} onChange={set('cellphone')} placeholder="Enter Cellphone Number" autoComplete="tel" required />
      </label>
      <label>This Project is for:
        <input type="text" value={form.artistName} onChange={set('artistName')} placeholder="Artist/s Name" required />
      </label>
      <label>Project Type:
        <select value={form.projectType} onChange={set('projectType')} required>
          <option value="" disabled>Select Project Type</option>
          {PROJECT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </label>
      <label>Reason for the Project:
        <textarea value={form.reason} onChange={set('reason')} placeholder="Tell us why you want to do this project" rows={4} maxLength={1500} required />
      </label>
      <label>This is an initiative by:
        <input type="text" value={form.initiative} onChange={set('initiative')} placeholder="Fanbase / group / your name" required />
      </label>
      <label>Target Date of the Project:
        <input type="date" value={form.targetDate} onChange={set('targetDate')} required />
      </label>
      <fieldset className="fp-duration">
        <legend>Target Poll Duration:</legend>
        <label>Start
          <input type="date" value={form.pollStart} onChange={set('pollStart')} required />
        </label>
        <label>End
          <input type="date" value={form.pollEnd} min={form.pollStart} onChange={set('pollEnd')} required />
        </label>
      </fieldset>
      {error && <p className="fp-error" role="alert">{error}</p>}
      <button type="submit" className="btn-solid fp-submit" disabled={busy}>{busy ? 'Submitting…' : 'Submit'}</button>
    </form>
  );
}

// One card, used by History (with the status) and Gallery (without)
function Entry({ item, i, showStatus }) {
  return (
    <article className="fp-entry" style={{ '--i': i }}>
      <div className="fp-entry-side">
        <div className="fp-tile" aria-hidden="true">{TYPE_ICON[item.projectType] || '⭐'}</div>
        {showStatus && <span className={`fp-status ${item.status}`}>{STATUS_LABEL[item.status] || item.status}</span>}
      </div>
      <div className="fp-entry-body">
        <h3>{item.artistName}</h3>
        <p className="fp-type">{item.projectType}</p>
        <p className="fp-dates">{range(item.pollStart, item.pollEnd)}</p>
        {showStatus
          ? <p className="fp-sub"><b>Submitted on:</b> {fmtDate(item.createdAt)}</p>
          : <p className="fp-sub"><b>An initiative by:</b> {item.initiative}</p>}
        {!showStatus && item.reason && <p className="fp-reason">{item.reason}</p>}
      </div>
    </article>
  );
}

function Entries({ items, loading, empty, showStatus }) {
  if (loading) return null;
  if (!items.length) return <div className="feed-empty">{empty}</div>;
  return (
    <div className="fp-list">
      {items.map((item, i) => <Entry key={item._id} item={item} i={i} showStatus={showStatus} />)}
    </div>
  );
}

function Gallery({ refreshKey }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    getJSON('/api/fan-projects/gallery')
      .then((d) => setItems(Array.isArray(d) ? d : []))
      .catch((err) => console.error('Error loading gallery:', err))
      .finally(() => setLoading(false));
  }, [refreshKey]);
  return <Entries items={items} loading={loading} empty="No approved fan projects yet." />;
}

function History({ refreshKey }) {
  const user = getUser();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(Boolean(user?.email));
  useEffect(() => {
    if (!user?.email) return;
    getJSON(`/api/fan-projects/mine?email=${encodeURIComponent(user.email)}`)
      .then((d) => setItems(Array.isArray(d) ? d : []))
      .catch((err) => console.error('Error loading history:', err))
      .finally(() => setLoading(false));
  }, [user?.email, refreshKey]);
  if (!user?.email) return <div className="feed-empty">Log in to see the projects you have submitted.</div>;
  return <Entries items={items} loading={loading} empty="You haven’t submitted a fan project yet." showStatus />;
}

export default function FanProjects() {
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const active = SECTIONS.some((s) => s.id === requested) ? requested : 'submit';
  const bubble = useBubble(active);
  const [refreshKey, setRefreshKey] = useState(0);

  const choose = (id) => setParams(id === 'submit' ? {} : { tab: id }, { replace: true });
  const title = SECTIONS.find((s) => s.id === active)?.label;

  return (
    <div className="community-page">
      <aside className="cm-sidebar rise">
        <nav className="cm-nav" aria-label="Fan project sections">
          {bubble.style && <span className="cm-bubble" style={bubble.style} />}
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              ref={bubble.setRef(s.id)}
              className={`cm-tab${active === s.id ? ' active' : ''}`}
              aria-current={active === s.id ? 'page' : undefined}
              onClick={() => choose(s.id)}
            >
              {s.label}
            </button>
          ))}
        </nav>
        <Link className="fp-back" to="/polls">← Back to Polls</Link>
      </aside>

      <main className="cm-main">
        <h1 className="cm-title" key={`t-${active}`}>{title}</h1>
        <div className="cm-section cm-scroll" key={active}>
          {active === 'submit' && <SubmitForm onDone={() => setRefreshKey((k) => k + 1)} />}
          {active === 'gallery' && <Gallery refreshKey={refreshKey} />}
          {active === 'history' && <History refreshKey={refreshKey} />}
        </div>
      </main>
    </div>
  );
}
