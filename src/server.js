// src/server.js
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const crypto = require("crypto");

// โหลด firebase-admin instance กลาง (อ่าน cred จาก .env)
require("./services/firebaseAdmin");

// ใช้ middleware ตรวจโทเคน/บทบาท
const { requireAuth, requireRole } = require("./Middlewares/authMiddleware");

const app = express();
app.set("trust proxy", 1);

// ===== Middleware =====
const corsOptions = {
  origin: true,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

app.use(express.json());
app.use(cookieParser());

// ===== MongoDB Connection =====
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/foodfindgo";
mongoose
  .connect(MONGODB_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => {
    console.error("MongoDB connection error:", err.message);
    process.exit(1);
  });

/* ========= Analytics (Site unique visit) ========= */
const siteCounterSchema = new mongoose.Schema({
  key: { type: String, unique: true },
  total: { type: Number, default: 0 },
  uniques: { type: Number, default: 0 },
});
const visitSchema = new mongoose.Schema({
  vid: { type: String, unique: true },
  ua: String,
  ipHash: String,
  at: { type: Date, default: Date.now },
});
const SiteCounter = mongoose.models.SiteCounter || mongoose.model("SiteCounter", siteCounterSchema);
const Visit = mongoose.models.Visit || mongoose.model("Visit", visitSchema);

app.post("/api/analytics/visit", async (req, res) => {
  try {
    const { vid } = req.body || {};
    if (!vid) return res.status(400).json({ error: "missing vid" });

    const ua = req.get("user-agent") || "";
    const ip = req.ip || req.connection?.remoteAddress || "0.0.0.0";
    const ipHash = crypto.createHash("sha256").update(ip + ua).digest("hex").slice(0, 16);

    const existed = await Visit.findOne({ vid }).lean();
    if (!existed) {
      await Visit.create({ vid, ua, ipHash });
      await SiteCounter.updateOne(
        { key: "site" },
        { $inc: { uniques: 1, total: 1 } },
        { upsert: true }
      );
      const counter = await SiteCounter.findOne({ key: "site" }).lean();
      return res.json({ ok: true, increased: true, counter });
    }

    // นับ total ทุกครั้ง (ถ้าต้องการ) -> ปลดคอมเมนต์บรรทัดล่าง
    // await SiteCounter.updateOne({ key: "site" }, { $inc: { total: 1 } }, { upsert: true });

    const counter = await SiteCounter.findOne({ key: "site" }).lean();
    return res.json({ ok: true, increased: false, counter });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/analytics/site", async (_req, res) => {
  const counter = await SiteCounter.findOne({ key: "site" }).lean();
  res.json(counter || { key: "site", uniques: 0, total: 0 });
});

// ===== Routes =====
const menuRouter = require("./routes/menuRouter");
const restaurantRouter = require("./routes/restaurantRoutes");
const adminRouter = require("./routes/adminRouter");
const commentRouter = require("./routes/commentRoutes");
const ownerRouter = require("./routes/ownerRouter");
const searchRouter = require("./routes/searchRouter");

// public
app.use("/api/menus", menuRouter);
app.use("/api/restaurants", restaurantRouter);
app.use("/api/search", searchRouter);

// admin dashboard เฉพาะแอดมิน
app.use("/api/admin", requireAuth, requireRole("admin"), adminRouter);

// comments: อย่า lock ทั้ง router ให้แอดมิน — ไปล็อกเฉพาะ endpoint moderation ภายในไฟล์ router
app.use("/api/comments", commentRouter);

// owner: เฉพาะ owner หรือ admin
app.use("/api/owner", requireAuth, requireRole("owner", "admin"), ownerRouter);

// ✅ ทดสอบโทเคน Firebase
app.get("/api/whoami", requireAuth, (req, res) => {
  res.json({
    uid: req.user?.uid || null,
    email: req.user?.email || null,
  });
});

// health check
app.get("/health", (_req, res) => res.json({ ok: true }));

// ===== Static files =====
const PUBLIC_DIR = path.resolve(__dirname, "..", "public");
app.use(express.static(PUBLIC_DIR));

// ===== Fallback (SPA) =====
app.get(/^\/(?!api\/).*/, (_req, res) => {
  const indexPath = path.join(PUBLIC_DIR, "index.html");
  res.sendFile(indexPath, (err) => {
    if (err) res.status(404).send("index.html not found");
  });
});

// ===== Error Handler =====
app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(err.status || 500).json({ message: err.message || "Server error" });
});

// ===== Start Server =====
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(" MongoDB URI:", MONGODB_URI);
  console.log(" Static dir:", PUBLIC_DIR);
});
