const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const Restaurant = require('../models/Restaurant');

// helper: เก็บเฉพาะคีย์ที่อนุญาต
const pick = (obj, keys) => keys.reduce((o,k)=>{
  if (Object.prototype.hasOwnProperty.call(obj, k) && obj[k] !== undefined) o[k] = obj[k];
  return o;
}, {});

// helper: แปลง lat/lng เป็น number
const toNum = v => (v === '' || v === null || v === undefined) ? undefined : Number(v);

// ===================== READ =====================

// GET /api/restaurants
// - ทั้งหมด
// - หรือค้นด้วย ?id=<mongoId> / ?restaurantId=<mongoId>
router.get('/', async (req, res, next) => {
  try {
    const { id, restaurantId } = req.query;

    const qid = id || restaurantId;
    if (qid) {
      if (!mongoose.Types.ObjectId.isValid(qid)) {
        return res.status(400).json({ error: 'invalid id' });
      }
      const doc = await Restaurant.findById(qid).lean();
      return doc ? res.json([doc]) : res.json([]);
    }

    // default: คืนรายการทั้งหมด
    const items = await Restaurant.find().lean();
    res.json(items);
  } catch (e) { next(e); }
});

// GET /api/restaurants/:id  <-- เพิ่มตัวนี้
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'invalid id' });
    }
    const doc = await Restaurant.findById(id).lean();
    if (!doc) return res.status(404).json({ error: 'not found' });
    res.json(doc);
  } catch (e) { next(e); }
});

// ===================== CREATE =====================

// POST /api/restaurants
router.post('/', async (req, res, next) => {
  try {
    let payload = pick(req.body, [
      'name','address','phone','image','hours','owners','ownerUid','location','lat','lng'
    ]);

    // แปลง lat/lng เป็น number (รองรับที่มาจากฟอร์มเป็นสตริง)
    const lat = toNum(payload.lat);
    const lng = toNum(payload.lng);

    // ถ้าไม่ได้ส่ง location (GeoJSON) แต่มี lat/lng ให้ประกอบเอง
    if (!payload.location && Number.isFinite(lng) && Number.isFinite(lat)) {
      payload.location = { type:'Point', coordinates:[lng, lat] };
    }

    const doc = await Restaurant.create(payload);
    res.status(201).json(doc);
  } catch (e) { next(e); }
});

// ===================== UPDATE =====================

// PUT /api/restaurants/:id
router.put('/:id', async (req, res, next) => {
  try {
    const id = req.params.id;

    let payload = pick(req.body, [
      'name','address','phone','image','hours','owners','ownerUid','location','lat','lng'
    ]);

    const lat = toNum(payload.lat);
    const lng = toNum(payload.lng);
    if (!payload.location && Number.isFinite(lng) && Number.isFinite(lat)) {
      payload.location = { type:'Point', coordinates:[lng, lat] };
    }

    const doc = await Restaurant.findByIdAndUpdate(id, payload, { new:true, runValidators:true });
    if (!doc) return res.status(404).json({ error: 'not found' });
    res.json(doc);
  } catch (e) { next(e); }
});

// ===================== DELETE =====================

// DELETE /api/restaurants/:id
router.delete('/:id', async (req, res, next) => {
  try {
    await Restaurant.findByIdAndDelete(req.params.id);
    res.json({ ok:true });
  } catch (e) { next(e); }
});

module.exports = router;
