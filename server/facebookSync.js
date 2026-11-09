// Auto-fetch for the Community video tab, Facebook edition. Reads the latest posts of a Facebook Page you manage
// and adds any that are not in the database yet (platform "Facebook").
//  - FACEBOOK_PAGE_ACCESS_TOKEN can be a Page token, or a (long-lived) user token of someone who manages the Page: the Page's own
//    token is then looked up automatically through /me/accounts. FACEBOOK_PAGE_ID is optional (needed only if the user manages several Pages)
//  - new posts are inserted once; edits made in the Admin dashboard are never overwritten
//  - a post deleted in the Admin dashboard stays deleted (shares the "skip" list with youtubeSync / instagramSync)
//  - Facebook picture links expire after a while, so posts whose picture is still a Facebook link get a fresh one on every sync
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

// one Facebook post object -> the fields for a Video document (null if it has no link)
function toVideo(p, pageName = '') {
  if (!p.id || !p.permalink_url) return null;
  const text = String(p.message || p.story || '').replace(/\s+/g, ' ').trim();
  return {
    sourceKey: `fb:${p.id}`, platform: 'Facebook',
    title: clip(text, 90) || 'Facebook post',
    subtitle: pageName,
    group: '', youtubeUrl: p.permalink_url, imageUrl: p.full_picture || '',
    createdAt: new Date(p.created_time || Date.now())
  };
}

function createFacebookSync({ mongoose, Video, token, pageId = '', version = 'v26.0', intervalMs = 60 * 60 * 1000 }) {
  const Skip = mongoose.models.VideoSkip || mongoose.model('VideoSkip', new mongoose.Schema({
    sourceKey: { type: String, required: true, unique: true }
  }));
  const GRAPH = `https://graph.facebook.com/${version}`;
  let page = pageId || 'me'; // a Page access token answers to "me"
  let useToken = token;
  let resolved = false;
  let running = null;
  let lastRun = 0;
  let pageName;

  const get = async (path, params = {}, tk = useToken) => {
    const r = await fetch(`${GRAPH}${path}?${new URLSearchParams({ ...params, access_token: tk })}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error?.message || `Facebook answered ${r.status}`);
    return j;
  };

  // the token may belong to a person instead of the Page: swap it for the Page's own token (found through /me/accounts)
  async function switchToPageToken(why) {
    const accounts = await get('/me/accounts', { fields: 'id,name,access_token', limit: '100' }).catch(() => ({}));
    const pages = accounts.data || [];
    const hit = pageId ? pages.find((p) => p.id === pageId) : (pages.length === 1 ? pages[0] : null);
    if (!hit) {
      if (!pages.length) throw new Error(`${why}. This token is not a Page token and no Pages are linked to it: use a token with pages_show_list + pages_read_engagement from someone who manages the Page`);
      throw new Error(`${why}. The token manages several Pages (${pages.map((p) => `${p.name} = ${p.id}`).join(', ')}): set FACEBOOK_PAGE_ID in .env`);
    }
    useToken = hit.access_token; page = hit.id; pageName = hit.name; resolved = true;
    console.log(`Facebook sync: using the Page token for "${hit.name}"`);
  }

  async function sync() {
    if (!token) return { added: 0, skipped: 'no FACEBOOK_PAGE_ACCESS_TOKEN' };
    if (running) return running;
    running = (async () => {
      try {
        if (pageName === undefined) pageName = (await get(`/${page}`, { fields: 'name' }).catch(() => ({}))).name || '';
        const fields = { fields: 'id,message,story,created_time,permalink_url,full_picture', limit: '25' };
        let feed;
        try { feed = await get(`/${page}/published_posts`, fields); } catch (e) {
          if (resolved) throw e;
          await switchToPageToken(e.message); // not a Page token: find the Page's own token and retry once
          feed = await get(`/${page}/published_posts`, fields);
        }
        const items = (feed.data || []).map((p) => toVideo(p, pageName)).filter(Boolean);
        const skipped = new Set((await Skip.find({ sourceKey: { $in: items.map((v) => v.sourceKey) } })).map((s) => s.sourceKey));
        let added = 0;
        for (const v of items.reverse()) { // oldest first, so the newest post gets the newest createdAt
          if (skipped.has(v.sourceKey)) continue;
          const r = await Video.updateOne({ sourceKey: v.sourceKey }, { $setOnInsert: v }, { upsert: true });
          if (r.upsertedCount) { added += 1; continue; }
          // already saved: only renew the picture while it is still an (expiring) Facebook link; uploaded pictures stay as they are
          if (v.imageUrl) await Video.updateOne({ sourceKey: v.sourceKey, imageUrl: /fbcdn|scontent/ }, { $set: { imageUrl: v.imageUrl } });
        }
        lastRun = Date.now();
        if (added) console.log(`Facebook sync: added ${added} new post(s)`);
        return { added, checked: items.length };
      } catch (error) {
        lastRun = Date.now();
        console.error('Facebook sync failed:', error.message, error.cause?.code || error.cause?.message || '');
        return { added: 0, error: error.message };
      } finally { running = null; }
    })();
    return running;
  }

  const syncIfStale = () => { if (Date.now() - lastRun > Math.min(intervalMs, 15 * 60 * 1000)) sync(); };
  const start = () => { sync(); setInterval(sync, intervalMs).unref?.(); };
  return { sync, start, syncIfStale };
}

module.exports = { createFacebookSync, toVideo };
