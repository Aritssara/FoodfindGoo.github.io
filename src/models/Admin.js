const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true }, // รหัสผ่านจะถูกเข้ารหัสก่อนเก็บ
  role: { type: String, enum: ['admin', 'superadmin'], default: 'admin' }
});

module.exports = mongoose.model('Admin', adminSchema);

