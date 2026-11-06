// One-off: copies every image in server/uploads/ (your local folder) into MongoDB so the deployed site can serve them.
// Run from the server folder, with server/.env pointing at the same MongoDB Atlas database the live site uses:
//   node migrate-uploads.js
// Safe to run more than once: files already in the database are skipped.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const types = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.jfif': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.avif': 'image/avif'
};

const UploadFile = mongoose.model('UploadFile', new mongoose.Schema({
  filename: { type: String, required: true, unique: true },
  contentType: { type: String, default: 'application/octet-stream' },
  data: { type: Buffer, required: true },
  createdAt: { type: Date, default: Date.now }
}));

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const dir = path.join(__dirname, 'uploads');
  const files = fs.readdirSync(dir).filter((f) => !f.startsWith('.'));
  let added = 0, skipped = 0, failed = 0;
  for (const filename of files) {
    try {
      if (await UploadFile.exists({ filename })) { skipped++; continue; }
      const data = fs.readFileSync(path.join(dir, filename));
      if (data.length > 15 * 1024 * 1024) { console.log('too big, skipped:', filename); failed++; continue; }
      const contentType = types[path.extname(filename).toLowerCase()] || 'application/octet-stream';
      await UploadFile.create({ filename, contentType, data });
      added++;
    } catch (err) {
      console.log('failed:', filename, err.message);
      failed++;
    }
  }
  console.log(`Done. added ${added}, already there ${skipped}, failed ${failed}.`);
  await mongoose.disconnect();
})();
