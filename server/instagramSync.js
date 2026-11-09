// Auto-fetch for the Community video tab, Instagram edition. Uses the "Instagram API with Instagram Login":
// the account that owns the posts generates an access token once (see the setup steps), and the server then
// reads that account's latest posts and adds any that are not in the database yet.
//  - new posts are inserted once; edits made in the Admin dashboard are never overwritten
//  - a post deleted in the Admin dashboard stays deleted (shares the "skip" list with youtubeSync)
//  - Instagram image links expire after a while, so posts whose picture is still an Instagram link get a fresh one on every sync
//  - the 60-day token is refreshed automatically and the newest one is kept in MongoDB (a .env value cannot be rewritten at runtime)
// "Instagram API with Unified Login": the token comes from the dashboard page "API setup with Unified login" (starts with EAA)
// and is used against graph.facebook.com. The Instagram account is found from the token itself.
const GRAPH = 'https://graph.facebook.com/v26.0';

const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

// one Instagram media object -> the fields for a Video document (null if it has no picture)
function toVideo(m, username = '') {
  const picture = m.media_type === 'VIDEO' ? (m.thumbnail_url || '') : (m.media_url || m.thumbnail_url || '');
  if (!m.id || !m.permalink) return null;
  const caption = String(m.caption || '').replace(/\s+/g, ' ').trim();
  return {
    sourceKey: `ig:${m.id}`, platform: 'Instagram',
    title: clip(caption, 90) || 'Instagram post',
    subtitle: username ? `@${username}` : '',
    group: '', youtubeUrl: m.permalink, imageUrl: picture,
    createdAt: new Date(m.timestamp || Date.now())
  };
}

function createInstagramSync({ mongoose, Video, envToken, intervalMs = 60 * 60 * 1000 }) {
  const Skip = mongoose.models.VideoSkip || mongoose.model('VideoSkip', new mongoose.Schema({
    sourceKey: { type: String, required: true, unique: true }
  }));
  let running = null;
  let lastRun = 0;
  let account = null; // { id, username }, found once from the token

  const get = async (path, params = {}) => {
    const url = `${GRAPH}${path}?${new URLSearchParams({ ...params, access_token: envToken })}`;
    const r = await fetch(url);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error?.message || `Instagram answered ${r.status}`);
    return j;
  };

  // which Instagram account does this token belong to?
  async function findAccount() {
    if (account) return account;
    const assigned = await get('/me/assigned_instagram_accounts', { fields: 'id,username' }).catch(() => ({}));
    let found = (assigned.data || [])[0];
    if (!found) { // fallback for tokens linked through a Facebook Page
      const pages = await get('/me/accounts', { fields: 'instagram_business_account{id,username}' }).catch(() => ({}));
      found = (pages.data || []).map((p) => p.instagram_business_account).find(Boolean);
    }
    if (!found) throw new Error('no Instagram account is linked to this token (generate it under "API setup with Unified login" and add the account there)');
    account = { id: found.id, username: found.username || '' };
    return account;
  }

  async function sync() {
    if (!envToken) return { added: 0, skipped: 'no INSTAGRAM_ACCESS_TOKEN' };
    if (running) return running;
    running = (async () => {
      try {
        const me = await findAccount();
        const media = await get(`/${me.id}/media`, { fields: 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp', limit: '25' });
        const items = (media.data || []).map((m) => toVideo(m, me.username)).filter(Boolean);
        const skipped = new Set((await Skip.find({ sourceKey: { $in: items.map((v) => v.sourceKey) } })).map((s) => s.sourceKey));
        let added = 0;
        for (const v of items.reverse()) { // oldest first, so the newest post gets the newest createdAt
          if (skipped.has(v.sourceKey)) continue;
          const r = await Video.updateOne({ sourceKey: v.sourceKey }, { $setOnInsert: v }, { upsert: true });
          if (r.upsertedCount) { added += 1; continue; }
          // already saved: only renew the picture while it is still an (expiring) Instagram link; uploaded pictures stay as they are
          if (v.imageUrl) await Video.updateOne({ sourceKey: v.sourceKey, imageUrl: /cdninstagram|fbcdn/ }, { $set: { imageUrl: v.imageUrl } });
        }
        lastRun = Date.now();
        if (added) console.log(`Instagram sync: added ${added} new post(s)`);
        return { added, checked: items.length };
      } catch (error) {
        lastRun = Date.now();
        console.error('Instagram sync failed:', error.message, error.cause?.code || error.cause?.message || '');
        return { added: 0, error: error.message };
      } finally { running = null; }
    })();
    return running;
  }

  const syncIfStale = () => { if (Date.now() - lastRun > Math.min(intervalMs, 15 * 60 * 1000)) sync(); };
  const start = () => { sync(); setInterval(sync, intervalMs).unref?.(); };
  return { sync, start, syncIfStale };
}

module.exports = { createInstagramSync, toVideo };
