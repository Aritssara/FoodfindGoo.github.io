const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const Menu = require('../models/Menu');
const Restaurant = require('../models/Restaurant');

// สร้างเมนู
router.post('/', async (req, res) => {
  try {
    const { name, price, type, image, description, restaurantId, status, isFeatured, featuredBoost } = req.body;
    const rest = await Restaurant.findById(restaurantId);
    if (!rest) return res.status(404).json({ error: 'ไม่พบร้านอาหาร' });
    if (!name) return res.status(400).json({ error: 'ต้องระบุชื่อเมนู' });

    const m = await Menu.create({
      name,
      price,
      type,
      image,
      description,
      restaurant: rest._id,
      status: status || 'draft',
      isFeatured: !!isFeatured,
      featuredBoost: Number(featuredBoost) || 0
    });
    res.status(201).json(m);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ดึงเมนูทั้งหมด (ให้หน้า /Menu/menu.html ใช้)
router.get('/', async (_req, res) => {
  const menus = await Menu.find().populate('restaurant', 'name image');
  res.json(menus);
});

// ดึง Top N ยอดฮิต พร้อมคะแนน (score)
router.get('/popular', async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(parseInt(req.query.limit || '10', 10), 50));
    const items = await Menu.find({ status: 'published' }).lean();

    const scored = items.map(m => {
      const views = m?.stats?.views || 0;
      const boost = (m.isFeatured ? 50 : 0) + (m.featuredBoost || 0) * 10;
      const recencyDays = m.createdAt ? Math.max(1, (Date.now() - new Date(m.createdAt)) / (1000 * 60 * 60 * 24)) : 30;
      const recencyBonus = 30 / recencyDays; // newer = higher
      const score = Math.round(views + boost + recencyBonus);
      return { ...m, score };
    }).sort((a, b) => b.score - a.score).slice(0, limit);

    res.json(scored);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ดึงเมนูตาม id หรือชื่อ + บันทึก view + impression
router.get('/:id', async (req, res) => {
  try {
    const key = req.params.id;
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(key);
    const q = isObjectId ? { _id: key } : { name: key };

    const m = await Menu.findOneAndUpdate(
      q,
      {
        $inc: { 'stats.views': 1 },
        $push: {
          'stats.impressions': {
            at: new Date(),
            ipHash: crypto.createHash('sha256').update((req.ip || '') + (req.headers['user-agent'] || '')).digest('hex').slice(0, 16),
            ua: req.headers['user-agent'] || ''
          }
        }
      },
      { new: true }
    ).populate('restaurant', 'name image location');

    if (!m) return res.status(404).json({ error: 'ไม่พบเมนู' });
    res.json(m);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// อัปเดตสถานะเผยแพร่ / isFeatured / featuredBoost (สำหรับแอดมิน)
router.patch('/:id', async (req, res) => {
  try {
    const { status, isFeatured, featuredBoost, name, price, type, image, description, restaurantId } = req.body;
    const update = {};
    if (status) update.status = status;
    if (typeof isFeatured === 'boolean') update.isFeatured = isFeatured;
    if (featuredBoost !== undefined) update.featuredBoost = Number(featuredBoost) || 0;
    if (name !== undefined) update.name = name;
    if (price !== undefined) update.price = Number(price) || 0;
    if (type !== undefined) update.type = type;
    if (image !== undefined) update.image = image;
    if (description !== undefined) update.description = description;
    if (restaurantId) update.restaurant = restaurantId;

    const m = await Menu.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!m) return res.status(404).json({ error: 'ไม่พบเมนู' });
    res.json(m);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
