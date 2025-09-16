// src/routes/restaurantRoutes.js
const express = require('express');
const router = express.Router();

const Restaurant = require('../models/Restaurant');
const Menu = require('../models/Menu');
const Review = require('../models/Review');

// GET /api/restaurants/nearby?lat=&lng=&radius=&limit=
router.get('/nearby', async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    const radius = parseInt(req.query.radius || '2000', 10);
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({ error: 'ต้องระบุ lat,lng' });
    }
    const data = await Restaurant.aggregate([
      {
        $geoNear: {
          near: { type: 'Point', coordinates: [lng, lat] },
          key: 'location',
          distanceField: 'distance',
          maxDistance: radius,
          spherical: true
        }
      },
      { $limit: limit }
    ]);
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/restaurants/by-menu?menu=ชื่อเมนู
router.get('/by-menu', async (req, res) => {
  try {
    const name = (req.query.menu || '').trim();
    if (!name) return res.status(400).json({ error: 'ต้องระบุชื่อเมนู' });

    const menus = await Menu.find({ name }).populate('restaurant');
    const uniq = {};
    menus.forEach(m => { if (m.restaurant) uniq[m.restaurant._id] = m.restaurant; });
    res.json(Object.values(uniq));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/restaurants
router.get('/', async (req, res) => {
  try {
    const { q, limit = 50 } = req.query;
    const query = q ? { name: new RegExp(q, 'i') } : {};
    const data = await Restaurant.find(query).limit(parseInt(limit, 10));
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/restaurants
router.post('/', async (req, res) => {
  try {
    const { name, address, image, phone, lng, lat } = req.body;
    if (!name) return res.status(400).json({ error: 'ต้องระบุชื่อร้าน' });
    if (lng === undefined || lat === undefined) return res.status(400).json({ error: 'ต้องระบุพิกัด (lng,lat)' });
    const r = await Restaurant.create({
      name, address, image, phone,
      location: { type: 'Point', coordinates: [Number(lng), Number(lat)] }
    });
    res.status(201).json(r);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// PUT /api/restaurants/:id
router.put('/:id', async (req, res) => {
  try {
    const { name, address, image, phone, lng, lat } = req.body;
    const update = { name, address, image, phone };
    if (lng !== undefined && lat !== undefined) {
      update.location = { type: 'Point', coordinates: [Number(lng), Number(lat)] };
    }
    const r = await Restaurant.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!r) return res.status(404).json({ error: 'ไม่พบร้าน' });
    res.json(r);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// DELETE /api/restaurants/:id
router.delete('/:id', async (req, res) => {
  try {
    const r = await Restaurant.findByIdAndDelete(req.params.id);
    if (!r) return res.status(404).json({ error: 'ไม่พบร้าน' });
    res.json(r);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

/* -------------------- Reviews (วางก่อน '/:id') -------------------- */

// GET /api/restaurants/:id/reviews
router.get('/:id/reviews', async (req, res) => {
  try {
    const { id } = req.params;
    const limit = Math.min(parseInt(req.query.limit || '20', 10), 50);
    const skip  = parseInt(req.query.skip || '0', 10);
    const items = await Review.find({ restaurant: id })
      .sort({ createdAt: -1 })
      .skip(skip).limit(limit)
      .lean();
    res.json(items);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/restaurants/:id/reviews
router.post('/:id/reviews', async (req, res) => {
  try {
    const r = await Restaurant.findById(req.params.id);
    if (!r) return res.status(404).json({ error: 'ไม่พบร้าน' });

    const text = (req.body.text || '').trim();
    if (!text) return res.status(400).json({ error: 'text_required' });

    let rating = Number(req.body.rating);
    if (!Number.isFinite(rating)) rating = undefined;
    if (rating && (rating < 1 || rating > 5)) {
      return res.status(400).json({ error: 'rating 1..5' });
    }

    const review = await Review.create({
      restaurant: r._id,
      text,
      rating,
      by: (req.body.by || req.body.userName || 'anonymous').trim()
    });

    if (Number.isFinite(rating)) {
      const count = r.reviewCount ?? 0;
      const avg   = r.avgRating   ?? 0;
      const newCount = count + 1;
      const newAvg   = ((avg * count) + rating) / newCount;
      r.reviewCount  = newCount;
      r.avgRating    = Math.round(newAvg * 10) / 10;
      await r.save();
    }

    res.status(201).json(review);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

/* ------------------ /Reviews --------------------- */

// GET /api/restaurants/:id   (วางท้ายสุด)
router.get('/:id', async (req, res) => {
  try {
    const r = await Restaurant.findById(req.params.id);
    if (!r) return res.status(404).json({ error: 'ไม่พบร้าน' });
    res.json(r);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
