// /src/routes/searchRouter.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

function toRegex(q) {
  // escape + ทำให้เป็นคำหลายๆ คำแบบ AND (เช่น "หมู กะทะ")
  const parts = String(q || '').trim().split(/\s+/).map(p =>
    p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  );
  const pattern = parts.map(p => `(?=.*${p})`).join('') + '.*';
  return new RegExp(pattern, 'i');
}
const pick = (obj, keys) => {
  const out = {};
  keys.forEach(k => (out[k] = obj?.[k]));
  return out;
};

// ช่วยให้เรียก collection โดยไม่ต้องพึ่ง model ชื่ออะไรแน่ๆ
const col = (name) => mongoose.connection.db.collection(name);

router.get('/', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    const limit = Math.min(parseInt(req.query.limit || '24', 10), 50);
    const type = req.query.type || 'all'; // 'all' | 'restaurants' | 'menus'
    const category = (req.query.category || '').trim();

    if (!q && !category) {
      return res.json({ restaurants: [], menus: [] });
    }

    const rx = q ? toRegex(q) : null;

    const tasks = [];
    if (type === 'all' || type === 'restaurants') {
      tasks.push(
        col('restaurants')
          .aggregate([
            {
              $match: rx
                ? { $or: [{ name: rx }, { address: rx }] }
                : {},
            },
            { $project: { name: 1, address: 1, image: 1, location: 1 } },
            { $limit: limit },
          ])
          .toArray()
          .then((rs) => ({ restaurants: rs }))
      );
    }
    if (type === 'all' || type === 'menus') {
      const match = {};
      if (rx) match.$or = [{ name: rx }, { category: rx }, { type: rx }];
      if (category) match.$and = [...(match.$and || []), { $or: [{ category }, { type: category }] }];

      tasks.push(
        col('menus')
          .aggregate([
            { $match: match },
            { $project: { name: 1, image: 1, price: 1, restaurantId: 1, category: 1, type: 1 } },
            { $limit: limit },
          ])
          .toArray()
          .then((ms) => ({ menus: ms }))
      );
    }

    const parts = await Promise.all(tasks);
    const out = { restaurants: [], menus: [] };
    for (const p of parts) {
      if (p.restaurants) out.restaurants = p.restaurants;
      if (p.menus) out.menus = p.menus;
    }
    res.json(out);
  } catch (e) {
    console.error('search error', e);
    res.status(500).json({ message: e.message });
  }
});

router.get('/suggest', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json({ suggestions: [] });

    const rxPrefix = new RegExp('^' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

    const [rs, ms] = await Promise.all([
      col('restaurants')
        .find({ name: rxPrefix })
        .project({ name: 1, address: 1 })
        .limit(6)
        .toArray(),
      col('menus')
        .find({ name: rxPrefix })
        .project({ name: 1, category: 1, restaurantId: 1 })
        .limit(6)
        .toArray(),
    ]);

    const suggestions = [
      ...rs.map((r) => ({
        type: 'restaurant',
        id: String(r._id),
        label: r.name,
        sub: r.address || '',
        href: `/Menu/shop.html?id=${encodeURIComponent(String(r._id))}`,
      })),
      ...ms.map((m) => ({
        type: 'menu',
        id: String(m._id),
        label: m.name,
        sub: m.category || '',
        href: m.restaurantId
          ? `/Menu/shop.html?id=${encodeURIComponent(String(m.restaurantId))}&menuId=${encodeURIComponent(String(m._id))}`
          : `/Menu/shop.html?menuId=${encodeURIComponent(String(m._id))}`,
      })),
    ].slice(0, 10);

    res.json({ suggestions });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// เพื่อดึงรายการหมวด (ทำชิป)
router.get('/categories', async (_req, res) => {
  try {
    const cats = await col('menus').distinct('category');
    const types = await col('menus').distinct('type');
    const merged = Array.from(
      new Set(
        [...cats, ...types]
          .map((v) => (typeof v === 'string' ? v.trim() : ''))
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b, 'th'));
    res.json({ categories: merged });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;
