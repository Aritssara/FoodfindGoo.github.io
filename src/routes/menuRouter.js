const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/menuController');

// REST
router.get('/',          ctrl.listMenus);
router.get('/popular',   ctrl.popularMenus);
router.get('/:idOrName', ctrl.getMenu);
router.post('/',         ctrl.createMenu);
router.patch('/:id',     ctrl.patchMenu);
router.put('/:id',       ctrl.putMenu);
router.delete('/:id',    ctrl.deleteMenu);

// Analytics
router.post('/:id/view',  ctrl.viewMenu);   // pageview เมื่อเข้า “หน้ารายละเอียด”
router.post('/:id/click', ctrl.clickMenu);  // click-through เมื่อ “คลิกจากลิสต์”

module.exports = router;
