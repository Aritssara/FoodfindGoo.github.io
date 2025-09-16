// src/routes/adminRouter.js
const express = require('express');
const router = express.Router();

const mongoose = require('mongoose');
const AdminModel = mongoose.models.Admin || mongoose.model('Admin', new mongoose.Schema({
  uid: { type: String, required: true, unique: true },
  displayName: String,
  email: String,
}, { timestamps: true }));

// ==== Firebase Admin (ประกาศในไฟล์นี้เลย) ====
const admin = require('firebase-admin');
if (!admin.apps.length) {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  } else {
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
  }
}

// ==== ตรวจ token แบบ inline ====
async function requireFirebaseAuth(req, res, next) {
  try {
    const hdr = req.headers.authorization || '';
    const [, token] = hdr.split(' ');
    if (!token) return res.status(401).json({ error: 'Missing Bearer token' });
    req.user = await admin.auth().verifyIdToken(token);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Unauthorized', message: e.message });
  }
}

// ==== GET /api/admin/profile ====
router.get('/profile', requireFirebaseAuth, async (req, res) => {
  const { uid, email, name } = req.user;
  const displayName = name || (email ? email.split('@')[0] : 'Admin');
  const doc = await AdminModel.findOneAndUpdate(
    { uid },
    { $setOnInsert: { uid, email: email || '', displayName } },
    { new: true, upsert: true }
  );
  res.json({ ok: true, profile: doc });
});

// ==== PATCH /api/admin/profile ====
router.patch('/profile', requireFirebaseAuth, async (req, res) => {
  const { uid } = req.user;
  const { displayName, email } = req.body || {};
  const update = {};
  if (typeof displayName === 'string') update.displayName = displayName;
  if (typeof email === 'string')       update.email = email;

  const doc = await AdminModel.findOneAndUpdate(
    { uid },
    { $set: { ...update } },
    { new: true, upsert: true }
  );

  // (เสริม) อัปเดตขึ้น Firebase Auth ด้วย ถ้ามีฟิลด์ส่งมา
  try {
    const payload = {};
    if (update.displayName) payload.displayName = update.displayName;
    if (update.email)       payload.email = update.email;
    if (Object.keys(payload).length) await admin.auth().updateUser(uid, payload);
  } catch (e) {
    console.warn('updateUser warn:', e.message);
  }

  res.json({ ok: true, profile: doc });
});

module.exports = router;
