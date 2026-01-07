const express = require('express');
const router = express.Router();
const Transaction = require('../models/Transaction');
const Medicine = require('../models/Medicine');

// Home page route
router.get('/', (req, res) => {
    // Get both recent transactions and low stock items
    Transaction.getRecentTransactions((err, recentTransactions) => {
        if (err) {
            console.error('Error loading recent transactions:', err);
            recentTransactions = [];
        }

        Medicine.getLowStock(10, (err, lowStockItems) => {
            if (err) {
                console.error('Error loading low stock items:', err);
                lowStockItems = [];
            }

            res.render('index', { 
                title: 'LSPU Medicine Inventory System',
                page: 'home',
                recentTransactions: recentTransactions,
                lowStockItems: lowStockItems
            });
        });
    });
});

// Test route
router.get('/test', (req, res) => {
    res.render('test', {
        title: 'Test Page',
        page: 'test'
    });
});

// Add this new route for fetching medicines
router.get('/api/medicines/current', (req, res) => {
    const year = req.query.year || new Date().getFullYear().toString();
    const month = req.query.month || (new Date().getMonth() + 1).toString().padStart(2, '0');

    console.log('Fetching medicines for year:', year, 'month:', month);

    Medicine.getAllMedicines(year, month, (err, medicines) => {
        if (err) {
            console.error('Error fetching medicines:', err);
            return res.status(500).json({ error: 'Failed to fetch medicines' });
        }

        console.log('Medicines received from database:', {
            medicinesCount: medicines.medicines.length,
            medicalSuppliesCount: medicines.medical_supplies.length,
            dentalSuppliesCount: medicines.dental_supplies.length,
            otherSuppliesCount: medicines.other_supplies.length
        });

        // Convert the grouped medicines into a flat array with category information
        const medicinesList = [
            ...medicines.medicines.map(med => ({ ...med, category: 'MEDICINES' })),
            ...medicines.medical_supplies.map(med => ({ ...med, category: 'MEDICAL SUPPLIES' })),
            ...medicines.dental_supplies.map(med => ({ ...med, category: 'DENTAL SUPPLIES' })),
            ...medicines.other_supplies.map(med => ({ ...med, category: 'OTHER SUPPLIES' }))
        ];

        console.log('Total medicines in response:', medicinesList.length);
        res.json(medicinesList);
    });
});

// Add endpoint for last 7 days transactions
router.get('/api/transactions/last-7-days', async (req, res) => {
    try {
        const last7Days = await Transaction.getLast7DaysTransactions();
        res.json(last7Days);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add endpoint for statistics
router.get('/api/statistics', async (req, res) => {
    try {
        const statistics = await Transaction.getStatistics();
        res.json(statistics);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router; 