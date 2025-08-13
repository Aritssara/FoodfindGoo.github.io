const mongoose = require('mongoose');

const menuSchema = new mongoose.Schema({
  name: String,
  price: Number,
  type: String,
  image: String,          
  description: String,  
  restaurant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant'
  }
});

module.exports = mongoose.model('Menu', menuSchema);