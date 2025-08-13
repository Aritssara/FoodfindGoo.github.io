const express = require('express');
const router = express.Router();
const Menu = require('../Models/Menu');
const Restaurant = require('../models/Restaurant');

// POST /api/menus
router.post('/', async (req, res) => {
  const { name, price, type, image, description, restaurantId } = req.body;

  try {
    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) return res.status(404).json({ error: 'ไม่พบร้านอาหาร' });

    const newMenu = new Menu({
      name,
      price,
      type,
      image,
      description,
      restaurant: restaurantId
    });

    await newMenu.save();

    res.status(201).json(newMenu);
  } catch (err) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาด', details: err.message });
  }
});
// GET /api/menus
router.get('/', async (req, res) => {
  const menus = await Menu.find().populate('restaurant', 'name image');
  res.json(menus);
});

module.exports = router;