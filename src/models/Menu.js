const mongoose = require('mongoose');

const MenuSchema = new mongoose.Schema({
  // ===== Basic fields =====
  name: { type: String, required: true },
  price: Number,
  type: String,                // ประเภท/หมวด
  image: String,
  description: String,

  // ===== Admin / publication =====
  status: { type: String, enum: ['draft', 'published'], default: 'draft' },
  isFeatured: { type: Boolean, default: false },
  featuredBoost: { type: Number, default: 0 },

  // ===== Analytics =====
  stats: {
    views: { type: Number, default: 0 },
    impressions: [{
      at: { type: Date, default: Date.now },
      ipHash: String,
      ua: String
    }]
  },

  // อ้างอิงร้าน (สำหรับเมนูนี้มีขายที่ร้านไหน)
  restaurant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: true
  }
}, { timestamps: true });

module.exports = mongoose.models.Menu || mongoose.model('Menu', MenuSchema);
