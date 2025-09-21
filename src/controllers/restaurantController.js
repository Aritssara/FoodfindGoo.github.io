const Restaurant = require('../models/Restaurant');

const pick = (obj, keys) =>
  keys.reduce((o,k)=> (obj[k] !== undefined ? (o[k]=obj[k], o) : o), {});

exports.list = async (req, res) => {
  const items = await Restaurant.find().lean();
  res.json(items);
};

exports.create = async (req, res, next) => {
  try {
    // รับเฉพาะคีย์ที่อนุญาต รวมถึง hours ✅
    const payload = pick(req.body, [
      'name','address','phone','image','hours','location','owners','ownerUid','lat','lng'
    ]);

    // สร้าง location จาก lat/lng ถ้าฝั่ง client ส่งมาแยก
    if (!payload.location && Number.isFinite(payload.lng) && Number.isFinite(payload.lat)) {
      payload.location = { type:'Point', coordinates:[payload.lng, payload.lat] };
    }

    const doc = await Restaurant.create(payload);
    res.status(201).json(doc);
  } catch (err) { next(err); }
};

exports.update = async (req, res, next) => {
  try {
    const id = req.params.id;

    const payload = pick(req.body, [
      'name','address','phone','image','hours','location','owners','ownerUid','lat','lng'
    ]);

    if (!payload.location && Number.isFinite(payload.lng) && Number.isFinite(payload.lat)) {
      payload.location = { type:'Point', coordinates:[payload.lng, payload.lat] };
    }

    const doc = await Restaurant.findByIdAndUpdate(id, payload, { new:true, runValidators:true });
    if (!doc) return res.status(404).json({ error: 'not found' });
    res.json(doc);
  } catch (err) { next(err); }
};

exports.remove = async (req, res, next) => {
  try {
    const id = req.params.id;
    await Restaurant.findByIdAndDelete(id);
    res.json({ ok:true });
  } catch (err) { next(err); }
};
