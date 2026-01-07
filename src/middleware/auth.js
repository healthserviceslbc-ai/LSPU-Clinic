const User = require('../models/User');

// Middleware to check if user is authenticated
function isAuthenticated(req, res, next) {
    if (req.session && req.session.user) {
        return next();
    }
    res.redirect('/auth/login');
}

// Middleware to check if user is admin
function isAdmin(req, res, next) {
    if (req.session && req.session.user && req.session.user.role === 'admin') {
        return next();
    }
    res.status(403).render('error', {
        message: 'Access Denied',
        error: { status: 403, stack: 'You do not have permission to access this page.' }
    });
}

// Add user data to all responses
function addUserToLocals(req, res, next) {
    if (req.session && req.session.user) {
        res.locals.user = req.session.user;
        // Set isAdmin based on user role
        res.locals.isAdmin = req.session.user.role === 'admin';
        // Set page title if not set
        res.locals.title = res.locals.title || 'LSPU Medicine Inventory';
        // Set current page if not set
        res.locals.page = res.locals.page || 'home';
    } else {
        res.locals.user = null;
        res.locals.isAdmin = false;
    }
    next();
}

module.exports = {
    isAuthenticated,
    isAdmin,
    addUserToLocals
}; 