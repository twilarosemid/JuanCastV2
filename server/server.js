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

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename: (_, file, cb) => {
    const safeName = `${Date.now()}-${Math.random().toString(16).slice(2)}${path.extname(file.originalname || '.png')}`;
    cb(null, safeName);
  }
});

const upload = multer({ storage });

app.use(express.json({ limit: '500mb' })); 
app.use(cors());
app.use('/uploads', express.static(uploadDir));

// 1. Connect to MongoDB and auto-synchronize ranking positions on boot
mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log("Connected to MongoDB Atlas!");
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
  phone: { type: String, required: true, unique: true }, 
  password: { type: String, required: true },
  otp: { type: String }, 
  passwordResetTokenHash: { type: String },
  passwordResetExpiresAt: { type: Date },
  isVerified: { type: Boolean, default: false },
  isAdmin: { type: Boolean, default: false },
  role: { type: String, enum: ['user', 'admin'], default: 'user' }
});
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

const getAdminEmails = () => {
  const configured = (process.env.ADMIN_EMAIL || '')
    .split(',')
    .map((email) => normalizeEmail(email))
    .filter(Boolean);

  return [...new Set([...configured, 'adminjuancast@gmail.com', 'gulfericdonato6@gmail.com'])];
};

const resolveAdminStatus = (user = {}) => {
  if (!user) return false;
  const normalizedEmail = normalizeEmail(user.email);
  const role = String(user.role || '').trim().toLowerCase();
  return Boolean(user.isAdmin) || role === 'admin' || getAdminEmails().includes(normalizedEmail);
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
  coverPhoto: { type: String, default: "" },
  coverPosition: {
    x: { type: Number, default: 50 },
    y: { type: Number, default: 50 }
  },
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
  swerteSpinsRemaining: { type: Number, default: 1 },
  swerteSpinDate: { type: String, default: null },
  transactions: { type: [transactionSchema], default: [] },
  lastNameChange: { type: Date },
  lastUsernameChange: { type: Date }
}, { timestamps: true });
const Profile = mongoose.model('Profile', profileSchema);

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
  imageUrl: { type: String, default: '' },
  fromDate: { type: Date, required: true },
  toDate: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now }
});
const Poll = mongoose.model('Poll', pollSchema);

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

// Process Daily Claim
app.post('/api/users/daily-claim', async (req, res) => {
  try {
    const { email, dayClaimed, rewardValue, currency } = req.body;
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

    // Allocate rewards
    if (currency === 'STARS') {
        profile.stars += rewardValue;
    } else if (currency === 'SUNS') {
        profile.suns += rewardValue;
    } else if (currency === 'BOTH') {
        profile.stars += rewardValue.stars || 0;
        profile.suns += rewardValue.suns || 0;
    }

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

    res.status(200).json(profile);
  } catch (error) {
    console.error("Daily claim error:", error);
    res.status(500).json({ error: "Internal server error while claiming reward." });
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

app.post('/api/chika', upload.single('image'), async (req, res) => {
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

app.put('/api/chika/:id', upload.single('image'), async (req, res) => {
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

app.delete('/api/chika/:id', async (req, res) => {
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

app.post('/api/poll-groups', upload.single('image'), async (req, res) => {
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

app.delete('/api/poll-groups/:id', async (req, res) => {
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

app.post('/api/polls', upload.single('image'), async (req, res) => {
  try {
    // 1. Extract the new fields from req.body
    const { title, fromDate, toDate, group, type, description } = req.body;
    
    if (!title || !fromDate || !toDate) {
      return res.status(400).json({ message: 'Title, fromDate, and toDate are required.' });
    }
    
    // 2. Save the new fields to MongoDB
    const poll = await Poll.create({
      title,
      group: group || '',     // Default to PPMA if left empty
      type: type || '',      // Default to Minor if left empty
      description: description || '',
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

app.put('/api/polls/:id', upload.single('image'), async (req, res) => {
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

app.delete('/api/polls/:id', async (req, res) => {
  try {
    const removed = await Poll.findByIdAndDelete(req.params.id);
    if (!removed) {
      return res.status(404).json({ message: 'Poll not found.' });
    }
    res.status(200).json({ message: 'Poll deleted.' });
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

app.post('/api/rankings', upload.single('image'), async (req, res) => {
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
    const { email, currencyType = 'stars', cost = 1 } = req.body;
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

app.put('/api/rankings/:id', upload.single('image'), async (req, res) => {
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

app.delete('/api/rankings/:id', async (req, res) => {
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

    let user = await User.findOne({ email: { $regex: `^${escapeRegex(normalizedEmail)}$`, $options: 'i' } });
    if (user && user.isVerified) {
      return res.status(400).json({ message: "User already exists." });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedPassword = await bcrypt.hash(password, 10);

    if (!user) {
      user = new User({ email: normalizedEmail, phone, password: hashedPassword, otp });
    } else {
      user.email = normalizedEmail;
      user.password = hashedPassword;
      user.otp = otp;
      user.phone = phone; 
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
    console.error(error);
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
      gender,
      coverPhoto: ''
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
    const isAdmin = resolveAdminStatus(user);

    if (isAdmin) {
      user.email = normalizedUserEmail;
      user.isAdmin = true;
      user.role = 'admin';
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
          coverPhoto: profile?.coverPhoto || '',
          stars: profile?.stars ?? 100, 
          suns: profile?.suns ?? 100,
          dailyStreak: profile?.dailyStreak ?? 0,
          lastClaimDate: profile?.lastClaimDate || null,
          isAdmin,
          role: isAdmin ? 'admin' : (user.role || 'user')
        }
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Server error during login." });
    }
});
// Your banner routes or app.listen should come AFTER that closing line.

// --- YOUTUBE VIDEO SCHEMA ---
const videoSchema = new mongoose.Schema({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  group: { type: String, default: '' },
  platform: { type: String, enum: ['YouTube', 'Facebook', 'X', 'TikTok'], default: 'YouTube' },
  imageUrl: { type: String, default: '' },
  youtubeUrl: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});
const Video = mongoose.model('Video', videoSchema);

// --- YOUTUBE VIDEO API ROUTES ---
app.get('/api/videos', async (req, res) => {
  try {
    const platform = req.query.platform || 'YouTube';
    const allowedPlatforms = ['YouTube', 'Facebook', 'X', 'TikTok'];
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

app.post('/api/videos', upload.single('image'), async (req, res) => {
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

app.put('/api/videos/:id', upload.single('image'), async (req, res) => {
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
app.post('/api/banners', (req, res) => {
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

      fs.unlink(req.file.path, (cleanupError) => {
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
app.delete('/api/banners/:id', async (req, res) => {
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

app.put('/api/reports/:id/resolve', async (req, res) => {
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

app.post('/api/reports/:id/messages', async (req, res) => {
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
app.get('/api/reports', async (req, res) => {
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
  featuredChikaId: { type: String, default: '' }
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

app.put('/api/settings', async (req, res) => {
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
    
    await settings.save();
    res.status(200).json(settings);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));