const Admin = require('../Models/Admin');
const bcrypt = require('bcrypt');

exports.createAdmin = async (req, res) => {
  try {
    const { username, password, role } = req.body;
    const exist = await Admin.findOne({ username });
    if (exist) return res.status(400).json({ message: 'Username already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const admin = new Admin({ username, password: hashedPassword, role });
    await admin.save();
    res.status(201).json({ id: admin._id, username: admin.username, role: admin.role });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.loginAdmin = async (req, res) => {
  try {
    const { username, password } = req.body;
    const admin = await Admin.findOne({ username });
    if (!admin) return res.status(401).json({ message: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, admin.password);
    if (!valid) return res.status(401).json({ message: 'Invalid credentials' });

    // ในระบบจริงให้ใช้ JWT
    res.json({ message: 'Login successful', admin: { id: admin._id, username: admin.username, role: admin.role } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
