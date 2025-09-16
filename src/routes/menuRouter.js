// routes/menuRouter.js
const express = require("express");
const router = express.Router();
const Menu = require("../models/Menu");

// GET /api/menus?restaurantId=&q=&limit=
router.get("/", async (req, res) => {
  try {
    const { restaurantId, q, limit = 100 } = req.query;
    const query = {};
    if (restaurantId) query.restaurant = restaurantId;
    if (q) query.name = new RegExp(q, "i");

    const items = await Menu.find(query)
      .limit(Math.min(parseInt(limit, 10) || 100, 500))
      .populate("restaurant", "name image");

    res.json(items);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/menus/popular  (ตัวอย่าง: จัดอันดับจาก isFeatured/featuredBoost + นับ views)
router.get("/popular", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || "20", 10), 100);
    const items = await Menu.find({})
      .sort({ isFeatured: -1, featuredBoost: -1, "stats.views": -1, updatedAt: -1 })
      .limit(limit)
      .populate("restaurant", "name image");
    res.json(items);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/menus/:idOrName  (ลองหาโดย id ไม่เจอค่อยหาโดยชื่อ)
router.get("/:idOrName", async (req, res) => {
  try {
    const { idOrName } = req.params;
    let item = null;
    if (idOrName.match(/^[0-9a-fA-F]{24}$/)) {
      item = await Menu.findById(idOrName).populate("restaurant");
    }
    if (!item) {
      item = await Menu.findOne({ name: idOrName }).populate("restaurant");
    }
    if (!item) return res.status(404).json({ error: "not found" });

    // อัปเดต views แบบเบา ๆ
    try {
      await Menu.updateOne({ _id: item._id }, { $inc: { "stats.views": 1 } });
      item.stats = { ...(item.stats || {}), views: (item.stats?.views || 0) + 1 };
    } catch {}

    res.json(item);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/menus
// body: { name, price, type, image, description, restaurantId, isFeatured, featuredBoost }
router.post("/", async (req, res) => {
  try {
    const { name, price, type, image, description, restaurantId, isFeatured, featuredBoost } = req.body;
    if (!name || !restaurantId) return res.status(400).json({ error: "ต้องระบุ name และ restaurantId" });

    const doc = await Menu.create({
      name,
      price,
      type,
      image,
      description,
      restaurant: restaurantId,
      isFeatured: !!isFeatured,
      featuredBoost: Number.isFinite(+featuredBoost) ? +featuredBoost : 0,
      stats: { views: 0 }
    });
    const saved = await Menu.findById(doc._id).populate("restaurant", "name image");
    res.status(201).json(saved);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// PATCH /api/menus/:id  (อัปเดตเฉพาะธงเด่น/บูสต์ หรือฟิลด์ย่อยที่ส่งมา)
router.patch("/:id", async (req, res) => {
  try {
    const upd = {};
    if ("isFeatured" in req.body) upd.isFeatured = !!req.body.isFeatured;
    if ("featuredBoost" in req.body) upd.featuredBoost = Number(req.body.featuredBoost) || 0;
    if ("name" in req.body) upd.name = req.body.name;
    if ("price" in req.body) upd.price = req.body.price;
    if ("type" in req.body) upd.type = req.body.type;
    if ("image" in req.body) upd.image = req.body.image;
    if ("description" in req.body) upd.description = req.body.description;
    if ("restaurantId" in req.body) upd.restaurant = req.body.restaurantId;

    const item = await Menu.findByIdAndUpdate(req.params.id, upd, { new: true })
      .populate("restaurant", "name image");
    if (!item) return res.status(404).json({ error: "ไม่พบเมนู" });
    res.json(item);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// PUT /api/menus/:id  (อัปเดตเต็ม)
router.put("/:id", async (req, res) => {
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
    ).populate("restaurant", "name image");
    if (!item) return res.status(404).json({ error: "ไม่พบเมนู" });
    res.json(item);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// DELETE /api/menus/:id
router.delete("/:id", async (req, res) => {
  try {
    const item = await Menu.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ error: "ไม่พบเมนู" });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
