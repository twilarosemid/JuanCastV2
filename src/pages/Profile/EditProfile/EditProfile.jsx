import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { API, adminFetch, getJSON, img, isArtistUser, mergeUser, saveUser } from '../../../api';
import useUser from '../../../hooks/useUser';
import Modal from '../../../components/Modal/Modal';
import Feedback from '../../../components/Feedback/Feedback';
import { SOCIAL_PLATFORMS, SocialLinksFields } from '../../../components/SocialLinks/SocialLinks';
import './EditProfile.css';

const STAGE_H = 320;
const ID_STAGE_H = 360;
const BIO_MAX = 300;
const MAX_COVER = 8 * 1024 * 1024; // same cap as the server
// quick-add labels for the ID card details
const ID_SUGGESTIONS = ['Birth Name', 'Position', 'Birthday', 'Zodiac Sign', 'Height', 'Weight', 'Blood Type', 'MBTI Type', 'Nationality', 'Representative Emoji'];
let rowSeq = 0;
const newRow = (label = '', value = '') => ({ key: `row-${rowSeq += 1}`, label, value });
// what actually gets saved: trimmed, empty rows and blank lines dropped
const cleanDetails = (rows) => (rows || []).map((r) => ({ label: String(r.label || '').trim(), value: String(r.value || '').trim() })).filter((r) => r.label || r.value);
const cleanFacts = (text) => String(text || '').split('\n').map((line) => line.trim()).filter(Boolean);
// every platform key, trimmed, so two link sets can be compared reliably
const cleanLinks = (value) => Object.fromEntries(SOCIAL_PLATFORMS.map(({ key }) => [key, String(value?.[key] || '').trim()]));
const DAY = 24 * 60 * 60 * 1000;

const formatJoined = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return 'Joined recently';
  return `Joined ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
};

const daysLeft = (last, days) => {
  if (!last) return 0;
  const left = Math.ceil((days * DAY - (Date.now() - new Date(last))) / DAY);
  return left > 0 ? left : 0;
};

const UserSvg = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
  </svg>
);

// Crop box on screen and the size of the saved image (profile photos are square, the ID photo is 9:16)
const cropSpec = (kind = 'avatar') => (kind === 'id'
  ? { boxW: 180, boxH: 320, outW: 540, outH: 960 }
  : { boxW: 240, boxH: 240, outW: 320, outH: 320 });

const clampOffset = (c, boxW, boxH, zoom, tx, ty) => {
  const scale = Math.max(boxW / c.nw, boxH / c.nh) * zoom;
  const maxX = Math.max(0, (c.nw * scale - boxW) / 2);
  const maxY = Math.max(0, (c.nh * scale - boxH) / 2);
  return { tx: Math.max(-maxX, Math.min(maxX, tx)), ty: Math.max(-maxY, Math.min(maxY, ty)), scale };
};

export default function EditProfile() {
  const navigate = useNavigate();
  const viewer = useUser();
  const viewerRef = useRef(viewer);
  viewerRef.current = viewer;

  const avatarInput = useRef(null);
  const idPhotoInput = useRef(null);
  const coverInput = useRef(null);
  const drag = useRef(null);

  const [form, setForm] = useState({ fullName: '', username: '', avatar: '' });
  const [initial, setInitial] = useState(null);
  const [about, setAbout] = useState({ bio: '', links: cleanLinks({}) }); // artists only
  const [aboutInitial, setAboutInitial] = useState(null);
  const [idCard, setIdCard] = useState({ stageName: '', details: [], facts: '', photo: '' }); // artists only: the ID card
  const [idInitial, setIdInitial] = useState(null);
  const [idPhotoFile, setIdPhotoFile] = useState(null);   // a freshly cropped 9:16 portrait waiting to be saved
  const [idPhotoPreview, setIdPhotoPreview] = useState('');
  const [removeIdPhoto, setRemoveIdPhoto] = useState(false);
  const [cover, setCover] = useState('');                  // artists only: the saved cover photo
  const [coverFile, setCoverFile] = useState(null);        // a new cover waiting to be saved
  const [coverPreview, setCoverPreview] = useState('');
  const [removeCover, setRemoveCover] = useState(false);
  const [joined, setJoined] = useState('Joined recently');
  const [locks, setLocks] = useState({ name: 0, username: 0 });
  const [saving, setSaving] = useState(false);
  const [cropper, setCropper] = useState(null);
  const [feedback, setFeedback] = useState({ open: false, type: 'error', message: '' });

  // fill the form from the saved user, then refresh it from the server
  useEffect(() => {
    const me = viewerRef.current;
    if (!me?.email) return undefined;
    let cancelled = false;

    const fill = (data) => {
      const next = {
        fullName: data.fullName || '',
        username: data.username || '',
        avatar: data.avatar || ''
      };
      setForm(next);
      setInitial(next);
      setJoined(formatJoined(data.createdAt));
    };

    fill(me);
    getJSON(`/api/users/me?email=${encodeURIComponent(me.email)}`)
      .then((fresh) => {
        if (cancelled) return;
        fill(fresh);
        const loaded = { bio: String(fresh.bio || ''), links: cleanLinks(fresh.socialLinks) };
        setAbout(loaded);
        setAboutInitial(loaded);
        const loadedId = {
          stageName: String(fresh.stageName || ''),
          details: (Array.isArray(fresh.idDetails) ? fresh.idDetails : []).map((r) => newRow(r.label, r.value)),
          facts: (Array.isArray(fresh.idFacts) ? fresh.idFacts : []).join('\n'),
          photo: String(fresh.idPhoto || '')
        };
        setIdCard(loadedId);
        setIdInitial({ stageName: loadedId.stageName.trim(), details: cleanDetails(loadedId.details), facts: cleanFacts(loadedId.facts) });
        setCover(String(fresh.coverPhoto || ''));
        setLocks({ name: daysLeft(fresh.lastNameChange, 7), username: daysLeft(fresh.lastUsernameChange, 30) });
      })
      .catch((error) => {
        console.error('Error loading profile for editing:', error);
        if (!cancelled) setInitial((cur) => cur);
      });
    return () => { cancelled = true; };
  }, [viewer?.email]);

  const isArtist = isArtistUser(viewer);
  // artists are never locked by the name / @username cooldowns
  const nameLock = isArtist ? 0 : locks.name;
  const userLock = isArtist ? 0 : locks.username;
  const profileChanged = initial !== null && Object.keys(form).some((key) => form[key] !== initial[key]);
  const idChanged = isArtist && idInitial !== null && (
    idCard.stageName.trim() !== idInitial.stageName
    || JSON.stringify(cleanDetails(idCard.details)) !== JSON.stringify(idInitial.details)
    || JSON.stringify(cleanFacts(idCard.facts)) !== JSON.stringify(idInitial.facts)
    || Boolean(idPhotoFile) || removeIdPhoto
  );
  const coverChanged = isArtist && (Boolean(coverFile) || removeCover);
  const aboutChanged = isArtist && aboutInitial !== null && (about.bio.trim() !== aboutInitial.bio.trim() || JSON.stringify(cleanLinks(about.links)) !== JSON.stringify(aboutInitial.links) || idChanged || coverChanged);
  const hasChanges = profileChanged || aboutChanged;

  const spec = useMemo(() => (cropper ? cropSpec(cropper.kind) : null), [cropper?.kind, Boolean(cropper)]);

  if (!viewer?.email) return <Navigate to="/login" replace state={{ from: '/profile/edit' }} />;

  const say = (type, message) => setFeedback({ open: true, type, message });

  const openCropper = (file, kind = 'avatar') => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { say('error', 'Please choose an image file.'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const probe = new Image();
      probe.onload = () => setCropper({ kind, src: reader.result, nw: probe.naturalWidth, nh: probe.naturalHeight, zoom: 1, tx: 0, ty: 0 });
      probe.onerror = () => say('error', 'That image could not be opened.');
      probe.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  const pickFile = (event) => {
    openCropper(event.target.files?.[0], 'avatar');
    event.target.value = '';
  };
  const pickCover = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { say('error', 'Please choose an image file.'); return; }
    if (file.size > MAX_COVER) { say('error', 'That image is too big (max 8 MB).'); return; }
    if (coverPreview) URL.revokeObjectURL(coverPreview);
    setCoverFile(file);
    setCoverPreview(URL.createObjectURL(file));
    setRemoveCover(false);
  };
  const dropCover = () => {
    if (coverPreview) URL.revokeObjectURL(coverPreview);
    setCoverFile(null);
    setCoverPreview('');
    setRemoveCover(Boolean(cover));
  };
  const pickIdPhoto = (event) => {
    openCropper(event.target.files?.[0], 'id');
    event.target.value = '';
  };

  // ID card detail rows
  const setRow = (key, patch) => setIdCard((c) => ({ ...c, details: c.details.map((r) => (r.key === key ? { ...r, ...patch } : r)) }));
  const addRow = (label = '') => setIdCard((c) => ({ ...c, details: [...c.details, newRow(label)] }));
  const removeRow = (key) => setIdCard((c) => ({ ...c, details: c.details.filter((r) => r.key !== key) }));

  const setZoom = (zoom) => {
    setCropper((c) => {
      const s = cropSpec(c.kind);
      const { tx, ty } = clampOffset(c, s.boxW, s.boxH, zoom, c.tx, c.ty);
      return { ...c, zoom, tx, ty };
    });
  };

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, tx: cropper.tx, ty: cropper.ty };
  };
  const onPointerMove = (e) => {
    if (!drag.current) return;
    const d = drag.current;
    setCropper((c) => {
      const s = cropSpec(c.kind);
      const { tx, ty } = clampOffset(c, s.boxW, s.boxH, c.zoom, d.tx + e.clientX - d.x, d.ty + e.clientY - d.y);
      return { ...c, tx, ty };
    });
  };
  const onPointerUp = () => { drag.current = null; };

  const applyCrop = () => {
    const image = new Image();
    image.onload = () => {
      const { boxW, boxH, outW, outH } = cropSpec(cropper.kind);
      const { scale } = clampOffset(cropper, boxW, boxH, cropper.zoom, cropper.tx, cropper.ty);
      const sw = boxW / scale;
      const sh = boxH / scale;
      const sx = cropper.nw / 2 - cropper.tx / scale - sw / 2;
      const sy = cropper.nh / 2 - cropper.ty / scale - sh / 2;

      const canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      canvas.getContext('2d').drawImage(image, sx, sy, sw, sh, 0, 0, outW, outH);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.86);

      if (cropper.kind === 'id') {
        // the ID portrait is uploaded as a file when you save
        canvas.toBlob((blob) => {
          if (!blob) { say('error', 'That photo could not be prepared. Please try another one.'); return; }
          setIdPhotoFile(new File([blob], 'id-photo.jpg', { type: 'image/jpeg' }));
          setIdPhotoPreview(dataUrl);
          setRemoveIdPhoto(false);
          setCropper(null);
        }, 'image/jpeg', 0.86);
        return;
      }
      setForm((f) => ({ ...f, avatar: dataUrl }));
      setCropper(null);
    };
    image.src = cropper.src;
  };

  const save = async (e) => {
    e.preventDefault();
    if (!hasChanges || saving) return;
    setSaving(true);
    try {
      let savedUser = viewer;
      if (profileChanged) {
        const res = await fetch(`${API}/api/users/update-profile`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: viewer.email,
            fullName: form.fullName,
            username: form.username,
            avatar: form.avatar
          })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || 'Failed to save your profile.');
        savedUser = mergeUser(viewer, data);
        saveUser(savedUser);
        setInitial({ ...form });
      }
      if (aboutChanged) {
        if (!viewer.token) throw new Error('Please log out and log in again to unlock your artist tools.');
        const body = new FormData();
        body.append('bio', about.bio.trim());
        body.append('socialLinks', JSON.stringify(cleanLinks(about.links)));
        body.append('stageName', idCard.stageName.trim());
        body.append('idDetails', JSON.stringify(cleanDetails(idCard.details)));
        body.append('idFacts', JSON.stringify(cleanFacts(idCard.facts)));
        if (coverFile) body.append('cover', coverFile);
        else if (removeCover) body.append('removeCover', 'true');
        if (idPhotoFile) body.append('idPhoto', idPhotoFile);
        else if (removeIdPhoto) body.append('removeIdPhoto', 'true');
        try {
          const saved = await adminFetch('/api/artist/profile', { method: 'PUT', body });
          const next = { bio: String(saved.bio || ''), links: cleanLinks(saved.socialLinks) };
          setAbout(next);
          setAboutInitial(next);
          const savedId = {
            stageName: String(saved.stageName || ''),
            details: (Array.isArray(saved.idDetails) ? saved.idDetails : []).map((r) => newRow(r.label, r.value)),
            facts: (Array.isArray(saved.idFacts) ? saved.idFacts : []).join('\n'),
            photo: String(saved.idPhoto || '')
          };
          setIdCard(savedId);
          setIdInitial({ stageName: savedId.stageName.trim(), details: cleanDetails(savedId.details), facts: cleanFacts(savedId.facts) });
          setIdPhotoFile(null);
          setIdPhotoPreview('');
          setRemoveIdPhoto(false);
          setCover(String(saved.coverPhoto || ''));
          if (coverPreview) URL.revokeObjectURL(coverPreview);
          setCoverFile(null);
          setCoverPreview('');
          setRemoveCover(false);
        } catch (error) {
          throw new Error(error.status === 401 ? 'Please log out and log in again to unlock your artist tools.' : (error.message || 'Could not save your bio and links.'));
        }
      }
      say('success', 'Your profile was updated.');
    } catch (error) {
      say('error', error.message || 'A network error occurred.');
    } finally {
      setSaving(false);
    }
  };

  const closeFeedback = () => {
    const wasSuccess = feedback.type === 'success';
    setFeedback((f) => ({ ...f, open: false }));
    if (wasSuccess) navigate('/profile');
  };

  const nameHint = nameLock ? `You can change your name again in ${nameLock} day${nameLock === 1 ? '' : 's'}.` : (isArtist ? '' : 'You can only change your name once every 7 days.');
  const userHint = userLock ? `You can change your @username again in ${userLock} day${userLock === 1 ? '' : 's'}.` : (isArtist ? '' : 'You can only change your @username once every 30 days.');

  return (
    <main className="ep-page">
      <section className="ep-card rise">
        <div className="ep-head">
          <button type="button" className="ep-avatar" onClick={() => avatarInput.current?.click()} aria-label="Change profile photo">
            {form.avatar ? <img src={img(form.avatar)} alt="" /> : <UserSvg />}
            <span>Change Photo</span>
          </button>
          <div className="ep-id">
            <h1>{form.fullName || 'Your name'}</h1>
            <p className="ep-handle">@{form.username}</p>
            <p className="ep-joined">{joined}</p>
          </div>
          <Link className="btn-ghost ep-back" to="/profile">Back to Profile</Link>
        </div>

        <form className="ep-form" onSubmit={save}>
          <h2>Edit Profile</h2>

          <label className="ep-field">
            <span>Full Name</span>
            <input
              type="text"
              value={form.fullName}
              maxLength={80}
              disabled={nameLock > 0}
              onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
              required
            />
            <small>{nameHint}</small>
          </label>

          <label className="ep-field">
            <span>Username</span>
            <div className="ep-at">
              <i aria-hidden="true">@</i>
              <input
                type="text"
                value={form.username}
                maxLength={30}
                disabled={userLock > 0}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value.replace(/^@/, '') }))}
                required
              />
            </div>
            <small>{userHint}</small>
          </label>

          {isArtist && (
            <section className="ep-about" aria-label="About and links">
              <h2>Cover Photo</h2>
              <p className="ep-note">The wide banner at the top of your artist page.</p>
              <div className="ep-cover">
                <div className="ep-cover-box">
                  {(coverPreview || (!removeCover && cover))
                    ? <img src={coverPreview || img(cover)} alt="Cover photo preview" />
                    : <span>No cover photo</span>}
                </div>
                <div className="ep-idphoto-btns">
                  <button type="button" className="btn-ghost" onClick={() => coverInput.current?.click()}>{(coverPreview || cover) && !removeCover ? 'Change cover' : 'Add cover photo'}</button>
                  {(coverPreview || (cover && !removeCover)) && (
                    <button type="button" className="btn-ghost" onClick={dropCover}>Remove</button>
                  )}
                </div>
              </div>

              <h2 className="ep-h2-gap">ID Card</h2>
              <p className="ep-note">Fans see this as an ID card in a pop-up when they tap View Profile on your page: portrait and stage name on the left, details and facts on the right, then your links.</p>

              <div className="ep-idphoto">
                <div className="ep-idphoto-box">
                  {(idPhotoPreview || (!removeIdPhoto && idCard.photo))
                    ? <img src={idPhotoPreview || img(idCard.photo)} alt="ID portrait preview" />
                    : <UserSvg />}
                </div>
                <div className="ep-idphoto-side">
                  <strong>ID portrait</strong>
                  <small>Tall photo (9:16). You can zoom and move it after choosing.</small>
                  <div className="ep-idphoto-btns">
                    <button type="button" className="btn-ghost" onClick={() => idPhotoInput.current?.click()}>{(idPhotoPreview || idCard.photo) && !removeIdPhoto ? 'Change photo' : 'Choose photo'}</button>
                    {(idPhotoPreview || (idCard.photo && !removeIdPhoto)) && (
                      <button type="button" className="btn-ghost" onClick={() => { setIdPhotoFile(null); setIdPhotoPreview(''); setRemoveIdPhoto(Boolean(idCard.photo)); }}>Remove</button>
                    )}
                  </div>
                </div>
              </div>

              <label className="ep-field">
                <span>Stage name</span>
                <input type="text" value={idCard.stageName} maxLength={80} placeholder={form.fullName || 'Your stage name'} onChange={(e) => setIdCard((c) => ({ ...c, stageName: e.target.value }))} />
                <small>Shown under your portrait. Leave empty to use your full name.</small>
              </label>

              <h3 className="ep-sub">Details</h3>
              <div className="ep-rows">
                {idCard.details.map((row) => (
                  <div className="ep-row" key={row.key}>
                    <input type="text" className="ep-row-label" value={row.label} maxLength={40} placeholder="Label (e.g. Birthday)" aria-label="Detail label" onChange={(e) => setRow(row.key, { label: e.target.value })} />
                    <input type="text" className="ep-row-value" value={row.value} maxLength={140} placeholder="Value" aria-label="Detail value" onChange={(e) => setRow(row.key, { value: e.target.value })} />
                    <button type="button" className="ep-row-x" onClick={() => removeRow(row.key)} aria-label={`Remove ${row.label || 'detail'}`}>×</button>
                  </div>
                ))}
                {idCard.details.length === 0 && <p className="ep-note">No details yet. Add as many as you like; they appear in two columns.</p>}
              </div>
              <div className="ep-quick" aria-label="Quick add">
                {ID_SUGGESTIONS.filter((label) => !idCard.details.some((r) => r.label.trim().toLowerCase() === label.toLowerCase())).map((label) => (
                  <button type="button" key={label} onClick={() => addRow(label)}>+ {label}</button>
                ))}
                <button type="button" className="ep-quick-new" onClick={() => addRow('')}>+ Custom detail</button>
              </div>

              <label className="ep-field">
                <span>Facts</span>
                <textarea
                  className="ep-textarea"
                  rows={6}
                  value={idCard.facts}
                  placeholder={'One fact per line, for example:\nHas been playing the ukulele since high school.\nFavourite color is pink.'}
                  onChange={(e) => setIdCard((c) => ({ ...c, facts: e.target.value }))}
                />
                <small>Each line becomes one fact on your ID.</small>
              </label>

              <h2 className="ep-h2-gap">About</h2>
              <label className="ep-field">
                <span>Bio</span>
                <textarea
                  className="ep-textarea"
                  rows={4}
                  maxLength={BIO_MAX}
                  value={about.bio}
                  placeholder="Who are you, and what do you make?"
                  onChange={(e) => setAbout((a) => ({ ...a, bio: e.target.value }))}
                />
                <small className="ep-count">{about.bio.length}/{BIO_MAX}</small>
              </label>
              <h3 className="ep-sub">Your links <small className="ep-sub-note">(only the ones you fill in show as icons on your ID)</small></h3>
              <SocialLinksFields value={about.links} onChange={(links) => setAbout((a) => ({ ...a, links }))} idPrefix="ep-link" />
            </section>
          )}

          <div className="ep-actions">
            <Link className="btn-ghost" to="/profile">Cancel</Link>
            <button type="submit" className="btn-solid" disabled={!hasChanges || saving}>{saving ? 'Saving...' : 'Save Changes'}</button>
          </div>

          <input type="file" accept="image/*" ref={avatarInput} onChange={pickFile} hidden />
          <input type="file" accept="image/*" ref={idPhotoInput} onChange={pickIdPhoto} hidden />
          <input type="file" accept="image/*" ref={coverInput} onChange={pickCover} hidden />
        </form>
      </section>

      <Modal open={Boolean(cropper)} onClose={() => setCropper(null)} label="Crop photo" className="ep-crop">
        {cropper && spec && (() => {
          const { tx, ty, scale } = clampOffset(cropper, spec.boxW, spec.boxH, cropper.zoom, cropper.tx, cropper.ty);
          return (
            <>
              <header className="ep-crop-head">
                <h3>{cropper.kind === 'id' ? 'Crop ID Portrait' : 'Crop Profile Photo'}</h3>
                <button type="button" className="ep-crop-x" onClick={() => setCropper(null)} aria-label="Close">×</button>
              </header>

              <div
                className="ep-stage"
                style={{ height: cropper.kind === 'id' ? ID_STAGE_H : STAGE_H }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              >
                <img
                  className="ep-stage-img"
                  src={cropper.src}
                  alt="Crop preview"
                  draggable={false}
                  style={{
                    width: cropper.nw,
                    height: cropper.nh,
                    transform: `translate(-50%, -50%) translate(${tx}px, ${ty}px) scale(${scale})`
                  }}
                />
                <div
                  className={`ep-box${cropper.kind === 'id' ? '' : ' round'}`}
                  style={{ width: spec.boxW, height: spec.boxH }}
                />
              </div>

              <div className="ep-zoom">
                <label htmlFor="ep-zoom">Zoom</label>
                <input id="ep-zoom" type="range" min="1" max="3" step="0.02" value={cropper.zoom} onChange={(e) => setZoom(Number(e.target.value))} />
              </div>
              <p className="ep-tip">Drag the photo to position it.</p>

              <div className="modal-actions">
                <button type="button" className="btn-ghost" onClick={() => setCropper(null)}>Cancel</button>
                <button type="button" className="btn-solid" onClick={applyCrop}>Use Cropped Photo</button>
              </div>
            </>
          );
        })()}
      </Modal>

      <Feedback state={feedback} onClose={closeFeedback} />
    </main>
  );
}
