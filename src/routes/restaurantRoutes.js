const express = require('express');
const router = express.Router();
const Restaurant = require('../models/Restaurant');
const Menu = require('../models/Menu');

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

// alias: /near -> /nearby (เพื่อให้โค้ด front เดิมใช้ต่อได้)
router.get('/near', async (req, res) => {
  req.url = req.url.replace('/near', '/nearby');
  return router.handle(req, res);
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
      name,
      address,
      image,
      phone,
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

// POST /api/restaurants/:id/reviews  { rating, text }
router.post('/:id/reviews', async (req, res) => {
  try {
    const r = await Restaurant.findById(req.params.id);
    if (!r) return res.status(404).json({ error: 'ไม่พบร้าน' });

    let rating = Number(req.body.rating);
    if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: 'rating 1..5' });
    const text = (req.body.text || '').trim();

    const Review = require('../models/Review');
    const review = await Review.create({ restaurant: r._id, rating, text, by: req.body.by });

    // Update aggregates
    const newCount = (r.reviewCount || 0) + 1;
    const newAvg = ((r.avgRating || 0) * (r.reviewCount || 0) + rating) / newCount;

    r.reviewCount = newCount;
    r.avgRating = Math.round(newAvg * 10) / 10;
    await r.save();

    res.status(201).json({ review, restaurant: r });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// GET /api/restaurants/:id
router.get('/:id', async (req, res) => {
  try {
    const r = await Restaurant.findById(req.params.id);
    if (!r) return res.status(404).json({ error: 'ไม่พบร้าน' });
    res.json(r);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
