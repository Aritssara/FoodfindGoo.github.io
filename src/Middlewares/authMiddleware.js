exports.isSuperAdmin = (req, res, next) => {
  const role = req.headers['role']; // ตัวอย่างง่ายๆ ตรวจสอบจาก header
  if (role !== 'superadmin') {
    return res.status(403).json({ message: 'Access denied: Superadmin only' });
  }
  next();
};

//👉 วิธีทำงาน
// 1.ดึงข้อมูล role มาจาก request header (เช่น req.headers.role)
// 2.ถ้าค่า role ไม่ใช่ superadmin → ส่งสถานะ 403 Forbidden กลับไป พร้อมข้อความห้ามเข้าถึง
// 3.ถ้า role คือ superadmin → ดำเนินการต่อไปยังฟังก์ชันถัดไป (next())

