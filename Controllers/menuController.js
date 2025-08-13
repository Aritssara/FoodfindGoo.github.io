const Menu = require('../Models/Menu');

exports.getAllMenus = async (req, res) => {
  const menus = await Menu.find();
  res.json(menus);
};

exports.addMenu = async (req, res) => {
  const { name, price, type } = req.body;
  const newMenu = new Menu({ name, price, type });
  await newMenu.save();
  res.status(201).json(newMenu);
};

exports.deleteMenu = async (req, res) => {
  const { id } = req.params;
  await Menu.findByIdAndDelete(id);
  res.json({ message: 'Deleted' });
};
