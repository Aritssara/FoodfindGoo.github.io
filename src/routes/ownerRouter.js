// src/routes/ownerRouter.js
const express = require('express');
const admin = require('firebase-admin');
const Restaurant = require('../models/Restaurant');
const Menu = require('../models/Menu'); // ถ้าคุณใช้คอลเลกชันนี้
const { requireAuth, requireRole } = require('../Middlewares/authMiddleware');

const router = express.Router();
router.use(requireAuth, requireRole('owner','admin'));

// helper: โหลดร้าน + ตรวจสิทธิ์ (เจ้าของหรือแอดมิน)
async function loadRestaurantAndCheck(req, res, next) {
  const id = req.params.id || req.query.restaurantId;
  if (!id) return res.status(400).json({ message: 'restaurantId is required' });

  const r = await Restaurant.findById(id);
  if (!r) return res.status(404).json({ message: 'restaurant not found' });

  const isAdmin = (req.roles || []).includes('admin');
  const isOwner = r.isOwner?.(req.user.uid) || false;

  if (!isAdmin && !isOwner) {
    return res.status(403).json({ message: 'forbidden' });
  }
  req.restaurant = r;
  next();
}

// 1) ข้อมูลตัวเอง: ร้านที่เป็นเจ้าของทั้งหมด
router.get('/me', async (req, res) => {
  const uid = req.user.uid;
  const isAdmin = (req.roles || []).includes('admin');

  const q = isAdmin ? {} : { $or: [{ ownerUid: uid }, { owners: uid }] };
  const restaurants = await Restaurant.find(q).lean();

  res.json({
    uid,
    role: (req.roles || [])[0] || null,
    restaurants
  });
});

// 2) เมนูของร้าน (ต้องระบุ restaurantId)
router.get('/menus', loadRestaurantAndCheck, async (req, res) => {
  const rid = req.restaurant._id;
  const menus = await Menu.find({ restaurantId: rid }).lean();
  res.json(menus);
});

// 3) เพิ่มผู้ร่วมเป็นเจ้าของ (ด้วย email หรือ uid)
// body: { email?: string, uid?: string }
router.post('/restaurant/:id/owners', loadRestaurantAndCheck, async (req, res) => {
  const { email, uid: rawUid } = req.body || {};
  const isAdmin = (req.roles || []).includes('admin');
  const isOwner = req.restaurant.isOwner?.(req.user.uid);
  if (!isAdmin && !isOwner) return res.status(403).json({ message: 'forbidden' });

  let uid = rawUid;
  try {
    if (!uid && email) {
      const u = await admin.auth().getUserByEmail(email);
      uid = u.uid;
    }
    if (!uid) return res.status(400).json({ message: 'email or uid is required' });

    await Restaurant.updateOne(
      { _id: req.restaurant._id },
      { $addToSet: { owners: uid } }
    );
    const updated = await Restaurant.findById(req.restaurant._id).lean();
    res.json({ ok: true, owners: updated.owners || [] });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

// 4) ลบผู้ร่วมเป็นเจ้าของ (กันลบจนเหลือ 0)
router.delete('/restaurant/:id/owners/:uid', loadRestaurantAndCheck, async (req, res) => {
  const targetUid = req.params.uid;
  const isAdmin = (req.roles || []).includes('admin');
  const isOwner = req.restaurant.isOwner?.(req.user.uid);
  if (!isAdmin && !isOwner) return res.status(403).json({ message: 'forbidden' });

  const ownersSet = new Set(req.restaurant.owners || []);
  if (ownersSet.size <= 1 && ownersSet.has(targetUid)) {
    return res.status(400).json({ message: 'cannot remove the last owner' });
  }

  await Restaurant.updateOne(
    { _id: req.restaurant._id },
    { $pull: { owners: targetUid } }
  );
  const updated = await Restaurant.findById(req.restaurant._id).lean();
  res.json({ ok: true, owners: updated.owners || [] });
});

module.exports = router;
