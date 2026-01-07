const express = require('express');
const router = express.Router();
const Medicine = require('../models/Medicine');

// Add new medicine
router.post('/add', (req, res) => {
    // Get current date for default values
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear().toString();
    const currentMonth = (currentDate.getMonth() + 1).toString().padStart(2, '0');

    // Capitalize all text fields
    const medicineData = {
        name: req.body.name.toUpperCase().trim(),
        unit: req.body.unit.toUpperCase().trim(),
        category: req.body.category.toUpperCase().trim(),
        expiry_date: req.body.expiry_date || null,
        beginning_stock: parseInt(req.body.beginning_stock, 10) || 0,
        year: req.body.year || currentYear,
        month: req.body.month || currentMonth
    };

    console.log('Processing medicine data:', {
        ...medicineData,
        year: medicineData.year,
        month: medicineData.month
    });

    // Validate the date
    const requestedDate = new Date(medicineData.year, parseInt(medicineData.month) - 1);
    const sep2024 = new Date(2024, 8); // September is 8 in JS dates (0-based)
    const firstDayOfNextMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);

    // Return error for invalid dates
    if (requestedDate < sep2024 || requestedDate >= firstDayOfNextMonth) {
        return res.status(400).json({
            success: false,
            error: 'Cannot add medicines before September 2024 or in future months'
        });
    }

    Medicine.addMedicine(medicineData, (err, result) => {
        if (err) {
            console.error('Error adding medicine:', err);
            return res.status(500).json({
                success: false,
                error: err.message || 'Error adding medicine'
            });
        }

        // Send success response with details
        res.json({
            success: true,
            message: result.message,
            medicineId: result.medicineId,
            recordsCreated: result.recordsCreated
        });
    });
});

// Edit medicine
router.post('/edit', (req, res) => {
    console.log('Received POST request to /medicines/edit');
    console.log('Request body:', req.body);
    
    const { id, name, unit, category, expiry_date, beginning_stock, replenished_stock, year, month } = req.body;
    
    if (!id || !name || !unit || !category || !expiry_date || beginning_stock === undefined || replenished_stock === undefined || !year || !month) {
        console.error('Missing required fields:', {
            id: !!id,
            name: !!name,
            unit: !!unit,
            category: !!category,
            expiry_date: !!expiry_date,
            beginning_stock: beginning_stock !== undefined,
            replenished_stock: replenished_stock !== undefined,
            year: !!year,
            month: !!month
        });
        return res.status(400).send('All fields are required');
    }

    Medicine.updateMedicine(
        id, 
        name, 
        unit, 
        category, 
        expiry_date, 
        parseInt(beginning_stock, 10),
        parseInt(replenished_stock, 10),
        year,
        month.toString().padStart(2, '0'),
        (err) => {
            if (err) {
                console.error('Database error while updating medicine:', err);
                return res.status(500).json({ error: 'Error updating medicine' });
            }
            console.log('Medicine updated successfully');
            res.json({ success: true, message: 'Medicine updated successfully' });
        }
    );
});

// Delete medicine
router.post('/delete', (req, res) => {
    console.log('Received POST request to /medicines/delete');
    console.log('Request body:', req.body);
    
    const { id } = req.body;
    
    if (!id) {
        console.error('No medicine ID provided for delete');
        return res.status(400).send('Medicine ID is required');
    }

    Medicine.deleteMedicine(id, (err) => {
        if (err) {
            console.error('Database error while deleting medicine:', err);
            return res.status(500).send('Error deleting medicine');
        }
        console.log('Medicine deleted successfully, redirecting to monthly report');
        res.redirect('/reports/monthly');
    });
});

// Replenish medicine
router.post('/replenish', (req, res) => {
    console.log('Received POST request to /medicines/replenish');
    console.log('Request body:', req.body);
    
    const { id, quantity, year, month } = req.body;
    
    if (!id || !quantity || !year || !month) {
        console.error('Missing required fields:', { id: !!id, quantity: !!quantity, year: !!year, month: !!month });
        return res.status(400).json({ error: 'Medicine ID, quantity, year, and month are required' });
    }

    Medicine.replenishStock(parseInt(id, 10), parseInt(quantity, 10), year, month, (err) => {
        if (err) {
            console.error('Error replenishing stock:', err);
            return res.status(500).json({ error: 'Error replenishing stock' });
        }
        
        // If it's an AJAX request, send JSON response
        if (req.xhr || req.headers.accept.includes('application/json')) {
            res.json({ success: true });
        } else {
            // Otherwise redirect to monthly report page
            res.redirect('/reports/monthly');
        }
    });
});

module.exports = router; 