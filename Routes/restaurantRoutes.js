const express = require('express');
const router = express.Router();
const Restaurant = require('../models/Restaurant');
const Menu = require('../Models/Menu');

// Add new restaurant
router.post('/', async (req, res) => {
  try {
    const restaurant = new Restaurant(req.body);
    await restaurant.save();
    res.status(201).send(restaurant);
  } catch (err) {
    res.status(400).send({ error: err.message });
  }
});
router.get('/by-menu', async (req, res) => {
  const menuName = req.query.menu;
  if (!menuName) {
    return res.status(400).json({ error: 'Missing menu query' });
  }

  try {
    // Find menus with the specified name
    const menus = await Menu.find({ name: menuName });

    if (menus.length === 0) {
      return res.status(404).json({ error: 'No menu found' });
    }

    // Get unique restaurant IDs from the menus
    const restaurantIds = [...new Set(menus.map(menu => menu.restaurant.toString()))];

    // Find restaurants by the collected IDs
    const restaurants = await Restaurant.find({ _id: { $in: restaurantIds } });

    res.json(restaurants);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all restaurants
router.get('/', async (req, res) => {
  const restaurants = await Restaurant.find();
  res.send(restaurants);
});

// Add menu to restaurant
router.post('/:id/menus', async (req, res) => {
  const restaurant = await Restaurant.findById(req.params.id);
  restaurant.menus.push(req.body);
  await restaurant.save();
  res.send(restaurant);
});

// Delete menu from restaurant by index
router.delete('/:restaurantId/menus/:menuIndex', async (req, res) => {
  const { restaurantId, menuIndex } = req.params;
  const restaurant = await Restaurant.findById(restaurantId);
  if (restaurant && restaurant.menus[menuIndex]) {
    restaurant.menus.splice(menuIndex, 1);
    await restaurant.save();
    res.send(restaurant);
  } else {
    res.status(404).send({ error: "Menu not found" });
  }
});

module.exports = router;
