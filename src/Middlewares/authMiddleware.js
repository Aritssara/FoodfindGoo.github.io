// src/Middlewares/authMiddleware.js
const admin = require('firebase-admin');
const Restaurant = require('../models/Restaurant');

function getBearer(req) {
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m && m[1];
}
function wrap(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// decode + ใส่ roles ลง req
async function decode(req, needUser = false) {
  const token = getBearer(req);
  if (!token) { const e = new Error('no token'); e.status = 401; throw e; }

  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(token);
  } catch {
    const e = new Error('invalid token'); e.status = 401; throw e;
  }

  req.user = { uid: decoded.uid, email: decoded.email || null, claims: decoded };

  // รวม role จากหลายแบบ claims
  const adminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase();
  const c = decoded || {};
  const rolesSet = new Set(
    [
      c.role,
      ...(Array.isArray(c.roles) ? c.roles : []),
      c.admin === true ? 'admin' : null,
      c.isAdmin === true ? 'admin' : null,
      c.owner === true ? 'owner' : null,
    ].filter(Boolean).map(x => String(x).toLowerCase())
  );

  // อีเมลที่กำหนดใน .env ถือเป็น admin
  if (adminEmail && (req.user.email || '').toLowerCase() === adminEmail) {
    rolesSet.add('admin');
  }

  // ✅ Fallback: ถ้าไม่มี role เลย ให้เช็กใน DB ว่าเป็นเจ้าของร้านไหม
  if (!rolesSet.size) {
    try {
      const uid = req.user.uid;
      const has = await Restaurant.exists({ $or: [{ ownerUid: uid }, { owners: uid }] });
      if (has) rolesSet.add('owner');
    } catch {}
  }

  req.roles = Array.from(rolesSet);
  req.role  = req.roles[0] || null;

  if (needUser && !req.user) {
    const e = new Error('unauthorized'); e.status = 401; throw e;
  }
}

exports.requireAuth = wrap(async (req, _res, next) => {
  await decode(req, true);
  next();
});

exports.requireRole = (...allowed) => wrap(async (req, _res, next) => {
  await decode(req, true);
  const allowedSet = new Set(allowed.map(a => String(a).toLowerCase()));
  const ok = (req.role && allowedSet.has(String(req.role).toLowerCase()))
         || (req.roles || []).some(r => allowedSet.has(String(r).toLowerCase()));
  if (!ok) {
    const e = new Error('forbidden'); e.status = 403; throw e;
  }
  next();
});

exports.requireAdmin = exports.requireRole.bind(null, 'admin');
