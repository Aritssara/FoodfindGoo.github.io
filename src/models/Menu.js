const mongoose = require('mongoose');

const MenuSchema = new mongoose.Schema({
  // เจ้าของ (ช่วยคิวรีย้อนกลับและบังคับสิทธิ์)
  ownerUid: { type: String, index: true },

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

  // ===== Analytics (แก้/เพิ่ม) =====
  // total = pageview ทั้งหมด (ทุกครั้ง)
  // views = pageview แบบ unique ต่อวัน  (กันซ้ำด้วย uniqueKeys)
  // clicks = จำนวนคลิกจากหน้าลิสต์เพื่อเข้าไปดูรายละเอียด
  // clickKeys = กันซ้ำคลิกแบบ unique ต่อวัน (ถ้าต้องการอ่านค่า unique click)
  // * uniqueKeys / clickKeys เก็บเป็น "YYYY-MM-DD|<vuid>" และไม่ select ออกมาเพื่อลด payload
  stats: {
    total: { type: Number, default: 0 },
    views: { type: Number, default: 0 },
    uniqueKeys: { type: [String], default: [], select: false },

    clicks: { type: Number, default: 0 },
    clickKeys: { type: [String], default: [], select: false },

    impressions: [{
      at: { type: Date, default: Date.now },
      ipHash: String,
      ua: String
    }]
  },

  // อ้างอิงร้านที่ขายเมนูนี้ (จำเป็น)
  restaurant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: true
  }
}, { timestamps: true });

module.exports = mongoose.models.Menu || mongoose.model('Menu', MenuSchema);
