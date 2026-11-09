// Auto-fetch for the Community video tab: reads a YouTube channel's public RSS feed (no API key needed)
// and adds any video that is not in the database yet. The feed only lists the channel's latest ~15 uploads.
//  - new videos are inserted once; later edits made in the Admin dashboard are never overwritten
//  - a video deleted in the Admin dashboard is remembered (see skipSource) so the next sync does not bring it back
const FEED = (id) => `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(id)}`;

const decode = (s = '') => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&');
const tag = (xml, name) => decode((xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`)) || [])[1] || '').trim();

// RSS text -> [{ id, title, author, published }]
function parseFeed(xml) {
  const author = tag((xml.split('<entry>')[0] || ''), 'name');
  return xml.split('<entry>').slice(1).map((entry) => ({
    id: tag(entry, 'yt:videoId'),
    title: tag(entry, 'title'),
    author: tag(entry, 'name') || author,
    published: new Date(tag(entry, 'published') || Date.now())
  })).filter((v) => v.id && v.title);
}

function createYouTubeSync({ mongoose, Video, channelId, intervalMs = 30 * 60 * 1000 }) {
  const Skip = mongoose.models.VideoSkip || mongoose.model('VideoSkip', new mongoose.Schema({
    sourceKey: { type: String, required: true, unique: true }
  }));
  let running = null;
  let lastRun = 0;

  const skipSource = async (sourceKey) => {
    if (sourceKey) await Skip.updateOne({ sourceKey }, { $setOnInsert: { sourceKey } }, { upsert: true }).catch(() => {});
  };

  async function sync() {
    if (!channelId) return { added: 0, skipped: 'no channel id' };
    if (running) return running;
    running = (async () => {
      try {
        const res = await fetch(FEED(channelId), { headers: { 'User-Agent': 'JuanCast/1.0' } });
        if (!res.ok) throw new Error(`YouTube feed answered ${res.status}`);
        const items = parseFeed(await res.text());
        const skipped = new Set((await Skip.find({ sourceKey: { $in: items.map((v) => `yt:${v.id}`) } })).map((s) => s.sourceKey));
        let added = 0;
        // oldest first, so the newest video ends up with the newest createdAt
        for (const v of items.reverse()) {
          const sourceKey = `yt:${v.id}`;
          if (skipped.has(sourceKey)) continue;
          const r = await Video.updateOne({ sourceKey }, { $setOnInsert: {
            sourceKey, platform: 'YouTube', title: v.title, subtitle: v.author, group: '',
            youtubeUrl: `https://www.youtube.com/watch?v=${v.id}`,
            imageUrl: `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
            createdAt: v.published
          } }, { upsert: true });
          if (r.upsertedCount) added += 1;
        }
        lastRun = Date.now();
        if (added) console.log(`YouTube sync: added ${added} new video(s)`);
        return { added, checked: items.length };
      } catch (error) {
        lastRun = Date.now();
        console.error('YouTube sync failed:', error.message, error.cause?.code || error.cause?.message || '');
        return { added: 0, error: error.message };
      } finally {
        running = null;
      }
    })();
    return running;
  }

  // on a free host that sleeps, timers pause: so also sync (in the background) when the video list is requested and the last check is old
  const syncIfStale = () => { if (Date.now() - lastRun > Math.min(intervalMs, 10 * 60 * 1000)) sync(); };
  const start = () => { sync(); setInterval(sync, intervalMs).unref?.(); };

  return { sync, start, syncIfStale, skipSource, parseFeed };
}

module.exports = { createYouTubeSync, parseFeed };
