const crypto = require('crypto');
const Menu = require('../models/Menu');

// ===== helpers =====
function isBot(ua = '') {
  const s = String(ua || '').toLowerCase();
  return /(bot|crawler|spider|facebookexternalhit|slurp|curl|wget|headless)/.test(s);
}
function startOfDayISO(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.toISOString().slice(0, 10); // YYYY-MM-DD
}
function getVuid(req) {
  const hv = req.headers['x-vuid'];
  if (hv && typeof hv === 'string' && hv.length >= 8) return hv.slice(0, 64);
  const ip = req.ip || req.connection?.remoteAddress || '';
  const ua = req.headers['user-agent'] || '';
  return crypto.createHash('sha256').update(ip + '|' + ua).digest('hex').slice(0, 24);
}

// ===== controllers =====
exports.listMenus = async (req, res) => {
  try {
    const { restaurantId, q, limit = 100 } = req.query;
    const query = {};
    if (restaurantId) query.restaurant = restaurantId;
    if (q) query.name = new RegExp(q, 'i');

    const items = await Menu.find(query)
      .limit(Math.min(parseInt(limit, 10) || 100, 500))
      .populate('restaurant', 'name image');

    res.json(items);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.popularMenus = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '20', 10), 100);
    const items = await Menu.find({})
      .sort({ isFeatured: -1, featuredBoost: -1, 'stats.views': -1, updatedAt: -1 })
      .limit(limit)
      .populate('restaurant', 'name image');
    res.json(items);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.getMenu = async (req, res) => {
  try {
    const { idOrName } = req.params;
    let item = null;
    if (/^[0-9a-fA-F]{24}$/.test(idOrName)) {
      item = await Menu.findById(idOrName).populate('restaurant');
    }
    if (!item) {
      item = await Menu.findOne({ name: idOrName }).populate('restaurant');
    }
    if (!item) return res.status(404).json({ error: 'not found' });

    // ⛔️ ไม่ inc views ใน GET อีกต่อไป
    res.json(item);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.createMenu = async (req, res) => {
  try {
    const { name, price, type, image, description, restaurantId, isFeatured, featuredBoost } = req.body;
    if (!name || !restaurantId) return res.status(400).json({ error: 'ต้องระบุ name และ restaurantId' });

    const doc = await Menu.create({
      name,
      price,
      type,
      image,
      description,
      restaurant: restaurantId,
      isFeatured: !!isFeatured,
      featuredBoost: Number.isFinite(+featuredBoost) ? +featuredBoost : 0,
      stats: { total: 0, views: 0, uniqueKeys: [], clicks: 0, clickKeys: [] }
    });
    const saved = await Menu.findById(doc._id).populate('restaurant', 'name image');
    res.status(201).json(saved);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};

exports.patchMenu = async (req, res) => {
  try {
    const upd = {};
    if ('isFeatured' in req.body) upd.isFeatured = !!req.body.isFeatured;
    if ('featuredBoost' in req.body) upd.featuredBoost = Number(req.body.featuredBoost) || 0;
    if ('name' in req.body) upd.name = req.body.name;
    if ('price' in req.body) upd.price = req.body.price;
    if ('type' in req.body) upd.type = req.body.type;
    if ('image' in req.body) upd.image = req.body.image;
    if ('description' in req.body) upd.description = req.body.description;
    if ('restaurantId' in req.body) upd.restaurant = req.body.restaurantId;

    const item = await Menu.findByIdAndUpdate(req.params.id, upd, { new: true })
      .populate('restaurant', 'name image');
    if (!item) return res.status(404).json({ error: 'ไม่พบเมนู' });
    res.json(item);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};

exports.putMenu = async (req, res) => {
  try {
    const { name, price, type, image, description, restaurantId, isFeatured, featuredBoost } = req.body;
    const item = await Menu.findByIdAndUpdate(
      req.params.id,
      {
        name,
        price,
        type,
        image,
        description,
        restaurant: restaurantId,
        isFeatured: !!isFeatured,
        featuredBoost: Number.isFinite(+featuredBoost) ? +featuredBoost : 0
      },
      { new: true }
    ).populate('restaurant', 'name image');
    if (!item) return res.status(404).json({ error: 'ไม่พบเมนู' });
    res.json(item);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};

exports.deleteMenu = async (req, res) => {
  try {
    const item = await Menu.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ error: 'ไม่พบเมนู' });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};

// ===== Pageview: total ทุกครั้ง + unique ต่อวัน =====
exports.viewMenu = async (req, res) => {
  try {
    const ua = req.headers['user-agent'] || '';
    if (isBot(ua)) return res.json({ ok: true, skipped: 'bot' });

    const id = req.params.id;
    const base = await Menu.findById(id).select('_id');
    if (!base) return res.status(404).json({ error: 'ไม่พบเมนู' });

    const day = startOfDayISO(new Date()); // YYYY-MM-DD
    const vuid = getVuid(req);
    const key = `${day}|${vuid}`;

    // กันซ้ำรายวันด้วย $addToSet
    const add = await Menu.updateOne(
      { _id: id },
      { $addToSet: { 'stats.uniqueKeys': key } }
    );

    // total เพิ่มทุกครั้ง / views เพิ่มเฉพาะตอน unique
    const incs = { 'stats.total': 1 };
    if (add.modifiedCount > 0) incs['stats.views'] = 1;

    const ip = req.ip || req.connection?.remoteAddress || '';
    const ipHash = crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16);

    await Menu.updateOne(
      { _id: id },
      {
        $inc: incs,
        $push: {
          'stats.impressions': {
            $each: [{ at: new Date(), ipHash, ua }],
            $slice: -200
          }
        }
      }
    );

    // ตัด key เก่าถ้าโตเกินไป (ดูแลขนาดเอกสาร)
    const doc = await Menu.findById(id).select('stats.uniqueKeys');
    if (doc?.stats?.uniqueKeys?.length > 3000) {
      const cutoff = startOfDayISO(new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)); // 60 วัน
      const kept = doc.stats.uniqueKeys.filter(k => k.slice(0, 10) >= cutoff);
      await Menu.updateOne({ _id: id }, { $set: { 'stats.uniqueKeys': kept } });
    }

    res.json({ ok: true, totalInc: 1, uniqueAdded: add.modifiedCount > 0 ? 1 : 0 });
  } catch (e) {
    console.error('[viewMenu]', e);
    res.status(500).json({ error: e.message });
  }
};

// ===== Click-through: คลิกจากลิสต์เพื่อเข้าไปดูรายละเอียด =====
exports.clickMenu = async (req, res) => {
  try {
    const ua = req.headers['user-agent'] || '';
    if (isBot(ua)) return res.json({ ok: true, skipped: 'bot' });

    const id = req.params.id;
    const base = await Menu.findById(id).select('_id');
    if (!base) return res.status(404).json({ error: 'ไม่พบเมนู' });

    const day = startOfDayISO(new Date()); // YYYY-MM-DD
    const vuid = getVuid(req);
    const key = `${day}|${vuid}`;

    // กันซ้ำคลิกแบบ unique รายวัน
    const add = await Menu.updateOne(
      { _id: id },
      { $addToSet: { 'stats.clickKeys': key } }
    );

    // เพิ่ม clicks ทุกครั้ง (ถ้าอยากนับเฉพาะ unique ให้ใช้: const incs = add.modifiedCount>0 ? { 'stats.clicks': 1 } : {};)
    const incs = { 'stats.clicks': 1 };

    const ip = req.ip || req.connection?.remoteAddress || '';
    const ipHash = crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16);

    await Menu.updateOne(
      { _id: id },
      {
        $inc: incs,
        $push: {
          'stats.impressions': {
            $each: [{ at: new Date(), ipHash, ua }],
            $slice: -200
          }
        }
      }
    );

    // ตัด key เก่าถ้าโตเกินไป
    const doc = await Menu.findById(id).select('stats.clickKeys');
    if (doc?.stats?.clickKeys?.length > 3000) {
      const cutoff = startOfDayISO(new Date(Date.now() - 60 * 24 * 60 * 60 * 1000));
      const kept = doc.stats.clickKeys.filter(k => k.slice(0, 10) >= cutoff);
      await Menu.updateOne({ _id: id }, { $set: { 'stats.clickKeys': kept } });
    }

    res.json({ ok: true, clickInc: 1, uniqueClick: add.modifiedCount > 0 ? 1 : 0 });
  } catch (e) {
    console.error('[clickMenu]', e);
    res.status(500).json({ error: e.message });
  }
};
