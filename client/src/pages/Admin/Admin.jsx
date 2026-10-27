import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import Cropper from 'react-easy-crop';
import { adminFetch, clearUser, getJSON, img, isAdminUser } from '../../api';
import useUser from '../../hooks/useUser';
import Modal from '../../components/Modal/Modal';
import './Admin.css';

/* ------------------------------------------------------------------ helpers */
const nf = new Intl.NumberFormat('en-US');
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '');
const toDateInput = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');
const idOf = (item) => item?._id || item?.id;

// same rule the public Polls page uses
const pollStatus = (poll) => {
  const now = new Date();
  if (poll.fromDate && new Date(poll.fromDate) > now) return 'soon';
  if (poll.toDate && new Date(poll.toDate) < now) return 'ended';
  return 'live';
};
const STATUS_LABEL = { live: 'Live', ended: 'Ended', soon: 'Upcoming' };

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'polls', label: 'Polls' },
  { key: 'groups', label: 'Poll groups' },
  { key: 'artists', label: 'Artists' },
  { key: 'chika', label: 'Chika' },
  { key: 'contents', label: 'Contents' },
  { key: 'banners', label: 'Banners' },
  { key: 'reports', label: 'Reports' }
];

/* crop helper for banners: returns a JPEG File, scaled down to a sensible size */
const loadImage = (src) => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = reject;
  image.src = src;
});
const cropToFile = async (src, area, maxWidth = 1920) => {
  const image = await loadImage(src);
  const scale = Math.min(1, maxWidth / area.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(area.width * scale);
  canvas.height = Math.round(area.height * scale);
  canvas.getContext('2d').drawImage(image, area.x, area.y, area.width, area.height, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
  if (!blob) throw new Error('Could not crop that image.');
  return new File([blob], `banner-${Date.now()}.jpg`, { type: 'image/jpeg' });
};

/* ------------------------------------------------------------------ small pieces */
function Thumb({ url, label = '' }) {
  const src = img(url);
  return (
    <span className="ad-thumb" aria-hidden="true">
      {src ? <img src={src} alt="" loading="lazy" /> : <b>{(label || '?').trim().charAt(0).toUpperCase()}</b>}
    </span>
  );
}

function Field({ field, value, onChange, fileKey, currentImage }) {
  const [preview, setPreview] = useState('');

  // preview of a freshly chosen file
  useEffect(() => {
    if (field.type !== 'file' || !(value instanceof File)) { setPreview(''); return undefined; }
    const url = URL.createObjectURL(value);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [field.type, value]);

  const id = `ad-f-${field.name}`;
  const common = { id, className: 'ad-input', placeholder: field.placeholder || '' };

  let control;
  if (field.type === 'textarea') {
    control = <textarea {...common} rows={field.rows || 4} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
  } else if (field.type === 'select') {
    control = (
      <select {...common} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        {field.placeholder && <option value="">{field.placeholder}</option>}
        {/* keep the saved value selectable even if it is no longer in the list (e.g. a deleted group) */}
        {[...(field.options || []), ...(value && !(field.options || []).includes(value) ? [value] : [])].map((o) => {
          const opt = typeof o === 'string' ? { value: o, label: o } : o;
          return <option key={opt.value} value={opt.value}>{opt.label}</option>;
        })}
      </select>
    );
  } else if (field.type === 'file') {
    const shown = preview || img(currentImage);
    control = (
      <div className="ad-file">
        {shown && <img className="ad-file-preview" src={shown} alt="" />}
        <input key={fileKey} id={id} type="file" accept="image/*" className="ad-input" onChange={(e) => onChange(e.target.files?.[0] || null)} />
        {currentImage && !preview && <small>Current image shown. Pick a file only if you want to replace it.</small>}
      </div>
    );
  } else {
    control = (
      <input
        {...common}
        type={field.type || 'text'}
        min={field.min}
        list={field.list}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  return (
    <div className={`ad-field ${field.half ? 'half' : ''}`}>
      <label htmlFor={id}>{field.label}{field.required && <em> *</em>}</label>
      {control}
      {field.hint && <small>{field.hint}</small>}
    </div>
  );
}

/* One create/edit form + searchable list, driven by a config object (used by Polls, Groups, Artists, Chika, Contents) */
function ResourceTab({ cfg, items, loading, ctx, children }) {
  const { reload, notify, fail, askConfirm } = ctx;
  const [form, setForm] = useState(() => ({ ...cfg.empty }));
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [fileKey, setFileKey] = useState(0);
  const formRef = useRef(null);

  const reset = () => {
    setForm({ ...cfg.empty });
    setEditing(null);
    setFileKey((k) => k + 1);
  };

  const startEdit = (item) => {
    setForm({ ...cfg.empty, ...cfg.toForm(item) });
    setEditing(item);
    setFileKey((k) => k + 1);
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const submit = async (e) => {
    e.preventDefault();
    const missing = cfg.fields.find((f) => f.required && !String(form[f.name] ?? '').trim());
    if (missing) { notify(`${missing.label} is required.`, 'err'); return; }
    const problem = cfg.validate?.(form);
    if (problem) { notify(problem, 'err'); return; }

    setSaving(true);
    try {
      const body = new FormData();
      cfg.fields.forEach((f) => {
        const v = form[f.name];
        if (f.type === 'file') { if (v) body.append(f.name, v); }
        else if (v !== undefined && v !== null) body.append(f.name, v);
      });
      await adminFetch(`/api/${cfg.endpoint}${editing ? `/${idOf(editing)}` : ''}`, { method: editing ? 'PUT' : 'POST', body });
      notify(`${cfg.noun} ${editing ? 'updated' : 'added'}.`);
      reset();
      await reload();
    } catch (err) {
      fail(err);
    } finally {
      setSaving(false);
    }
  };

  const remove = (item) => askConfirm({
    title: `Delete this ${cfg.noun.toLowerCase()}?`,
    body: `“${cfg.titleOf(item)}” will be removed from the site for everyone. This can’t be undone.`,
    confirmLabel: 'Delete',
    run: async () => {
      await adminFetch(`/api/${cfg.endpoint}/${idOf(item)}`, { method: 'DELETE' });
      notify(`${cfg.noun} deleted.`);
      if (idOf(editing) === idOf(item)) reset();
      await reload();
    }
  });

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? items.filter((it) => cfg.searchText(it).toLowerCase().includes(q)) : items;
    return cfg.sort ? [...list].sort(cfg.sort) : list;
  }, [items, query, cfg]);

  const grouped = useMemo(() => {
    if (!cfg.groupBy) return [['', rows]];
    const map = new Map();
    rows.forEach((it) => {
      const key = cfg.groupBy(it);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(it);
    });
    return [...map.entries()].sort(([a], [b]) => (a === 'Uncategorized') - (b === 'Uncategorized') || a.localeCompare(b));
  }, [rows, cfg]);

  const halfGrid = (fields) => {
    const out = [];
    for (let i = 0; i < fields.length; i += 1) {
      const f = fields[i];
      if (f.half && fields[i + 1]?.half) {
        out.push(<div className="ad-row2" key={f.name}>{[f, fields[i + 1]].map((x) => (
          <Field key={x.name} field={x} value={form[x.name]} fileKey={fileKey} currentImage={editing?.imageUrl}
            onChange={(v) => setForm((p) => ({ ...p, [x.name]: v }))} />
        ))}</div>);
        i += 1;
      } else {
        out.push(<Field key={f.name} field={f} value={form[f.name]} fileKey={fileKey} currentImage={editing?.imageUrl}
          onChange={(v) => setForm((p) => ({ ...p, [f.name]: v }))} />);
      }
    }
    return out;
  };

  return (
    <div className="ad-split">
      <form className="ad-card ad-form" onSubmit={submit} ref={formRef}>
        <h2>{editing ? `Edit ${cfg.noun.toLowerCase()}` : `Add ${cfg.noun.toLowerCase()}`}</h2>
        {halfGrid(cfg.fields)}
        <div className="ad-actions">
          <button type="submit" className="btn-solid" disabled={saving}>{saving ? 'Saving…' : editing ? `Update ${cfg.noun.toLowerCase()}` : `Save ${cfg.noun.toLowerCase()}`}</button>
          {editing && <button type="button" className="btn-ghost" onClick={reset}>Cancel</button>}
        </div>
      </form>

      <div className="ad-card">
        <div className="ad-list-head">
          <h2>{cfg.listTitle} <span className="ad-count">{items.length}</span></h2>
          <input className="ad-input ad-search" type="search" placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label={`Search ${cfg.listTitle}`} />
        </div>
        {children}
        {loading ? <p className="ad-empty">Loading…</p> : rows.length === 0 ? (
          <p className="ad-empty">{items.length === 0 ? cfg.empty_text : 'Nothing matches that search.'}</p>
        ) : grouped.map(([group, list]) => (
          <div key={group || 'all'} className="ad-group">
            {group && <h3 className="ad-group-title">{group}</h3>}
            {list.map((item) => {
              const row = cfg.row(item);
              return (
                <div className={`ad-item ${idOf(editing) === idOf(item) ? 'editing' : ''}`} key={idOf(item)}>
                  <Thumb url={item.imageUrl} label={cfg.titleOf(item)} />
                  <div className="ad-item-body">
                    <div className="ad-item-title">
                      {row.title}
                      {row.badge && <span className={`ad-chip ${row.badge.tone}`}>{row.badge.label}</span>}
                    </div>
                    {row.lines.filter(Boolean).map((line, i) => <div className="ad-item-sub" key={i}>{line}</div>)}
                  </div>
                  <div className="ad-item-actions">
                    {cfg.toForm && <button type="button" className="ad-btn" onClick={() => startEdit(item)}>Edit</button>}
                    <button type="button" className="ad-btn danger" onClick={() => remove(item)}>Delete</button>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ banners tab */
function BannersTab({ banners, ctx }) {
  const { reload, notify, fail, askConfirm } = ctx;
  const [cropSrc, setCropSrc] = useState('');
  const [rawFile, setRawFile] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState(null);
  const [ready, setReady] = useState(null);   // File that will be uploaded
  const [readyUrl, setReadyUrl] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [altText, setAltText] = useState('');
  const [fileKey, setFileKey] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!ready) { setReadyUrl(''); return undefined; }
    const url = URL.createObjectURL(ready);
    setReadyUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [ready]);

  const pick = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRawFile(file);
    setReady(null);
    const reader = new FileReader();
    reader.onload = () => { setCrop({ x: 0, y: 0 }); setZoom(1); setCropSrc(String(reader.result)); };
    reader.readAsDataURL(file);
  };

  const closeCrop = () => { setCropSrc(''); if (!ready) { setRawFile(null); setFileKey((k) => k + 1); } };

  const confirmCrop = async () => {
    try {
      setReady(await cropToFile(cropSrc, area));
      setCropSrc('');
    } catch (err) {
      notify(err.message || 'Could not crop that image.', 'err');
    }
  };

  // keep the artwork exactly as it is (no crop)
  const useOriginal = () => { setReady(rawFile); setCropSrc(''); };

  const upload = async () => {
    if (!ready) { notify('Choose an image first.', 'err'); return; }
    setBusy(true);
    try {
      const body = new FormData();
      body.append('image', ready);
      if (linkUrl.trim()) body.append('linkUrl', linkUrl.trim());
      if (altText.trim()) body.append('altText', altText.trim());
      await adminFetch('/api/banners', { method: 'POST', body });
      notify('Banner added. It shows on the homepage now.');
      setReady(null); setRawFile(null); setLinkUrl(''); setAltText(''); setFileKey((k) => k + 1);
      await reload();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const remove = (banner) => askConfirm({
    title: 'Delete this banner?',
    body: 'It will disappear from the homepage carousel.',
    confirmLabel: 'Delete',
    run: async () => {
      await adminFetch(`/api/banners/${idOf(banner)}`, { method: 'DELETE' });
      notify('Banner deleted.');
      await reload();
    }
  });

  // the homepage shows oldest first (same order as upload)
  const ordered = [...banners].reverse();

  return (
    <div className="ad-stack">
      <div className="ad-card">
        <h2>Add a banner</h2>
        <p className="ad-note">Banners crossfade on the homepage, oldest first. Wide 16:9 artwork fills the screen best.</p>
        <div className="ad-banner-form">
          <div className="ad-field">
            <label htmlFor="ad-banner-file">Image</label>
            <input key={fileKey} id="ad-banner-file" type="file" accept="image/*" className="ad-input" onChange={pick} />
          </div>
          <div className="ad-row2">
            <div className="ad-field">
              <label htmlFor="ad-banner-link">Link when clicked <small>(optional)</small></label>
              <input id="ad-banner-link" className="ad-input" placeholder="https://…" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
            </div>
            <div className="ad-field">
              <label htmlFor="ad-banner-alt">Alt text <small>(optional)</small></label>
              <input id="ad-banner-alt" className="ad-input" placeholder="Describe the banner" value={altText} onChange={(e) => setAltText(e.target.value)} />
            </div>
          </div>
          {readyUrl && (
            <div className="ad-ready">
              <img src={readyUrl} alt="Banner preview" />
              <span>Ready to upload</span>
              {rawFile && <button type="button" className="ad-btn" onClick={() => setCropSrc(URL.createObjectURL(rawFile))}>Re-crop</button>}
            </div>
          )}
          <div className="ad-actions">
            <button type="button" className="btn-solid" onClick={upload} disabled={busy || !ready}>{busy ? 'Uploading…' : 'Add banner'}</button>
          </div>
        </div>
      </div>

      <div className="ad-card">
        <h2>Live banners <span className="ad-count">{banners.length}</span></h2>
        {ordered.length === 0 ? <p className="ad-empty">No banners yet.</p> : ordered.map((b, i) => (
          <div className="ad-item" key={idOf(b)}>
            <img className="ad-banner-thumb" src={img(b.imageUrl)} alt={b.altText || 'Banner'} loading="lazy" />
            <div className="ad-item-body">
              <div className="ad-item-title">Slide {i + 1}</div>
              <div className="ad-item-sub">{b.linkUrl ? `Links to ${b.linkUrl}` : 'No link'}</div>
              <div className="ad-item-sub">Added {fmtDate(b.createdAt)}</div>
            </div>
            <div className="ad-item-actions">
              <button type="button" className="ad-btn danger" onClick={() => remove(b)}>Delete</button>
            </div>
          </div>
        ))}
      </div>

      <Modal open={Boolean(cropSrc)} onClose={closeCrop} label="Crop banner" className="ad-modal wide">
        <h3>Frame your banner</h3>
        <div className="ad-crop">
          {cropSrc && (
            <Cropper
              image={cropSrc}
              crop={crop}
              zoom={zoom}
              aspect={16 / 9}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={(_, pixels) => setArea(pixels)}
            />
          )}
        </div>
        <label className="ad-zoom">Zoom
          <input type="range" min={1} max={3} step={0.05} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
        </label>
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={closeCrop}>Cancel</button>
          <button type="button" className="btn-ghost" onClick={useOriginal}>Use original</button>
          <button type="button" className="btn-solid" onClick={confirmCrop} disabled={!area}>Crop</button>
        </div>
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ reports tab */
function ReportsTab({ reports, loading, ctx }) {
  const { reload, notify, fail, askConfirm } = ctx;
  const [drafts, setDrafts] = useState({});
  const [sending, setSending] = useState('');

  const send = async (report) => {
    const message = String(drafts[idOf(report)] || '').trim();
    if (!message) return;
    setSending(idOf(report));
    try {
      await adminFetch(`/api/reports/${idOf(report)}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      });
      setDrafts((d) => ({ ...d, [idOf(report)]: '' }));
      notify('Reply sent to the reporter’s notifications.');
      await reload();
    } catch (err) {
      fail(err);
    } finally {
      setSending('');
    }
  };

  const resolve = (report) => askConfirm({
    title: 'Mark as resolved?',
    body: 'The report leaves this list and the reporter is notified.',
    confirmLabel: 'Resolve',
    tone: 'ok',
    run: async () => {
      await adminFetch(`/api/reports/${idOf(report)}/resolve`, { method: 'PUT' });
      notify('Report resolved.');
      await reload();
    }
  });

  return (
    <div className="ad-card">
      <h2>Open reports <span className="ad-count">{reports.length}</span></h2>
      {loading ? <p className="ad-empty">Loading…</p> : reports.length === 0 ? <p className="ad-empty">Inbox zero. No open reports.</p> : reports.map((r) => (
        <article className="ad-report" key={idOf(r)}>
          {r.fileUrl && <a href={img(r.fileUrl)} target="_blank" rel="noopener noreferrer"><img src={img(r.fileUrl)} alt="Attachment" loading="lazy" /></a>}
          <div className="ad-report-main">
            <h3>{r.subject}</h3>
            <p className="ad-item-sub">
              {r.reporterUsername ? `@${r.reporterUsername}` : 'Anonymous'}{r.reporterEmail ? ` · ${r.reporterEmail}` : ''} · {new Date(r.createdAt).toLocaleString()}
            </p>
            <p className="ad-report-text">{r.issue}</p>
            {r.messages?.length > 0 && (
              <div className="ad-thread">
                {r.messages.map((m, i) => (
                  <p key={m._id || i}><small>{new Date(m.createdAt).toLocaleString()}</small>{m.message}</p>
                ))}
              </div>
            )}
            <textarea
              className="ad-input"
              rows={2}
              placeholder="Write a reply to the reporter…"
              value={drafts[idOf(r)] || ''}
              onChange={(e) => setDrafts((d) => ({ ...d, [idOf(r)]: e.target.value }))}
            />
            <div className="ad-actions">
              <button type="button" className="btn-solid" onClick={() => send(r)} disabled={sending === idOf(r) || !String(drafts[idOf(r)] || '').trim()}>
                {sending === idOf(r) ? 'Sending…' : 'Send reply'}
              </button>
              <button type="button" className="btn-ghost" onClick={() => resolve(r)}>Mark resolved</button>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ the dashboard */
function Dashboard({ user }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.key === params.get('tab')) ? params.get('tab') : 'overview';
  const setTab = (key) => setParams(key === 'overview' ? {} : { tab: key }, { replace: true });

  const [data, setData] = useState({ polls: [], groups: [], artists: [], chika: [], contents: [], banners: [], reports: [], settings: {} });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [sessionBad, setSessionBad] = useState(!user?.token);   // admins who logged in before the update have no token yet
  const [toast, setToast] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const toastTimer = useRef(null);

  const notify = useCallback((message, kind = 'ok') => {
    clearTimeout(toastTimer.current);
    setToast({ message, kind });
    toastTimer.current = setTimeout(() => setToast(null), kind === 'err' ? 6000 : 3200);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // errors from admin calls: an expired/missing token needs a fresh login
  const fail = useCallback((err) => {
    if (err?.status === 401 || err?.status === 403) setSessionBad(true);
    notify(err?.message || 'Something went wrong.', 'err');
  }, [notify]);

  const reload = useCallback(async () => {
    const safe = (p, fallback) => p.catch(() => fallback);
    try {
      const [polls, groups, artists, chika, contents, banners, settings, reports] = await Promise.all([
        getJSON('/api/polls'),
        safe(getJSON('/api/poll-groups'), []),
        getJSON('/api/rankings'),
        getJSON('/api/chika'),
        safe(getJSON('/api/videos?platform=all'), []),
        safe(getJSON('/api/banners'), []),
        safe(getJSON('/api/settings'), {}),
        adminFetch('/api/reports').catch((err) => {
          if (err.status === 401 || err.status === 403) setSessionBad(true);
          return [];
        })
      ]);
      setData({ polls, groups, artists, chika, contents, banners, reports: reports || [], settings });
      setLoadError('');
    } catch (err) {
      console.error(err);
      setLoadError('Could not load the data. Is the server running?');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const askConfirm = useCallback((opts) => setConfirm(opts), []);
  const runConfirm = async () => {
    if (!confirm) return;
    setConfirmBusy(true);
    try { await confirm.run(); } catch (err) { fail(err); } finally { setConfirmBusy(false); setConfirm(null); }
  };

  const relogin = () => { clearUser(); navigate('/login', { state: { from: '/admin' } }); };

  const ctx = { reload, notify, fail, askConfirm };

  /* ---- per-resource configs ---- */
  const groupNames = data.groups.map((g) => g.name);
  const pollTitles = [...new Set(data.polls.map((p) => p.title).filter(Boolean))];

  const configs = {
    polls: {
      endpoint: 'polls', noun: 'Poll', listTitle: 'Saved polls', empty_text: 'No polls yet.',
      empty: { title: '', group: '', type: 'Minor', description: '', fromDate: '', toDate: '', image: null },
      fields: [
        { name: 'title', label: 'Title', required: true, placeholder: 'e.g. Ace of the Year' },
        { name: 'group', label: 'Group', type: 'select', placeholder: 'No group', options: groupNames, half: true },
        { name: 'type', label: 'Type', type: 'select', options: ['Minor', 'Major'], half: true },
        { name: 'description', label: 'Description', type: 'textarea', rows: 3 },
        { name: 'fromDate', label: 'Starts', type: 'date', required: true, half: true },
        { name: 'toDate', label: 'Ends', type: 'date', required: true, half: true },
        { name: 'image', label: 'Cover image', type: 'file' }
      ],
      validate: (f) => (f.fromDate && f.toDate && f.toDate < f.fromDate ? 'The end date must be after the start date.' : ''),
      toForm: (p) => ({ title: p.title || '', group: p.group || '', type: p.type || 'Minor', description: p.description || '', fromDate: toDateInput(p.fromDate), toDate: toDateInput(p.toDate), image: null }),
      titleOf: (p) => p.title,
      searchText: (p) => `${p.title} ${p.group} ${p.type}`,
      sort: (a, b) => new Date(b.fromDate || 0) - new Date(a.fromDate || 0),
      row: (p) => {
        const status = pollStatus(p);
        return {
          title: p.title,
          badge: { label: STATUS_LABEL[status], tone: status },
          lines: [p.fromDate && p.toDate ? `${fmtDate(p.fromDate)} – ${fmtDate(p.toDate)}` : '', [p.group, p.type].filter(Boolean).join(' · ')]
        };
      }
    },

    groups: {
      endpoint: 'poll-groups', noun: 'Group', listTitle: 'Poll groups', empty_text: 'No groups yet. Groups become the filter chips on the Polls page.',
      empty: { name: '', image: null },
      fields: [
        { name: 'name', label: 'Group name', required: true, placeholder: 'e.g. PPMA, FAN PROJECT' },
        { name: 'image', label: 'Icon', type: 'file' }
      ],
      toForm: null,   // the server has no edit route for groups: delete and re-add
      titleOf: (g) => g.name,
      searchText: (g) => g.name,
      row: (g) => ({ title: g.name, lines: [`${data.polls.filter((p) => p.group === g.name).length} polls · ${data.artists.filter((a) => a.group === g.name).length} artists`] })
    },

    artists: {
      endpoint: 'rankings', noun: 'Artist', listTitle: 'Saved artists', empty_text: 'No artists yet.',
      empty: { name: '', group: '', category: '', position: '1', youtubeUrl: '', youtubeStartTime: '', image: null },
      fields: [
        { name: 'name', label: 'Artist name', required: true },
        { name: 'group', label: 'Poll group', type: 'select', placeholder: 'Select group…', options: groupNames, half: true },
        { name: 'category', label: 'Category (poll title)', type: 'select', placeholder: 'Select category…', options: pollTitles, half: true },
        { name: 'youtubeUrl', label: 'YouTube video', placeholder: 'https://youtube.com/…', hint: 'Optional. Plays when someone opens the artist.' },
        { name: 'youtubeStartTime', label: 'Start time (seconds)', type: 'number', min: 0, placeholder: 'e.g. 75 for 1:15', half: true },
        { name: 'position', label: 'Current rank', type: 'number', min: 1, hint: 'Ranks re-sort by votes automatically.', half: true },
        { name: 'image', label: 'Photo', type: 'file' }
      ],
      toForm: (a) => ({ name: a.name || '', group: a.group || '', category: a.category || '', position: String(a.position || 1), youtubeUrl: a.youtubeUrl || '', youtubeStartTime: a.youtubeStartTime || '', image: null }),
      titleOf: (a) => a.name,
      searchText: (a) => `${a.name} ${a.group} ${a.category}`,
      groupBy: (a) => a.category || 'Uncategorized',
      sort: (a, b) => Number(a.position) - Number(b.position),
      row: (a) => ({ title: a.name, lines: [`#${a.position} · ${nf.format(a.voteCount || 0)} votes`, a.group] })
    },

    chika: {
      endpoint: 'chika', noun: 'Article', listTitle: 'Chika articles', empty_text: 'No articles yet.',
      empty: { title: '', description: '', url: '', image: null },
      fields: [
        { name: 'title', label: 'Title', required: true },
        { name: 'description', label: 'Summary', type: 'textarea', rows: 5, required: true },
        { name: 'url', label: 'Article link', placeholder: 'https://…' },
        { name: 'image', label: 'Cover image', type: 'file' }
      ],
      toForm: (c) => ({ title: c.title || '', description: c.description || '', url: c.url || '', image: null }),
      titleOf: (c) => c.title,
      searchText: (c) => `${c.title} ${c.description}`,
      row: (c) => ({
        title: c.title,
        badge: String(data.settings.featuredChikaId) === String(idOf(c)) ? { label: 'Headline', tone: 'live' } : null,
        lines: [c.description]
      })
    },

    contents: {
      endpoint: 'videos', noun: 'Content', listTitle: 'Saved contents', empty_text: 'No contents yet.',
      empty: { title: '', subtitle: '', group: '', platform: 'YouTube', youtubeUrl: '', image: null },
      fields: [
        { name: 'title', label: 'Title', required: true },
        { name: 'subtitle', label: 'Subtitle / event', half: true },
        { name: 'group', label: 'P-pop group', placeholder: 'e.g. BINI, SB19', half: true },
        { name: 'platform', label: 'Platform', type: 'select', options: ['YouTube', 'Facebook', 'X', 'TikTok'] },
        { name: 'youtubeUrl', label: 'Content link', placeholder: 'https://…' },
        { name: 'image', label: 'Thumbnail', type: 'file' }
      ],
      toForm: (v) => ({ title: v.title || '', subtitle: v.subtitle || '', group: v.group || '', platform: v.platform || 'YouTube', youtubeUrl: v.youtubeUrl || '', image: null }),
      titleOf: (v) => v.title,
      searchText: (v) => `${v.title} ${v.subtitle} ${v.group} ${v.platform}`,
      row: (v) => ({ title: v.title, badge: { label: v.platform || 'YouTube', tone: 'soon' }, lines: [v.subtitle, v.group] })
    }
  };

  /* ---- homepage settings (featured ranking + chika headline) ---- */
  const [featured, setFeatured] = useState({ featuredGroup: '', featuredCategory: '', featuredChikaId: '' });
  useEffect(() => {
    setFeatured({
      featuredGroup: data.settings.featuredGroup || '',
      featuredCategory: data.settings.featuredCategory || '',
      featuredChikaId: data.settings.featuredChikaId || ''
    });
  }, [data.settings]);

  const saveSettings = async (payload, okMessage) => {
    try {
      await adminFetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      notify(okMessage);
      await reload();
    } catch (err) {
      fail(err);
    }
  };

  const featuredCard = (
    <div className="ad-inline">
      <h3>Homepage featured ranking</h3>
      <p className="ad-note">Choose which poll’s top 3 appear on the homepage podium.</p>
      <div className="ad-row2">
        <select className="ad-input" value={featured.featuredGroup} onChange={(e) => setFeatured((f) => ({ ...f, featuredGroup: e.target.value }))} aria-label="Featured group">
          <option value="">Any group</option>
          {groupNames.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <select className="ad-input" value={featured.featuredCategory} onChange={(e) => setFeatured((f) => ({ ...f, featuredCategory: e.target.value }))} aria-label="Featured category">
          <option value="">Top rankings (everything)</option>
          {pollTitles.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <button type="button" className="btn-solid" onClick={() => saveSettings({ featuredGroup: featured.featuredGroup, featuredCategory: featured.featuredCategory }, 'Homepage ranking updated.')}>Save homepage ranking</button>
    </div>
  );

  const headlineCard = (
    <div className="ad-inline">
      <h3>Headline article</h3>
      <p className="ad-note">The big card at the top of the Chika section.</p>
      <select className="ad-input" value={featured.featuredChikaId} onChange={(e) => setFeatured((f) => ({ ...f, featuredChikaId: e.target.value }))} aria-label="Headline article">
        <option value="">Use the latest article</option>
        {data.chika.map((c) => <option key={idOf(c)} value={idOf(c)}>{c.title}</option>)}
      </select>
      <button type="button" className="btn-solid" onClick={() => saveSettings({ featuredChikaId: featured.featuredChikaId }, 'Headline updated.')}>Save headline</button>
    </div>
  );

  /* ---- overview ---- */
  const livePolls = data.polls.filter((p) => pollStatus(p) === 'live');
  const totalVotes = data.artists.reduce((sum, a) => sum + (a.voteCount || 0), 0);
  const topArtists = [...data.artists].sort((a, b) => (b.voteCount || 0) - (a.voteCount || 0)).slice(0, 5);
  const stats = [
    { key: 'polls', label: 'Live polls', value: livePolls.length, sub: `${data.polls.length} total` },
    { key: 'artists', label: 'Artists', value: data.artists.length, sub: `${nf.format(totalVotes)} votes cast` },
    { key: 'groups', label: 'Poll groups', value: data.groups.length },
    { key: 'chika', label: 'Chika articles', value: data.chika.length },
    { key: 'contents', label: 'Contents', value: data.contents.length },
    { key: 'banners', label: 'Banners', value: data.banners.length },
    { key: 'reports', label: 'Open reports', value: data.reports.length, tone: data.reports.length ? 'alert' : '' }
  ];

  return (
    <main className="ad-page">
      <div className="ad-inner">
        <header className="ad-head rise">
          <div>
            <h1>Admin Dashboard</h1>
            <p>Signed in as <b>{user.email}</b></p>
          </div>
          <Link className="btn-ghost" to="/">View site</Link>
        </header>

        {sessionBad && (
          <div className="ad-alert rise" role="alert">
            <div>
              <b>Your admin session needs a refresh.</b>
              <span> Saving changes and reading reports need a fresh admin login.</span>
            </div>
            <button type="button" className="btn-solid" onClick={relogin}>Log in again</button>
          </div>
        )}
        {loadError && <div className="ad-alert" role="alert"><span>{loadError}</span><button type="button" className="btn-ghost" onClick={reload}>Retry</button></div>}

        <nav className="ad-tabs rise" style={{ '--d': '80ms' }} aria-label="Admin sections">
          {TABS.map((t) => (
            <button key={t.key} type="button" className={`ad-tab ${tab === t.key ? 'on' : ''}`} onClick={() => setTab(t.key)} aria-current={tab === t.key ? 'page' : undefined}>
              {t.label}
              {t.key === 'reports' && data.reports.length > 0 && <span className="ad-badge">{data.reports.length}</span>}
            </button>
          ))}
        </nav>

        <section key={tab} className="ad-panel rise" style={{ '--d': '120ms' }}>
          {tab === 'overview' && (
            <div className="ad-stack">
              <div className="ad-stats">
                {stats.map((s) => (
                  <button type="button" key={s.key} className={`ad-stat ${s.tone || ''}`} onClick={() => setTab(s.key)}>
                    <span className="ad-stat-label">{s.label}</span>
                    <strong>{loading ? '–' : nf.format(s.value)}</strong>
                    {s.sub && <small>{s.sub}</small>}
                  </button>
                ))}
              </div>
              <div className="ad-split">
                <div className="ad-card">
                  <h2>Polls running now</h2>
                  {livePolls.length === 0 ? <p className="ad-empty">No live polls. <button type="button" className="ad-link" onClick={() => setTab('polls')}>Create one</button></p> : livePolls.map((p) => (
                    <div className="ad-item" key={idOf(p)}>
                      <Thumb url={p.imageUrl} label={p.title} />
                      <div className="ad-item-body">
                        <div className="ad-item-title">{p.title}</div>
                        <div className="ad-item-sub">Ends {fmtDate(p.toDate)}</div>
                      </div>
                      <Link className="ad-btn" to={`/polls/${idOf(p)}`}>Open</Link>
                    </div>
                  ))}
                </div>
                <div className="ad-card">
                  <h2>Most voted artists</h2>
                  {topArtists.length === 0 ? <p className="ad-empty">No artists yet.</p> : topArtists.map((a, i) => (
                    <div className="ad-item" key={idOf(a)}>
                      <span className="ad-rank">{i + 1}</span>
                      <Thumb url={a.imageUrl} label={a.name} />
                      <div className="ad-item-body">
                        <div className="ad-item-title">{a.name}</div>
                        <div className="ad-item-sub">{a.category || 'Uncategorized'}</div>
                      </div>
                      <strong className="ad-votes">{nf.format(a.voteCount || 0)}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === 'polls' && <ResourceTab key="polls" cfg={configs.polls} items={data.polls} loading={loading} ctx={ctx} />}
          {tab === 'groups' && <ResourceTab key="groups" cfg={configs.groups} items={data.groups} loading={loading} ctx={ctx} />}
          {tab === 'artists' && <ResourceTab key="artists" cfg={configs.artists} items={data.artists} loading={loading} ctx={ctx}>{featuredCard}</ResourceTab>}
          {tab === 'chika' && <ResourceTab key="chika" cfg={configs.chika} items={data.chika} loading={loading} ctx={ctx}>{headlineCard}</ResourceTab>}
          {tab === 'contents' && <ResourceTab key="contents" cfg={configs.contents} items={data.contents} loading={loading} ctx={ctx} />}
          {tab === 'banners' && <BannersTab banners={data.banners} ctx={ctx} />}
          {tab === 'reports' && <ReportsTab reports={data.reports} loading={loading} ctx={ctx} />}
        </section>
      </div>

      <Modal open={Boolean(confirm)} onClose={() => !confirmBusy && setConfirm(null)} label={confirm?.title || 'Confirm'} role="alertdialog" className="ad-modal">
        <h3>{confirm?.title}</h3>
        <p>{confirm?.body}</p>
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={() => setConfirm(null)} disabled={confirmBusy}>Cancel</button>
          <button type="button" className={`btn-solid ${confirm?.tone === 'ok' ? '' : 'ad-danger-solid'}`} onClick={runConfirm} disabled={confirmBusy}>
            {confirmBusy ? 'Working…' : confirm?.confirmLabel || 'Confirm'}
          </button>
        </div>
      </Modal>

      {toast && <div className={`ad-toast ${toast.kind}`} role="status" aria-live="polite">{toast.message}</div>}
    </main>
  );
}

/* ------------------------------------------------------------------ route guard */
export default function Admin() {
  const user = useUser();

  if (!user?.email) return <Navigate to="/login" state={{ from: '/admin' }} replace />;

  if (!isAdminUser(user)) {
    return (
      <main className="ad-page">
        <div className="ad-inner ad-denied rise">
          <h1>Admins only</h1>
          <p>This account doesn’t have admin access.</p>
          <Link className="btn-solid" to="/">Back to home</Link>
        </div>
      </main>
    );
  }

  return <Dashboard user={user} />;
}
