const express = require('express');
const router = express.Router();
const adminController = require('../Controllers/adminController');
const { isSuperAdmin } = require('../Middlewares/authMiddleware');

router.post('/register', isSuperAdmin, adminController.createAdmin);
router.post('/login', adminController.loginAdmin);

module.exports = router;
