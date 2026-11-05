// One-time helper: puts the starter ads (two Market ads + the Welcome startup popup) into your database.
// Run from the server folder:  node seed-ads.js
// Safe to run again: ads that already exist are skipped.
require('dotenv').config();
const mongoose = require('mongoose');

const adSchema = new mongoose.Schema({
  imageUrl: { type: String, required: true },
  linkUrl: { type: String, default: '' },
  altText: { type: String, default: 'Advertisement' },
  placement: { type: String, default: 'market' },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});
const Ad = mongoose.models.Ad || mongoose.model('Ad', adSchema);

const STARTER_ADS = [
  { imageUrl: '/uploads/ad-market-1-greetings.png', altText: 'JuanCast: Juan-derful greetings, EveryJuan. Measures for equal playing conditions start February 1, 2026.' },
  { imageUrl: '/uploads/ad-market-2-notice.png', altText: 'JuanCast notice: buy Power Ups and Stars at least one hour before the poll ends.' },
  // popup that opens on the home page (set its link later in Admin > Ads > Edit)
  { imageUrl: '/uploads/ad-startup-welcome.jpg', altText: 'Welcome JuanCasters', placement: 'startup' }
];

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  let order = Date.now();
  for (const ad of STARTER_ADS) {
    if (await Ad.exists({ imageUrl: ad.imageUrl })) {
      console.log(`Skipped (already there): ${ad.imageUrl}`);
      continue;
    }
    await Ad.create({ placement: 'market', ...ad, active: true, createdAt: new Date(order++) });
    console.log(`Added: ${ad.imageUrl}`);
  }
  console.log('Done. Market ads show on the Market page; the Welcome popup shows when the home page opens.');
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
