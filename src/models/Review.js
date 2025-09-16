// src/models/Review.js
const mongoose = require('mongoose');

const ReviewSchema = new mongoose.Schema({
  restaurant: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true },
  text:       { type: String, required: true, trim: true },
  rating:     { type: Number, min: 1, max: 5 },
  by:         { type: String, default: 'anonymous' }
}, { timestamps: true });

module.exports = mongoose.model('Review', ReviewSchema);
