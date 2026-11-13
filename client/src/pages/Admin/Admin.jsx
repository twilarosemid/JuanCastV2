import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import Cropper from 'react-easy-crop';
import { adminFetch, clearUser, getJSON, img, isAdminUser, isGroupAdminUser, isSuperAdminUser } from '../../api';
import useUser from '../../hooks/useUser';
import Modal from '../../components/Modal/Modal';
import BoardPanel from '../../components/BoardPanel/BoardPanel';
import { SocialLinksFields } from '../../components/SocialLinks/SocialLinks';
import { markEntered } from '../../landingGate';
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

// Sidebar sections, grouped by what the admin is doing
const NAV_SUPER = [
  { group: '', items: [
    { key: 'overview', label: 'Overview', desc: 'What is live on the site right now.' }
  ] },
  { group: 'Content', items: [
    { key: 'polls', label: 'Polls', desc: 'Create and schedule the polls people vote in.' },
    { key: 'groups', label: 'Poll groups', desc: 'Groups become the filter chips on the Polls page.' },
    { key: 'artists', label: 'Artists', desc: 'The artists who receive votes, and the homepage ranking.' },
    { key: 'chika', label: 'Chika', desc: 'News and updates shown in the Chika section.' },
    { key: 'contents', label: 'Contents', desc: 'Videos and other content on the site.' },
    { key: 'fanprojects', label: 'Fan projects', desc: 'Fan project requests from the Polls page. Approve them to show in the Gallery, or decline them.' },
  ] },
  { group: 'Community', items: [
    { key: 'board', label: 'Community Board', desc: 'Write posts for the Community Board and control the comments: pin, lock, remove and mute.' },
    { key: 'accounts', label: 'Accounts', desc: 'Accounts made from this dashboard, and who is a user, an artist, a Group Admin, a System Admin or a super admin.' },
    { key: 'reports', label: 'Reports', desc: 'Problems sent in by users. Reply or mark them resolved.' }
  ] },
  { group: 'Site', items: [
    { key: 'banners', label: 'Banners', desc: 'The homepage carousel.' },
    { key: 'ads', label: 'Ads', desc: 'Ads shown around the site.' },
    { key: 'promos', label: 'Promo codes', desc: 'Codes people can enter on their profile for free Stars or Suns.' },
    { key: 'landing', label: 'Landing', desc: 'Links and buttons on the landing page.' }
  ] }
];
// System Admin: the same website tabs, without account management
const NAV_SYSTEM = NAV_SUPER.map((g) => ({ ...g, items: g.items.filter((t) => t.key !== 'accounts') }));

// Group Admin: fanbase groups and artist profiles only
const NAV_GROUP = [
  { group: 'Groups', items: [
    { key: 'fanbases', label: 'Fanbase groups', desc: 'Create and manage group fanbase pages, their members and which group is featured.' },
    { key: 'fanposts', label: 'Board posts', desc: 'Review posts shown on group fanbase pages.' },
    { key: 'merch', label: 'Merch', desc: 'Add the products shown on a fanbase\'s Merch tab: pictures, price, description and buy link.' }
  ] },
  { group: 'Artists', items: [
    { key: 'artistprofiles', label: 'Artist profiles', desc: 'Add artists and edit their profile: name, bio and links.' }
  ] }
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
  const [formOpen, setFormOpen] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState(() => new Set());

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
    setFormOpen(false);
  };

  const startEdit = (item) => {
    setForm({ ...cfg.empty, ...cfg.toForm(item) });
    setEditing(item);
    setFileKey((k) => k + 1);
    setFormOpen(true);
  };

  // "Add" keeps anything already typed; closing an edit throws the edit away
  const openNew = () => {
    if (editing) { setForm({ ...cfg.empty }); setEditing(null); setFileKey((k) => k + 1); }
    setFormOpen(true);
  };
  const closeForm = () => { if (saving) return; if (editing) reset(); else setFormOpen(false); };

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
    setFormOpen(true);
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
      if (!failedNames.length && !stopped) setFormOpen(false);
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
      const result = await adminFetch(`/api/${cfg.endpoint}/${idOf(item)}`, { method: 'DELETE' });
      const extra = result?.artistsRemoved ? ` ${result.artistsRemoved} artist${result.artistsRemoved === 1 ? '' : 's'} removed with it.` : '';
      notify(`${cfg.noun} deleted.${extra}`);
      if (idOf(editing) === idOf(item)) reset();
      await reload();
    }
  });

  const togglePick = (id) => setPicked((cur) => { const next = new Set(cur); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const stopSelecting = () => { setSelecting(false); setPicked(new Set()); };

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

  const visibleIds = rows.map(idOf);
  const pickedVisible = visibleIds.filter((id) => picked.has(id));
  const allPicked = visibleIds.length > 0 && pickedVisible.length === visibleIds.length;
  const toggleAll = () => setPicked(allPicked ? new Set() : new Set(visibleIds));

  const bulkRemove = () => {
    const targets = rows.filter((it) => picked.has(idOf(it)));
    if (!targets.length) return;
    const noun = cfg.noun.toLowerCase();
    const names = targets.slice(0, 3).map((it) => `“${cfg.titleOf(it)}”`).join(', ');
    askConfirm({
      title: `Delete ${targets.length} ${noun}${targets.length === 1 ? '' : 's'}?`,
      body: `${names}${targets.length > 3 ? ` and ${targets.length - 3} more` : ''} will be removed from the site for everyone. This can’t be undone.${cfg.bulkNote ? ` ${cfg.bulkNote}` : ''}`,
      confirmLabel: `Delete ${targets.length}`,
      run: async () => {
        let done = 0;
        let failed = 0;
        for (const item of targets) {
          try {
            await adminFetch(`/api/${cfg.endpoint}/${idOf(item)}`, { method: 'DELETE' });
            done += 1;
            if (idOf(editing) === idOf(item)) reset();
          } catch (err) {
            if (err.status === 401 || err.status === 403) { await reload(); throw err; }
            failed += 1;
          }
        }
        stopSelecting();
        if (failed) notify(`Deleted ${done}, but ${failed} could not be deleted.`, 'err');
        else notify(`${done} ${noun}${done === 1 ? '' : 's'} deleted.`);
        await reload();
      }
    });
  };

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
          <Field key={x.name} field={x} form={form} value={form[x.name]} fileKey={fileKey} currentImage={editing?.[x.imageKey || 'imageUrl']}
            onChange={(v) => change(x.name, v)} />
        ))}</div>);
        i += 1;
      } else {
        out.push(<Field key={f.name} field={f} form={form} value={form[f.name]} fileKey={fileKey} currentImage={editing?.[f.imageKey || 'imageUrl']}
          onChange={(v) => change(f.name, v)} />);
      }
    }
    return out;
  };

  const countLabel = rows.length === items.length ? `${items.length}` : `${rows.length} of ${items.length}`;

  return (
    <div className="ad-stack">
      {children}

      <div className="ad-card ad-listcard">
        <div className="ad-toolbar">
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
            {(filtersOn || query) && <button type="button" className="ad-link ad-clear" onClick={clearFilters}>Clear</button>}
          </div>
          <span className="ad-count-text">{loading ? '' : `${countLabel} ${countLabel === '1' ? cfg.noun.toLowerCase() : `${cfg.noun.toLowerCase()}s`}`}</span>
          {rows.length > 0 && <button type="button" className={`btn-ghost ad-select-btn${selecting ? ' on' : ''}`} onClick={() => (selecting ? stopSelecting() : setSelecting(true))}>{selecting ? 'Done' : 'Select'}</button>}
          <button type="button" className="btn-solid ad-add" onClick={openNew}>+ Add {cfg.noun.toLowerCase()}{queue.length > 0 ? ` (${queue.length} waiting)` : ''}</button>
        </div>

        {selecting && rows.length > 0 && (
          <div className="ad-bulkbar" role="toolbar" aria-label="Bulk actions">
            <label className="ad-check-all">
              <input type="checkbox" checked={allPicked} onChange={toggleAll} />
              <span>{allPicked ? 'Clear selection' : `Select all ${rows.length}`}</span>
            </label>
            <span className="ad-count-text">{pickedVisible.length} selected</span>
            <button type="button" className="ad-btn danger" disabled={!pickedVisible.length} onClick={bulkRemove}>Delete selected</button>
          </div>
        )}
        {loading ? <p className="ad-empty">Loading…</p> : rows.length === 0 ? (
          <p className="ad-empty">{items.length === 0 ? cfg.empty_text : <>Nothing matches these filters. <button type="button" className="ad-link" onClick={clearFilters}>Show everything</button></>}</p>
        ) : grouped.map(([group, list]) => (
          <div key={group || 'all'} className="ad-group">
            {group && <h3 className="ad-group-title"><span>{group}</span><em>{list.length}</em></h3>}
            {list.map((item) => {
              const row = cfg.row(item);
              return (
                <div
                  className={`ad-item ${idOf(editing) === idOf(item) ? 'editing' : ''}${selecting ? ' pickable' : ''}${picked.has(idOf(item)) ? ' picked' : ''}`}
                  key={idOf(item)}
                  onClick={selecting ? () => togglePick(idOf(item)) : undefined}
                >
                  {selecting && <input type="checkbox" className="ad-check" checked={picked.has(idOf(item))} onChange={() => togglePick(idOf(item))} onClick={(e) => e.stopPropagation()} aria-label={`Select ${cfg.titleOf(item)}`} />}
                  <Thumb url={item.imageUrl} label={cfg.titleOf(item)} />
                  <div className="ad-item-body">
                    <div className="ad-item-title">
                      {row.title}
                      {row.badge && <span className={`ad-chip ${row.badge.tone}`}>{row.badge.label}</span>}
                    </div>
                    {row.lines.filter(Boolean).map((line, i) => <div className="ad-item-sub" key={i}>{line}</div>)}
                  </div>
                  {!selecting && (
                    <div className="ad-item-actions">
                      {cfg.toForm && <button type="button" className="ad-btn" onClick={() => startEdit(item)}>Edit</button>}
                      <button type="button" className="ad-btn danger" onClick={() => remove(item)}>Delete</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <Modal open={formOpen} onClose={closeForm} label={editing ? `Edit ${cfg.noun.toLowerCase()}` : `Add ${cfg.noun.toLowerCase()}`} className="ad-modal ad-form-modal">
        <form className="ad-form" onSubmit={submit}>
          <h3>{editing ? `Edit ${cfg.noun.toLowerCase()}` : `Add ${cfg.noun.toLowerCase()}`}</h3>
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
      </Modal>
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

/* ------------------------------------------------------------------ fanbases */
function FanbaseModTab({ fanbases, artists, loading, ctx }) {
  const { reload, notify, fail, askConfirm } = ctx;
  const [busyId, setBusyId] = useState('');
  const [form, setForm] = useState(null);
  const [editingId, setEditingId] = useState('');
  const [banner, setBanner] = useState(null);
  const [avatar, setAvatar] = useState(null);
  const [saving, setSaving] = useState(false);
  const [bannerPreview, setBannerPreview] = useState('');
  const [avatarPreview, setAvatarPreview] = useState('');
  const socialFields = [
    ['instagram', 'Instagram'], ['tiktok', 'TikTok'], ['x', 'X'], ['youtube', 'YouTube'],
    ['spotify', 'Spotify'], ['appleMusic', 'Apple Music'], ['facebook', 'Facebook'], ['threads', 'Threads']
  ];

  useEffect(() => {
    if (!banner) { setBannerPreview(''); return undefined; }
    const url = URL.createObjectURL(banner);
    setBannerPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [banner]);

  useEffect(() => {
    if (!avatar) { setAvatarPreview(''); return undefined; }
    const url = URL.createObjectURL(avatar);
    setAvatarPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [avatar]);

  const closeEditor = () => {
    if (saving) return;
    setForm(null);
    setEditingId('');
    setBanner(null);
    setAvatar(null);
  };
  const create = () => {
    setEditingId('');
    setBanner(null);
    setAvatar(null);
    setForm({ name: '', bio: '', price: '500', memberEmails: [], socialLinks: {}, imageUrl: '', avatarUrl: '' });
  };
  const edit = (fb) => {
    setEditingId(idOf(fb));
    setBanner(null);
    setAvatar(null);
    setForm({
      name: fb.name || '',
      bio: fb.bio || '',
      price: String(fb.price ?? 500),
      memberEmails: fb.memberEmails || (fb.ownerEmail ? [fb.ownerEmail] : []),
      socialLinks: fb.socialLinks || {},
      imageUrl: fb.imageUrl || '',
      avatarUrl: fb.avatarUrl || ''
    });
  };
  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    const body = new FormData();
    body.append('name', form.name.trim());
    body.append('bio', form.bio.trim());
    body.append('price', form.price);
    body.append('memberEmails', JSON.stringify(form.memberEmails));
    body.append('socialLinks', JSON.stringify(form.socialLinks));
    if (banner) body.append('image', banner);
    if (avatar) body.append('avatar', avatar);
    try {
      await adminFetch(editingId ? `/api/fanbases/${editingId}` : '/api/fanbases', {
        method: editingId ? 'PUT' : 'POST',
        body
      });
      notify(editingId ? 'Fanbase updated.' : 'Fanbase created.');
      setForm(null);
      setEditingId('');
      setBanner(null);
      setAvatar(null);
      await reload();
    } catch (err) {
      fail(err);
    } finally {
      setSaving(false);
    }
  };

  const feature = async (fb) => {
    setBusyId(idOf(fb));
    try {
      await adminFetch(`/api/fanbases/${idOf(fb)}/featured`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ featured: !fb.featured })
      });
      notify(fb.featured ? 'No longer the featured artist.' : `${fb.name} is now the featured artist.`);
      await reload();
    } catch (err) {
      fail(err);
    } finally {
      setBusyId('');
    }
  };

  const remove = (fb) => askConfirm({
    title: 'Delete this fanbase?',
    body: `“${fb.name}” and its fanbase board posts will be removed, and subscribers lose access. Artist profile posts remain on the artist’s profile. This can’t be undone.`,
    confirmLabel: 'Delete',
    run: async () => {
      await adminFetch(`/api/fanbases/${idOf(fb)}`, { method: 'DELETE' });
      notify('Fanbase deleted.');
      await reload();
    }
  });
  const memberLabel = (fb) => {
    const emails = new Set((fb.memberEmails || []).map((email) => email.toLowerCase()));
    const names = artists.filter((artist) => emails.has(artist.email.toLowerCase())).map((artist) => artist.name);
    if (names.length) return names.join(', ');
    const count = (fb.memberEmails || []).length || (fb.hasOwner ? 1 : 0);
    return `${count} artist${count === 1 ? '' : 's'}`;
  };

  return (
    <div className="ad-card">
      <div className="ad-list-head">
        <h2>Fanbases <span className="ad-count">{fanbases.length}</span></h2>
        <button type="button" className="btn-solid ad-add" onClick={create}>Add fanbase</button>
      </div>
      <p className="ad-item-sub">Manage group fanbases, choose their artist members and social links, and feature a group on the Fanbase page.</p>
      {loading ? <p className="ad-empty">Loading…</p> : fanbases.length === 0 ? <p className="ad-empty">No fanbases yet. Create one here and select its artist members.</p> : fanbases.map((fb) => (
        <div className="ad-item" key={idOf(fb)}>
          <Thumb url={fb.avatarUrl || fb.imageUrl} label={fb.name} />
          <div className="ad-item-body">
            <div className="ad-item-title">{fb.name}{fb.featured && <span className="ad-chip live">Featured</span>}{!(fb.memberEmails || []).length && !fb.hasOwner && <span className="ad-chip soon">No artists selected</span>}</div>
            <div className="ad-item-sub">{[
              memberLabel(fb),
              `Php ${Number(fb.price || 0).toLocaleString('en-US')}/month`,
              `${Number(fb.subscriberCount || 0).toLocaleString('en-US')} subscribers`
            ].filter(Boolean).join(' · ')}</div>
          </div>
          <div className="ad-item-actions">
            <button type="button" className="ad-btn" onClick={() => edit(fb)}>Edit</button>
            <button type="button" className="ad-btn" disabled={busyId === idOf(fb)} onClick={() => feature(fb)}>{fb.featured ? 'Unfeature' : 'Feature'}</button>
            <button type="button" className="ad-btn danger" onClick={() => remove(fb)}>Delete</button>
          </div>
        </div>
      ))}
      <Modal open={Boolean(form)} onClose={closeEditor} label={editingId ? 'Edit fanbase' : 'Create fanbase'} className="ad-form-modal">
        {form && (
          <form className="ad-form" onSubmit={save}>
            <h3>{editingId ? 'Edit fanbase' : 'Create fanbase'}</h3>
            <label className="ad-field">
              <span>Fanbase name</span>
              <input className="ad-input" required maxLength={60} value={form.name} onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))} />
            </label>
            <label className="ad-field">
              <span>Bio <small>({(form.bio || '').length}/500)</small></span>
              <textarea className="ad-input" rows={4} maxLength={500} value={form.bio || ''} placeholder="Tell fans what this fanbase is about." onChange={(e) => setForm((current) => ({ ...current, bio: e.target.value }))} />
            </label>
            <div className="ad-field">
              <span>Artists in this group</span>
              <div className="ad-fanbase-members">
                {artists.map((artist) => {
                  const selected = form.memberEmails.includes(artist.email);
                  return (
                    <label className={`ad-fanbase-member${selected ? ' selected' : ''}`} key={artist.email}>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => setForm((current) => ({
                          ...current,
                          memberEmails: selected
                            ? current.memberEmails.filter((email) => email !== artist.email)
                            : [...current.memberEmails, artist.email]
                        }))}
                      />
                      <Thumb url={artist.avatar} label={artist.name} />
                      <span><strong>{artist.name}</strong><small>@{artist.username}</small></span>
                    </label>
                  );
                })}
                {artists.length === 0 && <small>Add artist accounts in Artist profiles before adding group members.</small>}
              </div>
            </div>
            <label className="ad-field">
              <span>Subscription price (Php/month)</span>
              <input className="ad-input" type="number" min="0" max="100000" required value={form.price} onChange={(e) => setForm((current) => ({ ...current, price: e.target.value }))} />
            </label>
            <label className="ad-field">
              <span>Banner image</span>
              {(bannerPreview || form.imageUrl) && <img className="ad-file-preview" src={bannerPreview || img(form.imageUrl)} alt="" />}
              <input className="ad-input" type="file" accept="image/*" onChange={(e) => setBanner(e.target.files?.[0] || null)} />
            </label>
            <label className="ad-field">
              <span>Artist avatar</span>
              {(avatarPreview || form.avatarUrl) && <img className="ad-file-preview" src={avatarPreview || img(form.avatarUrl)} alt="" />}
              <input className="ad-input" type="file" accept="image/*" onChange={(e) => setAvatar(e.target.files?.[0] || null)} />
            </label>
            <div className="ad-field">
              <span>Follow elsewhere</span>
              <div className="ad-fanbase-socials">
                {socialFields.map(([key, label]) => (
                  <label key={key}>
                    <span>{label}</span>
                    <input
                      className="ad-input"
                      type="url"
                      placeholder={`https://${key === 'x' ? 'x.com' : key === 'appleMusic' ? 'music.apple.com' : `${key}.com`}/...`}
                      value={form.socialLinks[key] || ''}
                      onChange={(e) => setForm((current) => ({
                        ...current,
                        socialLinks: { ...current.socialLinks, [key]: e.target.value }
                      }))}
                    />
                  </label>
                ))}
              </div>
            </div>
            <div className="ad-actions">
              <button type="button" className="btn-ghost" onClick={closeEditor} disabled={saving}>Cancel</button>
              <button type="submit" className="btn-solid" disabled={saving}>{saving ? 'Saving…' : editingId ? 'Save changes' : 'Create fanbase'}</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

function FanPostsModTab({ fanbases, posts, loading, ctx }) {
  const { reload, notify, askConfirm } = ctx;
  const nameOf = (id) => fanbases.find((f) => idOf(f) === id)?.name || 'Deleted fanbase';

  const remove = (post) => askConfirm({
    title: 'Delete this board post?',
    body: `This post by ${post.authorName} will be removed from the board. This can’t be undone.`,
    confirmLabel: 'Delete',
    run: async () => {
      const postId = post.source === 'artist' ? post.sourceId : idOf(post);
      const source = post.source === 'artist' ? '?source=artist' : '';
      await adminFetch(`/api/fanbase-posts/${postId}${source}`, { method: 'DELETE' });
      notify('Post deleted.');
      await reload();
    }
  });

  return (
    <div className="ad-card">
      <div className="ad-list-head">
        <h2>Board posts <span className="ad-count">{posts.length}</span></h2>
      </div>
      <p className="ad-item-sub">This includes posts artists publish on their profiles, which also appear on their linked fanbase page.</p>
      {loading ? <p className="ad-empty">Loading…</p> : posts.length === 0 ? <p className="ad-empty">No board posts yet.</p> : posts.map((post) => (
        <div className="ad-item" key={idOf(post)}>
          <Thumb url={post.imageUrl || post.authorAvatarUrl} label={post.authorName} />
          <div className="ad-item-body">
            <div className="ad-item-title">{post.authorName}</div>
            <div className="ad-item-sub">{[nameOf(post.fanbaseId), (post.text || 'Photo post').slice(0, 90), fmtDate(post.postedAt)].filter(Boolean).join(' · ')}</div>
          </div>
          <div className="ad-item-actions">
            <button type="button" className="ad-btn danger" onClick={() => remove(post)}>Delete</button>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ fanbase merch */
const MERCH_MAX_PICS = 5;
function MerchModTab({ fanbases, loading, ctx }) {
  const { notify, fail, askConfirm } = ctx;
  const [fanbaseId, setFanbaseId] = useState('');
  const [items, setItems] = useState([]);
  const [listing, setListing] = useState(false);
  const [form, setForm] = useState(null);      // { name, price, link, description, keep: [url], files: [File] }
  const [editingId, setEditingId] = useState('');
  const [previews, setPreviews] = useState([]);
  const [saving, setSaving] = useState(false);

  // start on the first fanbase
  useEffect(() => {
    if (!fanbaseId && fanbases.length) setFanbaseId(idOf(fanbases[0]));
  }, [fanbases, fanbaseId]);

  const load = useCallback(async () => {
    if (!fanbaseId) { setItems([]); return; }
    setListing(true);
    try {
      const data = await getJSON(`/api/fanbases/${fanbaseId}/merch`);
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      fail(err);
    } finally {
      setListing(false);
    }
  }, [fanbaseId, fail]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const urls = (form?.files || []).map((file) => URL.createObjectURL(file));
    setPreviews(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [form?.files]);

  const closeEditor = () => { if (saving) return; setForm(null); setEditingId(''); };
  const create = () => { setEditingId(''); setForm({ name: '', price: '', link: '', description: '', keep: [], files: [] }); };
  const edit = (item) => {
    setEditingId(idOf(item));
    setForm({ name: item.name || '', price: String(item.price ?? ''), link: item.link || '', description: item.description || '', keep: item.images || [], files: [] });
  };
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const addFiles = (list) => {
    const picked = Array.from(list || []);
    setForm((current) => {
      const room = MERCH_MAX_PICS - current.keep.length - current.files.length;
      if (picked.length > room) notify(`A product can have up to ${MERCH_MAX_PICS} pictures.`, 'err');
      return { ...current, files: [...current.files, ...picked.slice(0, Math.max(0, room))] };
    });
  };

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    const body = new FormData();
    body.append('name', form.name.trim());
    body.append('price', form.price);
    body.append('link', form.link.trim());
    body.append('description', form.description.trim());
    if (editingId) body.append('keepImages', JSON.stringify(form.keep));
    form.files.forEach((file) => body.append('images', file));
    try {
      await adminFetch(editingId ? `/api/fanbases/${fanbaseId}/merch/${editingId}` : `/api/fanbases/${fanbaseId}/merch`, {
        method: editingId ? 'PUT' : 'POST',
        body
      });
      notify(editingId ? 'Product updated.' : 'Product added.');
      setForm(null);
      setEditingId('');
      await load();
    } catch (err) {
      fail(err);
    } finally {
      setSaving(false);
    }
  };

  const remove = (item) => askConfirm({
    title: 'Delete this product?',
    body: `“${item.name}” will be removed from the Merch tab. This can’t be undone.`,
    confirmLabel: 'Delete',
    run: async () => {
      await adminFetch(`/api/fanbases/${fanbaseId}/merch/${idOf(item)}`, { method: 'DELETE' });
      notify('Product deleted.');
      await load();
    }
  });

  const peso = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="ad-card">
      <div className="ad-list-head">
        <h2>Merch <span className="ad-count">{items.length}</span></h2>
        <button type="button" className="btn-solid ad-add" onClick={create} disabled={!fanbaseId}>Add product</button>
      </div>
      <p className="ad-item-sub">Products shown on a fanbase’s Merch tab. Fans see the picture, name and price; the description opens in a pop-up, and the link is where they buy it.</p>
      {fanbases.length > 0 && (
        <div className="ad-filters">
          <select className="ad-input" value={fanbaseId} onChange={(e) => setFanbaseId(e.target.value)} aria-label="Fanbase">
            {fanbases.map((fb) => <option key={idOf(fb)} value={idOf(fb)}>{fb.name}</option>)}
          </select>
        </div>
      )}
      {loading ? <p className="ad-empty">Loading…</p> : fanbases.length === 0 ? <p className="ad-empty">Create a fanbase first, then add its merch here.</p> : listing && !items.length ? <p className="ad-empty">Loading…</p> : items.length === 0 ? <p className="ad-empty">No products yet for this fanbase.</p> : items.map((item) => (
        <div className="ad-item" key={idOf(item)}>
          <Thumb url={item.images?.[0]} label={item.name} />
          <div className="ad-item-body">
            <div className="ad-item-title">{item.name}{!item.link && <span className="ad-chip soon">No link</span>}</div>
            <div className="ad-item-sub">{[`Php ${peso(item.price)}`, `${(item.images || []).length} picture${(item.images || []).length === 1 ? '' : 's'}`, item.link && item.link.replace(/^https?:\/\//, '').slice(0, 48)].filter(Boolean).join(' · ')}</div>
          </div>
          <div className="ad-item-actions">
            <button type="button" className="ad-btn" onClick={() => edit(item)}>Edit</button>
            <button type="button" className="ad-btn danger" onClick={() => remove(item)}>Delete</button>
          </div>
        </div>
      ))}

      <Modal open={Boolean(form)} onClose={closeEditor} label={editingId ? 'Edit product' : 'Add product'} className="ad-form-modal">
        {form && (
          <form className="ad-form" onSubmit={save}>
            <h3>{editingId ? 'Edit product' : 'Add product'}</h3>
            <label className="ad-field">
              <span>Product name</span>
              <input className="ad-input" required maxLength={80} value={form.name} onChange={(e) => set('name', e.target.value)} />
            </label>
            <label className="ad-field">
              <span>Price (Php)</span>
              <input className="ad-input" type="number" required min="0" max="1000000" step="0.01" value={form.price} onChange={(e) => set('price', e.target.value)} />
            </label>
            <label className="ad-field">
              <span>Link to buy</span>
              <input className="ad-input" type="url" placeholder="https://shop.example.com/product" value={form.link} onChange={(e) => set('link', e.target.value)} />
            </label>
            <label className="ad-field">
              <span>Description <small>({form.description.length}/1000) · only shown in the pop-up</small></span>
              <textarea className="ad-input" rows={4} maxLength={1000} value={form.description} onChange={(e) => set('description', e.target.value)} />
            </label>
            <div className="ad-field">
              <span>Pictures <small>({form.keep.length + form.files.length}/{MERCH_MAX_PICS}) · the first one is the cover</small></span>
              <div className="ad-merch-pics">
                {form.keep.map((url) => (
                  <span className="ad-merch-pic" key={url}>
                    <img src={img(url)} alt="" />
                    <button type="button" aria-label="Remove picture" onClick={() => set('keep', form.keep.filter((u) => u !== url))}>×</button>
                  </span>
                ))}
                {form.files.map((file, n) => (
                  <span className="ad-merch-pic" key={`${file.name}-${n}`}>
                    {previews[n] && <img src={previews[n]} alt="" />}
                    <button type="button" aria-label="Remove picture" onClick={() => set('files', form.files.filter((_, i) => i !== n))}>×</button>
                  </span>
                ))}
              </div>
              {form.keep.length + form.files.length < MERCH_MAX_PICS && (
                <input className="ad-input" type="file" accept="image/*" multiple onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
              )}
            </div>
            <div className="ad-actions">
              <button type="button" className="btn-ghost" onClick={closeEditor} disabled={saving}>Cancel</button>
              <button type="submit" className="btn-solid" disabled={saving}>{saving ? 'Saving…' : editingId ? 'Save changes' : 'Add product'}</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ accounts & roles */
const ROLE_LABEL = { superadmin: 'Super admin', systemadmin: 'System Admin', groupadmin: 'Group Admin', admin: 'Group Admin', artist: 'Artist', user: 'User' };

function AccountsTab({ ctx, groupMode = false }) {
  const { notify, fail, askConfirm } = ctx;
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ accounts: [], total: 0, pages: 1, canManageAdmins: false, you: '' });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [aboutFor, setAboutFor] = useState(null); // account whose about section is being edited
  const [transferFor, setTransferFor] = useState(null); // account that would receive the super admin rights
  const [reloadKey, setReloadKey] = useState(0);
  const seq = useRef(0);

  // wait for a pause in typing before searching
  useEffect(() => {
    const t = setTimeout(() => { setSearch(query.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [query]);

  // "not allowed" (403) is a normal answer here, not an expired session
  const onError = useCallback((err) => (err?.status === 403 ? notify(err.message, 'err') : fail(err)), [notify, fail]);

  useEffect(() => {
    const mine = ++seq.current;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: '25' });
    if (search) params.set('q', search);
    if (role) params.set('role', role);
    adminFetch(`/api/admin/accounts?${params}`)
      .then((data) => { if (mine === seq.current) setState(data); })
      .catch((err) => { if (mine === seq.current) onError(err); })
      .finally(() => { if (mine === seq.current) setLoading(false); });
  }, [page, search, role, reloadKey, onError]);

  const nameOf = (a) => (a.username ? `@${a.username}` : a.email);

  const changeRole = async (account, nextRole) => {
    setBusyId(account.id);
    try {
      const data = await adminFetch(`/api/admin/accounts/${account.id}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: nextRole })
      });
      setState((s) => ({ ...s, accounts: s.accounts.map((a) => (a.id === account.id ? data.account : a)) }));
      notify(`${nameOf(account)} is now ${ROLE_LABEL[nextRole]}.`);
    } catch (err) {
      onError(err);
    } finally {
      setBusyId('');
    }
  };

  const pick = (account, nextRole) => {
    if (nextRole === account.role) return;
    const isStaffRole = (r) => ['groupadmin', 'systemadmin', 'admin'].includes(r);
    if (!isStaffRole(nextRole) && !isStaffRole(account.role)) return changeRole(account, nextRole);
    const promoting = isStaffRole(nextRole);
    const nextLabel = ROLE_LABEL[nextRole];
    askConfirm({
      title: promoting ? `Make ${nameOf(account)} a ${nextLabel}?` : `Remove ${ROLE_LABEL[account.role]} from ${nameOf(account)}?`,
      body: promoting
        ? (nextRole === 'systemadmin'
          ? 'System Admins can open the dashboard to manage polls, content, ads, banners and reports. They cannot manage accounts.'
          : 'Group Admins can open the Group Admin dashboard to manage fanbase groups and artist profiles.')
        : `They lose dashboard access and become ${ROLE_LABEL[nextRole].toLowerCase()}.`,
      confirmLabel: promoting ? `Make ${nextLabel}` : `Remove ${ROLE_LABEL[account.role]}`,
      tone: promoting ? 'ok' : 'danger',
      run: () => changeRole(account, nextRole)
    });
  };

  const { accounts, total, pages, canManageAdmins, you } = state;
  const clear = () => { setQuery(''); setSearch(''); setRole(''); setPage(1); };

  return (
    <div className="ad-card">
      <div className="ad-list-head">
        <h2>{groupMode ? 'Artist profiles' : 'Accounts'} <span className="ad-count">{total}</span></h2>
        <button type="button" className="btn-solid" onClick={() => setAddOpen(true)}>{groupMode ? '+ Add artist' : '+ Add user'}</button>
      </div>
      <p className="ad-empty">
        {groupMode
          ? 'Add artist accounts and edit their profile: name, bio, links and cover photo.'
          : <>Accounts made from this dashboard. People who signed up themselves are not listed. {canManageAdmins ? 'As a super admin you can make or remove Group Admins and System Admins.' : 'Only a super admin can make or remove admins.'}</>}
      </p>
      <div className="ad-filters">
        {!groupMode && (
          <select className="ad-input" value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }} aria-label="Filter by role">
            <option value="">All roles</option>
            <option value="user">Users</option>
            <option value="artist">Artists</option>
            <option value="groupadmin">Group Admins</option>
            <option value="systemadmin">System Admins</option>
          </select>
        )}
        <input className="ad-input ad-search" type="search" placeholder="Search name, @username or email…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search accounts" />
        {(query || role) && <button type="button" className="ad-link ad-clear" onClick={clear}>Clear filters</button>}
      </div>

      {loading && accounts.length === 0 ? <p className="ad-empty">Loading…</p> : accounts.length === 0 ? (
        <p className="ad-empty">No accounts match.</p>
      ) : accounts.map((a) => {
        const isYou = a.id === you;
        const fixed = a.locked || isYou;
        const lockedForMe = !fixed && ['admin', 'groupadmin', 'systemadmin'].includes(a.role) && !canManageAdmins;
        return (
          <div className="ad-item" key={a.id}>
            <span className="ad-thumb" aria-hidden="true"><b>{(a.username || a.email || '?').charAt(0).toUpperCase()}</b></span>
            <div className="ad-item-body">
              <div className="ad-item-title">
                {a.fullName || nameOf(a)}
                <span className={`ad-chip role-${a.role}`}>{ROLE_LABEL[a.role]}</span>
                {isYou && <span className="ad-chip">You</span>}
              </div>
              <div className="ad-item-sub">{[a.username && `@${a.username}`, a.email].filter(Boolean).join(' · ')}</div>
              <div className="ad-item-sub">
                Joined {fmtDate(a.createdAt)}
                {a.locked && ' · Role is set in the server settings'}
              </div>
            </div>
            <div className="ad-item-actions">
              {!groupMode && canManageAdmins && !isYou && a.role === 'systemadmin' && (
                <button
                  type="button"
                  className="ad-crown-btn"
                  onClick={() => setTransferFor(a)}
                  title="Make super admin"
                  aria-label={`Make ${nameOf(a)} super admin`}
                >
                  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
                    <path fill="currentColor" d="M3 7l4.5 4L12 4l4.5 7L21 7l-2 11H5L3 7zm2.4 13h13.2v2H5.4v-2z" />
                  </svg>
                </button>
              )}
              {!groupMode && (
                <select
                  className="ad-input ad-role-select"
                  value={a.role === 'admin' ? 'groupadmin' : a.role}
                  disabled={fixed || lockedForMe || busyId === a.id}
                  onChange={(e) => pick(a, e.target.value)}
                  aria-label={`Role for ${nameOf(a)}`}
                >
                  {a.role === 'superadmin' && <option value="superadmin">Super admin</option>}
                  <option value="user">User</option>
                  <option value="artist">Artist</option>
                  {(canManageAdmins || a.role === 'admin' || a.role === 'groupadmin') && <option value="groupadmin" disabled={!canManageAdmins}>Group Admin</option>}
                  {(canManageAdmins || a.role === 'systemadmin') && <option value="systemadmin" disabled={!canManageAdmins}>System Admin</option>}
                </select>
              )}
              {groupMode && a.role === 'artist' && <button type="button" className="btn-ghost" onClick={() => setAboutFor(a)}>Edit about</button>}
            </div>
          </div>
        );
      })}

      {pages > 1 && (
        <div className="ad-actions ad-pager">
          <button type="button" className="btn-ghost" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || loading}>Previous</button>
          <span className="ad-empty">Page {page} of {pages}</span>
          <button type="button" className="btn-ghost" onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages || loading}>Next</button>
        </div>
      )}

      <AboutModal
        account={aboutFor}
        onClose={() => setAboutFor(null)}
        onSaved={(account) => setState((st) => ({ ...st, accounts: st.accounts.map((x) => (x.id === account.id ? account : x)) }))}
        ctx={ctx}
      />

      <TransferSuperModal account={transferFor} onClose={() => setTransferFor(null)} ctx={ctx} />

      <AddUserModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        canManageAdmins={canManageAdmins}
        artistOnly={groupMode}
        onCreated={() => { setReloadKey((k) => k + 1); setPage(1); }}
        ctx={ctx}
      />
    </div>
  );
}

// Super admin only: hand the super admin rights to another account. The button stays grey until
// the super admin has typed their OWN email in full, then it turns red.
function TransferSuperModal({ account, onClose, ctx }) {
  const { notify, fail } = ctx;
  const me = useUser();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const shown = useRef(null);
  if (account) shown.current = account; // keep the last account while the dialog fades out
  const acc = account || shown.current;
  const myEmail = String(me?.email || '').trim();
  const matches = myEmail !== '' && typed.trim().toLowerCase() === myEmail.toLowerCase();

  useEffect(() => { if (account) setTyped(''); }, [account]);

  const close = () => { if (!busy) onClose(); };
  const submit = async (e) => {
    e.preventDefault();
    if (!matches || busy || !acc) return;
    setBusy(true);
    try {
      const data = await adminFetch('/api/admin/transfer-superadmin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId: acc.id, confirmEmail: typed.trim() })
      });
      notify(data.message || 'Super admin rights transferred.');
      onClose();
      // you are a System Admin now: sign in again so the dashboard matches your new role
      setTimeout(() => { clearUser(); window.location.assign('/login'); }, 1500);
    } catch (err) {
      if (err?.status === 400 || err?.status === 403 || err?.status === 404) notify(err.message, 'err');
      else fail(err);
      setBusy(false);
    }
  };

  return (
    <Modal open={Boolean(account)} onClose={close} label="Transfer super admin" className="ad-modal ad-form-modal">
      <form className="ad-form" onSubmit={submit}>
        <h3>Transfer super admin rights?</h3>
        <p className="ad-note">
          <b>{acc ? (acc.username ? `@${acc.username}` : acc.email) : ''}</b>{acc?.username ? ` (${acc.email})` : ''} will become the super admin.
          You will become a System Admin and will no longer be able to manage accounts and roles. Only the new super admin can undo this.
        </p>
        <div className="ad-field">
          <label htmlFor="ts-email">To confirm, type your email: <b>{myEmail}</b></label>
          <input
            id="ts-email"
            className="ad-input"
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder={myEmail}
            disabled={busy}
            autoFocus
          />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={close} disabled={busy}>Cancel</button>
          <button type="submit" className={`btn-solid ad-transfer-confirm${matches ? ' ready' : ''}`} disabled={!matches || busy}>
            {busy ? 'Transferring…' : 'Transfer super admin'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// Admin: edit an artist's "about" section: name, bio, links, and remove the cover photo.
function AboutModal({ account, onClose, onSaved, ctx }) {
  const { notify, fail } = ctx;
  const [form, setForm] = useState({ fullName: '', bio: '', socialLinks: {}, removeCover: false });
  const [busy, setBusy] = useState(false);
  const shown = useRef(null);
  if (account) shown.current = account; // keep the last account while the dialog fades out
  const acc = account || shown.current;

  useEffect(() => {
    if (account) setForm({ fullName: account.fullName || '', bio: account.bio || '', socialLinks: { ...(account.socialLinks || {}) }, removeCover: false });
  }, [account]);

  const save = async (e) => {
    e.preventDefault();
    if (busy || !account) return;
    setBusy(true);
    try {
      const data = await adminFetch(`/api/admin/accounts/${account.id}/about`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      onSaved(data.account);
      notify(data.message || 'Profile updated.');
      onClose();
    } catch (err) {
      if (err?.status === 400 || err?.status === 403 || err?.status === 404) notify(err.message, 'err');
      else fail(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={Boolean(account)} onClose={onClose} label="Edit about" className="ad-modal sl-modal">
      <form className="ad-form" onSubmit={save}>
        <h3>Edit about{acc?.username ? ` · @${acc.username}` : ''}</h3>
        <div className="ad-field">
          <label htmlFor="ab-name">Name</label>
          <input id="ab-name" className="ad-input" value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} maxLength={80} required />
        </div>
        <div className="ad-field">
          <label htmlFor="ab-bio">Bio <small>({form.bio.length}/300)</small></label>
          <textarea id="ab-bio" className="ad-input" rows={4} maxLength={300} value={form.bio} onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))} placeholder="Who are they, and what do they make?" />
        </div>
        <div className="ad-field">
          <label>Links <small>(leave empty to hide)</small></label>
          <SocialLinksFields value={form.socialLinks} onChange={(socialLinks) => setForm((f) => ({ ...f, socialLinks }))} idPrefix="ab-link" />
        </div>
        {acc?.hasCover && (
          <label className="ad-check-all ad-remove-cover">
            <input type="checkbox" checked={form.removeCover} onChange={(e) => setForm((f) => ({ ...f, removeCover: e.target.checked }))} /> Remove the cover photo
          </label>
        )}
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn-solid" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  );
}

// Create an account directly (no sign-up form or email code). The account is verified straight away.
const EMPTY_NEW_USER = { fullName: '', username: '', email: '', password: '', birthdate: '', role: 'user' };

function AddUserModal({ open, onClose, canManageAdmins, artistOnly = false, onCreated, ctx }) {
  const { notify, fail } = ctx;
  const [form, setForm] = useState(EMPTY_NEW_USER);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null); // { username, email, password } shown once after creating
  const [copied, setCopied] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const close = () => { setForm(EMPTY_NEW_USER); setCreated(null); setCopied(false); onClose(); };

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const data = await adminFetch('/api/admin/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, role: artistOnly ? 'artist' : form.role, username: form.username.replace(/\s/g, '') })
      });
      onCreated();
      notify(data.message || 'Account created.');
      setCreated({ username: data.account?.username || form.username, email: data.account?.email || form.email, password: data.generatedPassword || form.password });
    } catch (err) {
      if (err?.status === 400 || err?.status === 403 || err?.status === 409) notify(err.message, 'err');
      else fail(err);
    } finally {
      setBusy(false);
    }
  };

  const copyLogin = async () => {
    try {
      await navigator.clipboard.writeText(`Email: ${created.email}\nPassword: ${created.password}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      notify('Could not copy. Please copy it manually.', 'err');
    }
  };

  return (
    <Modal open={open} onClose={close} label={artistOnly ? 'Add artist' : 'Add user'} className="ad-modal ad-form-modal">
      {created ? (
        <div className="ad-form">
          <h3>Account created</h3>
          <p className="ad-note">@{created.username} can log in right away with these details. {form.password ? '' : 'The password is only shown now, so copy it before closing.'}</p>
          <div className="ad-cred">
            <div><small>Email</small><b>{created.email}</b></div>
            <div><small>Password</small><b>{created.password}</b></div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={copyLogin}>{copied ? 'Copied ✓' : 'Copy login'}</button>
            <button type="button" className="btn-solid" onClick={close}>Done</button>
          </div>
        </div>
      ) : (
        <form className="ad-form" onSubmit={submit}>
          <h3>{artistOnly ? 'Add artist' : 'Add user'}</h3>
          <p className="ad-note">Creates a ready-to-use account without the sign-up form or email code.</p>
          <div className="ad-field">
            <label htmlFor="au-name">Full name <em>*</em></label>
            <input id="au-name" className="ad-input" value={form.fullName} onChange={set('fullName')} maxLength={80} required autoFocus />
          </div>
          <div className="ad-row2">
            <div className="ad-field">
              <label htmlFor="au-user">Username <em>*</em></label>
              <input id="au-user" className="ad-input" value={form.username} onChange={set('username')} maxLength={24} placeholder="juandelacruz" autoComplete="off" required />
            </div>
            {!artistOnly && (
              <div className="ad-field">
                <label htmlFor="au-role">Role</label>
                <select id="au-role" className="ad-input" value={form.role} onChange={set('role')}>
                  <option value="user">User</option>
                  <option value="artist">Artist</option>
                  {canManageAdmins && <option value="groupadmin">Group Admin</option>}
                  {canManageAdmins && <option value="systemadmin">System Admin</option>}
                </select>
              </div>
            )}
          </div>
          <div className="ad-field">
            <label htmlFor="au-email">Email <em>*</em></label>
            <input id="au-email" className="ad-input" type="email" value={form.email} onChange={set('email')} autoComplete="off" required />
          </div>
          <div className="ad-row2">
            <div className="ad-field">
              <label htmlFor="au-pass">Password <small>(blank = generate one)</small></label>
              <input id="au-pass" className="ad-input" type="text" value={form.password} onChange={set('password')} minLength={8} autoComplete="new-password" placeholder="At least 8 characters" />
            </div>
            <div className="ad-field">
              <label htmlFor="au-bday">Birthdate <small>(optional)</small></label>
              <input id="au-bday" className="ad-input" type="date" value={form.birthdate} onChange={set('birthdate')} />
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={close} disabled={busy}>Cancel</button>
            <button type="submit" className="btn-solid" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
          </div>
        </form>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ promo codes */
function PromosTab({ ctx }) {
  const { notify, fail, askConfirm } = ctx;
  const [promos, setPromos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ code: '', stars: '', suns: '', maxRedemptions: '', expiresAt: '' });
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  useEffect(() => {
    let alive = true;
    adminFetch('/api/admin/promos')
      .then((data) => { if (alive) setPromos(Array.isArray(data) ? data : []); })
      .catch((err) => { if (alive) fail(err); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [fail]);

  const create = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const made = await adminFetch('/api/admin/promos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      setPromos((list) => [made, ...list]);
      setForm({ code: '', stars: '', suns: '', maxRedemptions: '', expiresAt: '' });
      notify(`Code ${made.code} created.`);
    } catch (err) {
      if (err?.status === 400 || err?.status === 409) notify(err.message, 'err');
      else fail(err);
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (promo) => {
    try {
      const next = await adminFetch(`/api/admin/promos/${promo.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !promo.active })
      });
      setPromos((list) => list.map((p) => (p.id === promo.id ? next : p)));
      notify(`${promo.code} ${next.active ? 'is on again' : 'is turned off'}.`);
    } catch (err) { fail(err); }
  };

  const remove = (promo) => askConfirm({
    title: `Delete ${promo.code}?`,
    body: 'The code stops working right away. People who already used it keep their reward.',
    confirmLabel: 'Delete',
    tone: 'danger',
    run: async () => {
      await adminFetch(`/api/admin/promos/${promo.id}`, { method: 'DELETE' });
      setPromos((list) => list.filter((p) => p.id !== promo.id));
      notify(`${promo.code} deleted.`);
    }
  });

  const worth = (p) => [p.stars > 0 && `${nf.format(p.stars)} Stars`, p.suns > 0 && `${nf.format(p.suns)} Suns`].filter(Boolean).join(' + ');
  const expired = (p) => Boolean(p.expiresAt) && new Date(p.expiresAt) < new Date();

  return (
    <div className="ad-stack">
      <div className="ad-card">
        <h2>Create a promo code</h2>
        <p className="ad-note">People enter codes under Promo on their profile. Each account can use a code once. Leave the code blank to make a random one.</p>
        <div className="ad-banner-form">
          <div className="ad-field">
            <label htmlFor="ad-promo-code">Code <small>(optional, letters and numbers)</small></label>
            <input id="ad-promo-code" className="ad-input" placeholder="e.g. WELCOME500" maxLength={30} value={form.code} onChange={set('code')} />
          </div>
          <div className="ad-row2">
            <div className="ad-field">
              <label htmlFor="ad-promo-stars">Stars</label>
              <input id="ad-promo-stars" className="ad-input" type="number" min="0" placeholder="0" value={form.stars} onChange={set('stars')} />
            </div>
            <div className="ad-field">
              <label htmlFor="ad-promo-suns">Suns</label>
              <input id="ad-promo-suns" className="ad-input" type="number" min="0" placeholder="0" value={form.suns} onChange={set('suns')} />
            </div>
          </div>
          <div className="ad-row2">
            <div className="ad-field">
              <label htmlFor="ad-promo-max">Max uses <small>(0 or blank = unlimited)</small></label>
              <input id="ad-promo-max" className="ad-input" type="number" min="0" placeholder="Unlimited" value={form.maxRedemptions} onChange={set('maxRedemptions')} />
            </div>
            <div className="ad-field">
              <label htmlFor="ad-promo-exp">Expires <small>(optional, last day it works)</small></label>
              <input id="ad-promo-exp" className="ad-input" type="date" value={form.expiresAt} onChange={set('expiresAt')} />
            </div>
          </div>
          <div className="ad-actions">
            <button type="button" className="btn-solid" onClick={create} disabled={busy}>{busy ? 'Creating…' : 'Create code'}</button>
          </div>
        </div>
      </div>

      <div className="ad-card">
        <h2>Promo codes <span className="ad-count">{promos.length}</span></h2>
        {loading ? <p className="ad-empty">Loading…</p> : promos.length === 0 ? <p className="ad-empty">No promo codes yet.</p> : promos.map((p) => (
          <div className="ad-item" key={p.id}>
            <div className="ad-item-body">
              <div className="ad-item-title">
                <span style={{ fontFamily: 'ui-monospace, Consolas, monospace', letterSpacing: '.06em' }}>{p.code}</span>
                <span className={`ad-status ${p.active && !expired(p) ? 'live' : 'paused'}`}>{!p.active ? 'Off' : expired(p) ? 'Expired' : 'Live'}</span>
              </div>
              <div className="ad-item-sub">{worth(p)}</div>
              <div className="ad-item-sub">
                Used {nf.format(p.redeemedCount)}{p.maxRedemptions > 0 ? ` of ${nf.format(p.maxRedemptions)}` : ''}
                {p.expiresAt ? ` · Expires ${fmtDate(p.expiresAt)}` : ' · No expiry'}
              </div>
            </div>
            <div className="ad-item-actions">
              <button type="button" className="ad-btn" onClick={() => toggle(p)}>{p.active ? 'Turn off' : 'Turn on'}</button>
              <button type="button" className="ad-btn danger" onClick={() => remove(p)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const FP_STATUS = { pending: 'For Approval', approved: 'Approved', rejected: 'Declined' };
const fpDay = (d) => (d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '');

function FanProjectsTab({ ctx }) {
  const { notify, fail, askConfirm } = ctx;
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');

  useEffect(() => {
    let alive = true;
    adminFetch('/api/admin/fan-projects')
      .then((data) => { if (alive) setItems(Array.isArray(data) ? data : []); })
      .catch((err) => { if (alive) fail(err); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [fail]);

  const setStatus = async (item, status) => {
    try {
      const next = await adminFetch(`/api/admin/fan-projects/${item._id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      setItems((list) => list.map((p) => (p._id === item._id ? next : p)));
      notify(`${item.artistName}: ${FP_STATUS[status]}.`);
    } catch (err) { fail(err); }
  };

  const remove = (item) => askConfirm({
    title: `Delete the ${item.artistName} request?`,
    body: 'It is removed from the Gallery and from the person’s History.',
    confirmLabel: 'Delete',
    tone: 'danger',
    run: async () => {
      await adminFetch(`/api/admin/fan-projects/${item._id}`, { method: 'DELETE' });
      setItems((list) => list.filter((p) => p._id !== item._id));
      notify('Request deleted.');
    }
  });

  const shown = items.filter((p) => filter === 'all' || p.status === filter);
  const count = (key) => items.filter((p) => p.status === key).length;

  return (
    <div className="ad-stack">
      <div className="ad-card">
        <div className="ad-list-head">
          <h2>Fan project requests <span className="ad-count">{shown.length}</span></h2>
          <select className="ad-input" style={{ width: 'auto' }} value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter requests">
            <option value="pending">For Approval ({count('pending')})</option>
            <option value="approved">Approved ({count('approved')})</option>
            <option value="rejected">Declined ({count('rejected')})</option>
            <option value="all">All ({items.length})</option>
          </select>
        </div>
        {loading ? <p className="ad-empty">Loading…</p> : shown.length === 0 ? <p className="ad-empty">Nothing here.</p> : shown.map((p) => (
          <div className="ad-item" key={p._id}>
            <div className="ad-item-body">
              <div className="ad-item-title">
                <span>{p.artistName}</span>
                <span className={`ad-status ${p.status === 'approved' ? 'live' : 'paused'}`}>{FP_STATUS[p.status]}</span>
              </div>
              <div className="ad-item-sub">{p.projectType} · Initiative by {p.initiative}</div>
              <div className="ad-item-sub">Poll {fpDay(p.pollStart)} - {fpDay(p.pollEnd)} · Target {fpDay(p.targetDate)}</div>
              <div className="ad-item-sub">{p.reason}</div>
              <div className="ad-item-sub">{p.name} · {p.email} · {p.cellphone} · Submitted {fpDay(p.createdAt)}</div>
            </div>
            <div className="ad-item-actions">
              {p.status !== 'approved' && <button type="button" className="ad-btn" onClick={() => setStatus(p, 'approved')}>Approve</button>}
              {p.status !== 'rejected' && <button type="button" className="ad-btn" onClick={() => setStatus(p, 'rejected')}>Decline</button>}
              <button type="button" className="ad-btn danger" onClick={() => remove(p)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ the dashboard */
function Dashboard({ user }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const isSuper = isSuperAdminUser(user);
  const isGroup = isGroupAdminUser(user);
  // Super Admin: website content + accounts. System Admin: website content only. Group Admin: groups + artist profiles.
  const NAV = isGroup ? NAV_GROUP : isSuper ? NAV_SUPER : NAV_SYSTEM;
  const TABS = NAV.flatMap((g) => g.items);
  const homeTab = TABS[0].key;
  const tab = TABS.some((t) => t.key === params.get('tab')) ? params.get('tab') : homeTab;
  const setTab = (key) => setParams(key === homeTab ? {} : { tab: key }, { replace: true });

  const [data, setData] = useState({ polls: [], groups: [], artists: [], chika: [], contents: [], fanbases: [], fanbaseArtists: [], fanposts: [], banners: [], ads: [], reports: [], settings: {} });
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
      if (isGroup) {
        // Group Admin: only fanbase groups and their board posts
        const [fanbaseData, fanposts] = await Promise.all([
          adminFetch('/api/admin/fanbases').catch((err) => {
            if (err.status === 401 || err.status === 403) setSessionBad(true);
            throw err;
          }),
          adminFetch('/api/fanbase-posts').catch(() => [])
        ]);
        setData((d) => ({ ...d, fanbases: fanbaseData?.fanbases || [], fanbaseArtists: fanbaseData?.artists || [], fanposts: fanposts || [] }));
        setLoadError('');
        return;
      }
      const [polls, groups, artists, chika, contents, banners, ads, settings, reports, artistAccounts, fanbaseList] = await Promise.all([
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
        }),
        adminFetch('/api/admin/artist-accounts').catch(() => ({ artists: [] })),
        safe(getJSON('/api/fanbases'), [])
      ]);
      setData({
        polls, groups, artists, chika, contents,
        fanbases: Array.isArray(fanbaseList) ? fanbaseList : [], fanbaseArtists: artistAccounts?.artists || [], fanposts: [],
        banners, ads: ads || [], reports: reports || [], settings
      });
      setLoadError('');
    } catch (err) {
      console.error(err);
      setLoadError('Could not load the data. Is the server running?');
    } finally {
      setLoading(false);
    }
  }, [isGroup]);

  useEffect(() => { reload(); }, [reload]);

  const askConfirm = useCallback((opts) => setConfirm(opts), []);
  const runConfirm = async () => {
    if (!confirm) return;
    setConfirmBusy(true);
    try { await confirm.run(); } catch (err) { fail(err); } finally { setConfirmBusy(false); setConfirm(null); }
  };

  const relogin = () => { clearUser(); navigate('/login', { state: { from: '/admin' } }); };
  const logout = () => { markEntered(); clearUser(); navigate('/login', { replace: true }); };

  const ctx = { reload, notify, fail, askConfirm };

  /* ---- per-resource configs ---- */
  const groupNames = data.groups.map((g) => g.name);
  const pollTitles = [...new Set(data.polls.map((p) => p.title).filter(Boolean))];
  // An artist shows in a poll only when its group AND category match that poll (see PollDetail),
  // so the category list only offers titles of polls that belong to the chosen group.
  const titlesForGroup = (group) => [...new Set(
    data.polls.filter((p) => (p.group || '') === (group || '')).map((p) => p.title).filter(Boolean)
  )];

  // an artist is shown in a poll when its group AND category match that poll
  const sameGroup = (a, b) => (a || '') === (b || '');
  const hasPoll = (artist) => data.polls.some((p) => p.title === artist.category && sameGroup(p.group, artist.group));
  const orphaned = (artist) => !loading && Boolean(artist.category) && !hasPoll(artist);
  const artistsOfPoll = (poll) => (
    data.polls.some((p) => idOf(p) !== idOf(poll) && p.title === poll.title && sameGroup(p.group, poll.group))
      ? []   // another poll still uses this title, so the artists stay
      : data.artists.filter((a) => a.category === poll.title && sameGroup(a.group, poll.group))
  );

  const configs = {
    polls: {
      endpoint: 'polls', noun: 'Poll', listTitle: 'Saved polls', empty_text: 'No polls yet.',
      filter: {
        sync: ['group'],
        fields: [{ name: 'group', all: 'All groups', options: () => groupNames }],
        match: (p, f) => !f.group || p.group === f.group
      },
      empty: { title: '', group: '', type: 'Minor', description: '', goal: '', fromDate: '', toDate: '', image: null },
      fields: [
        { name: 'title', label: 'Title', required: true, placeholder: 'e.g. Ace of the Year' },
        { name: 'group', label: 'Group', type: 'select', placeholder: 'No group', options: groupNames, half: true },
        { name: 'type', label: 'Type', type: 'select', options: ['Minor', 'Major'], half: true },
        { name: 'description', label: 'Description', type: 'textarea', rows: 3 },
        { name: 'goal', label: 'Goal (optional)', type: 'number', min: 0, placeholder: 'e.g. 8500', hint: 'Fan project: the poll page shows a progress bar of total votes toward this goal. Leave empty for a normal poll.' },
        { name: 'fromDate', label: 'Starts', type: 'date', required: true, half: true },
        { name: 'toDate', label: 'Ends', type: 'date', required: true, half: true },
        { name: 'image', label: 'Cover image', type: 'file' }
      ],
      validate: (f) => (f.fromDate && f.toDate && f.toDate < f.fromDate ? 'The end date must be after the start date.' : ''),
      toForm: (p) => ({ title: p.title || '', group: p.group || '', type: p.type || 'Minor', description: p.description || '', goal: p.goal ? String(p.goal) : '', fromDate: toDateInput(p.fromDate), toDate: toDateInput(p.toDate), image: null }),
      titleOf: (p) => p.title,
      deleteNote: (p) => {
        const n = artistsOfPoll(p).length;
        return n ? `The ${n} artist${n === 1 ? '' : 's'} in this poll will be deleted too.` : '';
      },
      bulkNote: 'Artists that only belong to these polls are deleted too.',
      searchText: (p) => `${p.title} ${p.group} ${p.type}`,
      sort: (a, b) => new Date(b.fromDate || 0) - new Date(a.fromDate || 0),
      row: (p) => {
        const status = pollStatus(p);
        return {
          title: p.title,
          badge: { label: STATUS_LABEL[status], tone: status },
          lines: [
            p.fromDate && p.toDate ? `${fmtDate(p.fromDate)} – ${fmtDate(p.toDate)}` : '',
            [p.group, p.type, p.goal > 0 ? `Goal ${nf.format(p.goal)}` : ''].filter(Boolean).join(' · ')
          ]
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
          { name: 'category', all: 'All polls', options: (f) => (f.group ? titlesForGroup(f.group) : pollTitles) },
          { name: 'orphan', all: 'All artists', options: () => ['Poll was deleted'] }
        ],
        // picking another group drops a poll filter that doesn't belong to it
        onChange: (next, name) => (name === 'group' && next.group && next.category && !titlesForGroup(next.group).includes(next.category) ? { ...next, category: '' } : next),
        match: (a, f) => (!f.group || a.group === f.group) && (!f.category || a.category === f.category) && (!f.orphan || orphaned(a))
      },
      stack: {
        keep: ['group', 'category'],
        key: (v) => [v.name, v.group, v.category].map((x) => String(x || '').trim().toLowerCase()).join('|')
      },
      empty: { name: '', group: '', category: '', position: '1', youtubeUrl: '', youtubeStartTime: '', accountEmail: '', fanbaseId: '', image: null },
      fields: [
        { name: 'name', label: 'Artist name', required: true },
        { name: 'group', label: 'Poll group', type: 'select', placeholder: 'Select group…', options: groupNames },
        {
          name: 'category', label: 'Category (poll title)', type: 'select',
          options: (f) => titlesForGroup(f.group),
          placeholder: (f) => (titlesForGroup(f.group).length ? 'Select category…' : f.group ? 'No polls in this group yet' : 'Select a group first…'),
          hint: 'Only polls in the selected group are listed.'
        },
        {
          name: 'accountEmail', label: 'Linked artist account (optional)', type: 'select', placeholder: 'Not linked',
          options: () => (data.fanbaseArtists || []).map((a) => ({ value: a.email, label: `${a.name} (@${a.username})` })),
          hint: 'Optional. Links this entry to the artist’s profile, so their polls show on their profile card. You can leave it empty and link it later by editing.'
        },
        {
          name: 'fanbaseId', label: 'Linked fanbase (optional)', type: 'select', placeholder: 'Not linked',
          options: () => (data.fanbases || []).map((f) => ({ value: idOf(f), label: f.name })),
          hint: 'Optional. For an entry that stands for a whole group: votes for it count toward that fanbase’s Top Fans. Entries named exactly like a fanbase, or linked to one of its artists, count automatically.'
        },
        { name: 'youtubeUrl', label: 'YouTube video', placeholder: 'https://youtube.com/…', hint: 'Optional. Plays when someone opens the artist.' },
        { name: 'youtubeStartTime', label: 'Start time (seconds)', type: 'number', min: 0, placeholder: 'e.g. 75 for 1:15', half: true },
        { name: 'position', label: 'Current rank', type: 'number', min: 1, hint: 'Ranks re-sort by votes automatically.', half: true },
        { name: 'image', label: 'Photo', type: 'file' }
      ],
      // changing the group clears a category that doesn't belong to the new group
      onChange: (next, name) => (name === 'group' && next.category && !titlesForGroup(next.group).includes(next.category) ? { ...next, category: '' } : next),
      toForm: (a) => ({ name: a.name || '', group: a.group || '', category: a.category || '', position: String(a.position || 1), youtubeUrl: a.youtubeUrl || '', youtubeStartTime: a.youtubeStartTime || '', accountEmail: a.accountEmail || '', fanbaseId: a.fanbaseId || '', image: null }),
      titleOf: (a) => a.name,
      searchText: (a) => `${a.name} ${a.group} ${a.category}`,
      groupBy: (a) => (a.category ? (a.group ? `${a.group} · ${a.category}` : a.category) : 'Uncategorized'),
      sort: (a, b) => Number(a.position) - Number(b.position),
      row: (a) => ({ title: a.name, badge: orphaned(a) ? { label: 'Poll deleted', tone: 'gone' } : { label: `#${a.position}`, tone: 'rank' }, lines: [`${nf.format(a.voteCount || 0)} votes`, a.category ? '' : a.group, a.profileUsername ? `Linked to @${a.profileUsername}` : ''] })
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
        { name: 'platform', label: 'Platform', type: 'select', options: ['YouTube', 'Facebook', 'Instagram', 'X', 'TikTok'] },
        { name: 'youtubeUrl', label: 'Content link', placeholder: 'https://…' },
        { name: 'image', label: 'Thumbnail', type: 'file' }
      ],
      toForm: (v) => ({ title: v.title || '', subtitle: v.subtitle || '', group: v.group || '', platform: v.platform || 'YouTube', youtubeUrl: v.youtubeUrl || '', image: null }),
      titleOf: (v) => v.title,
      searchText: (v) => `${v.title} ${v.subtitle} ${v.group} ${v.platform}`,
      row: (v) => ({ title: v.title, badge: { label: v.platform || 'YouTube', tone: 'soon' }, lines: [v.subtitle, v.group] })
    },
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
  const activeAds = data.ads.filter((a) => a.active).length;
  const stats = [
    { key: 'polls', label: 'Live polls', value: livePolls.length, sub: `${data.polls.length} in total` },
    { key: 'artists', label: 'Votes cast', value: totalVotes, sub: `${data.artists.length} artists` },
    { key: 'ads', label: 'Ads running', value: activeAds, sub: `${data.ads.length} in total` },
    { key: 'reports', label: 'Open reports', value: data.reports.length, sub: data.reports.length ? 'Waiting for a reply' : 'All clear', tone: data.reports.length ? 'alert' : '' }
  ];
  const current = TABS.find((t) => t.key === tab) || TABS[0];

  return (
    <main className="ad-page">
      <div className="ad-shell">
        <aside className="ad-side rise">
          <div className="ad-brand">
            <strong>{isGroup ? 'Group Admin' : isSuper ? 'Admin' : 'System Admin'}</strong>
            <span title={user.email}>{user.email}</span>
            <button type="button" className="ad-logout" onClick={logout}>Log out</button>
          </div>
          <nav className="ad-nav" aria-label="Admin sections">
            {NAV.map((g) => (
              <div className="ad-nav-group" key={g.group || 'top'}>
                {g.group && <p className="ad-nav-title">{g.group}</p>}
                {g.items.map((t) => (
                  <button key={t.key} type="button" className={`ad-tab ${tab === t.key ? 'on' : ''}`} onClick={() => setTab(t.key)} aria-current={tab === t.key ? 'page' : undefined}>
                    <span>{t.label}</span>
                    {t.key === 'reports' && data.reports.length > 0 && <span className="ad-badge">{data.reports.length}</span>}
                  </button>
                ))}
              </div>
            ))}
          </nav>

        </aside>

        <div className="ad-main">
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

          <header className="ad-title rise" style={{ '--d': '60ms' }}>
            <h1>{current.label}</h1>
            <p>{current.desc}</p>
          </header>

          <section key={tab} className="ad-panel rise" style={{ '--d': '100ms' }}>
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
            {tab === 'fanbases' && <FanbaseModTab key="fanbases" fanbases={data.fanbases} artists={data.fanbaseArtists} loading={loading} ctx={ctx} />}
            {tab === 'fanposts' && <FanPostsModTab key="fanposts" fanbases={data.fanbases} posts={data.fanposts} loading={loading} ctx={ctx} />}
            {tab === 'merch' && isGroup && <MerchModTab key="merch" fanbases={data.fanbases} loading={loading} ctx={ctx} />}
            {tab === 'banners' && <BannersTab banners={data.banners} ctx={ctx} />}
            {tab === 'ads' && <AdsTab ads={data.ads} ctx={ctx} />}
            {tab === 'landing' && <LandingTab settings={data.settings} ctx={ctx} />}
            {tab === 'reports' && <ReportsTab reports={data.reports} loading={loading} ctx={ctx} />}
            {tab === 'board' && <div className="admin-board" style={{ maxWidth: 820 }}><BoardPanel /></div>}
            {tab === 'accounts' && <AccountsTab key="accounts" ctx={ctx} />}
            {tab === 'artistprofiles' && <AccountsTab key="artistprofiles" ctx={ctx} groupMode />}
            {tab === 'promos' && <PromosTab key="promos" ctx={ctx} />}
            {tab === 'fanprojects' && <FanProjectsTab key="fanprojects" ctx={ctx} />}
          </section>
        </div>
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