const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getPollDisplayTitle, sortRankings, normalizeImageUrl } = require('./contentUtils');
require('dotenv').config();

const app = express();
const uploadDir = path.join(__dirname, 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

// Uploaded images live in MongoDB, not on the server's disk: Render wipes the disk on every restart / deploy / rollback,
// which is what caused "Cannot GET /uploads/...". The URL stays /uploads/<filename>, so nothing else in the app changes.
const UploadFile = mongoose.model('UploadFile', new mongoose.Schema({
  filename: { type: String, required: true, unique: true },
  contentType: { type: String, default: 'application/octet-stream' },
  data: { type: Buffer, required: true },
  createdAt: { type: Date, default: Date.now }
}));

const dbStorage = {
  _handleFile(req, file, cb) {
    const chunks = [];
    file.stream.on('data', (chunk) => chunks.push(chunk));
    file.stream.on('error', cb);
    file.stream.on('end', async () => {
      try {
        const filename = `${Date.now()}-${Math.random().toString(16).slice(2)}${path.extname(file.originalname || '.png')}`;
        const data = Buffer.concat(chunks);
        await UploadFile.create({ filename, contentType: file.mimetype, data });
        // `path` is kept (it no longer exists on disk) so the existing cleanup calls keep working through unlinkUpload()
        cb(null, { filename, path: path.join(uploadDir, filename), size: data.length });
      } catch (err) {
        cb(err);
      }
    });
  },
  _removeFile(req, file, cb) {
    UploadFile.deleteOne({ filename: file.filename }).then(() => cb(null), cb);
  }
};

// removes an upload from MongoDB (and from disk, if an old copy is lying around)
const unlinkUpload = (filePath, cb = () => {}) => {
  const filename = path.basename(String(filePath || ''));
  UploadFile.deleteOne({ filename }).catch(() => {});
  fs.unlink(filePath, (err) => cb(err && err.code === 'ENOENT' ? null : err)); // a missing disk copy is expected now
};

// 15 MB cap: MongoDB documents max out at 16 MB
const upload = multer({ storage: dbStorage, limits: { fileSize: 15 * 1024 * 1024 } });

app.use(express.json({ limit: '500mb' })); 
app.use(cors());
app.use('/uploads', express.static(uploadDir)); // files that exist on disk (local dev)
app.get('/uploads/:filename', async (req, res, next) => {
  try {
    const doc = await UploadFile.findOne({ filename: path.basename(req.params.filename) });
    if (!doc) return next();
    res.set('Content-Type', doc.contentType || 'application/octet-stream');
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    return res.send(doc.data);
  } catch (error) {
    return next(error);
  }
});

// 1. Connect to MongoDB and auto-synchronize ranking positions on boot
mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000 })
  .then(async () => {
    console.log("Connected to MongoDB Atlas!");
    // start the auto-syncs only once the database is reachable
    youtubeSync.start();
    instagramSync.start();
    facebookSync.start();
    xSync.start();

    // Phone is now optional: drop the old plain unique index (it treats every missing phone as a duplicate)
    try {
      const indexes = await User.collection.indexes();
      for (const ix of indexes) {
        if (ix.key && ix.key.phone === 1 && !ix.partialFilterExpression) {
          await User.collection.dropIndex(ix.name);
          console.log(`Dropped old phone index: ${ix.name}`);
        }
      }
      await User.syncIndexes();
    } catch (err) {
      console.error("Phone index migration failed:", err.message);
    }
    await seedChikaArticles();
    await seedPolls();
    await seedRankings();

    // Auto-recalculate and sync database positions based on vote counts
    const allRankings = await Ranking.find().sort({ voteCount: -1, createdAt: 1 });
    for (let i = 0; i < allRankings.length; i++) {
      allRankings[i].position = i + 1;
      await allRankings[i].save();
    }
    console.log("Database ranking positions synchronized successfully.");
  })
  .catch((err) => console.error("Database connection error:", err));

// 2a. Define the User Schema (Authentication)
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  phone: { type: String }, // optional; uniqueness is enforced by a partial index (see below)
  password: { type: String, required: true },
  otp: { type: String }, 
  passwordResetTokenHash: { type: String },
  passwordResetExpiresAt: { type: Date },
  isVerified: { type: Boolean, default: false },
  isAdmin: { type: Boolean, default: false },
  role: { type: String, enum: ['user', 'artist', 'admin', 'superadmin'], default: 'user' }
});
// Phone is optional: only enforce uniqueness when a phone number is actually stored.
userSchema.index({ phone: 1 }, { unique: true, partialFilterExpression: { phone: { $type: 'string' } }, name: 'phone_unique_when_present' });
const User = mongoose.model('User', userSchema);

const normalizeEmail = (value = '') => String(value).trim().toLowerCase();
const escapeRegex = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const getPacificDateKey = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const resetDailySpins = async (email) => {
  const emailFilter = { email: { $regex: `^${escapeRegex(email)}$`, $options: 'i' } };
  const today = getPacificDateKey();
  const profile = await Profile.findOne(emailFilter);
  if (!profile) return null;
  if (profile.spinDate === today) return profile;

  const resetProfile = await Profile.findOneAndUpdate(
    { ...emailFilter, spinDate: { $ne: today } },
    { $set: { spinDate: today, spinsRemaining: 15, lastSpinAt: null } },
    { new: true }
  );
  return resetProfile || Profile.findOne(emailFilter);
};

const resetDailySwerteSpins = async (email) => {
  const emailFilter = { email: { $regex: `^${escapeRegex(email)}$`, $options: 'i' } };
  const today = getPacificDateKey();
  const profile = await Profile.findOne(emailFilter);
  if (!profile) return null;
  if (profile.swerteSpinDate === today) return profile;

  const resetProfile = await Profile.findOneAndUpdate(
    { ...emailFilter, swerteSpinDate: { $ne: today } },
    { $set: { swerteSpinDate: today, swerteSpinsRemaining: 1 } },
    { new: true }
  );
  return resetProfile || Profile.findOne(emailFilter);
};

// Super admins: set SUPERADMIN_EMAIL in .env / Render (comma separated) to add more.
// gulfericdonato6@gmail.com is always a super admin, and its role can't be changed from the Accounts tab.
const getSuperAdminEmails = () => {
  const configured = (process.env.SUPERADMIN_EMAIL || '')
    .split(',')
    .map((email) => normalizeEmail(email))
    .filter(Boolean);

  return [...new Set([...configured, 'gulfericdonato6@gmail.com'])];
};

const getAdminEmails = () => {
  const configured = (process.env.ADMIN_EMAIL || '')
    .split(',')
    .map((email) => normalizeEmail(email))
    .filter(Boolean);

  return [...new Set([...configured, ...getSuperAdminEmails(), 'adminjuancast@gmail.com'])];
};

// Super admin is decided by email only, so nobody can become one by editing a database field.
const isSuperAdmin = (user = {}) => Boolean(user) && getSuperAdminEmails().includes(normalizeEmail(user.email));

const resolveAdminStatus = (user = {}) => {
  if (!user) return false;
  const normalizedEmail = normalizeEmail(user.email);
  const role = String(user.role || '').trim().toLowerCase();
  return Boolean(user.isAdmin) || role === 'admin' || role === 'superadmin' || getAdminEmails().includes(normalizedEmail);
};

// The one role to show for an account: superadmin | admin | artist | user
const resolveRole = (user = {}) => {
  if (isSuperAdmin(user)) return 'superadmin';
  if (resolveAdminStatus(user)) return 'admin';
  return String(user?.role || '').trim().toLowerCase() === 'artist' ? 'artist' : 'user';
};

// role of the account that owns a profile (profiles and users are linked by email)
const roleOfProfile = async (profile) => {
  const user = await User.findOne({ email: { $regex: `^${escapeRegex(normalizeEmail(profile.email))}$`, $options: 'i' } }).select('email isAdmin role').lean();
  return user ? resolveRole(user) : 'user';
};

// ---- ADMIN SESSION TOKENS ----
// Signed with HMAC (built-in crypto, no extra package). Only admins receive one at login.
// Set ADMIN_TOKEN_SECRET in .env / Render to use your own secret; otherwise one is derived from MONGO_URI.
const ADMIN_TOKEN_SECRET = process.env.ADMIN_TOKEN_SECRET
  || crypto.createHash('sha256').update(`juancast-admin:${process.env.MONGO_URI || 'dev'}`).digest('hex');
const ADMIN_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const signToken = (body) => crypto.createHmac('sha256', ADMIN_TOKEN_SECRET).update(body).digest('base64url');

const createAdminToken = (user) => {
  const body = Buffer.from(JSON.stringify({ id: String(user._id), exp: Date.now() + ADMIN_TOKEN_TTL_MS })).toString('base64url');
  return `${body}.${signToken(body)}`;
};

// Put in front of any route that only admins may use
const requireAdmin = async (req, res, next) => {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const [body, sig] = token.split('.');
    if (!body || !sig) return res.status(401).json({ message: 'Admin login required. Please log in again.' });

    const expected = Buffer.from(signToken(body));
    const given = Buffer.from(sig);
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
      return res.status(401).json({ message: 'Invalid admin session. Please log in again.' });
    }

    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Date.now()) {
      return res.status(401).json({ message: 'Admin session expired. Please log in again.' });
    }

    const user = await User.findById(payload.id);
    if (!user || !resolveAdminStatus(user)) {
      return res.status(403).json({ message: 'This account is not an admin.' });
    }

    req.adminUser = user;
    next();
  } catch (error) {
    console.error('Admin auth error:', error);
    res.status(401).json({ message: 'Admin login required. Please log in again.' });
  }
};

// Put in front of any route that only artists may use (same signed token as admins; artists get one at login)
const requireArtist = async (req, res, next) => {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const [body, sig] = token.split('.');
    if (!body || !sig) return res.status(401).json({ message: 'Please log in again to use your artist tools.' });

    const expected = Buffer.from(signToken(body));
    const given = Buffer.from(sig);
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
      return res.status(401).json({ message: 'Invalid session. Please log in again.' });
    }

    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Date.now()) {
      return res.status(401).json({ message: 'Session expired. Please log in again.' });
    }

    const user = await User.findById(payload.id);
    if (!user || resolveRole(user) !== 'artist') {
      return res.status(403).json({ message: 'Only artist accounts can do this.' });
    }
    const profile = await Profile.findOne({ email: { $regex: `^${escapeRegex(normalizeEmail(user.email))}$`, $options: 'i' } });
    if (!profile) return res.status(404).json({ message: 'Artist profile not found.' });

    req.artistUser = user;
    req.artistProfile = profile;
    next();
  } catch (error) {
    console.error('Artist auth error:', error);
    res.status(401).json({ message: 'Please log in again to use your artist tools.' });
  }
};

// 2b. Define the Profile Schema (Public Info & Currency)
const transactionChangeSchema = new mongoose.Schema({
  currency: { type: String, required: true },
  amount: { type: Number, required: true },
  direction: { type: String, enum: ['credit', 'debit'], required: true }
}, { _id: false });

const transactionSchema = new mongoose.Schema({
  category: { type: String, required: true },
  description: { type: String, required: true },
  details: { type: String, default: '' },
  changes: { type: [transactionChangeSchema], default: [] },
  createdAt: { type: Date, default: Date.now }
});

const createTransaction = (category, description, changes, details = '') => ({
  category,
  description,
  details,
  changes,
  createdAt: new Date()
});

const profileSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  fullName: { type: String, required: true },
  username: { type: String, required: true, unique: true }, 
  birthdate: { type: String, required: true },
  gender: { type: String },
  avatar: { type: String, default: "" },
  followers: { type: [String], default: [] },
  following: { type: [String], default: [] },
  stars: { type: Number, default: 100 }, 
  suns: { type: Number, default: 100 },
  dailyStreak: { type: Number, default: 0 },    // <-- ADDED FOR DAILY REWARDS
  lastClaimDate: { type: Date, default: null }, // <-- ADDED FOR DAILY REWARDS
  spinsRemaining: { type: Number, default: 15 },
  spinDate: { type: String, default: null },
  lastSpinAt: { type: Date, default: null },
  marketBonusSpins: { type: Number, default: 0 },
  redeemedRewardIds: { type: [String], default: [] },
  fanbases: { type: [String], default: [] },              // artists on the user's "Your Artists" row
  fanbaseSubscriptions: { type: [String], default: [] },  // fanbases the user is subscribed to (payments are not live yet)
  swerteSpinsRemaining: { type: Number, default: 1 },
  swerteSpinDate: { type: String, default: null },
  transactions: { type: [transactionSchema], default: [] },
  lastNameChange: { type: Date },
  lastUsernameChange: { type: Date },
  totalVotes: { type: Number }, // lifetime votes cast; accounts created before this field are backfilled from their vote history
  coverPhoto: { type: String, default: '' },              // artist profile cover photo
  bio: { type: String, default: '', maxlength: 300 },     // artist profile bio
  socialLinks: {                                          // artist profile links (website, Instagram, Threads, ...)
    instagram: { type: String, default: '' },
    facebook: { type: String, default: '' },
    tiktok: { type: String, default: '' },
    x: { type: String, default: '' },
    youtube: { type: String, default: '' },
    threads: { type: String, default: '' },
    spotify: { type: String, default: '' },
    appleMusic: { type: String, default: '' },
    website: { type: String, default: '' }
  }
}, { timestamps: true });
const Profile = mongoose.model('Profile', profileSchema);

// Lifetime votes for a profile: the stored counter, or (for older accounts) the sum of their recorded vote transactions
const lifetimeVotes = (profile) => {
  if (typeof profile.totalVotes === 'number') return profile.totalVotes;
  return (profile.transactions || [])
    .filter((t) => t.category === 'voting')
    .reduce((sum, t) => sum + (t.changes || []).reduce((s, c) => s + (Number(c.amount) || 0), 0), 0);
};

// 2c. Define Content Schemas
const chikaSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  imageUrl: { type: String, default: "" },
  url: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now }
});
const Chika = mongoose.model('Chika', chikaSchema);

// --- NEW: POLL GROUP SCHEMA ---
const pollGroupSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  imageUrl: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});
const PollGroup = mongoose.model('PollGroup', pollGroupSchema);
// ------------------------------

const pollSchema = new mongoose.Schema({
  title: { type: String, required: true },
  group: { type: String, default: '' },      // ADDED
  type: { type: String, default: '' },      // ADDED
  description: { type: String, default: '' },    // ADDED
  goal: { type: Number, default: 0, min: 0 },    // fan project goal (total votes to reach); 0 = a normal poll
  imageUrl: { type: String, default: '' },
  fromDate: { type: Date, required: true },
  toDate: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now }
});
const Poll = mongoose.model('Poll', pollSchema);
const cleanGoal = (value) => Math.max(0, Math.floor(Number(value) || 0));

const rankingSchema = new mongoose.Schema({
  name: { type: String, required: true },
  group: { type: String, default: '' },       // <-- ADDED: Links to Poll Group
  category: { type: String, default: '' },    // <-- ADDED: Links to specific Poll (e.g. Ace of the Year)
  imageUrl: { type: String, default: '' },
  youtubeUrl: { type: String, default: '' },
  youtubeStartTime: { type: Number, default: 0 }, 
  voteCount: { type: Number, default: 0 },
  position: { type: Number, default: 1 },
  createdAt: { type: Date, default: Date.now }
});
const Ranking = mongoose.model('Ranking', rankingSchema);

// --- ADD THIS MATH HELPER RIGHT BELOW THE SCHEMA ---
// This ensures ranks are calculated independently for EACH category
const updateRankingPositions = async () => {
  const allRankings = await Ranking.find().sort({ voteCount: -1, createdAt: 1 });
  const categories = [...new Set(allRankings.map(r => `${r.group}-${r.category}`))];
  
  for (const catKey of categories) {
    const catRankings = allRankings.filter(r => `${r.group}-${r.category}` === catKey);
    for (let i = 0; i < catRankings.length; i++) {
      if (catRankings[i].position !== i + 1) {
        catRankings[i].position = i + 1;
        await catRankings[i].save();
      }
    }
  }
};

const seedChikaArticles = async () => {
  try {
    const count = await Chika.countDocuments();
    if (count === 0) {
      // await Chika.create(defaultChikaArticle);
      console.log('Seeded default Chika article.');
    }
  } catch (error) {
    console.error('Error seeding Chika data:', error);
  }
};

const seedPolls = async () => {
  try {
    const count = await Poll.countDocuments();
    if (count === 0) {
      // await Poll.insertMany(defaultPolls);
      console.log('Seeded default poll data.');
    }
  } catch (error) {
    console.error('Error seeding Poll data:', error);
  }
};

const seedRankings = async () => {
  try {
    const count = await Ranking.countDocuments();
    if (count === 0) {
      // await Ranking.insertMany(defaultRankings);
      console.log('Seeded default ranking data.');
    }
  } catch (error) {
    console.error('Error seeding Ranking data:', error);
  }
};

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// -----------------------------------------------------------
// PROFILE & DAILY REWARD ROUTES (NEW)
// -----------------------------------------------------------

// Fetch logged-in user profile by email
app.get('/api/users/me', async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ message: "Email is required." });

    const profile = await Profile.findOne({ email: { $regex: `^${escapeRegex(email)}$`, $options: 'i' } });
    if (!profile) return res.status(404).json({ message: "Profile not found." });

    res.status(200).json({
      ...profile.toObject(),
      coverPhoto: normalizeImageUrl(profile.coverPhoto || ''),
      role: await roleOfProfile(profile),
      totalVotes: lifetimeVotes(profile),
      createdAt: profile.createdAt || profile._id.getTimestamp()
    });
  } catch (error) {
    console.error("Error fetching user profile:", error);
    res.status(500).json({ error: "Server error fetching profile." });
  }
});

// Fetch user profile by username (for public viewing)
app.get('/api/users/profile/:username', async (req, res) => {
  try {
    const profile = await Profile.findOne({ username: { $regex: `^${escapeRegex(req.params.username)}$`, $options: 'i' } });
    if (!profile) return res.status(404).json({ message: "Profile not found." });

    res.status(200).json({
      ...profile.toObject(),
      coverPhoto: normalizeImageUrl(profile.coverPhoto || ''),
      role: await roleOfProfile(profile),
      totalVotes: lifetimeVotes(profile),
      createdAt: profile.createdAt || profile._id.getTimestamp()
    });
  } catch (error) {
    console.error("Error fetching public profile:", error);
    res.status(500).json({ error: "Server error fetching profile." });
  }
});

app.put('/api/users/follow', async (req, res) => {
  try {
    const { email, username } = req.body;
    if (!email || !username) return res.status(400).json({ message: 'Email and username are required.' });

    const follower = await Profile.findOne({ email: { $regex: `^${escapeRegex(email)}$`, $options: 'i' } });
    const followed = await Profile.findOne({ username: { $regex: `^${escapeRegex(String(username).replace(/^@/, ''))}$`, $options: 'i' } });
    if (!follower || !followed) return res.status(404).json({ message: 'Profile not found.' });

    const normalizeHandle = (value = '') => String(value).replace(/^@/, '').trim().toLowerCase();
    const followerHandle = normalizeHandle(follower.username);
    const followedHandle = normalizeHandle(followed.username);
    if (followerHandle === followedHandle) return res.status(400).json({ message: 'You cannot follow yourself.' });

    const isFollowing = followed.followers.some(handle => normalizeHandle(handle) === followerHandle);
    if (isFollowing) {
      followed.followers = followed.followers.filter(handle => normalizeHandle(handle) !== followerHandle);
      follower.following = follower.following.filter(handle => normalizeHandle(handle) !== followedHandle);
    } else {
      followed.followers.push(`@${follower.username}`);
      follower.following.push(`@${followed.username}`);
    }

    await Promise.all([follower.save(), followed.save()]);
    if (!isFollowing) {
      await createNotification({
        recipient: followed.username,
        actor: `@${follower.username}`,
        actorAvatar: follower.avatar,
        type: 'follow'
      });
    }

    res.status(200).json({ isFollowing: !isFollowing, followersCount: followed.followers.length });
  } catch (error) {
    console.error('Error updating follow status:', error);
    res.status(500).json({ message: 'Failed to update follow status.' });
  }
});

// Fields the client may keep in localStorage (no transactions, no internal counters)
const publicUser = (profile) => ({
  email: profile.email,
  username: profile.username,
  fullName: profile.fullName,
  avatar: profile.avatar || '',
  followers: profile.followers || [],
  following: profile.following || [],
  stars: profile.stars,
  suns: profile.suns,
  dailyStreak: profile.dailyStreak || 0,
  lastClaimDate: profile.lastClaimDate || null,
  totalVotes: lifetimeVotes(profile),
  createdAt: profile.createdAt || profile._id.getTimestamp()
});

// Edit profile: name (7-day cooldown), @username (30-day cooldown), avatar
app.put('/api/users/update-profile', async (req, res) => {
  try {
    const { email, fullName, username, avatar } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required.' });

    const profile = await Profile.findOne({ email: { $regex: `^${escapeRegex(email)}$`, $options: 'i' } });
    if (!profile) return res.status(404).json({ message: 'Profile not found.' });

    const DAY = 24 * 60 * 60 * 1000;
    const now = new Date();
    const daysLeft = (last, days) => Math.ceil((days * DAY - (now - last)) / DAY);

    const nextName = typeof fullName === 'string' ? fullName.trim() : profile.fullName;
    if (!nextName) return res.status(400).json({ message: 'Full name is required.' });
    if (nextName.length > 80) return res.status(400).json({ message: 'Full name is too long.' });
    if (nextName !== profile.fullName) {
      if (profile.lastNameChange && now - profile.lastNameChange < 7 * DAY) {
        return res.status(429).json({ message: `You can change your name again in ${daysLeft(profile.lastNameChange, 7)} day(s).` });
      }
      profile.fullName = nextName;
      profile.lastNameChange = now;
    }

    const nextUsername = typeof username === 'string' ? username.replace(/^@/, '').trim() : profile.username;
    if (!/^[a-zA-Z0-9._]{3,30}$/.test(nextUsername)) {
      return res.status(400).json({ message: 'Username must be 3-30 characters: letters, numbers, dots or underscores.' });
    }
    let oldUsername = null;
    if (nextUsername !== profile.username) {
      if (profile.lastUsernameChange && now - profile.lastUsernameChange < 30 * DAY) {
        return res.status(429).json({ message: `You can change your @username again in ${daysLeft(profile.lastUsernameChange, 30)} day(s).` });
      }
      const taken = await Profile.findOne({
        username: { $regex: `^${escapeRegex(nextUsername)}$`, $options: 'i' },
        _id: { $ne: profile._id }
      });
      if (taken) return res.status(400).json({ message: 'Username is already taken.' });
      oldUsername = profile.username;
      profile.username = nextUsername;
      profile.lastUsernameChange = now;
    }

    if (typeof avatar === 'string') profile.avatar = avatar;

    await profile.save();

    // keep old posts, replies, likes, follows and notifications attached to the renamed account
    if (oldUsername) {
      const oldHandle = `@${oldUsername}`;
      const newHandle = `@${profile.username}`;
      try {
        await Post.updateMany({ user: oldHandle }, { $set: { user: newHandle } });
        await Post.updateMany({ 'replies.user': oldHandle }, { $set: { 'replies.$[r].user': newHandle } }, { arrayFilters: [{ 'r.user': oldHandle }] });
        await Post.updateMany({ likes: oldHandle }, { $set: { 'likes.$[l]': newHandle } }, { arrayFilters: [{ l: oldHandle }] });
        await ArtistPost.updateMany({ 'replies.user': oldHandle }, { $set: { 'replies.$[r].user': newHandle } }, { arrayFilters: [{ 'r.user': oldHandle }] });
        await ArtistPost.updateMany({ likes: oldHandle }, { $set: { 'likes.$[l]': newHandle } }, { arrayFilters: [{ l: oldHandle }] });
        await Profile.updateMany({ followers: oldHandle }, { $set: { 'followers.$[f]': newHandle } }, { arrayFilters: [{ f: oldHandle }] });
        await Profile.updateMany({ following: oldHandle }, { $set: { 'following.$[f]': newHandle } }, { arrayFilters: [{ f: oldHandle }] });
        await Notification.updateMany({ recipient: normalizeHandle(oldUsername) }, { $set: { recipient: normalizeHandle(profile.username) } });
        await Notification.updateMany({ actor: oldHandle }, { $set: { actor: newHandle } });
      } catch (cascadeError) {
        console.error('Username changed, but updating old posts failed:', cascadeError);
      }
    }

    res.status(200).json(publicUser(profile));
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ message: 'Failed to update profile.' });
  }
});

// Process Daily Claim
app.post('/api/users/daily-claim', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required." });

    const profile = await Profile.findOne({ email: { $regex: `^${escapeRegex(email)}$`, $options: 'i' } });
    if (!profile) return res.status(404).json({ message: "User profile not found." });

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    
    // Normalize last claim to midnight of that day for comparison
    const lastClaimTime = profile.lastClaimDate 
        ? new Date(profile.lastClaimDate.getFullYear(), profile.lastClaimDate.getMonth(), profile.lastClaimDate.getDate()).getTime() 
        : null;

    if (lastClaimTime === today) {
        return res.status(400).json({ message: 'Reward already claimed today. Come back tomorrow!' });
    }

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    // Update streak logic
    if (lastClaimTime === yesterday.getTime()) {
        profile.dailyStreak += 1;
    } else {
        profile.dailyStreak = 1; // Reset to 1 if missed a day
    }

    if (profile.dailyStreak > 7) {
        profile.dailyStreak = 1; // Loop back after day 7
    }

    const previousStars = profile.stars;
    const previousSuns = profile.suns;

    // Allocate rewards: the amount comes from the streak day, never from the request
    const DAILY_REWARDS = [50, 100, 250, 400, 650, 800, 1000];
    profile.stars += DAILY_REWARDS[profile.dailyStreak - 1] || 0;

    profile.lastClaimDate = now;
    const rewardChanges = [];
    const starsEarned = profile.stars - previousStars;
    const sunsEarned = profile.suns - previousSuns;
    if (starsEarned > 0) rewardChanges.push({ currency: 'Stars', amount: starsEarned, direction: 'credit' });
    if (sunsEarned > 0) rewardChanges.push({ currency: 'Suns', amount: sunsEarned, direction: 'credit' });
    profile.transactions.push(createTransaction(
      'rewards',
      `Daily reward · Day ${profile.dailyStreak}`,
      rewardChanges
    ));
    if (profile.transactions.length > 200) profile.transactions.splice(0, profile.transactions.length - 200);
    await profile.save();

    res.status(200).json(publicUser(profile));
  } catch (error) {
    console.error("Daily claim error:", error);
    res.status(500).json({ error: "Internal server error while claiming reward." });
  }
});

// ---- PROMO CODES ----
// Admins create codes (Stars and/or Suns). Each account can redeem a code once.
const promoCodeSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  stars: { type: Number, default: 0, min: 0 },
  suns: { type: Number, default: 0, min: 0 },
  maxRedemptions: { type: Number, default: 0, min: 0 }, // 0 = unlimited
  expiresAt: { type: Date, default: null },
  active: { type: Boolean, default: true },
  redeemedBy: { type: [String], default: [] }            // lower-cased emails
}, { timestamps: true });
const PromoCode = mongoose.model('PromoCode', promoCodeSchema);

const PROMO_CODE_PATTERN = /^[A-Z0-9_-]{3,30}$/;
const cleanPromoCode = (value) => String(value || '').trim().toUpperCase().replace(/\s+/g, '');
const randomPromoCode = () => crypto.randomBytes(6).toString('base64url').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8).padEnd(8, 'X');
const publicPromo = (promo) => ({
  id: String(promo._id),
  code: promo.code,
  stars: promo.stars || 0,
  suns: promo.suns || 0,
  maxRedemptions: promo.maxRedemptions || 0,
  redeemedCount: (promo.redeemedBy || []).length,
  expiresAt: promo.expiresAt || null,
  active: Boolean(promo.active),
  createdAt: promo.createdAt
});

// Redeem a promo code
app.post('/api/users/redeem-promo', async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const code = cleanPromoCode(req.body?.code);
    if (!email) return res.status(400).json({ message: 'Email is required.' });
    if (!code) return res.status(400).json({ message: 'Enter a promo code.' });

    const profile = await Profile.findOne({ email: { $regex: `^${escapeRegex(email)}$`, $options: 'i' } });
    if (!profile) return res.status(404).json({ message: 'User profile not found.' });

    const emailKey = normalizeEmail(profile.email);
    const now = new Date();

    // One atomic step: the code must be active, not expired, not used up and not already used by this account.
    const promo = await PromoCode.findOneAndUpdate(
      {
        code,
        active: true,
        redeemedBy: { $ne: emailKey },
        $and: [
          { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] },
          { $expr: { $or: [{ $eq: ['$maxRedemptions', 0] }, { $lt: [{ $size: '$redeemedBy' }, '$maxRedemptions'] }] } }
        ]
      },
      { $addToSet: { redeemedBy: emailKey } },
      { new: true }
    );

    if (!promo) {
      const existing = await PromoCode.findOne({ code }).lean();
      let message = 'That promo code is not valid.';
      if (existing) {
        if ((existing.redeemedBy || []).includes(emailKey)) message = 'You have already used this code.';
        else if (!existing.active) message = 'This promo code is no longer active.';
        else if (existing.expiresAt && new Date(existing.expiresAt) <= now) message = 'This promo code has expired.';
        else if (existing.maxRedemptions > 0 && (existing.redeemedBy || []).length >= existing.maxRedemptions) message = 'This promo code has been fully redeemed.';
        else message = 'This promo code could not be used.';
      }
      return res.status(400).json({ message });
    }

    try {
      const changes = [];
      if (promo.stars > 0) { profile.stars += promo.stars; changes.push({ currency: 'Stars', amount: promo.stars, direction: 'credit' }); }
      if (promo.suns > 0) { profile.suns += promo.suns; changes.push({ currency: 'Suns', amount: promo.suns, direction: 'credit' }); }
      profile.transactions.push(createTransaction('rewards', `Promo code · ${promo.code}`, changes));
      if (profile.transactions.length > 200) profile.transactions.splice(0, profile.transactions.length - 200);
      await profile.save();
    } catch (saveError) {
      // the reward was not paid out, so give the code back
      await PromoCode.updateOne({ _id: promo._id }, { $pull: { redeemedBy: emailKey } }).catch(() => {});
      throw saveError;
    }

    res.status(200).json({ ...publicUser(profile), promoReward: { code: promo.code, stars: promo.stars || 0, suns: promo.suns || 0 } });
  } catch (error) {
    console.error('Promo redeem error:', error);
    res.status(500).json({ message: 'Could not redeem the code. Please try again.' });
  }
});

app.get('/api/admin/promos', requireAdmin, async (req, res) => {
  try {
    const promos = await PromoCode.find().sort({ createdAt: -1 }).limit(500).lean();
    res.json(promos.map(publicPromo));
  } catch (error) {
    console.error('Promo list error:', error);
    res.status(500).json({ message: 'Could not load promo codes.' });
  }
});

app.post('/api/admin/promos', requireAdmin, async (req, res) => {
  try {
    const code = cleanPromoCode(req.body?.code) || randomPromoCode();
    if (!PROMO_CODE_PATTERN.test(code)) {
      return res.status(400).json({ message: 'Codes use 3-30 letters, numbers, - or _.' });
    }
    const whole = (value) => Math.max(0, Math.floor(Number(value) || 0));
    const stars = whole(req.body?.stars);
    const suns = whole(req.body?.suns);
    if (stars + suns <= 0) return res.status(400).json({ message: 'Give the code at least some Stars or Suns.' });
    if (stars > 1000000 || suns > 1000000) return res.status(400).json({ message: 'That reward is too large.' });

    let expiresAt = null;
    if (req.body?.expiresAt) {
      expiresAt = new Date(`${String(req.body.expiresAt).slice(0, 10)}T23:59:59`);
      if (Number.isNaN(expiresAt.getTime())) return res.status(400).json({ message: 'That expiry date is not valid.' });
    }

    const promo = await PromoCode.create({ code, stars, suns, maxRedemptions: whole(req.body?.maxRedemptions), expiresAt, active: true });
    res.status(201).json(publicPromo(promo));
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ message: 'That code already exists.' });
    console.error('Promo create error:', error);
    res.status(500).json({ message: 'Could not create the promo code.' });
  }
});

app.put('/api/admin/promos/:id', requireAdmin, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid promo code.' });
    const promo = await PromoCode.findByIdAndUpdate(req.params.id, { active: Boolean(req.body?.active) }, { new: true });
    if (!promo) return res.status(404).json({ message: 'Promo code not found.' });
    res.json(publicPromo(promo));
  } catch (error) {
    console.error('Promo update error:', error);
    res.status(500).json({ message: 'Could not update the promo code.' });
  }
});

app.delete('/api/admin/promos/:id', requireAdmin, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid promo code.' });
    const promo = await PromoCode.findByIdAndDelete(req.params.id);
    if (!promo) return res.status(404).json({ message: 'Promo code not found.' });
    res.json({ message: 'Promo code deleted.' });
  } catch (error) {
    console.error('Promo delete error:', error);
    res.status(500).json({ message: 'Could not delete the promo code.' });
  }
});

app.post('/api/users/convert-suns', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email || '');
    const sunsToConvert = Number(req.body.suns);
    if (!email) return res.status(400).json({ message: 'Email is required.' });
    if (!Number.isSafeInteger(sunsToConvert) || sunsToConvert < 1) {
      return res.status(400).json({ message: 'Enter a whole number of Suns to convert.' });
    }

    const starsToAdd = sunsToConvert * 1800;
    if (!Number.isSafeInteger(starsToAdd)) {
      return res.status(400).json({ message: 'Conversion amount is too large.' });
    }

    const emailFilter = { email: { $regex: `^${escapeRegex(email)}$`, $options: 'i' } };
    const profile = await Profile.findOneAndUpdate(
      { ...emailFilter, suns: { $gte: sunsToConvert } },
      {
        $inc: { suns: -sunsToConvert, stars: starsToAdd },
        $push: {
          transactions: {
            $each: [createTransaction('conversion', 'Suns converted to Stars', [
              { currency: 'Suns', amount: sunsToConvert, direction: 'debit' },
              { currency: 'Stars', amount: starsToAdd, direction: 'credit' }
            ])],
            $slice: -200
          }
        }
      },
      { new: true }
    );

    if (!profile) {
      const existingProfile = await Profile.findOne(emailFilter);
      if (!existingProfile) return res.status(404).json({ message: 'User profile not found.' });
      return res.status(400).json({ message: 'Not enough Suns for this conversion.' });
    }

    res.status(200).json({ stars: profile.stars, suns: profile.suns, convertedSuns: sunsToConvert, addedStars: starsToAdd });
  } catch (error) {
    console.error('Error converting Suns to Stars:', error);
    res.status(500).json({ message: 'Failed to convert Suns to Stars.' });
  }
});

app.get('/api/users/transactions', async (req, res) => {
  try {
    const email = normalizeEmail(req.query.email || '');
    if (!email) return res.status(400).json({ message: 'Email is required.' });

    const profile = await Profile.findOne({
      email: { $regex: `^${escapeRegex(email)}$`, $options: 'i' }
    }).select('transactions');
    if (!profile) return res.status(404).json({ message: 'User profile not found.' });

    const transactions = [...(profile.transactions || [])]
      .filter(transaction => transaction.category !== 'market spin' || (transaction.changes || []).some(change =>
        change.currency === 'Stars' && change.direction === 'credit' && Number(change.amount) > 0
      ))
      .sort((first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime())
      .slice(0, 100);
    res.status(200).json(transactions);
  } catch (error) {
    console.error('Error loading transactions:', error);
    res.status(500).json({ message: 'Failed to load transactions.' });
  }
});

app.get('/api/users/swerte-spin-status', async (req, res) => {
  try {
    const email = normalizeEmail(req.query.email || '');
    if (!email) return res.status(400).json({ message: 'Email is required.' });

    const profile = await resetDailySwerteSpins(email);
    if (!profile) return res.status(404).json({ message: 'User profile not found.' });

    res.status(200).json({
      spinsRemaining: profile.swerteSpinsRemaining,
      spinDate: profile.swerteSpinDate
    });
  } catch (error) {
    console.error('Error loading Swerte spin status:', error);
    res.status(500).json({ message: 'Failed to load Swerte spin status.' });
  }
});

app.post('/api/users/swerte-spin', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email || '');
    if (!email) return res.status(400).json({ message: 'Email is required.' });

    const profile = await resetDailySwerteSpins(email);
    if (!profile) return res.status(404).json({ message: 'User profile not found.' });

    const today = getPacificDateKey();
    const updatedProfile = await Profile.findOneAndUpdate(
      {
        email: { $regex: `^${escapeRegex(email)}$`, $options: 'i' },
        swerteSpinDate: today,
        swerteSpinsRemaining: { $gte: 1 }
      },
      {
        $inc: { swerteSpinsRemaining: -1 },
        $push: {
          transactions: {
            $each: [createTransaction('rewards', 'Swerte wheel spin', [
              { currency: 'Swerte spins', amount: 1, direction: 'debit' }
            ])],
            $slice: -200
          }
        }
      },
      { new: true }
    );

    if (!updatedProfile) {
      return res.status(409).json({ message: 'You have already used your Swerte spin today.', spinsRemaining: 0 });
    }

    res.status(200).json({
      spinsRemaining: updatedProfile.swerteSpinsRemaining,
      spinDate: updatedProfile.swerteSpinDate
    });
  } catch (error) {
    console.error('Error recording Swerte spin:', error);
    res.status(500).json({ message: 'Failed to record Swerte spin.' });
  }
});

app.post('/api/users/market-spin-bonus', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email || '');
    const rewardId = typeof req.body.rewardId === 'string' ? req.body.rewardId.trim() : '';
    if (!email) return res.status(400).json({ message: 'Email is required.' });
    if (!rewardId || rewardId.length > 160) return res.status(400).json({ message: 'A valid reward ID is required.' });

    const profile = await resetDailySpins(email);
    if (!profile) return res.status(404).json({ message: 'User profile not found.' });

    const updatedProfile = await Profile.findOneAndUpdate(
      {
        email: { $regex: `^${escapeRegex(email)}$`, $options: 'i' },
        redeemedRewardIds: { $ne: rewardId }
      },
      {
        $inc: { marketBonusSpins: 20 },
        $addToSet: { redeemedRewardIds: rewardId },
        $push: {
          transactions: {
            $each: [createTransaction('rewards', 'Swerte reward: +20 Market spins', [
              { currency: 'Market spins', amount: 20, direction: 'credit' }
            ])],
            $slice: -200
          }
        }
      },
      { new: true }
    );

    if (!updatedProfile) {
      const existingProfile = await Profile.findOne({
        email: { $regex: `^${escapeRegex(email)}$`, $options: 'i' }
      });
      if (!existingProfile) return res.status(404).json({ message: 'User profile not found.' });
      if (!(existingProfile.redeemedRewardIds || []).includes(rewardId)) {
        return res.status(409).json({ message: 'Could not redeem this reward. Please try again.' });
      }
      const bonusSpins = existingProfile.marketBonusSpins || 0;
      return res.status(200).json({
        bonusSpins,
        spinsRemaining: (existingProfile.spinsRemaining || 0) + bonusSpins,
        alreadyRedeemed: true
      });
    }

    const bonusSpins = updatedProfile.marketBonusSpins || 0;
    res.status(200).json({
      bonusSpins,
      spinsRemaining: (updatedProfile.spinsRemaining || 0) + bonusSpins
    });
  } catch (error) {
    console.error('Error redeeming Market spins reward:', error);
    res.status(500).json({ message: 'Failed to redeem Market spins reward.' });
  }
});

app.get('/api/users/spin-status', async (req, res) => {
  try {
    const email = normalizeEmail(req.query.email || '');
    if (!email) return res.status(400).json({ message: 'Email is required.' });

    const profile = await resetDailySpins(email);
    if (!profile) return res.status(404).json({ message: 'User profile not found.' });

    res.status(200).json({
      spinsRemaining: (profile.spinsRemaining || 0) + (profile.marketBonusSpins || 0),
      stars: profile.stars,
      lastSpinAt: profile.lastSpinAt
    });
  } catch (error) {
    console.error('Error loading spin status:', error);
    res.status(500).json({ message: 'Failed to load spin status.' });
  }
});

app.post('/api/users/spin', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email || '');
    if (!email) return res.status(400).json({ message: 'Email is required.' });

    const profile = await resetDailySpins(email);
    if (!profile) return res.status(404).json({ message: 'User profile not found.' });

    const cooldownMs = 30_000;
    const now = new Date();
    if (profile.lastSpinAt && now.getTime() - profile.lastSpinAt.getTime() < cooldownMs) {
      return res.status(429).json({ message: 'Please wait for the spin cooldown to finish.', cooldownEndsAt: new Date(profile.lastSpinAt.getTime() + cooldownMs) });
    }
    if (profile.spinsRemaining + profile.marketBonusSpins < 1) {
      return res.status(400).json({ message: 'You have used all available spins.' });
    }

    const values = [0, 5, 10, 25, 50, 100];
    const symbols = Array.from({ length: 3 }, () => values[Math.floor(Math.random() * values.length)]);
    const counts = symbols.reduce((result, value) => ({ ...result, [value]: (result[value] || 0) + 1 }), {});
    const match = Object.entries(counts).find(([, count]) => count > 1);
    const reward = match ? Number(match[0]) * (match[1] === 3 ? 2 : 1) : 0;
    const cooldownCutoff = new Date(now.getTime() - cooldownMs);
    const spinUpdate = {
      $inc: { stars: reward },
      $set: { lastSpinAt: now }
    };
    if (reward > 0) {
      spinUpdate.$push = {
        transactions: {
          $each: [createTransaction('market spin', 'Market slot spin', [
            { currency: 'Stars', amount: reward, direction: 'credit' }
          ])],
          $slice: -200
        }
      };
    }
    const spinFilter = {
      email: { $regex: `^${escapeRegex(email)}$`, $options: 'i' },
      spinDate: getPacificDateKey(now),
      $or: [{ lastSpinAt: null }, { lastSpinAt: { $lte: cooldownCutoff } }]
    };
    let updatedProfile = await Profile.findOneAndUpdate(
      { ...spinFilter, spinsRemaining: { $gte: 1 } },
      { ...spinUpdate, $inc: { ...spinUpdate.$inc, spinsRemaining: -1 } },
      { new: true }
    );
    if (!updatedProfile) {
      updatedProfile = await Profile.findOneAndUpdate(
        { ...spinFilter, spinsRemaining: { $lt: 1 }, marketBonusSpins: { $gte: 1 } },
        { ...spinUpdate, $inc: { ...spinUpdate.$inc, marketBonusSpins: -1 } },
        { new: true }
      );
    }

    if (!updatedProfile) return res.status(429).json({ message: 'Spin limit or cooldown reached. Refresh your status and try again.' });

    res.status(200).json({
      symbols,
      reward,
      spinsRemaining: (updatedProfile.spinsRemaining || 0) + (updatedProfile.marketBonusSpins || 0),
      stars: updatedProfile.stars,
      cooldownEndsAt: new Date(now.getTime() + cooldownMs)
    });
  } catch (error) {
    console.error('Error processing spin:', error);
    res.status(500).json({ message: 'Failed to process spin.' });
  }
});

app.post('/api/check-username', async (req, res) => {
  try {
    const { username } = req.body;
    const existingUsername = await Profile.findOne({ username });
    if (existingUsername) {
      return res.status(400).json({ message: "Username is already taken." });
    }
    res.status(200).json({ message: "Username is available!" });
  } catch (error) {
    res.status(500).json({ error: "Server error checking username." });
  }
});

// Chat Posts
const postSchema = new mongoose.Schema({
  user: { type: String, required: true },
  avatar: { type: String, default: '' },
  text: { type: String, required: true },
  likes: { type: [String], default: [] },
  // ADD THIS REPLIES ARRAY:
  replies: [{
    user: String,
    avatar: String,
    text: String,
    createdAt: { type: Date, default: Date.now }
  }],
  createdAt: { type: Date, default: Date.now }
});

const Post = mongoose.model('Post', postSchema);

const notificationSchema = new mongoose.Schema({
  recipient: { type: String, required: true, index: true },
  actor: { type: String, required: true },
  actorAvatar: { type: String, default: '' },
  type: { type: String, enum: ['like', 'reply', 'follow', 'mail'], required: true },
  subject: { type: String, default: '' },
  sourceId: { type: String, default: '' },
  postId: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', default: null },
  replyIndex: { type: Number, default: null },
  preview: { type: String, default: '' },
  isRead: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});
const Notification = mongoose.model('Notification', notificationSchema);

const normalizeHandle = (value = '') => String(value).replace(/^@/, '').trim().toLowerCase();

const createNotification = async ({ recipient, actor, actorAvatar = '', type, postId = null, replyIndex = null, preview = '' }) => {
  if (!recipient || !actor || normalizeHandle(recipient) === normalizeHandle(actor)) return;
  await Notification.create({
    recipient: normalizeHandle(recipient),
    actor: String(actor).startsWith('@') ? String(actor) : `@${actor}`,
    actorAvatar,
    type,
    postId,
    replyIndex,
    preview
  });
};

app.get('/api/notifications', async (req, res) => {
  try {
    const username = normalizeHandle(req.query.username);
    if (!username) return res.status(400).json({ message: 'Username is required.' });
    const notifications = await Notification.find({ recipient: username }).sort({ createdAt: -1 }).limit(50);
    res.status(200).json(notifications);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ message: 'Failed to fetch notifications.' });
  }
});

// mark every unread notification of one user as read (registered before the :id route so "read-all" is never taken as an id)
app.patch('/api/notifications/read-all', async (req, res) => {
  try {
    const username = normalizeHandle(req.body.username);
    if (!username) return res.status(400).json({ message: 'Username is required.' });
    const result = await Notification.updateMany({ recipient: username, isRead: false }, { isRead: true });
    res.status(200).json({ updated: result.modifiedCount || 0 });
  } catch (error) {
    console.error('Error marking notifications read:', error);
    res.status(500).json({ message: 'Failed to update notifications.' });
  }
});

app.patch('/api/notifications/:id/read', async (req, res) => {
  try {
    const username = normalizeHandle(req.body.username);
    if (!username) return res.status(400).json({ message: 'Username is required.' });
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: username },
      { isRead: true },
      { new: true }
    );
    if (!notification) return res.status(404).json({ message: 'Notification not found.' });
    res.status(200).json(notification);
  } catch (error) {
    console.error('Error marking notification read:', error);
    res.status(500).json({ message: 'Failed to update notification.' });
  }
});

app.get('/api/posts', async (req, res) => {
  try {
    const posts = await Post.find().sort({ createdAt: -1 });
    res.status(200).json(posts);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch posts" });
  }
});

app.put('/api/posts/:id/like', async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    const actor = String(req.body.user || '').trim();
    if (!post) return res.status(404).json({ message: 'Post not found.' });
    if (!actor || normalizeHandle(actor) === 'guest') return res.status(400).json({ message: 'A signed-in user is required.' });

    const alreadyLiked = post.likes.includes(actor);
    if (alreadyLiked) {
      post.likes = post.likes.filter(handle => handle !== actor);
    } else {
      post.likes.push(actor);
    }
    await post.save();

    if (!alreadyLiked) {
      await createNotification({
        recipient: post.user,
        actor,
        type: 'like',
        postId: post._id,
        preview: post.text
      });
    }

    res.status(200).json(post);
  } catch (error) {
    console.error('Error toggling post reaction:', error);
    res.status(500).json({ message: 'Failed to update reaction.' });
  }
});

app.post('/api/posts', async (req, res) => {
  try {
    const { user, avatar, text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ message: "Post text cannot be empty" });
    }
    const newPost = new Post({ user, avatar: avatar || "", text, likes: [], replies: [] });
    await newPost.save();
    res.status(201).json(newPost);
  } catch (error) {
    console.error("Error creating post:", error);
    res.status(500).json({ error: "Failed to create post" });
  }
});

// POST: Add a reply to a specific post
app.post('/api/posts/:id/reply', async (req, res) => {
  try {
    const { user, avatar, text } = req.body;
    if (!text || !String(text).trim()) return res.status(400).json({ message: 'Reply cannot be empty.' });
    
    // 1. Find the post by the ID in the URL
    const post = await Post.findById(req.params.id);
    
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    // 2. Add the new reply to the array
    post.replies.push({ 
      user, 
      avatar: avatar || '', 
      text: String(text).trim()
    });

    // 3. Save it to the database
    await post.save();

    await createNotification({
      recipient: post.user,
      actor: user,
      actorAvatar: avatar || '',
      type: 'reply',
      postId: post._id,
      replyIndex: post.replies.length - 1,
      preview: String(text).trim()
    });

    // 4. Send the FULL updated post back to React so it can re-render the UI
    res.status(200).json(post);
    
  } catch (error) {
    console.error("Error adding reply:", error);
    res.status(500).json({ message: 'Error adding reply', error: error.message });
  }
});

const serializeImage = (item = {}) => ({
  ...item,
  imageUrl: normalizeImageUrl(item.imageUrl)
});

// Chika API Routes
app.get('/api/chika', async (req, res) => {
  try {
    const articles = await Chika.find().sort({ createdAt: -1 });
    res.status(200).json(articles.map((article) => serializeImage(article.toObject())));
  } catch (error) {
    console.error('Error fetching Chika articles:', error);
    res.status(500).json({ error: 'Failed to fetch Chika articles' });
  }
});

app.post('/api/chika', requireAdmin, upload.single('image'), async (req, res) => {
  try {
    const { title, description, url } = req.body;
    if (!title || !description) {
      return res.status(400).json({ message: 'Title and description are required.' });
    }
    const article = await Chika.create({
      title,
      description,
      imageUrl: normalizeImageUrl(req.file ? `/uploads/${req.file.filename}` : ''),
      url: url || ''
    });
    res.status(201).json(serializeImage(article.toObject()));
  } catch (error) {
    console.error('Error creating Chika article:', error);
    res.status(500).json({ error: 'Failed to create Chika article' });
  }
});

app.put('/api/chika/:id', requireAdmin, upload.single('image'), async (req, res) => {
  try {
    const article = await Chika.findById(req.params.id);
    if (!article) {
      return res.status(404).json({ message: 'Chika article not found.' });
    }
    article.title = req.body.title || article.title;
    article.description = req.body.description || article.description;
    article.url = req.body.url ?? article.url;
    if (req.file) {
      article.imageUrl = normalizeImageUrl(`/uploads/${req.file.filename}`);
    }
    await article.save();
    res.status(200).json(serializeImage(article.toObject()));
  } catch (error) {
    console.error('Error updating Chika article:', error);
    res.status(500).json({ error: 'Failed to update Chika article' });
  }
});

app.delete('/api/chika/:id', requireAdmin, async (req, res) => {
  try {
    const removed = await Chika.findByIdAndDelete(req.params.id);
    if (!removed) {
      return res.status(404).json({ message: 'Chika article not found.' });
    }
    res.status(200).json({ message: 'Chika article deleted.' });
  } catch (error) {
    console.error('Error deleting Chika article:', error);
    res.status(500).json({ error: 'Failed to delete Chika article' });
  }
});

// ==========================================
// POLL GROUPS (FILTER ICONS) ROUTES - NEW!
// ==========================================
app.get('/api/poll-groups', async (req, res) => {
  try {
    const groups = await PollGroup.find().sort({ createdAt: 1 });
    res.status(200).json(groups.map(group => ({
      ...group.toObject(),
      imageUrl: normalizeImageUrl(group.imageUrl)
    })));
  } catch (error) {
    console.error('Error fetching poll groups:', error);
    res.status(500).json({ error: 'Failed to fetch poll groups' });
  }
});

app.post('/api/poll-groups', requireAdmin, upload.single('image'), async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: 'Group name is required.' });
    
    const newGroup = await PollGroup.create({
      name,
      imageUrl: normalizeImageUrl(req.file ? `/uploads/${req.file.filename}` : '')
    });
    res.status(201).json({ ...newGroup.toObject(), imageUrl: normalizeImageUrl(newGroup.imageUrl) });
  } catch (error) {
    console.error('Error creating poll group:', error);
    res.status(500).json({ error: 'Failed to create group' });
  }
});

app.delete('/api/poll-groups/:id', requireAdmin, async (req, res) => {
  try {
    await PollGroup.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: 'Group deleted.' });
  } catch (error) {
    console.error('Error deleting poll group:', error);
    res.status(500).json({ error: 'Failed to delete group' });
  }
});
// ==========================================

// Polls API Routes
app.get('/api/polls', async (req, res) => {
  try {
    const polls = await Poll.find().sort({ fromDate: 1 });
    res.status(200).json(polls.map((poll) => ({
      ...poll.toObject(),
      imageUrl: normalizeImageUrl(poll.imageUrl),
      displayTitle: getPollDisplayTitle ? getPollDisplayTitle(poll.title, poll.fromDate) : poll.title
    })));
  } catch (error) {
    console.error('Error fetching polls:', error);
    res.status(500).json({ error: 'Failed to fetch polls' });
  }
});

app.post('/api/polls', requireAdmin, upload.single('image'), async (req, res) => {
  try {
    // 1. Extract the new fields from req.body
    const { title, fromDate, toDate, group, type, description, goal } = req.body;
    
    if (!title || !fromDate || !toDate) {
      return res.status(400).json({ message: 'Title, fromDate, and toDate are required.' });
    }
    
    // 2. Save the new fields to MongoDB
    const poll = await Poll.create({
      title,
      group: group || '',     // Default to PPMA if left empty
      type: type || '',      // Default to Minor if left empty
      description: description || '',
      goal: cleanGoal(goal),
      imageUrl: normalizeImageUrl(req.file ? `/uploads/${req.file.filename}` : ''),
      fromDate: new Date(fromDate),
      toDate: new Date(toDate)
    });
    
    res.status(201).json({
      ...poll.toObject(),
      imageUrl: normalizeImageUrl(poll.imageUrl),
      displayTitle: poll.title
    });
  } catch (error) {
    console.error('Error creating poll:', error);
    res.status(500).json({ error: 'Failed to create poll' });
  }
});

app.put('/api/polls/:id', requireAdmin, upload.single('image'), async (req, res) => {
  try {
    const poll = await Poll.findById(req.params.id);
    if (!poll) {
      return res.status(404).json({ message: 'Poll not found.' });
    }
    
    // 3. Update existing fields if they were changed
    poll.title = req.body.title || poll.title;
    poll.group = req.body.group || poll.group;
    poll.type = req.body.type || poll.type;
    
    // Check undefined so we can save empty strings if the admin clears the description
    if (req.body.description !== undefined) {
      poll.description = req.body.description;
    }
    
    // an empty goal clears it (turns a fan project back into a normal poll)
    if (req.body.goal !== undefined) poll.goal = cleanGoal(req.body.goal);

    poll.fromDate = req.body.fromDate ? new Date(req.body.fromDate) : poll.fromDate;
    poll.toDate = req.body.toDate ? new Date(req.body.toDate) : poll.toDate;
    
    if (req.file) {
      poll.imageUrl = normalizeImageUrl(`/uploads/${req.file.filename}`);
    }
    
    await poll.save();
    
    res.status(200).json({
      ...poll.toObject(),
      imageUrl: normalizeImageUrl(poll.imageUrl),
      displayTitle: poll.title
    });
  } catch (error) {
    console.error('Error updating poll:', error);
    res.status(500).json({ error: 'Failed to update poll' });
  }
});

app.delete('/api/polls/:id', requireAdmin, async (req, res) => {
  try {
    const removed = await Poll.findByIdAndDelete(req.params.id);
    if (!removed) {
      return res.status(404).json({ message: 'Poll not found.' });
    }

    // Artists belong to a poll by group + poll title. Remove them with the poll,
    // unless another poll in the same group still uses that title.
    let artistsRemoved = 0;
    if (removed.title) {
      const groupMatch = removed.group ? removed.group : { $in: ['', null] };
      const stillUsed = await Poll.exists({ title: removed.title, group: groupMatch });
      if (!stillUsed) {
        const result = await Ranking.deleteMany({ category: removed.title, group: groupMatch });
        artistsRemoved = result.deletedCount || 0;
        if (artistsRemoved) await updateRankingPositions();
      }
    }
    res.status(200).json({ message: 'Poll deleted.', artistsRemoved });
  } catch (error) {
    console.error('Error deleting poll:', error);
    res.status(500).json({ error: 'Failed to delete poll' });
  }
});



// Rankings API Routes
app.get('/api/rankings', async (req, res) => {
  try {
    await updateRankingPositions(); // Auto-sort by category before sending
    const rankings = await Ranking.find().sort({ voteCount: -1, createdAt: 1 });
    res.status(200).json(rankings.map(item => serializeImage(item.toObject())));
  } catch (error) {
    console.error('Error fetching rankings:', error);
    res.status(500).json({ error: 'Failed to fetch rankings' });
  }
});

app.post('/api/rankings', requireAdmin, upload.single('image'), async (req, res) => {
  try {
    const { name, position, youtubeUrl, youtubeStartTime, group, category } = req.body; 
    
    if (!name) {
      return res.status(400).json({ message: 'Ranking name is required.' });
    }
    const ranking = await Ranking.create({
      name,
      group: group || '',             // <-- CAPTURE GROUP
      category: category || '',       // <-- CAPTURE CATEGORY
      youtubeUrl: youtubeUrl || '',
      youtubeStartTime: Number(youtubeStartTime) || 0, 
      imageUrl: normalizeImageUrl(req.file ? `/uploads/${req.file.filename}` : ''),
      voteCount: 0,
      position: Number(position || 1)
    });
    
    await updateRankingPositions(); // Recalculate ranks
    res.status(201).json(serializeImage(ranking.toObject()));
  } catch (error) {
    console.error('Error creating ranking:', error);
    res.status(500).json({ error: 'Failed to create ranking' });
  }
});

// CURRENCY-BASED VOTING ROUTE
app.post('/api/rankings/:id/vote', async (req, res) => {
  try {
    const { email, currencyType = 'stars' } = req.body;
    const cost = Number(req.body.cost ?? 1);
    if (!Number.isSafeInteger(cost) || cost < 1) {
      return res.status(400).json({ message: 'Enter a whole number of at least 1.' });
    }
    if (currencyType !== 'stars' && currencyType !== 'suns') {
      return res.status(400).json({ message: 'Invalid currency.' });
    }
    if (!email) {
      return res.status(400).json({ message: "Login required to vote." });
    }

    const profile = await Profile.findOne({ email: { $regex: `^${escapeRegex(email)}$`, $options: 'i' } });
    if (!profile) {
      return res.status(404).json({ message: "User profile not found." });
    }

    const ranking = await Ranking.findById(req.params.id);
    if (!ranking) {
      return res.status(404).json({ message: 'Ranking not found.' });
    }

    if (typeof profile.stars !== 'number') profile.stars = 100;
    if (typeof profile.suns !== 'number') profile.suns = 100;

    if (currencyType === 'stars' && profile.stars < cost) {
      return res.status(400).json({ message: "Not enough stars to vote!" });
    }
    if (currencyType === 'suns' && profile.suns < cost) {
      return res.status(400).json({ message: "Not enough suns to vote!" });
    }

    // lifetime vote counter (older accounts are backfilled from their history BEFORE this vote's transaction is added)
    profile.totalVotes = lifetimeVotes(profile) + Number(cost);

    if (currencyType === 'stars') {
      profile.stars -= cost;
    } else {
      profile.suns -= cost;
    }
    const voteCurrency = currencyType === 'stars' ? 'Stars' : 'Suns';
    profile.transactions.push(createTransaction('voting', `Vote · ${ranking.name}`, [
      { currency: voteCurrency, amount: Number(cost), direction: 'debit' }
    ], ranking.category || ''));
    if (profile.transactions.length > 200) profile.transactions.splice(0, profile.transactions.length - 200);
    await profile.save();

    ranking.voteCount = Number(ranking.voteCount || 0) + cost;
    await ranking.save();

    await updateRankingPositions(); // Recalculate ranks safely within categories

    const updatedTarget = await Ranking.findById(req.params.id);

    res.status(200).json({
      ranking: serializeImage(updatedTarget.toObject()),
      remainingStars: profile.stars,
      remainingSuns: profile.suns
    });
  } catch (error) {
    console.error('Error voting for ranking:', error);
    res.status(500).json({ error: 'Failed to vote for ranking' });
  }
});

app.put('/api/rankings/:id', requireAdmin, upload.single('image'), async (req, res) => {
  try {
    const ranking = await Ranking.findById(req.params.id);
    if (!ranking) {
      return res.status(404).json({ message: 'Ranking not found.' });
    }
    
    ranking.name = req.body.name || ranking.name;
    
    // Update group and category if provided
    if (req.body.group !== undefined) ranking.group = req.body.group;
    if (req.body.category !== undefined) ranking.category = req.body.category;
    if (req.body.youtubeUrl !== undefined) ranking.youtubeUrl = req.body.youtubeUrl;
    if (req.body.youtubeStartTime !== undefined) ranking.youtubeStartTime = Number(req.body.youtubeStartTime) || 0;

    if (req.file) {
      ranking.imageUrl = normalizeImageUrl(`/uploads/${req.file.filename}`);
    }
    await ranking.save();
    await updateRankingPositions(); // Recalculate ranks

    res.status(200).json(serializeImage(ranking.toObject()));
  } catch (error) {
    console.error('Error updating ranking:', error);
    res.status(500).json({ error: 'Failed to update ranking' });
  }
});

app.delete('/api/rankings/:id', requireAdmin, async (req, res) => {
  try {
    await Ranking.findByIdAndDelete(req.params.id);
    await updateRankingPositions();
    res.status(200).json({ message: 'Ranking deleted.' });
  } catch (error) {
    console.error('Error deleting ranking:', error);
    res.status(500).json({ error: 'Failed to delete ranking' });
  }
});
// Authentication Routes
app.post('/api/forgot-password', async (req, res) => {
  try {
    const isProduction = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true';
    const configuredClientUrl = process.env.CLIENT_URL?.trim();
    if (isProduction && !configuredClientUrl) {
      console.error('CLIENT_URL must be configured for password reset emails in production.');
      return res.status(500).json({ message: 'Password reset is temporarily unavailable. Please contact support.' });
    }

    const clientUrl = (configuredClientUrl || 'http://localhost:5173').replace(/\/+$/, '');
    const normalizedEmail = normalizeEmail(req.body.email || '');
    if (!normalizedEmail) return res.status(400).json({ message: 'Email is required.' });

    const user = await User.findOne({
      email: { $regex: `^${escapeRegex(normalizedEmail)}$`, $options: 'i' },
      isVerified: true
    });

    if (!user) {
      return res.status(404).json({ message: 'No verified account is registered with that email address.' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    user.passwordResetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.passwordResetExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await user.save();

    const resetUrl = `${clientUrl}/forgot-password?token=${encodeURIComponent(resetToken)}`;
    try {
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: user.email,
        subject: 'Reset your JuanCast password',
        text: `We received a request to reset your JuanCast password. Use this link within one hour:\n\n${resetUrl}\n\nIf you did not request this, you can ignore this email.`
      });
    } catch (error) {
      user.passwordResetTokenHash = undefined;
      user.passwordResetExpiresAt = undefined;
      await user.save();
      console.error('Error sending password reset email:', error);
      return res.status(500).json({ message: 'Could not send the password reset email. Please try again later.' });
    }

    res.status(200).json({
      message: 'Email verified. A password reset link has been sent.'
    });
  } catch (error) {
    console.error('Error requesting password reset:', error);
    res.status(500).json({ message: 'Could not process the password reset request.' });
  }
});

app.post('/api/reset-password', async (req, res) => {
  try {
    const token = typeof req.body.token === 'string' ? req.body.token : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (!token || !password) {
      return res.status(400).json({ message: 'Reset token and new password are required.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters long.' });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.findOneAndUpdate(
      {
        passwordResetTokenHash: tokenHash,
        passwordResetExpiresAt: { $gt: new Date() }
      },
      {
        $set: { password: hashedPassword },
        $unset: { passwordResetTokenHash: 1, passwordResetExpiresAt: 1, otp: 1 }
      },
      { new: true }
    );

    if (!user) {
      return res.status(400).json({ message: 'This password reset link is invalid or has expired. Request a new one.' });
    }

    res.status(200).json({ message: 'Password updated. You can now log in with your new password.' });
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ message: 'Could not reset the password. Please try again later.' });
  }
});

app.post('/api/request-otp', async (req, res) => {
  try {
    const { email, phone, password } = req.body;
    const normalizedEmail = normalizeEmail(email);
    const cleanPhone = typeof phone === 'string' ? phone.trim() : '';

    let user = await User.findOne({ email: { $regex: `^${escapeRegex(normalizedEmail)}$`, $options: 'i' } });
    if (user && user.isVerified) {
      return res.status(400).json({ message: "User already exists." });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedPassword = await bcrypt.hash(password, 10);

    if (!user) {
      user = new User({ email: normalizedEmail, password: hashedPassword, otp });
      if (cleanPhone) user.phone = cleanPhone;
    } else {
      user.email = normalizedEmail;
      user.password = hashedPassword;
      user.otp = otp;
      user.phone = cleanPhone || undefined; // optional; never store an empty string
    }
    await user.save();

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Your JuanCast Verification Code',
      text: `Your 6-digit verification code is: ${otp}`
    });

    res.status(200).json({ message: "OTP sent successfully!" });
  } catch (error) {
    console.error('request-otp failed:', error.code, error.message);
    if (error.code === 11000) return res.status(400).json({ message: "That phone number or email is already registered." });
    if (['EAUTH', 'ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'EENVELOPE'].includes(error.code)) return res.status(502).json({ message: "We couldn't send the verification email. Please try again later." });
    res.status(500).json({ error: "Failed to process request." });
  }
});

app.post('/api/verify-otp', async (req, res) => {
  try {
    const { email, otp, fullName, username, birthdate, gender } = req.body;
    const normalizedEmail = normalizeEmail(email);
    
    const existingUsername = await Profile.findOne({ username });
    if (existingUsername) {
      return res.status(400).json({ message: "Username is already taken. Please try another." });
    }

    const user = await User.findOne({ email: { $regex: `^${escapeRegex(normalizedEmail)}$`, $options: 'i' } });
    if (!user) return res.status(404).json({ message: "User not found." });
    if (user.otp !== otp) return res.status(400).json({ message: "Invalid verification code." });

    user.email = normalizedEmail;
    user.isVerified = true;
    user.otp = undefined; 
    await user.save();

    const newProfile = new Profile({
      email: normalizedEmail,
      fullName,
      username,
      birthdate,
      gender
    });
    await newProfile.save();

    res.status(200).json({ message: "Account and Profile created successfully!" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to verify account." });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = normalizeEmail(email);

    const user = await User.findOne({ email: { $regex: `^${escapeRegex(normalizedEmail)}$`, $options: 'i' } });
    if (!user) {
      return res.status(400).json({ message: "Invalid email or password." });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid email or password." });
    }

    const normalizedUserEmail = normalizeEmail(user.email);
    const profile = await Profile.findOne({ email: { $regex: `^${escapeRegex(normalizedUserEmail)}$`, $options: 'i' } });
    const role = resolveRole(user);
    const isAdmin = role === 'admin' || role === 'superadmin';

    if (isAdmin && (!user.isAdmin || user.role !== role || user.email !== normalizedUserEmail)) {
      user.email = normalizedUserEmail;
      user.isAdmin = true;
      user.role = role;
      await user.save();
    }

// Inside app.post('/api/login') ...
    
res.status(200).json({ 
        message: "Login successful!", 
        user: {
          id: user._id,
          email: normalizedUserEmail,
          username: profile ? profile.username : normalizedUserEmail,
          fullName: profile ? profile.fullName : "User",
          avatar: profile ? profile.avatar : "",
          stars: profile?.stars ?? 100, 
          suns: profile?.suns ?? 100,
          dailyStreak: profile?.dailyStreak ?? 0,
          lastClaimDate: profile?.lastClaimDate || null,
          isAdmin,
          role,
          ...(isAdmin || role === 'artist' ? { token: createAdminToken(user) } : {})
        }
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Server error during login." });
    }
});
// Your banner routes or app.listen should come AFTER that closing line.

// ---- ADMIN: ACCOUNTS & ROLES ----
// Roles: user, artist, admin, superadmin.
//  - any admin can list accounts and switch someone between user and artist
//  - only a super admin can make or remove admins
//  - super admins / built-in admins (SUPERADMIN_EMAIL, ADMIN_EMAIL) are fixed and can't be changed here
const ASSIGNABLE_ROLES = ['user', 'artist', 'admin'];
const CI = { locale: 'en', strength: 2 }; // case-insensitive matching for old accounts with mixed-case emails

const adminClause = () => ({
  $or: [
    { isAdmin: true },
    { role: { $in: ['admin', 'superadmin'] } },
    { email: { $in: getAdminEmails().map((e) => new RegExp(`^${escapeRegex(e)}$`, 'i')) } }
  ]
});

const accountView = (user, profile) => ({
  id: String(user._id),
  email: user.email,
  username: profile?.username || '',
  fullName: profile?.fullName || '',
  role: resolveRole(user),
  locked: getAdminEmails().includes(normalizeEmail(user.email)),
  verified: Boolean(user.isVerified),
  bio: profile?.bio || '',
  socialLinks: linksOf(profile),
  hasCover: Boolean(profile?.coverPhoto),
  createdAt: profile?.createdAt || user._id.getTimestamp()
});

app.get('/api/admin/accounts', requireAdmin, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 80);
    const roleFilter = String(req.query.role || '').trim().toLowerCase();
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 100);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);

    const and = [];
    if (q) {
      const rx = new RegExp(escapeRegex(q), 'i');
      const matched = await Profile.find({ $or: [{ username: rx }, { fullName: rx }, { email: rx }] }).select('email').limit(500).lean();
      and.push({ $or: [{ email: rx }, { email: { $in: matched.map((p) => p.email) } }] });
    }
    if (roleFilter === 'admin') and.push(adminClause());
    else if (roleFilter === 'artist') and.push({ role: 'artist' }, { $nor: [adminClause()] });
    else if (roleFilter === 'user') and.push({ $nor: [adminClause(), { role: 'artist' }] });
    const filter = and.length ? { $and: and } : {};

    const [total, users] = await Promise.all([
      User.countDocuments(filter).collation(CI),
      User.find(filter).collation(CI).sort({ _id: -1 }).skip((page - 1) * limit).limit(limit).select('email isAdmin role isVerified').lean()
    ]);

    const profiles = await Profile.find({ email: { $in: users.map((u) => normalizeEmail(u.email)) } })
      .collation(CI).select('email username fullName createdAt bio socialLinks coverPhoto').lean();
    const byEmail = new Map(profiles.map((p) => [normalizeEmail(p.email), p]));

    res.json({
      accounts: users.map((u) => accountView(u, byEmail.get(normalizeEmail(u.email)))),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      canManageAdmins: isSuperAdmin(req.adminUser),
      you: String(req.adminUser._id)
    });
  } catch (error) {
    console.error('Error loading accounts:', error);
    res.status(500).json({ message: 'Failed to load accounts.' });
  }
});

// Create an account without the sign-up / email-verification flow (admins only).
// It is marked verified straight away, so the person can log in with the email and password set here.
const ACCOUNT_USERNAME_RE = /^[A-Za-z0-9_.]{3,24}$/;
const ACCOUNT_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
app.post('/api/admin/accounts', requireAdmin, async (req, res) => {
  let createdUser = null;
  try {
    const body = req.body || {};
    const email = normalizeEmail(body.email);
    const fullName = String(body.fullName || '').trim().slice(0, 80);
    const username = String(body.username || '').trim().replace(/^@/, '');
    const role = String(body.role || 'user').trim().toLowerCase();
    const birthdate = String(body.birthdate || '').trim().slice(0, 10) || '2000-01-01';
    const gender = String(body.gender || '').trim().slice(0, 30);
    let password = String(body.password || '');

    if (!ACCOUNT_EMAIL_RE.test(email)) return res.status(400).json({ message: 'Enter a valid email address.' });
    if (!fullName) return res.status(400).json({ message: 'Enter the person’s full name.' });
    if (!ACCOUNT_USERNAME_RE.test(username)) return res.status(400).json({ message: 'Username must be 3–24 characters: letters, numbers, "_" or ".".' });
    if (!ASSIGNABLE_ROLES.includes(role)) return res.status(400).json({ message: 'Role must be user, artist or admin.' });
    if ((role === 'admin' || getAdminEmails().includes(email)) && !isSuperAdmin(req.adminUser)) {
      return res.status(403).json({ message: 'Only a super admin can create admin accounts.' });
    }
    if (password && password.length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters.' });

    let generatedPassword = '';
    if (!password) {
      password = crypto.randomBytes(9).toString('base64url'); // 12 characters
      generatedPassword = password;
    }

    const existingUser = await User.findOne({ email: { $regex: `^${escapeRegex(email)}$`, $options: 'i' } });
    if (existingUser && existingUser.isVerified) return res.status(409).json({ message: 'An account with that email already exists.' });
    if (await Profile.findOne({ username }).collation(CI)) return res.status(409).json({ message: 'That username is already taken.' });
    if (await Profile.findOne({ email: { $regex: `^${escapeRegex(email)}$`, $options: 'i' } })) {
      return res.status(409).json({ message: 'A profile with that email already exists.' });
    }

    const hashed = await bcrypt.hash(password, 10);
    let user = existingUser; // an unverified leftover from an abandoned sign-up is reused
    if (user) {
      user.email = email; user.password = hashed; user.otp = undefined;
    } else {
      user = new User({ email, password: hashed });
      createdUser = user;
    }
    user.isVerified = true;
    user.role = role;
    user.isAdmin = role === 'admin';
    await user.save();

    const profile = await new Profile({ email, fullName, username, birthdate, gender: gender || undefined }).save();

    res.status(201).json({
      message: `Account created for @${username}.`,
      account: accountView(user.toObject(), profile),
      ...(generatedPassword ? { generatedPassword } : {})
    });
  } catch (error) {
    if (createdUser) await User.deleteOne({ _id: createdUser._id }).catch(() => {}); // don't leave a login with no profile
    console.error('Error creating account:', error);
    if (error.code === 11000) return res.status(409).json({ message: 'That email or username is already in use.' });
    res.status(500).json({ message: 'Failed to create the account.' });
  }
});

app.put('/api/admin/accounts/:id/role', requireAdmin, async (req, res) => {
  try {
    const nextRole = String(req.body?.role || '').trim().toLowerCase();
    if (!ASSIGNABLE_ROLES.includes(nextRole)) {
      return res.status(400).json({ message: 'Role must be user, artist or admin.' });
    }
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid account.' });
    }

    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ message: 'Account not found.' });

    if (String(target._id) === String(req.adminUser._id)) {
      return res.status(400).json({ message: 'You can’t change your own role.' });
    }
    if (getAdminEmails().includes(normalizeEmail(target.email))) {
      return res.status(403).json({ message: 'This account’s role is set in the server settings (SUPERADMIN_EMAIL / ADMIN_EMAIL) and can’t be changed here.' });
    }
    if ((resolveAdminStatus(target) || nextRole === 'admin') && !isSuperAdmin(req.adminUser)) {
      return res.status(403).json({ message: 'Only a super admin can add or remove admins.' });
    }

    target.role = nextRole;
    target.isAdmin = nextRole === 'admin';
    await target.save();

    const profile = await Profile.findOne({ email: normalizeEmail(target.email) }).collation(CI).select('email username fullName createdAt bio socialLinks coverPhoto').lean();
    res.json({ message: `Role updated to ${nextRole}.`, account: accountView(target.toObject(), profile) });
  } catch (error) {
    console.error('Error updating role:', error);
    res.status(500).json({ message: 'Failed to update the role.' });
  }
});

// Admin: edit someone's "about" section (name, bio, links, remove the cover photo).
app.put('/api/admin/accounts/:id/about', requireAdmin, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid account.' });
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ message: 'Account not found.' });
    const isSelf = String(target._id) === String(req.adminUser._id);
    if (resolveAdminStatus(target) && !isSelf && !isSuperAdmin(req.adminUser)) {
      return res.status(403).json({ message: 'Only a super admin can edit an admin’s profile.' });
    }
    const profile = await Profile.findOne({ email: { $regex: `^${escapeRegex(normalizeEmail(target.email))}$`, $options: 'i' } });
    if (!profile) return res.status(404).json({ message: 'This account has no profile yet.' });

    const body = req.body || {};
    if (body.fullName !== undefined) {
      const fullName = String(body.fullName).trim().slice(0, 80);
      if (!fullName) return res.status(400).json({ message: 'The name can’t be empty.' });
      profile.fullName = fullName;
    }
    if (body.bio !== undefined) {
      const bio = String(body.bio).trim();
      if (bio.length > 300) return res.status(400).json({ message: 'Bio can be up to 300 characters.' });
      profile.bio = bio;
    }
    if (body.socialLinks !== undefined) {
      const parsed = parseSocialLinks(body.socialLinks, PROFILE_LINK_KEYS);
      if (parsed.error) return res.status(400).json({ message: parsed.error });
      profile.socialLinks = parsed.links;
    }
    if (toBool(body.removeCover) && profile.coverPhoto) {
      removeStoredImage(profile.coverPhoto);
      profile.coverPhoto = '';
    }
    await profile.save();
    res.json({ message: 'Profile updated.', account: accountView(target.toObject(), profile.toObject()) });
  } catch (error) {
    console.error('Error updating profile (admin):', error);
    res.status(500).json({ message: 'Failed to update the profile.' });
  }
});

// --- YOUTUBE VIDEO SCHEMA ---
const videoSchema = new mongoose.Schema({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  group: { type: String, default: '' },
  platform: { type: String, enum: ['YouTube', 'Facebook', 'Instagram', 'X', 'TikTok'], default: 'YouTube' },
  imageUrl: { type: String, default: '' },
  youtubeUrl: { type: String, default: '' },
  sourceKey: { type: String, default: undefined },
  createdAt: { type: Date, default: Date.now }
});
videoSchema.index({ sourceKey: 1 }, { unique: true, sparse: true });
const Video = mongoose.model('Video', videoSchema);

// auto-fetch the channel's latest uploads into the Community video tab (set YOUTUBE_CHANNEL_ID in .env to change the channel, or to 'off' to stop)
const { createYouTubeSync } = require('./youtubeSync');
const YT_CHANNEL_ID = (process.env.YOUTUBE_CHANNEL_ID || 'UCdaZ-doFvqishXEdUl36LXg').trim();
const youtubeSync = createYouTubeSync({
  mongoose, Video,
  channelId: YT_CHANNEL_ID.toLowerCase() === 'off' ? '' : YT_CHANNEL_ID,
  intervalMs: (Number(process.env.YOUTUBE_SYNC_MINUTES) || 30) * 60 * 1000
});

// same for Instagram posts (needs INSTAGRAM_ACCESS_TOKEN in .env; without it this does nothing)
const { createInstagramSync } = require('./instagramSync');
const instagramSync = createInstagramSync({
  mongoose, Video,
  envToken: (process.env.INSTAGRAM_ACCESS_TOKEN || '').trim(),
  intervalMs: (Number(process.env.INSTAGRAM_SYNC_MINUTES) || 60) * 60 * 1000
});

// same for the Facebook Page (needs FACEBOOK_PAGE_ACCESS_TOKEN in .env; without it this does nothing)
const { createFacebookSync } = require('./facebookSync');
const facebookSync = createFacebookSync({
  mongoose, Video,
  token: (process.env.FACEBOOK_PAGE_ACCESS_TOKEN || '').trim(),
  pageId: (process.env.FACEBOOK_PAGE_ID || '').trim(),
  version: (process.env.META_GRAPH_API_VERSION || 'v26.0').trim(),
  intervalMs: (Number(process.env.FACEBOOK_SYNC_MINUTES) || 60) * 60 * 1000
});

// same for X (needs X_BEARER_TOKEN in .env; without it this does nothing). The X API is pay-per-use, so it checks every 3 hours by default
const { createXSync } = require('./xSync');
const xSync = createXSync({
  mongoose, Video,
  bearer: (process.env.X_BEARER_TOKEN || '').trim(),
  username: (process.env.X_USERNAME || 'NotJuanCastPH').trim().replace(/^@/, ''),
  userId: (process.env.X_USER_ID || '').trim(),
  intervalMs: (Number(process.env.X_SYNC_MINUTES) || 180) * 60 * 1000
});

// --- YOUTUBE VIDEO API ROUTES ---
app.get('/api/videos', async (req, res) => {
  try {
    youtubeSync.syncIfStale();
    instagramSync.syncIfStale();
    facebookSync.syncIfStale();
    xSync.syncIfStale();
    const platform = req.query.platform || 'YouTube';
    const allowedPlatforms = ['YouTube', 'Facebook', 'Instagram', 'X', 'TikTok'];
    if (platform !== 'all' && !allowedPlatforms.includes(platform)) {
      return res.status(400).json({ error: 'Invalid video platform' });
    }

    const filter = platform === 'all'
      ? {}
      : platform === 'YouTube'
        ? { $or: [{ platform: 'YouTube' }, { platform: { $exists: false } }, { platform: '' }] }
        : { platform };
    const videos = await Video.find(filter).sort({ createdAt: -1 });
    res.status(200).json(videos.map((video) => serializeImage(video.toObject())));
  } catch (error) {
    console.error('Error fetching videos:', error);
    res.status(500).json({ error: 'Failed to fetch videos' });
  }
});

// admin: check the YouTube channel right now (POST /api/videos/sync)
app.post('/api/videos/sync', requireAdmin, async (req, res) => {
  const result = await youtubeSync.sync();
  res.status(result.error ? 502 : 200).json(result);
});

// admin: check the Instagram account right now (POST /api/videos/sync-instagram)
app.post('/api/videos/sync-instagram', requireAdmin, async (req, res) => {
  const result = await instagramSync.sync();
  res.status(result.error ? 502 : 200).json(result);
});

// admin: check the Facebook Page right now (POST /api/videos/sync-facebook)
app.post('/api/videos/sync-facebook', requireAdmin, async (req, res) => {
  const result = await facebookSync.sync();
  res.status(result.error ? 502 : 200).json(result);
});

// admin: check the X account right now (POST /api/videos/sync-x)
app.post('/api/videos/sync-x', requireAdmin, async (req, res) => {
  const result = await xSync.sync();
  res.status(result.error ? 502 : 200).json(result);
});

app.post('/api/videos', requireAdmin, upload.single('image'), async (req, res) => {
  try {
    const { title, subtitle, group, platform, youtubeUrl } = req.body;
    const newVideo = await Video.create({
      title,
      subtitle: subtitle || '',
      group: group || '',
      platform: platform || 'YouTube',
      youtubeUrl: youtubeUrl || '',
      imageUrl: normalizeImageUrl(req.file ? `/uploads/${req.file.filename}` : ''),
    });
    res.status(201).json(serializeImage(newVideo.toObject()));
  } catch (error) {
    console.error('Error creating video:', error);
    res.status(500).json({ error: 'Failed to create video' });
  }
});

app.put('/api/videos/:id', requireAdmin, upload.single('image'), async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) return res.status(404).json({ message: 'Video not found.' });

    video.title = req.body.title ?? video.title;
    video.subtitle = req.body.subtitle ?? video.subtitle;
    video.group = req.body.group ?? video.group;
    video.platform = req.body.platform ?? video.platform;
    video.youtubeUrl = req.body.youtubeUrl ?? video.youtubeUrl;
    if (req.file) video.imageUrl = normalizeImageUrl(`/uploads/${req.file.filename}`);

    await video.save();
    res.status(200).json(serializeImage(video.toObject()));
  } catch (error) {
    console.error('Error updating video:', error);
    res.status(500).json({ error: 'Failed to update video' });
  }
});

// DELETE: remove a Content/video (admin only)
app.delete('/api/videos/:id', requireAdmin, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid video ID.' });
    const deleted = await Video.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Video not found.' });
    await youtubeSync.skipSource(deleted.sourceKey); // an auto-imported video stays deleted
    res.status(200).json({ message: 'Video deleted successfully.' });
  } catch (error) {
    console.error('Error deleting video:', error);
    res.status(500).json({ message: 'Failed to delete video.' });
  }
});

// --- FANBASE (artist communities: Your Artists / Explore / artist board) ---
const fanbaseSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  bio: { type: String, default: '', trim: true, maxlength: 500 },   // shown on the fanbase's About tab
  imageUrl: { type: String, default: '' },     // banner
  avatarUrl: { type: String, default: '' },    // circle on the Fanbase page
  price: { type: Number, default: 500, min: 0 },            // Php per month
  subscriberCount: { type: Number, default: 0, min: 0 },
  featured: { type: Boolean, default: false },              // its latest post is the "Featured Artist" post
  ownerEmail: { type: String, default: '', index: true },   // legacy single-artist owner, retained for existing fanbases
  memberEmails: { type: [String], default: [] },             // artists in this group fanbase
  socialLinks: {
    instagram: { type: String, default: '' },
    tiktok: { type: String, default: '' },
    x: { type: String, default: '' },
    youtube: { type: String, default: '' },
    spotify: { type: String, default: '' },
    appleMusic: { type: String, default: '' },
    facebook: { type: String, default: '' },
    threads: { type: String, default: '' }
  },
  createdAt: { type: Date, default: Date.now }
});
const Fanbase = mongoose.model('Fanbase', fanbaseSchema);

const fanbasePostSchema = new mongoose.Schema({
  fanbaseId: { type: String, required: true, index: true },
  authorName: { type: String, required: true, trim: true },
  authorAvatarUrl: { type: String, default: '' },
  verified: { type: Boolean, default: true },
  text: { type: String, default: '' },
  imageUrl: { type: String, default: '' },
  likes: { type: Number, default: 0, min: 0 },
  comments: { type: Number, default: 0, min: 0 },
  postedAt: { type: Date, default: Date.now }
});
const FanbasePost = mongoose.model('FanbasePost', fanbasePostSchema);

const fanbaseUpload = upload.fields([{ name: 'image', maxCount: 1 }, { name: 'avatar', maxCount: 1 }]);
const fanbasePostUpload = upload.fields([{ name: 'image', maxCount: 1 }, { name: 'authorAvatar', maxCount: 1 }]);
const FANBASE_SOCIAL_KEYS = ['instagram', 'tiktok', 'x', 'youtube', 'spotify', 'appleMusic', 'facebook', 'threads'];
const PROFILE_LINK_KEYS = ['instagram', 'facebook', 'tiktok', 'x', 'youtube', 'threads', 'spotify', 'appleMusic', 'website'];
const uploadedUrl = (req, field) => {
  const file = req.files?.[field]?.[0];
  return file ? normalizeImageUrl(`/uploads/${file.filename}`) : null;
};
const toBool = (value, fallback = false) => (value === undefined ? fallback : value === true || ['true', 'yes', '1', 'on'].includes(String(value).toLowerCase()));
const toCount = (value, fallback = 0) => {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};
const serializeFanbase = (doc) => {
  const { ownerEmail, memberEmails, ...item } = doc.toObject ? doc.toObject() : doc;
  return { ...item, imageUrl: normalizeImageUrl(item.imageUrl), avatarUrl: normalizeImageUrl(item.avatarUrl), hasOwner: Boolean(ownerEmail) };
};
const serializeFanbasePost = (doc) => {
  const item = doc.toObject ? doc.toObject() : doc;
  return { ...item, imageUrl: normalizeImageUrl(item.imageUrl), authorAvatarUrl: normalizeImageUrl(item.authorAvatarUrl) };
};
const parseFanbaseMembers = async (value) => {
  let emails;
  try {
    emails = typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    return { error: 'Choose one or more valid artist profiles.' };
  }
  if (!Array.isArray(emails)) return { error: 'Choose one or more valid artist profiles.' };
  const uniqueEmails = [...new Set(emails.map(normalizeEmail).filter(Boolean))];
  const members = await Promise.all(uniqueEmails.map(findArtistOwner));
  if (members.some((member) => !member)) return { error: 'Every fanbase member must be an existing artist account.' };
  return { emails: members.map(({ profile }) => normalizeEmail(profile.email)) };
};
// Validates a { platform: url } object. Links may be typed without "https://"; only http(s) links are kept.
const parseSocialLinks = (value, keys = FANBASE_SOCIAL_KEYS) => {
  let submitted = value;
  try {
    if (typeof value === 'string') submitted = JSON.parse(value);
  } catch {
    return { error: 'Social links must be valid.' };
  }
  if (!submitted || typeof submitted !== 'object' || Array.isArray(submitted)) return { error: 'Social links must be valid.' };
  const links = {};
  for (const key of keys) {
    let url = String(submitted[key] || '').trim().slice(0, 300);
    if (!url) { links[key] = ''; continue; }
    if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) url = `https://${url}`;
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname.includes('.')) return { error: `Enter a valid ${key} link.` };
    } catch {
      return { error: `Enter a valid ${key} link.` };
    }
    links[key] = url;
  }
  return { links };
};
const parseFanbaseSocialLinks = (value) => parseSocialLinks(value, FANBASE_SOCIAL_KEYS);
const linksOf = (profile) => Object.fromEntries(PROFILE_LINK_KEYS.map((key) => [key, profile?.socialLinks?.[key] || '']));
const dropOtherFeatured = (keepId) => Fanbase.updateMany({ _id: { $ne: keepId }, featured: true }, { $set: { featured: false } });

// everything on the Fanbase landing page
app.get('/api/fanbases', async (req, res) => {
  try {
    const list = await Fanbase.find().sort({ createdAt: 1 });
    res.status(200).json(list.map(serializeFanbase));
  } catch (error) {
    console.error('Error fetching fanbases:', error);
    res.status(500).json({ message: 'Failed to load fanbases.' });
  }
});

app.get('/api/admin/fanbases', requireAdmin, async (req, res) => {
  try {
    const [fanbases, artistUsers] = await Promise.all([
      Fanbase.find().sort({ createdAt: 1 }),
      User.find({ role: 'artist' }).select('email role isAdmin').sort({ email: 1 })
    ]);
    const artists = artistUsers.filter((artist) => resolveRole(artist) === 'artist');
    const artistEmails = new Set(artists.map((artist) => normalizeEmail(artist.email)));
    const profiles = await Promise.all(artists.map((artist) => findProfileByEmail(artist.email)));
    res.status(200).json({
      fanbases: fanbases.map((fanbase) => {
        const memberEmails = [...new Set([...(fanbase.memberEmails || []), ...(fanbase.ownerEmail ? [fanbase.ownerEmail] : [])]
          .map(normalizeEmail).filter((email) => artistEmails.has(email)))];
        return {
          ...serializeFanbase(fanbase),
          ownerEmail: fanbase.ownerEmail || '',
          memberEmails,
          hasOwner: memberEmails.length > 0
        };
      }),
      artists: profiles.filter(Boolean).map((profile) => ({
        email: normalizeEmail(profile.email),
        name: profile.fullName || profile.username,
        username: profile.username,
        avatar: normalizeImageUrl(profile.avatar || ''),
        bio: profile.bio || ''
      }))
    });
  } catch (error) {
    console.error('Error fetching admin fanbases:', error);
    res.status(500).json({ message: 'Failed to load fanbase management data.' });
  }
});

app.post('/api/fanbases', requireAdmin, fanbaseUpload, async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const price = Number(req.body.price ?? 500);
    if (!name || name.length > 60) return res.status(400).json({ message: 'Fanbase names must be between 1 and 60 characters.' });
    if (!Number.isFinite(price) || price < 0 || price > 100000) return res.status(400).json({ message: 'Enter a monthly price between 0 and 100,000.' });
    const membership = await parseFanbaseMembers(req.body.memberEmails);
    if (membership.error) return res.status(400).json({ message: membership.error });
    const socialLinks = parseFanbaseSocialLinks(req.body.socialLinks);
    if (socialLinks.error) return res.status(400).json({ message: socialLinks.error });
    const bio = String(req.body.bio || '').trim();
    if (bio.length > 500) return res.status(400).json({ message: 'The bio can be up to 500 characters.' });

    const fanbase = await Fanbase.create({
      name,
      bio,
      price: Math.round(price),
      memberEmails: membership.emails,
      socialLinks: socialLinks.links,
      imageUrl: uploadedUrl(req, 'image') || '',
      avatarUrl: uploadedUrl(req, 'avatar') || ''
    });
    res.status(201).json(serializeFanbase(fanbase));
  } catch (error) {
    console.error('Error creating fanbase:', error);
    res.status(500).json({ message: 'Failed to create fanbase.' });
  }
});

app.put('/api/fanbases/:id', requireAdmin, fanbaseUpload, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid fanbase ID.' });
    const fanbase = await Fanbase.findById(req.params.id);
    if (!fanbase) return res.status(404).json({ message: 'Fanbase not found.' });

    const name = String(req.body.name ?? fanbase.name).trim();
    const price = Number(req.body.price ?? fanbase.price);
    if (!name || name.length > 60) return res.status(400).json({ message: 'Fanbase names must be between 1 and 60 characters.' });
    if (!Number.isFinite(price) || price < 0 || price > 100000) return res.status(400).json({ message: 'Enter a monthly price between 0 and 100,000.' });
    const membership = await parseFanbaseMembers(req.body.memberEmails === undefined
      ? [...(fanbase.memberEmails || []), ...(fanbase.ownerEmail ? [fanbase.ownerEmail] : [])]
      : req.body.memberEmails);
    if (membership.error) return res.status(400).json({ message: membership.error });
    const socialLinks = parseFanbaseSocialLinks(req.body.socialLinks === undefined ? fanbase.socialLinks : req.body.socialLinks);
    if (socialLinks.error) return res.status(400).json({ message: socialLinks.error });

    if (req.body.bio !== undefined) {
      const bio = String(req.body.bio).trim();
      if (bio.length > 500) return res.status(400).json({ message: 'The bio can be up to 500 characters.' });
      fanbase.bio = bio;
    }

    fanbase.name = name;
    fanbase.price = Math.round(price);
    fanbase.memberEmails = membership.emails;
    fanbase.ownerEmail = '';
    fanbase.socialLinks = socialLinks.links;
    const imageUrl = uploadedUrl(req, 'image');
    const avatarUrl = uploadedUrl(req, 'avatar');
    if (imageUrl) {
      if (fanbase.imageUrl) removeStoredImage(fanbase.imageUrl);
      fanbase.imageUrl = imageUrl;
    }
    if (avatarUrl) {
      if (fanbase.avatarUrl) removeStoredImage(fanbase.avatarUrl);
      fanbase.avatarUrl = avatarUrl;
    }
    await fanbase.save();
    res.status(200).json(serializeFanbase(fanbase));
  } catch (error) {
    console.error('Error updating fanbase:', error);
    res.status(500).json({ message: 'Failed to update fanbase.' });
  }
});

// the "Featured Artist" post: latest post of the featured fanbase (or the latest post anywhere)
app.get('/api/fanbases/featured', async (req, res) => {
  try {
    const featured = await Fanbase.findOne({ featured: true });
    const allFanbases = await Fanbase.find().sort({ createdAt: 1 });
    const posts = (await Promise.all(allFanbases.map(getFanbaseBoardPosts))).flat()
      .sort((a, b) => new Date(b.postedAt) - new Date(a.postedAt));
    const post = (featured && posts.find((item) => item.fanbaseId === String(featured._id))) || posts[0];
    if (!post) return res.status(200).json({ post: null, fanbase: null });
    const fanbase = allFanbases.find((item) => String(item._id) === post.fanbaseId);
    res.status(200).json({ post, fanbase: fanbase ? serializeFanbase(fanbase) : null });
  } catch (error) {
    console.error('Error fetching featured fanbase post:', error);
    res.status(500).json({ message: 'Failed to load the featured post.' });
  }
});

// one artist's board. Without a subscription only the newest post comes back (the rest is locked on the client).
app.get('/api/fanbases/:id/board', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid fanbase ID.' });
    const fanbase = await Fanbase.findById(req.params.id);
    if (!fanbase) return res.status(404).json({ message: 'Fanbase not found.' });

    const email = normalizeEmail(req.query.email || '');
    const profile = email ? await Profile.findOne({ email: { $regex: `^${escapeRegex(email)}$`, $options: 'i' } }) : null;
    const unlocked = Boolean(profile) && (resolveAdminStatus(profile) || (profile.fanbaseSubscriptions || []).includes(String(fanbase._id)));

    const [posts, members] = await Promise.all([getFanbaseBoardPosts(fanbase), getFanbaseMemberProfiles(fanbase)]);
    const shown = unlocked ? posts : posts.slice(0, 1);
    res.status(200).json({
      fanbase: serializeFanbase(fanbase),
      locked: !unlocked,
      total: posts.length,
      posts: shown,
      members
    });
  } catch (error) {
    console.error('Error loading fanbase board:', error);
    res.status(500).json({ message: 'Failed to load the board.' });
  }
});

// DEV ONLY: subscribe / unsubscribe an account to a fanbase while payments are not live (used from the browser console).
// It only answers requests that come from this same computer, so it does nothing on a deployed server.
const isLocalRequest = (req) => {
  if (req.headers['x-forwarded-for']) return false;
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket?.remoteAddress);
};
app.put('/api/dev/fanbase-subscription', async (req, res) => {
  try {
    if (!isLocalRequest(req)) return res.status(404).json({ message: 'Not found.' });
    const email = normalizeEmail(req.body.email || '');
    const fanbaseId = String(req.body.fanbaseId || '');
    const subscribed = toBool(req.body.subscribed, true);
    if (!email || !mongoose.isValidObjectId(fanbaseId)) return res.status(400).json({ message: 'Send { email, fanbaseId, subscribed }.' });
    const [profile, fanbase] = await Promise.all([findProfileByEmail(email), Fanbase.findById(fanbaseId)]);
    if (!profile) return res.status(404).json({ message: 'User profile not found.' });
    if (!fanbase) return res.status(404).json({ message: 'Fanbase not found.' });

    const had = (profile.fanbaseSubscriptions || []).includes(fanbaseId);
    if (subscribed && !had) {
      profile.fanbaseSubscriptions = [...(profile.fanbaseSubscriptions || []), fanbaseId];
      fanbase.subscriberCount = (fanbase.subscriberCount || 0) + 1;
    } else if (!subscribed && had) {
      profile.fanbaseSubscriptions = profile.fanbaseSubscriptions.filter((id) => id !== fanbaseId);
      fanbase.subscriberCount = Math.max(0, (fanbase.subscriberCount || 0) - 1);
    }
    await Promise.all([profile.save(), fanbase.save()]);
    res.status(200).json({ email: profile.email, fanbase: fanbase.name, subscribed: (profile.fanbaseSubscriptions || []).includes(fanbaseId), subscriberCount: fanbase.subscriberCount });
  } catch (error) {
    console.error('Dev subscription error:', error);
    res.status(500).json({ message: 'Failed to change the subscription.' });
  }
});

// the user's "Your Artists" row
app.get('/api/users/fanbases', async (req, res) => {
  try {
    const email = normalizeEmail(req.query.email || '');
    if (!email) return res.status(400).json({ message: 'Email is required.' });
    const profile = await Profile.findOne({ email: { $regex: `^${escapeRegex(email)}$`, $options: 'i' } });
    if (!profile) return res.status(404).json({ message: 'User profile not found.' });
    res.status(200).json({ ids: profile.fanbases || [] });
  } catch (error) {
    console.error('Error loading Your Artists:', error);
    res.status(500).json({ message: 'Failed to load your artists.' });
  }
});

app.put('/api/users/fanbases', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email || '');
    if (!email) return res.status(400).json({ message: 'Email is required.' });
    const wanted = [...new Set((Array.isArray(req.body.ids) ? req.body.ids : []).map(String))].filter((id) => mongoose.isValidObjectId(id));
    if (wanted.length > 12) return res.status(400).json({ message: 'You can pick up to 12 artists.' });
    const real = await Fanbase.find({ _id: { $in: wanted } }).select('_id');
    const known = new Set(real.map((f) => String(f._id)));
    const ids = wanted.filter((id) => known.has(id));
    const profile = await Profile.findOneAndUpdate(
      { email: { $regex: `^${escapeRegex(email)}$`, $options: 'i' } },
      { $set: { fanbases: ids } },
      { new: true }
    );
    if (!profile) return res.status(404).json({ message: 'User profile not found.' });
    res.status(200).json({ ids: profile.fanbases });
  } catch (error) {
    console.error('Error saving Your Artists:', error);
    res.status(500).json({ message: 'Failed to save your artists.' });
  }
});

// ---- fanbases belong to their artist ----
app.put('/api/fanbases/:id/featured', requireAdmin, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid fanbase ID.' });
    const fanbase = await Fanbase.findById(req.params.id);
    if (!fanbase) return res.status(404).json({ message: 'Fanbase not found.' });
    fanbase.featured = toBool(req.body.featured);
    await fanbase.save();
    if (fanbase.featured) await dropOtherFeatured(fanbase._id);
    res.status(200).json(serializeFanbase(fanbase));
  } catch (error) {
    console.error('Error featuring fanbase:', error);
    res.status(500).json({ message: 'Failed to update the featured artist.' });
  }
});

app.delete('/api/fanbases/:id', requireAdmin, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid fanbase ID.' });
    const deleted = await Fanbase.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Fanbase not found.' });
    await FanbasePost.deleteMany({ fanbaseId: String(deleted._id) });
    await Profile.updateMany({}, { $pull: { fanbases: String(deleted._id), fanbaseSubscriptions: String(deleted._id) } });
    res.status(200).json({ message: 'Fanbase deleted.' });
  } catch (error) {
    console.error('Error deleting fanbase:', error);
    res.status(500).json({ message: 'Failed to delete fanbase.' });
  }
});

// ---- admin: board posts ----
app.get('/api/fanbase-posts', requireAdmin, async (req, res) => {
  try {
    const fanbases = await Fanbase.find();
    const posts = (await Promise.all(fanbases.map(getFanbaseBoardPosts))).flat()
      .sort((a, b) => new Date(b.postedAt) - new Date(a.postedAt));
    res.status(200).json(posts);
  } catch (error) {
    console.error('Error fetching fanbase posts:', error);
    res.status(500).json({ message: 'Failed to load posts.' });
  }
});

app.delete('/api/fanbase-posts/:id', requireAdmin, async (req, res) => {
  try {
    const source = String(req.query.source || 'fanbase');
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid post ID.' });
    if (source === 'artist') {
      const deleted = await ArtistPost.findByIdAndDelete(req.params.id);
      if (!deleted) return res.status(404).json({ message: 'Post not found.' });
      removePostImages(deleted);
    } else if (source === 'fanbase') {
      const deleted = await FanbasePost.findByIdAndDelete(req.params.id);
      if (!deleted) return res.status(404).json({ message: 'Post not found.' });
    } else {
      return res.status(400).json({ message: 'Invalid post source.' });
    }
    res.status(200).json({ message: 'Post deleted.' });
  } catch (error) {
    console.error('Error deleting fanbase post:', error);
    res.status(500).json({ message: 'Failed to delete post.' });
  }
});

// --- ARTIST PROFILES: cover photo, bio and posts ---
// Only accounts with the "artist" role can post or edit; everyone can read. Set the role from the admin Accounts tab.
const imageUpload = multer({
  storage: dbStorage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => (/^image\//.test(file.mimetype || '') ? cb(null, true) : cb(new Error('Only image files are allowed.')))
});
// turns a multer/image error into a normal JSON message
const withImage = (field) => (req, res, next) => imageUpload.single(field)(req, res, (err) => {
  if (!err) return next();
  res.status(400).json({ message: err.code === 'LIMIT_FILE_SIZE' ? 'That image is too big (max 8 MB).' : (err.message || 'Upload failed.') });
});

// up to MAX_POST_PHOTOS photos per post (field "images"; the old single "image" field still works)
const MAX_POST_PHOTOS = 10;
const postImagesUpload = multer({
  storage: dbStorage,
  limits: { fileSize: 8 * 1024 * 1024, files: MAX_POST_PHOTOS },
  fileFilter: (req, file, cb) => (/^image\//.test(file.mimetype || '') ? cb(null, true) : cb(new Error('Only image files are allowed.')))
}).fields([{ name: 'images', maxCount: MAX_POST_PHOTOS }, { name: 'image', maxCount: 1 }]);
const withImages = (req, res, next) => postImagesUpload(req, res, (err) => {
  if (!err) return next();
  const message = err.code === 'LIMIT_FILE_SIZE' ? 'One of those images is too big (max 8 MB each).'
    : (err.code === 'LIMIT_UNEXPECTED_FILE' || err.code === 'LIMIT_FILE_COUNT') ? `You can add up to ${MAX_POST_PHOTOS} photos per post.`
    : (err.message || 'Upload failed.');
  res.status(400).json({ message });
});
// every photo of a post, in order. Older posts only have imageUrl, so they read as a one-photo post.
const postPhotos = (item) => {
  const list = Array.isArray(item.images) && item.images.length ? item.images : (item.imageUrl ? [item.imageUrl] : []);
  return list.filter(Boolean).map((url) => normalizeImageUrl(url));
};

const artistPostSchema = new mongoose.Schema({
  artistEmail: { type: String, required: true, index: true },   // owner (stable even if the @username changes)
  text: { type: String, default: '', maxlength: 2000 },
  imageUrl: { type: String, default: '' },                      // first photo (kept so older code and posts keep working)
  images: { type: [String], default: [] },                      // all photos, in order (up to 10)
  likes: { type: [String], default: [] },                       // @handles
  replies: [{
    user: String,
    avatar: String,
    text: String,
    createdAt: { type: Date, default: Date.now }
  }],
  createdAt: { type: Date, default: Date.now }
});
const ArtistPost = mongoose.model('ArtistPost', artistPostSchema);

const findProfileByEmail = (email) => Profile.findOne({ email: { $regex: `^${escapeRegex(normalizeEmail(email))}$`, $options: 'i' } });
const findArtistOwner = async (email) => {
  const user = await User.findOne({ email: { $regex: `^${escapeRegex(normalizeEmail(email))}$`, $options: 'i' } });
  if (!user || resolveRole(user) !== 'artist') return null;
  const profile = await findProfileByEmail(user.email);
  return profile ? { user, profile } : null;
};
const removeStoredImage = (url) => {
  const name = path.basename(String(url || ''));
  if (name) unlinkUpload(path.join(uploadDir, name));
};

const serializeArtistPost = (doc, artist) => {
  const item = doc.toObject ? doc.toObject() : doc;
  return {
    _id: item._id,
    user: `@${artist.username}`,
    avatar: artist.avatar || '',
    text: item.text || '',
    images: postPhotos(item),
    imageUrl: postPhotos(item)[0] || '',
    likes: item.likes || [],
    replies: item.replies || [],
    createdAt: item.createdAt
  };
};

// every stored file of a post (new multi-photo posts and old single-photo posts)
const removePostImages = (post) => {
  const urls = new Set([...(post.images || []), post.imageUrl].filter(Boolean));
  urls.forEach(removeStoredImage);
};

// the name shown on an artist's posts: their full name, or their @username if they have none
const artistDisplayName = (artist) => String(artist?.fullName || artist?.username || 'Artist').trim();

const getFanbaseBoardPosts = async (fanbase) => {
  const fanbaseId = String(fanbase._id);
  const [boardPosts, artists] = await Promise.all([
    FanbasePost.find({ fanbaseId }).sort({ postedAt: -1 }),
    getFanbaseMemberProfiles(fanbase)
  ]);
  const authoredPosts = await ArtistPost.find({
    artistEmail: { $in: artists.map((artist) => normalizeEmail(artist.email)) }
  }).sort({ createdAt: -1 });
  const artistByEmail = new Map(artists.map((artist) => [normalizeEmail(artist.email), artist]));
  return [
    ...boardPosts.map((post) => {
      const item = serializeFanbasePost(post);
      return { ...item, images: item.imageUrl ? [item.imageUrl] : [], source: 'fanbase' };
    }),
    ...authoredPosts.map((post) => {
      const item = post.toObject();
      const artist = artistByEmail.get(normalizeEmail(item.artistEmail));
      return {
        _id: `artist-${item._id}`,
        source: 'artist',
        sourceId: String(item._id),
        fanbaseId,
        authorName: artistDisplayName(artist),
        authorUsername: artist.username || '',
        authorAvatarUrl: normalizeImageUrl(artist.avatar || ''),
        verified: true,
        text: item.text || '',
        images: postPhotos(item),
        imageUrl: postPhotos(item)[0] || '',
        likes: (item.likes || []).length,
        comments: (item.replies || []).length,
        postedAt: item.createdAt
      };
    })
  ].sort((a, b) => new Date(b.postedAt) - new Date(a.postedAt));
};

const getFanbaseMemberProfiles = async (fanbase) => {
  const emails = [...new Set([...(fanbase.memberEmails || []), ...(fanbase.ownerEmail ? [fanbase.ownerEmail] : [])].map(normalizeEmail))];
  const members = await Promise.all(emails.map(findArtistOwner));
  return members.filter(Boolean).map(({ profile }) => ({
    email: normalizeEmail(profile.email),
    username: profile.username,
    name: profile.fullName || profile.username,
    avatar: normalizeImageUrl(profile.avatar || ''),
    bio: profile.bio || ''
  }));
};

// Which fanbases an artist belongs to (as a member or legacy owner)
const getArtistFanbases = (artistEmail) => {
  const email = normalizeEmail(artistEmail);
  return Fanbase.find({ $or: [{ memberEmails: email }, { ownerEmail: email }] }).sort({ createdAt: 1 });
};

// every post by one artist, newest first.
// If the artist is part of a fanbase, visitors who are not subscribed (and are not the artist or an admin) only get the newest
// post; the rest stay on the server, so they cannot be read from the browser. The reply also says how many are locked.
app.get('/api/artists/:username/posts', async (req, res) => {
  try {
    const artist = await Profile.findOne({ username: { $regex: `^${escapeRegex(String(req.params.username).replace(/^@/, ''))}$`, $options: 'i' } });
    if (!artist) return res.status(404).json({ message: 'Artist not found.' });
    const artistEmail = normalizeEmail(artist.email);
    const [posts, fanbases] = await Promise.all([
      ArtistPost.find({ artistEmail }).sort({ createdAt: -1 }),
      getArtistFanbases(artistEmail)
    ]);

    const viewerEmail = normalizeEmail(req.query.email || '');
    const viewer = viewerEmail ? await findProfileByEmail(viewerEmail) : null;
    const isSelf = Boolean(viewer) && normalizeEmail(viewer.email) === artistEmail;
    const subscribedTo = new Set((viewer?.fanbaseSubscriptions || []).map(String));
    const subscribed = fanbases.some((fanbase) => subscribedTo.has(String(fanbase._id)));
    const gated = fanbases.length > 0;
    const unlocked = !gated || isSelf || subscribed || Boolean(viewer && resolveAdminStatus(viewer));

    const shown = unlocked ? posts : posts.slice(0, 1);
    const target = fanbases[0] || null;
    res.status(200).json({
      posts: shown.map((post) => serializeArtistPost(post, artist)),
      locked: !unlocked,
      total: posts.length,
      fanbase: target ? { _id: String(target._id), name: target.name, price: target.price } : null
    });
  } catch (error) {
    console.error('Error loading artist posts:', error);
    res.status(500).json({ message: 'Failed to load posts.' });
  }
});

// artist: change own cover photo / bio
app.put('/api/artist/profile', requireArtist, withImage('cover'), async (req, res) => {
  try {
    const profile = req.artistProfile;
    if (req.body.bio !== undefined) {
      const bio = String(req.body.bio).trim();
      if (bio.length > 300) return res.status(400).json({ message: 'Bio can be up to 300 characters.' });
      profile.bio = bio;
    }
    if (req.body.socialLinks !== undefined) {
      const parsed = parseSocialLinks(req.body.socialLinks, PROFILE_LINK_KEYS);
      if (parsed.error) return res.status(400).json({ message: parsed.error });
      profile.socialLinks = parsed.links;
    }
    if (req.file) {
      if (profile.coverPhoto) removeStoredImage(profile.coverPhoto);
      profile.coverPhoto = `/uploads/${req.file.filename}`;
    } else if (toBool(req.body.removeCover)) {
      if (profile.coverPhoto) removeStoredImage(profile.coverPhoto);
      profile.coverPhoto = '';
    }
    await profile.save();
    res.status(200).json({ coverPhoto: normalizeImageUrl(profile.coverPhoto || ''), bio: profile.bio || '', socialLinks: linksOf(profile) });
  } catch (error) {
    console.error('Error updating artist profile:', error);
    res.status(500).json({ message: 'Failed to update your artist profile.' });
  }
});

// artist: publish a post (text and/or up to 10 photos)
app.post('/api/artist/posts', requireArtist, withImages, async (req, res) => {
  const files = [...(req.files?.images || []), ...(req.files?.image || [])].slice(0, MAX_POST_PHOTOS);
  const images = files.map((file) => `/uploads/${file.filename}`);
  const discardUploads = () => images.forEach(removeStoredImage);
  try {
    const text = String(req.body.text || '').trim();
    if (text.length > 2000) { discardUploads(); return res.status(400).json({ message: 'Posts can be up to 2000 characters.' }); }
    if (!text && !images.length) return res.status(400).json({ message: 'Add some text or a photo.' });
    const created = await ArtistPost.create({ artistEmail: normalizeEmail(req.artistProfile.email), text, images, imageUrl: images[0] || '' });
    res.status(201).json(serializeArtistPost(created, req.artistProfile));
  } catch (error) {
    console.error('Error creating artist post:', error);
    discardUploads();
    res.status(500).json({ message: 'Failed to publish your post.' });
  }
});

// artist: delete one of their own posts
app.delete('/api/artist/posts/:id', requireArtist, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid post ID.' });
    const post = await ArtistPost.findOne({ _id: req.params.id, artistEmail: normalizeEmail(req.artistProfile.email) });
    if (!post) return res.status(404).json({ message: 'Post not found.' });
    removePostImages(post);
    await post.deleteOne();
    res.status(200).json({ message: 'Post deleted.' });
  } catch (error) {
    console.error('Error deleting artist post:', error);
    res.status(500).json({ message: 'Failed to delete the post.' });
  }
});

// Artists no longer run their own fanbase. Admins create fanbases and add artists as members (Admin > Fanbases);
// a member's posts show on that fanbase's board automatically.

// fans: like / reply (same trust level as the community posts: the app sends the signed-in email)
app.put('/api/artist-posts/:id/like', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid post ID.' });
    const [post, fan] = await Promise.all([ArtistPost.findById(req.params.id), findProfileByEmail(req.body.email || '')]);
    if (!post) return res.status(404).json({ message: 'Post not found.' });
    if (!fan) return res.status(400).json({ message: 'A signed-in user is required.' });
    const handle = `@${fan.username}`;
    post.likes = post.likes.includes(handle) ? post.likes.filter((h) => h !== handle) : [...post.likes, handle];
    await post.save();
    res.status(200).json({ likes: post.likes });
  } catch (error) {
    console.error('Error liking artist post:', error);
    res.status(500).json({ message: 'Failed to update your like.' });
  }
});

app.post('/api/artist-posts/:id/reply', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid post ID.' });
    const text = String(req.body.text || '').trim();
    if (!text) return res.status(400).json({ message: 'Reply cannot be empty.' });
    if (text.length > 500) return res.status(400).json({ message: 'Replies can be up to 500 characters.' });
    const [post, fan] = await Promise.all([ArtistPost.findById(req.params.id), findProfileByEmail(req.body.email || '')]);
    if (!post) return res.status(404).json({ message: 'Post not found.' });
    if (!fan) return res.status(400).json({ message: 'A signed-in user is required.' });
    post.replies.push({ user: `@${fan.username}`, avatar: fan.avatar || '', text });
    await post.save();
    res.status(200).json({ replies: post.replies });
  } catch (error) {
    console.error('Error replying to artist post:', error);
    res.status(500).json({ message: 'Failed to send your reply.' });
  }
});

// --- BANNER SCHEMA ---
const bannerSchema = new mongoose.Schema({
  imageUrl: { type: String, required: true },
  linkUrl: { type: String, required: false },
  altText: { type: String, required: false, default: 'Promo Banner' },
  createdAt: { type: Date, default: Date.now }
});

const Banner = mongoose.model('Banner', bannerSchema);

// --- BANNER API ROUTES ---
// GET: Fetch all banners for the carousel
app.get('/api/banners', async (req, res) => {
  try {
    const banners = await Banner.find().sort({ createdAt: -1 });

    return res.status(200).json(banners.map((banner) => serializeImage(banner.toObject())));
  } catch (error) {
    console.error('Error fetching banners:', error);

    return res.status(500).json({
      message: 'Error fetching banners.'
    });
  }
});

// POST: Upload and save a new banner
app.post('/api/banners', requireAdmin, (req, res) => {
  upload.single('image')(req, res, async (uploadError) => {
    if (uploadError) {
      console.error('Banner upload error:', uploadError);

      return res.status(400).json({
        message: 'Failed to upload image.'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        message: 'Please select an image to upload.'
      });
    }

    try {
      const imageUrl = normalizeImageUrl(`/uploads/${req.file.filename}`);

      const newBanner = await Banner.create({
        imageUrl,
        linkUrl: req.body.linkUrl || '',
        altText: req.body.altText || 'Promo Banner'
      });

      return res.status(201).json(serializeImage(newBanner.toObject()));
    } catch (error) {
      console.error('Error saving banner:', error);

      unlinkUpload(req.file.path, (cleanupError) => {
        if (cleanupError) {
          console.error('Error removing unsaved image:', cleanupError);
        }
      });

      return res.status(500).json({
        message: 'Failed to save banner.'
      });
    }
  });
});

// DELETE: Remove a banner from Admin Dashboard
app.delete('/api/banners/:id', requireAdmin, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        message: 'Invalid banner ID.'
      });
    }

    const deletedBanner = await Banner.findByIdAndDelete(req.params.id);

    if (!deletedBanner) {
      return res.status(404).json({
        message: 'Banner not found.'
      });
    }

    return res.status(200).json({
      message: 'Banner deleted successfully.'
    });
  } catch (error) {
    console.error('Error deleting banner:', error);

    return res.status(500).json({
      message: 'Error deleting banner.'
    });
  }
});

// --- ADS (sidebar ads, e.g. the right-hand ad on the Market page) ---
// 'market' = tall side ad on the Market page (desktop web). 'startup' = popup shown when the home page opens.
const AD_PLACEMENTS = ['market', 'startup'];

const adSchema = new mongoose.Schema({
  imageUrl: { type: String, required: true },
  linkUrl: { type: String, default: '' },
  altText: { type: String, default: 'Advertisement' },
  placement: { type: String, enum: AD_PLACEMENTS, default: 'market', index: true },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

const Ad = mongoose.model('Ad', adSchema);

const imageOnly = (req, res, next) => {
  upload.single('image')(req, res, (uploadError) => {
    if (uploadError) {
      console.error('Ad upload error:', uploadError);
      return res.status(400).json({ message: 'Failed to upload image.' });
    }
    if (req.file && !/^image\//.test(req.file.mimetype || '')) {
      unlinkUpload(req.file.path, () => {});
      return res.status(400).json({ message: 'Only image files can be used as ads.' });
    }
    next();
  });
};

const cleanLink = (value = '') => {
  const link = String(value || '').trim();
  if (!link) return '';
  return /^https?:\/\//i.test(link) ? link : `https://${link}`;
};

const removeUploadedFile = async (imageUrl = '') => {
  if (!imageUrl.startsWith('/uploads/')) return;
  const stillUsed = await Ad.exists({ imageUrl });
  if (stillUsed) return;
  unlinkUpload(path.join(uploadDir, path.basename(imageUrl)));
};

// GET (public): active ads for a placement, oldest first so the rotation order matches upload order
app.get('/api/ads', async (req, res) => {
  try {
    const placement = AD_PLACEMENTS.includes(req.query.placement) ? req.query.placement : 'market';
    const ads = await Ad.find({ placement, active: true }).sort({ createdAt: 1 });
    return res.status(200).json(ads.map((ad) => serializeImage(ad.toObject())));
  } catch (error) {
    console.error('Error fetching ads:', error);
    return res.status(500).json({ message: 'Error fetching ads.' });
  }
});

// GET (admin): every ad, including paused ones
app.get('/api/ads/all', requireAdmin, async (req, res) => {
  try {
    const ads = await Ad.find().sort({ createdAt: 1 });
    return res.status(200).json(ads.map((ad) => serializeImage(ad.toObject())));
  } catch (error) {
    console.error('Error fetching all ads:', error);
    return res.status(500).json({ message: 'Error fetching ads.' });
  }
});

// POST (admin): upload a new ad
app.post('/api/ads', requireAdmin, imageOnly, async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Please select an image to upload.' });
  try {
    const ad = await Ad.create({
      imageUrl: normalizeImageUrl(`/uploads/${req.file.filename}`),
      linkUrl: cleanLink(req.body.linkUrl),
      altText: String(req.body.altText || '').trim() || 'Advertisement',
      placement: AD_PLACEMENTS.includes(req.body.placement) ? req.body.placement : 'market',
      active: req.body.active === undefined ? true : String(req.body.active) !== 'false'
    });
    return res.status(201).json(serializeImage(ad.toObject()));
  } catch (error) {
    console.error('Error saving ad:', error);
    unlinkUpload(req.file.path, () => {});
    return res.status(500).json({ message: 'Failed to save ad.' });
  }
});

// PUT (admin): edit link / alt text, pause or resume, or swap the image
app.put('/api/ads/:id', requireAdmin, imageOnly, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      if (req.file) unlinkUpload(req.file.path, () => {});
      return res.status(400).json({ message: 'Invalid ad ID.' });
    }
    const ad = await Ad.findById(req.params.id);
    if (!ad) {
      if (req.file) unlinkUpload(req.file.path, () => {});
      return res.status(404).json({ message: 'Ad not found.' });
    }

    const oldImage = ad.imageUrl;
    if (req.body.linkUrl !== undefined) ad.linkUrl = cleanLink(req.body.linkUrl);
    if (req.body.altText !== undefined) ad.altText = String(req.body.altText).trim() || 'Advertisement';
    if (req.body.active !== undefined) ad.active = String(req.body.active) !== 'false';
    if (req.file) ad.imageUrl = normalizeImageUrl(`/uploads/${req.file.filename}`);

    await ad.save();
    if (req.file && oldImage !== ad.imageUrl) await removeUploadedFile(oldImage);
    return res.status(200).json(serializeImage(ad.toObject()));
  } catch (error) {
    console.error('Error updating ad:', error);
    if (req.file) unlinkUpload(req.file.path, () => {});
    return res.status(500).json({ message: 'Failed to update ad.' });
  }
});

// DELETE (admin)
app.delete('/api/ads/:id', requireAdmin, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid ad ID.' });
    }
    const deleted = await Ad.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Ad not found.' });
    await removeUploadedFile(deleted.imageUrl);
    return res.status(200).json({ message: 'Ad deleted successfully.' });
  } catch (error) {
    console.error('Error deleting ad:', error);
    return res.status(500).json({ message: 'Error deleting ad.' });
  }
});

const reportSchema = new mongoose.Schema({
  subject: { type: String, required: true },
  issue: { type: String, required: true },
  fileUrl: { type: String, default: '' },
  reporterEmail: { type: String, default: '' },
  reporterUsername: { type: String, default: '' },
  messages: [{
    message: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
  }],
  resolved: { type: Boolean, default: false },
  resolvedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});

const Report = mongoose.model('Report', reportSchema);

// POST: Submit a new issue report
// Notice we use upload.single('file') to match the formData.append('file', ...) from React
app.post('/api/reports', upload.single('file'), async (req, res) => {
  try {
    const { subject, issue } = req.body;
    const reporterEmail = normalizeEmail(req.body.email || '');
    const reporter = reporterEmail
      ? await Profile.findOne({ email: { $regex: `^${escapeRegex(reporterEmail)}$`, $options: 'i' } }).select('username email')
      : null;

    if (!subject || !issue) {
      return res.status(400).json({ message: 'Subject and issue text are required.' });
    }
    if (reporterEmail && !reporter) {
      return res.status(404).json({ message: 'Reporter profile not found.' });
    }

    // Create the report in MongoDB
    const newReport = await Report.create({
      subject,
      issue,
      reporterEmail: reporter?.email || '',
      reporterUsername: reporter?.username || '',
      // If a file was uploaded, generate its URL using your existing normalizer. Otherwise, leave empty.
      fileUrl: normalizeImageUrl(req.file ? `/uploads/${req.file.filename}` : '')
    });

    res.status(201).json({ 
      message: 'Report submitted successfully', 
      report: newReport 
    });

  } catch (error) {
    console.error('Error saving report:', error);
    res.status(500).json({ message: 'Internal server error while saving report.' });
  }
});

app.put('/api/reports/:id/resolve', requireAdmin, async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);
    if (!report) return res.status(404).json({ message: 'Report not found.' });

    if (!report.resolved) {
      report.resolved = true;
      report.resolvedAt = new Date();
      await report.save();
    }

    const reporter = report.reporterUsername
      ? { username: report.reporterUsername }
      : report.reporterEmail
        ? await Profile.findOne({
          email: { $regex: `^${escapeRegex(normalizeEmail(report.reporterEmail))}$`, $options: 'i' }
        }).select('username')
        : null;

    if (reporter?.username) {
      const recipient = normalizeHandle(reporter.username);
      await Notification.findOneAndUpdate(
        { recipient, type: 'mail', sourceId: `report:${report._id}:resolved` },
        {
          $set: {
            actor: 'JuanCast',
            subject: `Your report was resolved: ${report.subject}`,
            preview: 'The issue you reported has been marked as resolved. Thank you for helping us improve JuanCast.',
            isRead: false
          },
          $setOnInsert: {
            recipient,
            type: 'mail',
            sourceId: `report:${report._id}:resolved`
          }
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );
    }

    res.status(200).json({ message: 'Report resolved and reporter notified.', report });
  } catch (error) {
    console.error('Error resolving report:', error);
    res.status(500).json({ message: 'Failed to resolve report.' });
  }
});

app.post('/api/reports/:id/messages', requireAdmin, async (req, res) => {
  try {
    const message = typeof req.body.message === 'string' ? req.body.message.trim() : '';
    if (!message) return res.status(400).json({ message: 'A message is required.' });
    if (message.length > 2000) return res.status(400).json({ message: 'Message must be 2,000 characters or fewer.' });

    const report = await Report.findById(req.params.id);
    if (!report) return res.status(404).json({ message: 'Report not found.' });

    const reporter = report.reporterUsername
      ? { username: report.reporterUsername }
      : report.reporterEmail
        ? await Profile.findOne({
          email: { $regex: `^${escapeRegex(normalizeEmail(report.reporterEmail))}$`, $options: 'i' }
        }).select('username')
        : null;
    if (!reporter?.username) {
      return res.status(400).json({ message: 'This report is not linked to a user account, so a Mail message cannot be delivered.' });
    }

    const reportMessage = { message, createdAt: new Date() };
    report.messages.push(reportMessage);
    await report.save();

    const recipient = normalizeHandle(reporter.username);
    const savedMessage = report.messages[report.messages.length - 1];
    const notification = await Notification.create({
      recipient,
        actor: 'JuanCast',
        type: 'mail',
      sourceId: `report:${report._id}:message:${savedMessage._id}`,
      subject: `A message about your report: ${report.subject}`,
      preview: message
    });

    res.status(201).json({ message: 'Message sent to the reporter.', report, notification });
  } catch (error) {
    console.error('Error messaging report submitter:', error);
    res.status(500).json({ message: 'Failed to send message to the reporter.' });
  }
});

// Optional GET route if you want to view reports later in your Admin Dashboard
app.get('/api/reports', requireAdmin, async (req, res) => {
  try {
    const reports = await Report.find({ resolved: { $ne: true } }).sort({ createdAt: -1 });
    res.status(200).json(reports.map((report) => ({
      ...report.toObject(),
      fileUrl: normalizeImageUrl(report.fileUrl)
    })));
  } catch (error) {
    console.error('Error fetching reports:', error);
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

// ==========================================
// SYSTEM SETTINGS (FEATURED HOMEPAGE RANKING)
// ==========================================
const settingsSchema = new mongoose.Schema({
  featuredGroup: { type: String, default: '' },
  featuredCategory: { type: String, default: '' },
  featuredChikaId: { type: String, default: '' },
  playStoreUrl: { type: String, default: 'https://play.google.com/store/apps/details?id=com.JuanCast.myapplication&hl=en-US' },
  facebookUrl: { type: String, default: '' },
  xUrl: { type: String, default: '' },
  youtubeUrl: { type: String, default: '' },
  tiktokUrl: { type: String, default: '' }
});
const Settings = mongoose.model('Settings', settingsSchema);

app.get('/api/settings', async (req, res) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) settings = await Settings.create({});
    res.status(200).json(settings);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

app.put('/api/settings', requireAdmin, async (req, res) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) settings = await Settings.create({});
    
    if (Object.hasOwn(req.body, 'featuredGroup')) {
      settings.featuredGroup = req.body.featuredGroup || '';
    }
    if (Object.hasOwn(req.body, 'featuredCategory')) {
      settings.featuredCategory = req.body.featuredCategory || '';
    }
    if (Object.hasOwn(req.body, 'featuredChikaId')) {
      settings.featuredChikaId = req.body.featuredChikaId || '';
    }
    
    // landing page links (Play Store + social media): empty clears the link, anything else gets https:// if missing
    ['playStoreUrl', 'facebookUrl', 'xUrl', 'youtubeUrl', 'tiktokUrl'].forEach((key) => {
      if (Object.hasOwn(req.body, key)) settings[key] = cleanLink(req.body[key]);
    });

    await settings.save();
    res.status(200).json(settings);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => { console.log(`Server running on port ${PORT}`); });
