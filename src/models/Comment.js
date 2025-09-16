// src/models/Comment.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

/**
 * คอมเมนต์ของเมนู/ร้าน (อ้างอิงแบบ generic ผ่าน refType + refId)
 */
const CommentSchema = new Schema(
  {
    refType:   { type: String, required: true },     // ตัวอย่าง: 'menu' | 'restaurant'
    refId:     { type: Schema.Types.ObjectId, required: true },

    rating:    { type: Number, min: 1, max: 5, default: 5 },
    content:   { type: String, trim: true, maxlength: 2000 },

    username:  { type: String, trim: true },
    userId:    { type: String, required: true },

    status:    { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
    hidden:    { type: Boolean, default: false },

    // ไลก์
    likesCount:{ type: Number, default: 0 },
    likedBy:   { type: [String], default: [] }, // เก็บ uid ผู้กดไลก์
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

// index ช่วยให้ query เร็วขึ้น
CommentSchema.index({ refType: 1, refId: 1, status: 1, hidden: 1, createdAt: -1 });

module.exports = mongoose.model("Comment", CommentSchema);
