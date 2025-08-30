const Restaurant = require('../models/Restaurant');

exports.addRestaurant = async (req, res) => {
  try {
    const { name, coordinates, menus } = req.body;

    const restaurant = new Restaurant({
      name,
      location: {
        type: 'Point',
        coordinates
      },
      menus
    });

    await restaurant.save();
    res.status(201).json(restaurant);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getNearbyRestaurants = async (req, res) => {
  try {
    const { lat, lng } = req.query;
    const maxDistance = 2000;

    const restaurants = await Restaurant.aggregate([
      {
        $geoNear: {
          near: { type: 'Point', coordinates: [parseFloat(lng), parseFloat(lat)] },
          distanceField: 'distance',
          maxDistance,
          spherical: true
        }
      }
    ]);

    res.json(restaurants);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
