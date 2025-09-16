// src/routes/commentRoutes.js
const express = require("express");
const mongoose = require("mongoose");
const Comment = require("../models/Comment");
const { requireAuth, requireRole } = require("../Middlewares/authMiddleware");

const router = express.Router();
const isObjectId = (v) => mongoose.isValidObjectId(String(v || ""));

/* =========================
   USER endpoints
   ========================= */

// POST /api/comments  (ต้องล็อกอิน)
router.post("/", requireAuth, async (req, res) => {
  try {
    const { refType, refId, rating } = req.body || {};
    const text = (req.body?.text ?? req.body?.content ?? "").toString().trim();

    if (!refType || !refId) return res.status(400).json({ error: "missing refType/refId" });
    if (!isObjectId(refId)) return res.status(400).json({ error: "invalid refId" });
    if (!text) return res.status(400).json({ error: "empty text" });

    const r = Math.max(1, Math.min(5, Number(rating || 0)));

    // ✅ ให้ตรง schema: ต้องมี userId (required) และใช้ username
    const uid = req.user?.uid || "";
    const displayName = req.user?.claims?.name || req.user?.email || "ผู้ใช้";

    const doc = await Comment.create({
      refType: String(refType),
      refId: new mongoose.Types.ObjectId(refId),
      rating: r,
      content: text,
      status: "pending",
      hidden: false,
      userId: uid,
      username: displayName,
      likedBy: [],
    });

    res.status(201).json({ ok: true, id: doc._id });
  } catch (e) {
    if (e?.name === "ValidationError") return res.status(400).json({ error: e.message });
    if (e?.code === 11000) return res.status(409).json({ error: "duplicate" });
    console.error("POST /api/comments error:", e);
    res.status(500).json({ error: e.message || "server error" });
  }
});

// GET /api/comments/public?refType=restaurant&refId=...
router.get("/public", async (req, res) => {
  try {
    const { refType, refId } = req.query || {};
    if (!refType || !refId || !isObjectId(refId)) {
      return res.status(400).json({ error: "missing/invalid refType/refId" });
    }
    const q = {
      refType: String(refType),
      refId: new mongoose.Types.ObjectId(refId),
      status: "approved",
      hidden: false,
    };
    const docs = await Comment.find(q).sort({ createdAt: -1 }).lean();

    const count = docs.length;
    const avg   = count ? (docs.reduce((s, c) => s + (Number(c.rating) || 0), 0) / count) : 0;

    // ใช้ c.username ตาม schema (สำรอง userName เผื่อมีของเก่า)
    const items = docs.map(c => ({
      _id: c._id,
      username: c.username || c.userName || "ผู้ใช้",
      rating: c.rating || 0,
      content: c.content || "",
      createdAt: c.createdAt,
      likesCount: typeof c.likesCount === "number" ? c.likesCount
                 : (Array.isArray(c.likedBy) ? c.likedBy.length : 0),
      meLiked: false,
    }));

    res.json({ items, count, avgRating: avg });
  } catch (e) {
    console.error("GET /api/comments/public error:", e);
    res.status(500).json({ error: e.message || "server error" });
  }
});

// POST /api/comments/:id/like (toggle)  ต้องล็อกอิน
router.post("/:id/like", requireAuth, async (req, res) => {
  try {
    const id = req.params.id;
    if (!isObjectId(id)) return res.status(400).json({ error: "invalid id" });

    const uid = req.user?.uid;
    const c = await Comment.findById(id);
    if (!c) return res.status(404).json({ error: "not found" });

    const set = new Set((c.likedBy || []).map(String));
    let liked;
    if (set.has(uid)) { set.delete(uid); liked = false; }
    else { set.add(uid); liked = true; }
    c.likedBy = Array.from(set);
    c.likesCount = c.likedBy.length;
    await c.save();

    res.json({ liked, likesCount: c.likesCount });
  } catch (e) {
    console.error("POST /api/comments/:id/like error:", e);
    res.status(500).json({ error: e.message || "server error" });
  }
});

/* =========================
   ADMIN moderation endpoints
   ========================= */

router.get("/mod", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const status = String(req.query.status || "pending");
    const raw = await Comment.find({ status, hidden: false }).sort({ createdAt: -1 }).lean();
    // ใส่ alias userName ให้ด้วย เผื่อ frontend ฝั่ง admin.js อ้าง field เดิม
    const items = raw.map(c => ({ ...c, userName: c.userName || c.username || "ผู้ใช้" }));
    res.json({ items });
  } catch (e) {
    console.error("GET /api/comments/mod error:", e);
    res.status(500).json({ error: e.message || "server error" });
  }
});

router.patch("/:id/approve", requireAuth, requireRole("admin"), async (req, res) => {
  await Comment.findByIdAndUpdate(req.params.id, { $set: { status: "approved" } });
  res.json({ ok: true });
});

router.patch("/:id/reject", requireAuth, requireRole("admin"), async (req, res) => {
  await Comment.findByIdAndUpdate(req.params.id, { $set: { status: "rejected" } });
  res.json({ ok: true });
});

router.delete("/:id", requireAuth, requireRole("admin"), async (req, res) => {
  await Comment.deleteOne({ _id: req.params.id });
  res.json({ ok: true });
});

module.exports = router;
