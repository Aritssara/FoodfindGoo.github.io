const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true }, // รหัสผ่านจะถูกเข้ารหัสก่อนเก็บ
  role: { type: String, enum: ['admin', 'superadmin'], default: 'admin' }
});

module.exports = mongoose.model('Admin', adminSchema);

//โค้ดนี้คือ Mongoose Schema สำหรับสร้าง Model ที่ชื่อว่า Admin
//ใช้กับฐานข้อมูล MongoDB โดยเป็นโครงสร้างข้อมูลของผู้ดูแลระบบ (Admin)

// ความหมายของแต่ละส่วน
// 1. username: String กำหนด ชื่อผู้ใช้งาน เป็นข้อมูลแบบ String
// ตัวอย่างเช่น admin01, superadmin99
// 2. password: String
// เก็บ รหัสผ่าน เป็น String
// # หมายเหตุ: มีคอมเมนต์เตือนว่าในระบบจริง (production)
//  ควร เข้ารหัส (hash password) เช่น bcrypt.hash() เพื่อความปลอดภัย ไม่ควรเก็บ plain-text password
// 3. role: { type: String, enum: ['admin', 'superadmin'], default: 'admin' }
// เก็บ ระดับสิทธิ์ของผู้ใช้งาน (role)
// มีแค่ 2 ค่าที่อนุญาตให้ใช้ คือ admin หรือ superadmin ผ่าน enum
// ถ้าไม่ใส่ค่า role จะตั้งค่าเริ่มต้นเป็น admin อัตโนมัติ