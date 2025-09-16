const mongoose = require('mongoose');

const AdminSchema = new mongoose.Schema({
  uid:          { type: String, required: true, unique: true },
  displayName:  { type: String, default: '' },
  email:        { type: String, default: '' },
  createdAt:    { type: Date, default: Date.now },
  updatedAt:    { type: Date, default: Date.now },
});

AdminSchema.pre('save', function(next){ this.updatedAt = new Date(); next(); });

module.exports = mongoose.model('Admin', AdminSchema);
