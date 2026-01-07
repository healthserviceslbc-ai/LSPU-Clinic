const express = require('express');
const router = express.Router();
const Medicine = require('../models/Medicine');

// Initialize December 2024 and January 2025 data
router.post('/initialize-december-january', (req, res) => {
    Medicine.initializeDecemberAndJanuary((err) => {
        if (err) {
            console.error('Error initializing December 2024 and January 2025 data:', err);
            req.session.message = {
                type: 'error',
                text: 'Failed to initialize December 2024 and January 2025 data'
            };
        } else {
            req.session.message = {
                type: 'success',
                text: 'Successfully initialized December 2024 and January 2025 data'
            };
        }
        res.redirect('/reports/monthly');
    });
});

module.exports = router; 