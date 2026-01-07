const express = require('express');
const router = express.Router();
const Medicine = require('../models/Medicine');
const inventoryController = require('../controllers/inventoryController');

router.get('/', inventoryController.listInventory);
router.get('/add', inventoryController.getMedicineForm);
router.post('/add', inventoryController.addMedicine);
router.post('/update-stock', inventoryController.updateStock);

// Initialize inventory route
router.post('/initialize', (req, res) => {
    Medicine.initializeMedicineInventory((err) => {
        if (err) {
            console.error('Error initializing inventory:', err);
            return res.status(500).json({
                success: false,
                error: 'Error initializing inventory'
            });
        }
        
        res.json({
            success: true,
            message: 'Inventory initialized successfully'
        });
    });
});

module.exports = router; 