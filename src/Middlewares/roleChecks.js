// src/Middlewares/roleChecks.js
const admin = require('../services/firebaseAdmin');

async function fetchUserRole(uid) {
  // 1) Custom claims มาก่อน
  try {
    const rec = await admin.auth().getUser(uid);
    const cc = (rec && rec.customClaims) || {};
    if (cc.role) return cc.role;
  } catch (_) {}

  // 2) Firestore fallback: users/{uid}.role
  try {
    const db = admin.firestore();
    const snap = await db.collection('users').doc(uid).get();
    if (snap.exists) {
      const data = snap.data() || {};
      if (data.role) return data.role;
    }
  } catch (_) {}

  return null;
}

function allowRoles(...roles) {
  return async (req, res, next) => {
    try {
      let role = req.user && req.user.role;
      if (!role && req.user && req.user.uid) {
        role = await fetchUserRole(req.user.uid);
      }
      req.user.role = role;

      if (roles.includes(role)) return next();
      return res.status(403).json({ message: 'Forbidden: insufficient role' });
    } catch (err) {
      console.error('[allowRoles] error:', err.message);
      return res.status(500).json({ message: 'Role check error' });
    }
  };
}

module.exports = { allowRoles, fetchUserRole };
