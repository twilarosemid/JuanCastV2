// Auto-fetch for the Community video tab, X (Twitter) edition. Reads the latest public posts of one X account and adds
// any that are not in the database yet (platform "X").
//  - needs X_BEARER_TOKEN (app-only token from the X developer console). The X API is pay-per-use (credits), see below
//  - new posts are inserted once; edits made in the Admin dashboard are never overwritten
//  - a post deleted in the Admin dashboard stays deleted (shares the "skip" list with the other syncs)
//  - cost control: X bills per post RETURNED, so after the first run only posts newer than the newest one already saved are requested
//    ("since_id"); a check with nothing new returns nothing and costs nothing. Replies and reposts are left out.
const API = 'https://api.x.com/2';
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const decode = (s = '') => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

// one X post (+ the media list that came with it) -> the fields for a Video document (null if it has no id)
function toVideo(t, username, media = []) {
  if (!t.id) return null;
  const text = decode(String(t.text || '')).replace(/https?:\/\/t\.co\/\S+/g, '').replace(/\s+/g, ' ').trim();
  const m = media.find((x) => x.media_key === (t.attachments?.media_keys || [])[0]);
  const picture = m ? (m.type === 'photo' ? m.url : m.preview_image_url) || '' : '';
  return {
    sourceKey: `x:${t.id}`, platform: 'X',
    title: clip(text, 90) || 'X post',
    subtitle: username ? `@${username}` : '',
    group: '', youtubeUrl: `https://x.com/${username || 'i'}/status/${t.id}`, imageUrl: picture,
    createdAt: new Date(t.created_at || Date.now())
  };
}

function createXSync({ mongoose, Video, bearer, username = '', userId = '', intervalMs = 3 * 60 * 60 * 1000 }) {
  const Skip = mongoose.models.VideoSkip || mongoose.model('VideoSkip', new mongoose.Schema({
    sourceKey: { type: String, required: true, unique: true }
  }));
  let running = null;
  let lastRun = 0;
  let uid = userId;

  const get = async (path, params = {}) => {
    const r = await fetch(`${API}${path}?${new URLSearchParams(params)}`, { headers: { Authorization: `Bearer ${bearer}`, 'User-Agent': 'JuanCast/1.0' } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.detail || j.title || j.errors?.[0]?.message || `X answered ${r.status}`);
    if (j.errors?.length && !j.data) throw new Error(j.errors[0].detail || j.errors[0].message || 'X returned an error');
    return j;
  };

  // newest post id we already know (saved or deleted on purpose); X post ids only ever grow
  async function newestKnownId() {
    const [saved, skipped] = await Promise.all([
      Video.find({ sourceKey: /^x:/ }, { sourceKey: 1 }).lean(),
      Skip.find({ sourceKey: /^x:/ }).lean()
    ]);
    let max = 0n;
    for (const d of [...saved, ...skipped]) {
      try { const n = BigInt(String(d.sourceKey).slice(2)); if (n > max) max = n; } catch { /* ignore */ }
    }
    return max > 0n ? String(max) : '';
  }

  async function sync() {
    if (!bearer) return { added: 0, skipped: 'no X_BEARER_TOKEN' };
    if (!username && !uid) return { added: 0, skipped: 'no X_USERNAME or X_USER_ID' };
    if (running) return running;
    running = (async () => {
      try {
        if (!uid) uid = (await get(`/users/by/username/${encodeURIComponent(username)}`)).data?.id || '';
        if (!uid) throw new Error(`could not find the X account @${username}`);
        const since = await newestKnownId();
        const params = {
          max_results: '10', exclude: 'replies,retweets',
          'tweet.fields': 'created_at,attachments', expansions: 'attachments.media_keys', 'media.fields': 'type,url,preview_image_url'
        };
        if (since) params.since_id = since;
        const res = await get(`/users/${uid}/tweets`, params);
        const items = (res.data || []).map((t) => toVideo(t, username, res.includes?.media)).filter(Boolean);
        const skipped = new Set((await Skip.find({ sourceKey: { $in: items.map((v) => v.sourceKey) } })).map((s) => s.sourceKey));
        let added = 0;
        for (const v of items.reverse()) { // oldest first, so the newest post gets the newest createdAt
          if (skipped.has(v.sourceKey)) continue;
          const r = await Video.updateOne({ sourceKey: v.sourceKey }, { $setOnInsert: v }, { upsert: true });
          if (r.upsertedCount) added += 1;
        }
        lastRun = Date.now();
        if (added) console.log(`X sync: added ${added} new post(s)`);
        return { added, checked: items.length };
      } catch (error) {
        lastRun = Date.now();
        console.error('X sync failed:', error.message, error.cause?.code || error.cause?.message || '');
        return { added: 0, error: error.message };
      } finally { running = null; }
    })();
    return running;
  }

  const syncIfStale = () => { if (Date.now() - lastRun > intervalMs) sync(); };
  const start = () => { sync(); setInterval(sync, intervalMs).unref?.(); };
  return { sync, start, syncIfStale };
}

module.exports = { createXSync, toVideo };
