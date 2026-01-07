const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { isAuthenticated, isAdmin } = require('../middleware/auth');
const db = require('../config/database');

// Apply JSON parsing middleware for all routes
router.use(express.json());

// List all users (admin only) - This should be first
router.get('/', isAuthenticated, isAdmin, (req, res) => {
    const searchParams = {
        searchTerm: req.query.search ? req.query.search.trim() : '',
        selectedRole: req.query.role || 'all'
    };

    User.searchUsers(searchParams.searchTerm, searchParams.selectedRole, (err, users) => {
        if (err) {
            console.error('Error fetching users:', err);
            return res.status(500).render('error', { 
                message: 'Error fetching users',
                error: err,
                layout: 'layouts/main'
            });
        }

        res.render('users/list', { 
            title: 'User Management',
            page: 'users',
            users: users,
            searchTerm: searchParams.searchTerm,
            selectedRole: searchParams.selectedRole
        });
    });
});

// Show create user form (admin only)
router.get('/new', isAuthenticated, isAdmin, (req, res) => {
    res.render('users/new', {
        title: 'Add New User',
        page: 'users'
    });
});

// Verify admin password
router.post('/verify-password', isAuthenticated, isAdmin, (req, res) => {
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

// Update user status
router.post('/update-status', isAuthenticated, (req, res) => {
    const userId = req.session.user.id;
    const status = req.body.status;

    // First update the session status
    if (req.session.user) {
        req.session.user.status = status;
    }

    // Then update the database
    User.updateUserStatus(userId, status, (err) => {
        if (err) {
            console.error('Error updating user status:', err);
            return res.status(500).json({ success: false, message: 'Error updating status' });
        }

        // Double-check the update with setUserOffline for 'offline' status
        if (status === 'offline') {
            User.setUserOffline(userId, (err) => {
                if (err) {
                    console.error('Error ensuring offline status:', err);
                }
                res.json({ success: true });
            });
        } else {
            res.json({ success: true });
        }
    });
});

// Profile routes
router.get('/profile', isAuthenticated, (req, res) => {
    User.findByUsername(req.session.user.username, (err, user) => {
        if (err || !user) {
            req.flash('error', 'Error loading profile');
            return res.redirect('/');
        }
        console.log('User data:', user); // Debug log
        res.render('users/profile', {
            title: 'Manage Account',
            page: 'profile',
            user: user
        });
    });
});

router.post('/profile', isAuthenticated, (req, res) => {
    // First get the current user data to preserve role and status
    User.findById(req.session.user.id, (err, currentUser) => {
        if (err || !currentUser) {
            req.flash('error', 'Error updating profile');
            return res.redirect('/users/profile');
        }

        const userData = {
            full_name: req.body.full_name,
            username: req.body.username,
            role: currentUser.role,           // Preserve existing role
            status: currentUser.status        // Preserve existing status
        };

        // Only update password if provided
        if (req.body.new_password && req.body.current_password) {
            User.verifyPassword(req.body.current_password, currentUser.password, (err, isMatch) => {
                if (err || !isMatch) {
                    req.flash('error', 'Current password is incorrect');
                    return res.redirect('/users/profile');
                }

                // If password matches, update with new password
                userData.password = req.body.new_password;
                updateUserProfile(req, res, userData);
            });
        } else {
            updateUserProfile(req, res, userData);
        }
    });
});

// Normal user registration routes (must be before parameterized routes)
router.get('/register-normal/:timestamp', isAuthenticated, isAdmin, (req, res) => {
    console.log('Rendering register-normal form');
    res.render('users/register-normal', {
        title: 'Register Normal User',
        page: 'users',
        layout: 'layouts/form',
        timestamp: req.params.timestamp,
        messages: {
            error: req.flash('error'),
            success: req.flash('success')
        }
    });
});

router.post('/register-normal/:timestamp', isAuthenticated, isAdmin, (req, res) => {
    console.log('Received register-normal POST request:', req.body);
    
    const userData = {
        username: req.body.username,
        password: req.body.password,
        full_name: req.body.full_name,
        role: 'user',  // Force role to be 'user' for normal user registration
        status: 'offline'  // Set initial status as offline
    };

    console.log('Creating user with data:', { ...userData, password: '[REDACTED]' });

    User.createUser(userData, (err) => {
        if (err) {
            console.error('Error in register-normal:', err);
            if (err.message.includes('UNIQUE constraint failed')) {
                return res.status(400).send('Username already exists');
            }
            console.error('Error creating user:', err);
            return res.status(500).send('Error creating user');
        }
        console.log('User created successfully');
        res.status(200).send('User created successfully');
    });
});

// Search users (AJAX endpoint)
router.get('/search', isAuthenticated, isAdmin, (req, res) => {
    const searchParams = {
        searchTerm: req.query.search ? req.query.search.trim() : '',
        selectedRole: req.query.role || 'all'
    };

    User.searchUsers(searchParams.searchTerm, searchParams.selectedRole, (err, users) => {
        if (err) {
            console.error('Error searching users:', err);
            return res.status(500).json({ error: 'Error searching users' });
        }
        res.json(users);
    });
});

// Create new user (admin only)
router.post('/', isAuthenticated, isAdmin, (req, res) => {
    const userData = {
        username: req.body.username,
        password: req.body.password,
        full_name: req.body.full_name,
        role: req.body.role
    };

    User.createUser(userData, (err) => {
        if (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
                req.flash('error', 'Username already exists');
                return res.redirect('/users/new');
            }
            console.error('Error creating user:', err);
            req.flash('error', 'Error creating user');
            return res.redirect('/users/new');
        }
        req.flash('success', 'User created successfully');
        res.redirect('/users');
    });
});

// Parameterized routes should be last
router.get('/:id/edit', isAuthenticated, isAdmin, (req, res) => {
    User.findById(req.params.id, (err, user) => {
        if (err || !user) {
            req.flash('error', 'User not found');
            return res.redirect('/users');
        }
        res.render('users/edit', { 
            title: 'Edit User',
            page: 'users',
            user: user
        });
    });
});

router.post('/:id', isAuthenticated, isAdmin, (req, res) => {
    // First get the current user to preserve status
    User.findById(req.params.id, (err, currentUser) => {
        if (err || !currentUser) {
            req.flash('error', 'User not found');
            return res.redirect('/users');
        }

        const userData = {
            username: req.body.username,
            full_name: req.body.full_name,
            role: req.body.role,
            status: currentUser.status  // Preserve existing status
        };

        // Only include password if it's being changed
        if (req.body.password && req.body.password.trim() !== '') {
            userData.password = req.body.password;
        }

        User.updateUser(req.params.id, userData, (err) => {
            if (err) {
                if (err.message.includes('UNIQUE constraint failed')) {
                    req.flash('error', 'Username already exists');
                    return res.redirect(`/users/${req.params.id}/edit`);
                }
                console.error('Error updating user:', err);
                req.flash('error', 'Error updating user');
                return res.redirect(`/users/${req.params.id}/edit`);
            }
            req.flash('success', 'User updated successfully');
            res.redirect('/users');
        });
    });
});

router.post('/:id/delete', isAuthenticated, isAdmin, (req, res) => {
    User.deleteUser(req.params.id, (err) => {
        if (err) {
            console.error('Error deleting user:', err);
            req.flash('error', 'Error deleting user');
            return res.redirect('/users');
        }
        req.flash('success', 'User deleted successfully');
        res.redirect('/users');
    });
});

// Helper function for updating user profile
function updateUserProfile(req, res, userData) {
    User.updateUser(req.session.user.id, userData, (err) => {
        if (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
                req.flash('error', 'Username already exists');
            } else {
                console.error('Error updating profile:', err);
                req.flash('error', 'Error updating profile');
            }
            return res.redirect('/users/profile');
        }

        // Update session data
        req.session.user.full_name = userData.full_name;
        req.session.user.username = userData.username;
        // Don't need to update role/status in session as they haven't changed

        req.flash('success', 'Profile updated successfully');
        res.redirect('/users/profile');
    });
}

module.exports = router; 