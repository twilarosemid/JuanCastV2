import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { API, getJSON, img, mergeUser, saveUser } from '../../../api';
import useUser from '../../../hooks/useUser';
import Modal from '../../../components/Modal/Modal';
import Feedback from '../../../components/Feedback/Feedback';
import './EditProfile.css';

const STAGE_H = 320;
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

// Crop box on screen (stageW = width of the drag area) and the size of the saved image
const cropSpec = (type, stageW) => {
  if (type === 'avatar') return { boxW: 240, boxH: 240, outW: 320, outH: 320 };
  const boxW = Math.max(200, Math.min(stageW - 32, 560));
  return { boxW, boxH: Math.round(boxW * (500 / 1200)), outW: 1200, outH: 500 };
};

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
  const coverInput = useRef(null);
  const stageRef = useRef(null);
  const drag = useRef(null);

  const [form, setForm] = useState({ fullName: '', username: '', avatar: '', coverPhoto: '' });
  const [initial, setInitial] = useState(null);
  const [joined, setJoined] = useState('Joined recently');
  const [locks, setLocks] = useState({ name: 0, username: 0 });
  const [saving, setSaving] = useState(false);
  const [cropper, setCropper] = useState(null);
  const [stageW, setStageW] = useState(600);
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
        avatar: data.avatar || '',
        coverPhoto: data.coverPhoto || ''
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
        setLocks({ name: daysLeft(fresh.lastNameChange, 7), username: daysLeft(fresh.lastUsernameChange, 30) });
      })
      .catch((error) => {
        console.error('Error loading profile for editing:', error);
        if (!cancelled) setInitial((cur) => cur);
      });
    return () => { cancelled = true; };
  }, [viewer?.email]);

  const hasChanges = initial !== null && Object.keys(form).some((key) => form[key] !== initial[key]);

  // measure the crop area so the cover box fits small screens
  useEffect(() => {
    if (!cropper) return undefined;
    const measure = () => { if (stageRef.current) setStageW(stageRef.current.clientWidth); };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [cropper?.type, Boolean(cropper)]);

  const spec = useMemo(() => (cropper ? cropSpec(cropper.type, stageW) : null), [cropper?.type, stageW, Boolean(cropper)]);

  if (!viewer?.email) return <Navigate to="/login" replace state={{ from: '/profile/edit' }} />;

  const say = (type, message) => setFeedback({ open: true, type, message });

  const openCropper = (file, type) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { say('error', 'Please choose an image file.'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const probe = new Image();
      probe.onload = () => setCropper({ type, src: reader.result, nw: probe.naturalWidth, nh: probe.naturalHeight, zoom: 1, tx: 0, ty: 0 });
      probe.onerror = () => say('error', 'That image could not be opened.');
      probe.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  const pickFile = (type) => (event) => {
    openCropper(event.target.files?.[0], type);
    event.target.value = '';
  };

  const setZoom = (zoom) => {
    setCropper((c) => {
      const s = cropSpec(c.type, stageW);
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
      const s = cropSpec(c.type, stageW);
      const { tx, ty } = clampOffset(c, s.boxW, s.boxH, c.zoom, d.tx + e.clientX - d.x, d.ty + e.clientY - d.y);
      return { ...c, tx, ty };
    });
  };
  const onPointerUp = () => { drag.current = null; };

  const applyCrop = () => {
    const image = new Image();
    image.onload = () => {
      const { boxW, boxH, outW, outH } = cropSpec(cropper.type, stageW);
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

      setForm((f) => (cropper.type === 'avatar' ? { ...f, avatar: dataUrl } : { ...f, coverPhoto: dataUrl }));
      setCropper(null);
    };
    image.src = cropper.src;
  };

  const save = async (e) => {
    e.preventDefault();
    if (!hasChanges || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/users/update-profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: viewer.email,
          fullName: form.fullName,
          username: form.username,
          avatar: form.avatar,
          coverPhoto: form.coverPhoto,
          coverPosition: { x: 50, y: 50 }
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Failed to save your profile.');
      saveUser(mergeUser(viewer, data));
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

  const nameHint = locks.name ? `You can change your name again in ${locks.name} day${locks.name === 1 ? '' : 's'}.` : 'You can only change your name once every 7 days.';
  const userHint = locks.username ? `You can change your @username again in ${locks.username} day${locks.username === 1 ? '' : 's'}.` : 'You can only change your @username once every 30 days.';

  return (
    <main className="ep-page">
      <section className="ep-card rise">
        <div className="ep-cover">
          {form.coverPhoto && <img src={img(form.coverPhoto)} alt="Cover preview" />}
          <button type="button" className="ep-cover-btn" onClick={() => coverInput.current?.click()}>Change Cover Photo</button>
        </div>

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
              disabled={locks.name > 0}
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
                disabled={locks.username > 0}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value.replace(/^@/, '') }))}
                required
              />
            </div>
            <small>{userHint}</small>
          </label>

          <div className="ep-actions">
            <Link className="btn-ghost" to="/profile">Cancel</Link>
            <button type="submit" className="btn-solid" disabled={!hasChanges || saving}>{saving ? 'Saving...' : 'Save Changes'}</button>
          </div>

          <input type="file" accept="image/*" ref={avatarInput} onChange={pickFile('avatar')} hidden />
          <input type="file" accept="image/*" ref={coverInput} onChange={pickFile('cover')} hidden />
        </form>
      </section>

      <Modal open={Boolean(cropper)} onClose={() => setCropper(null)} label="Crop photo" className="ep-crop">
        {cropper && spec && (() => {
          const { tx, ty, scale } = clampOffset(cropper, spec.boxW, spec.boxH, cropper.zoom, cropper.tx, cropper.ty);
          return (
            <>
              <header className="ep-crop-head">
                <h3>{cropper.type === 'avatar' ? 'Crop Profile Photo' : 'Crop Cover Photo'}</h3>
                <button type="button" className="ep-crop-x" onClick={() => setCropper(null)} aria-label="Close">×</button>
              </header>

              <div
                className="ep-stage"
                ref={stageRef}
                style={{ height: STAGE_H }}
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
                  className={`ep-box${cropper.type === 'avatar' ? ' round' : ''}`}
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
