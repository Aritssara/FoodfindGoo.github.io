const mongoose = require('mongoose');

const ReviewSchema = new mongoose.Schema({
  restaurant: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true },
  menu:       { type: mongoose.Schema.Types.ObjectId, ref: 'Menu' },
  rating:     { type: Number, min: 1, max: 5, required: true },
  text:       String,
  by:         String // user id/name (optional)
}, { timestamps: true });

module.exports = mongoose.model('Review', ReviewSchema);
