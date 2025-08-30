const mongoose = require('mongoose');

const RestaurantSchema = new mongoose.Schema({
  name: { type: String, required: true },
  address: String,

  // GeoJSON [lng, lat]
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number],
      required: true,
      index: '2dsphere'
    }
  },

  phone: String,
  image: String,

  // ===== Ratings (derived) =====
  avgRating: { type: Number, default: 0 },
  reviewCount: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('Restaurant', RestaurantSchema);
