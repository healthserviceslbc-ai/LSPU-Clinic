const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { isAuthenticated } = require('../middleware/auth');
const User = require('../models/User');

router.get('/login', authController.getLoginPage);
router.post('/login', authController.login);
router.get('/logout', authController.logout);

// Add authenticated ping endpoint for connection checking
router.get('/ping', isAuthenticated, (req, res) => {
    if (!req.session || !req.session.user) {
        return res.status(401).json({ status: 'unauthenticated' });
    }
    res.status(200).json({ status: 'authenticated' });
});

// Add password verification endpoint
router.post('/verify-password', isAuthenticated, (req, res) => {
    const { password } = req.body;
    
    if (!password) {
        return res.status(400).json({ success: false, message: 'Password is required' });
    }
    
    // Get the current user's stored password hash
    User.findByUsername(req.session.user.username, (err, user) => {
        if (err || !user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Verify the password
        User.verifyPassword(password, user.password, (err, isMatch) => {
            if (err) {
                return res.status(500).json({ success: false, message: 'Error verifying password' });
            }
            if (!isMatch) {
                return res.status(401).json({ success: false, message: 'Incorrect password' });
            }
            res.json({ success: true });
        });
    });
});

// Verify password
router.post('/verify-password', authController.verifyPassword);

module.exports = router; 