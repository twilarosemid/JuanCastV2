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
  { key: 'ads', label: 'Ads' },
  { key: 'landing', label: 'Landing' },
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

function Field({ field, value, onChange, fileKey, currentImage, form = {} }) {
  const [preview, setPreview] = useState('');

  // preview of a freshly chosen file
  useEffect(() => {
    if (field.type !== 'file' || !(value instanceof File)) { setPreview(''); return undefined; }
    const url = URL.createObjectURL(value);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [field.type, value]);

  const id = `ad-f-${field.name}`;
  // options / placeholder may be functions of the whole form, so one dropdown can follow another
  const optionList = typeof field.options === 'function' ? field.options(form) : (field.options || []);
  const placeholder = typeof field.placeholder === 'function' ? field.placeholder(form) : (field.placeholder || '');
  const common = { id, className: 'ad-input', placeholder };

  let control;
  if (field.type === 'textarea') {
    control = <textarea {...common} rows={field.rows || 4} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
  } else if (field.type === 'select') {
    control = (
      <select {...common} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        {placeholder && <option value="">{placeholder}</option>}
        {optionList.map((o) => {
          const opt = typeof o === 'string' ? { value: o, label: o } : o;
          return <option key={opt.value} value={opt.value}>{opt.label}</option>;
        })}
        {/* keep the saved value visible even if it is no longer in the list (e.g. a deleted group), but flag it */}
        {value && !optionList.some((o) => (typeof o === 'string' ? o : o.value) === value) && (
          <option value={value}>{value} (not in the current list)</option>
        )}
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

// Staged (not yet saved) items per resource, kept here so switching admin tabs doesn't lose them
const stackStore = {};

function QueueThumb({ file, label = '' }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!(file instanceof File)) { setUrl(''); return undefined; }
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return (
    <span className="ad-thumb" aria-hidden="true">
      {url ? <img src={url} alt="" /> : <b>{(label || '?').trim().charAt(0).toUpperCase()}</b>}
    </span>
  );
}

/* One create/edit form + searchable list, driven by a config object (used by Polls, Groups, Artists, Chika, Contents) */
function ResourceTab({ cfg, items, loading, ctx, children }) {
  const { reload, notify, fail, askConfirm } = ctx;
  const [form, setForm] = useState(() => ({ ...cfg.empty }));
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState({});
  const [fileKey, setFileKey] = useState(0);
  const formRef = useRef(null);

  const setFilter = (name, value) => setFilters((f) => {
    const next = { ...f, [name]: value };
    return cfg.filter?.onChange ? cfg.filter.onChange(next, name) : next;
  });
  const filtersOn = Boolean(cfg.filter) && cfg.filter.fields.some((fl) => filters[fl.name]);
  const clearFilters = () => { setFilters({}); setQuery(''); };

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

  /* ---- stack several items, then save them all at once (enabled per resource with cfg.stack) ---- */
  const stackable = Boolean(cfg.stack) && !editing;
  const [queue, setQueue] = useState(() => stackStore[cfg.endpoint] || []);
  const [progress, setProgress] = useState(null);
  useEffect(() => { stackStore[cfg.endpoint] = queue; }, [queue, cfg.endpoint]);
  useEffect(() => {
    if (!queue.length) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [queue.length]);

  const buildBody = (values) => {
    const body = new FormData();
    cfg.fields.forEach((f) => {
      const v = values[f.name];
      if (f.type === 'file') { if (v) body.append(f.name, v); }
      else if (v !== undefined && v !== null) body.append(f.name, v);
    });
    return body;
  };

  // returns an error message, or '' when this entry can be added
  const checkEntry = (values, others = queue) => {
    const missing = cfg.fields.find((f) => f.required && !String(values[f.name] ?? '').trim());
    if (missing) return `${missing.label} is required.`;
    const problem = cfg.validate?.(values);
    if (problem) return problem;
    const key = cfg.stack.key(values);
    if (others.some((q) => cfg.stack.key(q.values) === key) || items.some((it) => cfg.stack.key(cfg.toForm(it)) === key)) {
      return `“${String(values.name).trim()}” is already in this group and category.`;
    }
    return '';
  };

  // something typed in the form that hasn't been added to the list yet
  const hasDraft = () => cfg.fields.some((f) => f.required && String(form[f.name] ?? '').trim());

  const addToQueue = () => {
    const problem = checkEntry(form);
    if (problem) { notify(problem, 'err'); return; }
    setQueue((q) => [...q, { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, values: { ...form } }]);
    // keep the fields that usually repeat (group, category); clear the rest for the next one
    setForm({ ...cfg.empty, ...Object.fromEntries(cfg.stack.keep.map((k) => [k, form[k]])) });
    setFileKey((k) => k + 1);
  };

  const popFromQueue = (entry) => {
    setQueue((q) => q.filter((x) => x.id !== entry.id));
    setForm({ ...cfg.empty, ...entry.values });
    setFileKey((k) => k + 1);
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const saveBatch = async () => {
    const batch = [...queue];
    if (hasDraft()) {
      const problem = checkEntry(form);
      if (problem) { notify(problem, 'err'); return; }
      batch.push({ id: `draft-${Date.now()}`, values: { ...form } });
    }
    if (!batch.length) return;

    setSaving(true);
    setProgress({ done: 0, total: batch.length });
    const saved = new Set();
    const failedNames = [];
    let stopped = false;
    // one at a time, in order, so ranks and "oldest first" ordering stay the way you typed them
    for (let i = 0; i < batch.length; i += 1) {
      const entry = batch[i];
      try {
        await adminFetch(`/api/${cfg.endpoint}`, { method: 'POST', body: buildBody(entry.values) });
        saved.add(entry.id);
      } catch (err) {
        if (err.status === 401 || err.status === 403) { fail(err); stopped = true; break; }
        failedNames.push(String(entry.values.name || 'item'));
      }
      setProgress({ done: i + 1, total: batch.length });
    }

    // whatever wasn't saved stays in the list (including a half-typed draft) so nothing is lost
    setQueue(batch.filter((x) => !saved.has(x.id)));
    if (saved.size) {
      setForm({ ...cfg.empty });
      setFileKey((k) => k + 1);
    }
    if (!stopped) {
      const noun = cfg.noun.toLowerCase();
      if (failedNames.length) {
        notify(`Added ${saved.size}, but ${failedNames.length} failed (${failedNames.join(', ')}). They are still in the list, so you can try again.`, 'err');
      } else {
        notify(`${saved.size} ${noun}${saved.size === 1 ? '' : 's'} added.`);
      }
    }
    setSaving(false);
    setProgress(null);
    if (saved.size) await reload();
  };

  const submit = async (e) => {
    e.preventDefault();
    if (stackable) {
      // Enter in a field triggers the first submit button ("Add to list"), so typing + Enter stacks quickly
      const action = e.nativeEvent?.submitter?.dataset?.action;
      if (action === 'add') { addToQueue(); return; }
      if (queue.length) { await saveBatch(); return; }
    }
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
    body: `“${cfg.titleOf(item)}” will be removed from the site for everyone. This can’t be undone.${cfg.deleteNote?.(item) ? ` ${cfg.deleteNote(item)}` : ''}`,
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
    let list = cfg.filter ? items.filter((it) => cfg.filter.match(it, filters)) : items;
    if (q) list = list.filter((it) => cfg.searchText(it).toLowerCase().includes(q));
    return cfg.sort ? [...list].sort(cfg.sort) : list;
  }, [items, query, cfg, filters]);

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

  const change = (name, v) => {
    const next = { ...form, [name]: v };
    const out = cfg.onChange ? cfg.onChange(next, name) : next;
    setForm(out);
    // while adding, picking a group / poll in the form also narrows the list on the right
    if (cfg.filter?.sync?.includes(name) && !editing) {
      setFilters(Object.fromEntries(cfg.filter.sync.map((k) => [k, out[k] || ''])));
    }
  };

  const halfGrid = (fields) => {
    const out = [];
    for (let i = 0; i < fields.length; i += 1) {
      const f = fields[i];
      if (f.half && fields[i + 1]?.half) {
        out.push(<div className="ad-row2" key={f.name}>{[f, fields[i + 1]].map((x) => (
          <Field key={x.name} field={x} form={form} value={form[x.name]} fileKey={fileKey} currentImage={editing?.imageUrl}
            onChange={(v) => change(x.name, v)} />
        ))}</div>);
        i += 1;
      } else {
        out.push(<Field key={f.name} field={f} form={form} value={form[f.name]} fileKey={fileKey} currentImage={editing?.imageUrl}
          onChange={(v) => change(f.name, v)} />);
      }
    }
    return out;
  };

  return (
    <div className="ad-split">
      <form className="ad-card ad-form" onSubmit={submit} ref={formRef}>
        <h2>{editing ? `Edit ${cfg.noun.toLowerCase()}` : `Add ${cfg.noun.toLowerCase()}`}</h2>
        {stackable && <p className="ad-note">Fill one in and press <b>Add to list</b> (or Enter). {cfg.stack.keep.length ? 'Group and category stay filled for the next one. ' : ''}Save them all together when you’re done.</p>}
        {halfGrid(cfg.fields)}
        {stackable && queue.length > 0 && (
          <div className="ad-inline ad-queue">
            <div className="ad-list-head">
              <h3>Ready to save <span className="ad-count">{queue.length}</span></h3>
              <button type="button" className="ad-link" onClick={() => setQueue([])} disabled={saving}>Clear list</button>
            </div>
            {queue.map((q) => (
              <div className="ad-item" key={q.id}>
                <QueueThumb file={q.values.image} label={q.values.name} />
                <div className="ad-item-body">
                  <div className="ad-item-title">{q.values.name}</div>
                  <div className="ad-item-sub">{[q.values.group, q.values.category].filter(Boolean).join(' · ') || 'No group'}</div>
                </div>
                <div className="ad-item-actions">
                  <button type="button" className="ad-btn" onClick={() => popFromQueue(q)} disabled={saving}>Edit</button>
                  <button type="button" className="ad-btn danger" onClick={() => setQueue((list) => list.filter((x) => x.id !== q.id))} disabled={saving} aria-label={`Remove ${q.values.name}`}>Remove</button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="ad-actions">
          {stackable && <button type="submit" data-action="add" className="btn-ghost" disabled={saving}>+ Add to list</button>}
          <button type="submit" data-action="save" className="btn-solid" disabled={saving}>
            {saving
              ? (progress ? `Saving ${progress.done}/${progress.total}…` : 'Saving…')
              : editing ? `Update ${cfg.noun.toLowerCase()}`
              : stackable && queue.length + (hasDraft() ? 1 : 0) > 1
                ? `Save ${queue.length + (hasDraft() ? 1 : 0)} ${cfg.noun.toLowerCase()}s`
                : `Save ${cfg.noun.toLowerCase()}`}
          </button>
          {editing && <button type="button" className="btn-ghost" onClick={reset}>Cancel</button>}
        </div>
      </form>

      <div className="ad-card">
        <div className="ad-list-head">
          <h2>{cfg.listTitle} <span className="ad-count">{rows.length === items.length ? items.length : `${rows.length} of ${items.length}`}</span></h2>
        </div>
        {children}
        <div className="ad-filters">
          {cfg.filter?.fields.map((fl) => {
            const options = fl.options(filters);
            const value = filters[fl.name] || '';
            return (
              <select key={fl.name} className="ad-input" value={value} onChange={(e) => setFilter(fl.name, e.target.value)} aria-label={fl.all}>
                <option value="">{fl.all}</option>
                {options.map((o) => <option key={o} value={o}>{o}</option>)}
                {value && !options.includes(value) && <option value={value}>{value}</option>}
              </select>
            );
          })}
          <input className="ad-input ad-search" type="search" placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label={`Search ${cfg.listTitle}`} />
          {(filtersOn || query) && <button type="button" className="ad-link ad-clear" onClick={clearFilters}>Clear filters</button>}
        </div>
        {loading ? <p className="ad-empty">Loading…</p> : rows.length === 0 ? (
          <p className="ad-empty">{items.length === 0 ? cfg.empty_text : <>Nothing matches these filters. <button type="button" className="ad-link" onClick={clearFilters}>Show everything</button></>}</p>
        ) : grouped.map(([group, list]) => (
          <div key={group || 'all'} className="ad-group">
            {group && <h3 className="ad-group-title"><span>{group}</span><em>{list.length}</em></h3>}
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

/* ------------------------------------------------------------------ ads tab */
const AD_PLACEMENT_LABELS = { market: 'Market side ad', startup: 'Startup popup' };

function AdsTab({ ads, ctx }) {
  const { reload, notify, fail, askConfirm } = ctx;
  const [placement, setPlacement] = useState('market');
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [sizeNote, setSizeNote] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [altText, setAltText] = useState('');
  const [fileKey, setFileKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editLink, setEditLink] = useState('');
  const [editAlt, setEditAlt] = useState('');
  const [editFile, setEditFile] = useState(null);
  const [editBusy, setEditBusy] = useState(false);

  useEffect(() => {
    if (!file) { setPreviewUrl(''); setSizeNote(''); return undefined; }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    const probe = new Image();
    probe.onload = () => {
      const ratio = probe.naturalHeight / probe.naturalWidth;
      setSizeNote(placement === 'market' && Math.abs(ratio - 2) > 0.15
        ? `This image is ${probe.naturalWidth}×${probe.naturalHeight}. Side ads are shown tall (1:2), so it will be cropped to fit. 720×1440 is ideal.`
        : '');
    };
    probe.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file, placement]);

  const pick = (e) => {
    const chosen = e.target.files?.[0];
    if (!chosen) return;
    if (!/^image\//.test(chosen.type)) {
      notify('Please choose an image file.', 'err');
      setFileKey((k) => k + 1);
      return;
    }
    setFile(chosen);
  };

  const upload = async () => {
    if (!file) { notify('Choose an image first.', 'err'); return; }
    setBusy(true);
    try {
      const body = new FormData();
      body.append('image', file);
      body.append('placement', placement);
      if (linkUrl.trim()) body.append('linkUrl', linkUrl.trim());
      if (altText.trim()) body.append('altText', altText.trim());
      await adminFetch('/api/ads', { method: 'POST', body });
      notify(placement === 'startup' ? 'Startup ad added. It pops up when the home page opens.' : 'Ad added. It shows in the Market now.');
      setFile(null); setLinkUrl(''); setAltText(''); setFileKey((k) => k + 1);
      await reload();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (ad) => {
    try {
      const body = new FormData();
      body.append('active', String(!ad.active));
      await adminFetch(`/api/ads/${idOf(ad)}`, { method: 'PUT', body });
      notify(ad.active ? 'Ad paused. It is hidden from the site.' : 'Ad is live again.');
      await reload();
    } catch (err) {
      fail(err);
    }
  };

  const remove = (ad) => askConfirm({
    title: 'Delete this ad?',
    body: 'It will disappear from the site for good.',
    confirmLabel: 'Delete',
    run: async () => {
      await adminFetch(`/api/ads/${idOf(ad)}`, { method: 'DELETE' });
      notify('Ad deleted.');
      await reload();
    }
  });

  const openEdit = (ad) => { setEditing(ad); setEditLink(ad.linkUrl || ''); setEditAlt(ad.altText || ''); setEditFile(null); };
  const closeEdit = () => { setEditing(null); setEditFile(null); };

  const saveEdit = async () => {
    setEditBusy(true);
    try {
      const body = new FormData();
      body.append('linkUrl', editLink.trim());
      body.append('altText', editAlt.trim());
      if (editFile) body.append('image', editFile);
      await adminFetch(`/api/ads/${idOf(editing)}`, { method: 'PUT', body });
      notify('Ad updated.');
      closeEdit();
      await reload();
    } catch (err) {
      fail(err);
    } finally {
      setEditBusy(false);
    }
  };

  const liveCount = ads.filter((a) => a.active).length;

  return (
    <div className="ad-stack">
      <div className="ad-card">
        <h2>Add an ad</h2>
        <p className="ad-note">
          <strong>Market side ad:</strong> a tall column pinned to the right of every Market section, on desktop web only (hidden on phones). With more than one live ad they take turns every few seconds. Best size 720×1440 (1:2).<br />
          <strong>Startup popup:</strong> opens over the home page when someone arrives (once per visit, on every device). Any shape works; the whole image is shown. It also shows again right after someone logs in, before the daily check-in. Set the link in the Popup link box. The link opens in a new tab, and you can change it any time with Edit.
        </p>
        <div className="ad-banner-form">
          <div className="ad-field">
            <label htmlFor="ad-ads-placement">Where it shows</label>
            <select id="ad-ads-placement" className="ad-input" value={placement} onChange={(e) => setPlacement(e.target.value)}>
              {Object.entries(AD_PLACEMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          <div className="ad-field">
            <label htmlFor="ad-ads-file">Image</label>
            <input key={fileKey} id="ad-ads-file" type="file" accept="image/*" className="ad-input" onChange={pick} />
          </div>
          <div className="ad-row2">
            <div className="ad-field">
              <label htmlFor="ad-ads-link">{placement === 'startup' ? 'Popup link' : 'Link when clicked'} <small>{placement === 'startup' ? '(opens in a new tab when the popup is tapped)' : '(optional)'}</small></label>
              <input id="ad-ads-link" className="ad-input" placeholder="https://…" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
            </div>
            <div className="ad-field">
              <label htmlFor="ad-ads-alt">Alt text <small>(optional)</small></label>
              <input id="ad-ads-alt" className="ad-input" placeholder="Describe the ad" value={altText} onChange={(e) => setAltText(e.target.value)} />
            </div>
          </div>
          {previewUrl && (
            <div className="ad-ready">
              <img className="ad-tall-preview" src={previewUrl} alt="Ad preview" />
              <span>Ready to upload</span>
            </div>
          )}
          {sizeNote && <p className="ad-note" style={{ margin: 0 }}>{sizeNote}</p>}
          <div className="ad-actions">
            <button type="button" className="btn-solid" onClick={upload} disabled={busy || !file}>{busy ? 'Uploading…' : 'Add ad'}</button>
          </div>
        </div>
      </div>

      <div className="ad-card">
        <h2>Ads <span className="ad-count">{liveCount} live / {ads.length}</span></h2>
        {ads.length === 0 ? <p className="ad-empty">No ads yet.</p> : ads.map((ad, i) => (
          <div className="ad-item" key={idOf(ad)}>
            <img className="ad-tall-thumb" src={img(ad.imageUrl)} alt={ad.altText || 'Ad'} loading="lazy" />
            <div className="ad-item-body">
              <div className="ad-item-title">
                Ad {i + 1} · {AD_PLACEMENT_LABELS[ad.placement] || AD_PLACEMENT_LABELS.market}
                <span className={`ad-status ${ad.active ? 'live' : 'paused'}`}>{ad.active ? 'Live' : 'Paused'}</span>
              </div>
              <div className="ad-item-sub">{ad.linkUrl ? `Links to ${ad.linkUrl}` : 'No link'}</div>
              <div className="ad-item-sub">Added {fmtDate(ad.createdAt)}</div>
            </div>
            <div className="ad-item-actions">
              <button type="button" className="ad-btn" onClick={() => toggle(ad)}>{ad.active ? 'Pause' : 'Resume'}</button>
              <button type="button" className="ad-btn" onClick={() => openEdit(ad)}>Edit</button>
              <button type="button" className="ad-btn danger" onClick={() => remove(ad)}>Delete</button>
            </div>
          </div>
        ))}
      </div>

      <Modal open={Boolean(editing)} onClose={closeEdit} label="Edit ad" className="ad-modal">
        <h3>Edit ad</h3>
        <div className="ad-banner-form">
          <div className="ad-field">
            <label htmlFor="ad-edit-link">{editing?.placement === 'startup' ? 'Popup link' : 'Link when clicked'} <small>(leave empty for no link)</small></label>
            <input id="ad-edit-link" className="ad-input" placeholder="https://…" value={editLink} onChange={(e) => setEditLink(e.target.value)} />
          </div>
          <div className="ad-field">
            <label htmlFor="ad-edit-alt">Alt text</label>
            <input id="ad-edit-alt" className="ad-input" value={editAlt} onChange={(e) => setEditAlt(e.target.value)} />
          </div>
          <div className="ad-field">
            <label htmlFor="ad-edit-file">Replace image <small>(optional)</small></label>
            <input id="ad-edit-file" type="file" accept="image/*" className="ad-input" onChange={(e) => setEditFile(e.target.files?.[0] || null)} />
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={closeEdit}>Cancel</button>
          <button type="button" className="btn-solid" onClick={saveEdit} disabled={editBusy}>{editBusy ? 'Saving…' : 'Save'}</button>
        </div>
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ landing tab */
const LANDING_LINKS = [
  { key: 'playStoreUrl', label: 'Play Store button', placeholder: 'https://play.google.com/store/apps/details?id=…' },
  { key: 'facebookUrl', label: 'Facebook', placeholder: 'https://facebook.com/…' },
  { key: 'xUrl', label: 'X (Twitter)', placeholder: 'https://x.com/…' },
  { key: 'youtubeUrl', label: 'YouTube', placeholder: 'https://youtube.com/@…' },
  { key: 'tiktokUrl', label: 'TikTok', placeholder: 'https://tiktok.com/@…' }
];

function LandingTab({ settings, ctx }) {
  const { reload, notify, fail } = ctx;
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setForm(Object.fromEntries(LANDING_LINKS.map((l) => [l.key, settings?.[l.key] || ''])));
  }, [settings]);

  const save = async () => {
    setBusy(true);
    try {
      const payload = Object.fromEntries(LANDING_LINKS.map((l) => [l.key, (form[l.key] || '').trim()]));
      await adminFetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      notify('Landing page links saved.');
      await reload();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ad-stack">
      <div className="ad-card">
        <h2>Landing page links</h2>
        <p className="ad-note">These power the buttons and icons on the landing page (<Link className="ad-link" to="/landing" target="_blank">/landing</Link>). Leave a social link empty to hide its icon. An empty Play Store link falls back to the default JuanCast Play Store listing.</p>
        <div className="ad-banner-form">
          {LANDING_LINKS.map((l) => (
            <div className="ad-field" key={l.key}>
              <label htmlFor={`ad-lp-${l.key}`}>{l.label}</label>
              <input id={`ad-lp-${l.key}`} className="ad-input" placeholder={l.placeholder} value={form[l.key] || ''} onChange={(e) => setForm((f) => ({ ...f, [l.key]: e.target.value }))} />
            </div>
          ))}
          <div className="ad-actions">
            <button type="button" className="btn-solid" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save links'}</button>
          </div>
        </div>
      </div>
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

  const [data, setData] = useState({ polls: [], groups: [], artists: [], chika: [], contents: [], banners: [], ads: [], reports: [], settings: {} });
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
      const [polls, groups, artists, chika, contents, banners, ads, settings, reports] = await Promise.all([
        getJSON('/api/polls'),
        safe(getJSON('/api/poll-groups'), []),
        getJSON('/api/rankings'),
        getJSON('/api/chika'),
        safe(getJSON('/api/videos?platform=all'), []),
        safe(getJSON('/api/banners'), []),
        adminFetch('/api/ads/all').catch((err) => {
          if (err.status === 401 || err.status === 403) setSessionBad(true);
          return [];
        }),
        safe(getJSON('/api/settings'), {}),
        adminFetch('/api/reports').catch((err) => {
          if (err.status === 401 || err.status === 403) setSessionBad(true);
          return [];
        })
      ]);
      setData({ polls, groups, artists, chika, contents, banners, ads: ads || [], reports: reports || [], settings });
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
  // An artist shows in a poll only when its group AND category match that poll (see PollDetail),
  // so the category list only offers titles of polls that belong to the chosen group.
  const titlesForGroup = (group) => [...new Set(
    data.polls.filter((p) => (p.group || '') === (group || '')).map((p) => p.title).filter(Boolean)
  )];

  const configs = {
    polls: {
      endpoint: 'polls', noun: 'Poll', listTitle: 'Saved polls', empty_text: 'No polls yet.',
      filter: {
        sync: ['group'],
        fields: [{ name: 'group', all: 'All groups', options: () => groupNames }],
        match: (p, f) => !f.group || p.group === f.group
      },
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
      deleteNote: (g) => {
        const polls = data.polls.filter((p) => p.group === g.name).length;
        const artists = data.artists.filter((a) => a.group === g.name).length;
        return polls || artists
          ? `${polls} poll${polls === 1 ? '' : 's'} and ${artists} artist${artists === 1 ? '' : 's'} still use this group and will keep its name until you change them.`
          : '';
      },
      titleOf: (g) => g.name,
      searchText: (g) => g.name,
      row: (g) => ({ title: g.name, lines: [`${data.polls.filter((p) => p.group === g.name).length} polls · ${data.artists.filter((a) => a.group === g.name).length} artists`] })
    },

    artists: {
      endpoint: 'rankings', noun: 'Artist', listTitle: 'Saved artists', empty_text: 'No artists yet.',
      filter: {
        sync: ['group', 'category'],
        fields: [
          { name: 'group', all: 'All groups', options: () => groupNames },
          { name: 'category', all: 'All polls', options: (f) => (f.group ? titlesForGroup(f.group) : pollTitles) }
        ],
        // picking another group drops a poll filter that doesn't belong to it
        onChange: (next, name) => (name === 'group' && next.group && next.category && !titlesForGroup(next.group).includes(next.category) ? { ...next, category: '' } : next),
        match: (a, f) => (!f.group || a.group === f.group) && (!f.category || a.category === f.category)
      },
      stack: {
        keep: ['group', 'category'],
        key: (v) => [v.name, v.group, v.category].map((x) => String(x || '').trim().toLowerCase()).join('|')
      },
      empty: { name: '', group: '', category: '', position: '1', youtubeUrl: '', youtubeStartTime: '', image: null },
      fields: [
        { name: 'name', label: 'Artist name', required: true },
        { name: 'group', label: 'Poll group', type: 'select', placeholder: 'Select group…', options: groupNames },
        {
          name: 'category', label: 'Category (poll title)', type: 'select',
          options: (f) => titlesForGroup(f.group),
          placeholder: (f) => (titlesForGroup(f.group).length ? 'Select category…' : f.group ? 'No polls in this group yet' : 'Select a group first…'),
          hint: 'Only polls in the selected group are listed.'
        },
        { name: 'youtubeUrl', label: 'YouTube video', placeholder: 'https://youtube.com/…', hint: 'Optional. Plays when someone opens the artist.' },
        { name: 'youtubeStartTime', label: 'Start time (seconds)', type: 'number', min: 0, placeholder: 'e.g. 75 for 1:15', half: true },
        { name: 'position', label: 'Current rank', type: 'number', min: 1, hint: 'Ranks re-sort by votes automatically.', half: true },
        { name: 'image', label: 'Photo', type: 'file' }
      ],
      // changing the group clears a category that doesn't belong to the new group
      onChange: (next, name) => (name === 'group' && next.category && !titlesForGroup(next.group).includes(next.category) ? { ...next, category: '' } : next),
      toForm: (a) => ({ name: a.name || '', group: a.group || '', category: a.category || '', position: String(a.position || 1), youtubeUrl: a.youtubeUrl || '', youtubeStartTime: a.youtubeStartTime || '', image: null }),
      titleOf: (a) => a.name,
      searchText: (a) => `${a.name} ${a.group} ${a.category}`,
      groupBy: (a) => (a.category ? (a.group ? `${a.group} · ${a.category}` : a.category) : 'Uncategorized'),
      sort: (a, b) => Number(a.position) - Number(b.position),
      row: (a) => ({ title: a.name, badge: { label: `#${a.position}`, tone: 'rank' }, lines: [`${nf.format(a.voteCount || 0)} votes`, a.category ? '' : a.group] })
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

  const featuredTitles = featured.featuredGroup ? titlesForGroup(featured.featuredGroup) : pollTitles;

  const featuredCard = (
    <details className="ad-inline ad-fold">
      <summary>Homepage featured ranking</summary>
      <p className="ad-note">Choose which poll’s top 3 appear on the homepage podium.</p>
      <div className="ad-row2">
        <select className="ad-input" value={featured.featuredGroup} onChange={(e) => setFeatured((f) => {
          const group = e.target.value;
          const keep = !group || !f.featuredCategory || titlesForGroup(group).includes(f.featuredCategory);
          return { ...f, featuredGroup: group, featuredCategory: keep ? f.featuredCategory : '' };
        })} aria-label="Featured group">
          <option value="">Any group</option>
          {groupNames.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <select className="ad-input" value={featured.featuredCategory} onChange={(e) => setFeatured((f) => ({ ...f, featuredCategory: e.target.value }))} aria-label="Featured category">
          <option value="">Top rankings (everything)</option>
          {featuredTitles.map((t) => <option key={t} value={t}>{t}</option>)}
          {featured.featuredCategory && !featuredTitles.includes(featured.featuredCategory) && (
            <option value={featured.featuredCategory}>{featured.featuredCategory} (not in the current list)</option>
          )}
        </select>
      </div>
      <button type="button" className="btn-solid" onClick={() => saveSettings({ featuredGroup: featured.featuredGroup, featuredCategory: featured.featuredCategory }, 'Homepage ranking updated.')}>Save homepage ranking</button>
    </details>
  );

  const headlineCard = (
    <details className="ad-inline ad-fold">
      <summary>Headline article</summary>
      <p className="ad-note">The big card at the top of the Chika section.</p>
      <select className="ad-input" value={featured.featuredChikaId} onChange={(e) => setFeatured((f) => ({ ...f, featuredChikaId: e.target.value }))} aria-label="Headline article">
        <option value="">Use the latest article</option>
        {data.chika.map((c) => <option key={idOf(c)} value={idOf(c)}>{c.title}</option>)}
      </select>
      <button type="button" className="btn-solid" onClick={() => saveSettings({ featuredChikaId: featured.featuredChikaId }, 'Headline updated.')}>Save headline</button>
    </details>
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
    { key: 'ads', label: 'Ads', value: data.ads.filter((a) => a.active).length, sub: `${data.ads.length} total` },
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
                        <div className="ad-item-sub">{[a.group, a.category].filter(Boolean).join(' · ') || 'Uncategorized'}</div>
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
          {tab === 'ads' && <AdsTab ads={data.ads} ctx={ctx} />}
          {tab === 'landing' && <LandingTab settings={data.settings} ctx={ctx} />}
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