const bcrypt = require('bcrypt');
const User = require('../models/User');

exports.getLoginPage = (req, res) => {
    if (req.session.user) {
        return res.redirect('/');
    }
    res.render('auth/login', {
        title: 'Login',
        page: 'login',
        error: req.session.error
    });
    delete req.session.error;
};

exports.login = (req, res) => {
    const { username, password } = req.body;

    User.findByUsername(username, (err, user) => {
        if (err || !user) {
            req.session.error = 'Invalid username or password';
            return res.redirect('/auth/login');
        }

        // Check if user is already logged in
        if (user.status === 'online') {
            // Force set user to offline if they haven't logged out properly
            User.setUserOffline(user.id, (err) => {
                if (err) {
                    console.error('Error resetting user status:', err);
                    req.session.error = 'Error logging in. Please try again.';
                    return res.redirect('/auth/login');
                }
                // Continue with login process
                proceedWithLogin();
            });
        } else {
            proceedWithLogin();
        }

        function proceedWithLogin() {
            User.verifyPassword(password, user.password, (err, isValid) => {
                if (err || !isValid) {
                    req.session.error = 'Invalid username or password';
                    return res.redirect('/auth/login');
                }

                // Update last login time and set status to online
                User.updateLastLogin(user.id, (err) => {
                    if (err) {
                        console.error('Error updating last login time:', err);
                    }

                    // Store user in session (exclude password)
                    req.session.user = {
                        id: user.id,
                        username: user.username,
                        full_name: user.full_name,
                        role: user.role,
                        status: 'online'
                    };

                    // Set isAdmin flag
                    req.session.isAdmin = user.role === 'admin';

                    res.redirect('/');
                });
            });
        }
    });
};

exports.logout = (req, res) => {
    if (req.session.user) {
        // Set user status to offline
        User.setUserOffline(req.session.user.id, (err) => {
            if (err) {
                console.error('Error setting user offline:', err);
            }
            // Destroy the session after setting user offline
            req.session.destroy((err) => {
                if (err) {
                    console.error('Error destroying session:', err);
                }
                res.redirect('/auth/login');
            });
        });
    } else {
        res.redirect('/auth/login');
    }
};

// Handle session expiry
exports.handleSessionExpiry = (req, res, next) => {
    if (req.session && req.session.user) {
        // Check if session is about to expire
        const sessionTimeout = req.session.cookie.maxAge;
        const currentTime = Date.now();
        
        // If session is expired or about to expire in the next minute
        if (sessionTimeout <= 60000) {
            // Set user status to offline
            User.setUserOffline(req.session.user.id, (err) => {
                if (err) {
                    console.error('Error setting user offline on session expiry:', err);
                }
            });
        }
    }
    next();
};

// Middleware to check if user is authenticated
exports.requireAuth = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/auth/login');
    }
    next();
};

exports.verifyPassword = (req, res) => {
    // Check if user is logged in
    if (!req.session.userId) {
        return res.status(401).json({
            success: false,
            error: 'Not logged in'
        });
    }

    const { password } = req.body;

    if (!password) {
        return res.status(400).json({
            success: false,
            error: 'Password is required'
        });
    }

    // Get user from database
    User.getUserById(req.session.userId, (err, user) => {
        if (err) {
            return res.status(500).json({
                success: false,
                error: 'Error verifying password'
            });
        }

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // Compare password
        bcrypt.compare(password, user.password, (err, isMatch) => {
            if (err) {
                return res.status(500).json({
                    success: false,
                    error: 'Error verifying password'
                });
            }

            if (!isMatch) {
                return res.status(400).json({
                    success: false,
                    error: 'Incorrect password'
                });
            }

            res.json({
                success: true,
                message: 'Password verified'
            });
        });
    });
}; 