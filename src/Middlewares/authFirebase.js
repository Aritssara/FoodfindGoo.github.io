// /src/Middlewares/authFirebase.js
const admin = require('../services/firebaseAdmin');
const db = admin.firestore();

async function authFirebase(req, res, next) {
  try {
    const h = req.headers.authorization || req.headers.Authorization || '';
    if (!h.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing token' });
    }
    const idToken = h.slice(7);
    const decoded = await admin.auth().verifyIdToken(idToken);

    req.user = decoded;
    req.uid  = decoded.uid;

    // role: custom claim > Firestore flags
    let role = decoded.role || null;
    if (!role) {
      const snap = await db.collection('users').doc(req.uid).get();
      const u = snap.exists ? snap.data() : {};
      role = u.role || (u.admin ? 'admin' : u.owner ? 'owner' : 'user');
    }
    req.role = role;
    return next();
  } catch (e) {
    console.error('[authFirebase] verifyIdToken failed:', {
      code: e.code, message: e.message, name: e.name
    });
    return res.status(401).json({ error: 'Unauthorized', code: e.code });
  }
}

const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.role) ? next() : res.status(403).json({ error: 'Forbidden' });

module.exports = { authFirebase, requireRole };
