const mongoose = require('mongoose');

const MenuSchema = new mongoose.Schema({
  name: String,
  price: Number,
  type: String
});

const RestaurantSchema = new mongoose.Schema({
  name: String,
  location: {
    type: {
      type: String,
      enum: ['Point'],
      required: true,
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [lng, lat]
      required: true
    }
  },
  image: String,
  
});

// Create Geo Index
RestaurantSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('Restaurant', RestaurantSchema);
