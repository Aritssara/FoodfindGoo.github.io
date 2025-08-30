// src/server.js
require("dotenv").config();
const path = require("path");
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();

// ===== Middleware =====
app.use(express.json());
app.use(cors());

// ===== MongoDB Connection =====
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/foodfindgoo";
mongoose
  .connect(MONGODB_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => {
    console.error("MongoDB connection error:", err.message);
    process.exit(1);
  });

// ===== Routes =====
const menuRouter = require("./routes/menuRouter");
const restaurantRouter = require("./routes/restaurantRoutes")
const adminRouter = require("./routes/adminRouter");

app.use("/api/menus", menuRouter);
app.use("/api/restaurants", restaurantRouter);
app.use("/api/admin", adminRouter);

// ===== Serve static files =====
const PUBLIC_DIR = path.join(__dirname, "..", "public");
app.use(express.static(PUBLIC_DIR));

// ===== Fallback (SPA) =====
app.get(/^\/(?!api\/).*/, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

// ===== Start Server =====
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(" MongoDB URI:", MONGODB_URI);
});
