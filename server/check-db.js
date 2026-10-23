require('dotenv').config();
const mongoose = require('mongoose');
(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Server is currently using database:', mongoose.connection.name);
  const { databases } = await mongoose.connection.db.admin().listDatabases();
  for (const d of databases) {
    const db = mongoose.connection.client.db(d.name);
    const cols = await db.listCollections().toArray();
    const banners = cols.find(c => c.name === 'banners')
      ? await db.collection('banners').countDocuments() : 0;
    console.log(`- ${d.name}: ${cols.map(c => c.name).join(', ') || '(empty)'}  [banners: ${banners}]`);
  }
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
