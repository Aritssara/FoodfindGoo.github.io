// src/controllers/adminController.js
const Admin = require('../models/Admin');
const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 10;

exports.createAdmin = async (req, res) => {
  try {
    const { username, password, role = 'admin' } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({ message: 'username และ password จำเป็นต้องมี' });
    }

    const exist = await Admin.findOne({ username });
    if (exist) {
      return res.status(409).json({ message: 'Username already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    const admin = new Admin({ username, password: hashedPassword, role });
    await admin.save();

    return res.status(201).json({
      id: admin._id,
      username: admin.username,
      role: admin.role,
    });
  } catch (err) {
    console.error('[createAdmin] ', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.loginAdmin = async (req, res) => {
  try {
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({ message: 'username และ password จำเป็นต้องมี' });
    }

    const admin = await Admin.findOne({ username });
    if (!admin) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, admin.password);
    if (!valid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // โปรดเปลี่ยนเป็น JWT ในระบบจริง
    return res.json({
      message: 'Login successful',
      admin: { id: admin._id, username: admin.username, role: admin.role },
    });
  } catch (err) {
    console.error('[loginAdmin] ', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
