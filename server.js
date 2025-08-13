const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const restaurantRoutes = require('./Routes/restaurantRoutes');
const menuRoutes = require('./Routes/menuRouter');
const adminRoutes = require('./Routes/adminRouter');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

mongoose.connect('mongodb://127.0.0.1:27017/foodfindgoo', {
  
}).then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

app.use('/api/restaurants', restaurantRoutes);
app.use('/api/menus', menuRoutes);
app.use('/api/admin', adminRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
