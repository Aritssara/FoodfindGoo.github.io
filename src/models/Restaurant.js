// src/models/Restaurant.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const RestaurantSchema = new Schema({
  // legacy (ช่วงเปลี่ยนผ่าน)
  ownerUid: { type: String, index: true },

  // ✅ หลายเจ้าของ
  owners:   { type: [String], default: [], index: true },

  name:     { type: String, required: true, trim: true },
  address:  { type: String, trim: true },

  // GeoJSON: coordinates = [lng, lat]
  location: {
    type: { type: String, enum: ['Point'], default: 'Point', required: true },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator(v) {
          return Array.isArray(v) &&
                 v.length === 2 &&
                 v.every(n => typeof n === 'number' && !Number.isNaN(n));
        },
        message: 'location.coordinates ต้องเป็น [lng, lat]',
      },
    },
  },

  phone: { type: String, trim: true },
  image: { type: String, trim: true },

  // summary rating ถ้ามีใช้อยู่
  avgRating:   { type: Number, default: 0 },
  reviewCount: { type: Number, default: 0 },
  ratingSum:   { type: Number, default: 0 },
}, { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });

RestaurantSchema.index({ location: '2dsphere' });

RestaurantSchema.virtual('lat').get(function(){ return this.location?.coordinates?.[1]; });
RestaurantSchema.virtual('lng').get(function(){ return this.location?.coordinates?.[0]; });

// ✅ เช็กสิทธิ์เจ้าของ
RestaurantSchema.methods.isOwner = function(uid) {
  if (!uid) return false;
  const mine = Array.isArray(this.owners) && this.owners.includes(uid);
  const legacy = !!this.ownerUid && this.ownerUid === uid;
  return mine || legacy;
};

module.exports = mongoose.model('Restaurant', RestaurantSchema);
