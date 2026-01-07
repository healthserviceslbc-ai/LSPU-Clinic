const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const expressLayouts = require('express-ejs-layouts');
const User = require('./models/User');
const { addUserToLocals } = require('./middleware/auth');
const { handleSessionExpiry } = require('./controllers/authController');
require('dotenv').config();
require('./utils/scheduler'); // Initialize backup scheduler

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static file serving - make sure this comes before other middleware
app.use('/js', express.static(path.join(__dirname, 'public/js')));
app.use('/css', express.static(path.join(__dirname, 'public/css')));
app.use('/images', express.static(path.join(__dirname, 'public/images')));
app.use('/icons', express.static(path.join(__dirname, 'public/images/icons')));
app.use('/favicon.ico', express.static(path.join(__dirname, 'public/images/icons/favicon.ico')));
app.use('/app.ico', express.static(path.join(__dirname, 'public/images/icons/app.ico')));
app.use('/fonts', express.static(path.join(__dirname, '../public/fonts')));
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Log the actual paths being used for debugging
console.log('Icons directory:', path.join(__dirname, 'public/images/icons'));
console.log('Favicon path:', path.join(__dirname, 'public/images/icons/favicon.ico'));
console.log('App icon path:', path.join(__dirname, 'public/images/icons/app.ico'));

// Session and Flash setup
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false
}));
app.use(flash());

// View engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Configure express-ejs-layouts
app.use(expressLayouts);
app.set('layout', 'layouts/main');
app.set('layout extractScripts', true);
app.set('layout extractStyles', true);

// Make flash messages and default variables available to all views
app.use((req, res, next) => {
    res.locals.success = req.flash('success');
    res.locals.error = req.flash('error');
    res.locals.body = ''; // Initialize body variable
    res.locals.style = ''; // Initialize style variable
    res.locals.script = ''; // Initialize script variable
    res.locals.title = 'LSPU Medicine Inventory'; // Set default title
    res.locals.page = ''; // Initialize page variable
    next();
});

// Make user available to all views
app.use(addUserToLocals);

// Initialize database tables
User.initialize((err) => {
    if (err) {
        console.error('Error initializing users table:', err);
    } else {
        // Create default admin user if it doesn't exist
        User.findByUsername('admin', (err, user) => {
            if (err) {
                console.error('Error checking for admin user:', err);
            } else if (!user) {
                User.createUser({
                    username: 'admin',
                    password: process.env.ADMIN_PASSWORD || 'admin123',
                    full_name: 'System Administrator',
                    role: 'admin'
                }, (err) => {
                    if (err) {
                        console.error('Error creating admin user:', err);
                    } else {
                        console.log('Default admin user created');
                    }
                });
            }
        });
    }
});

// Routes
const authController = require('./controllers/authController');

// Auth routes (unprotected)
app.use('/auth', require('./routes/auth'));

// Protected routes - make sure these come before error handlers
app.use('/users', authController.requireAuth, require('./routes/users'));
app.use('/medicines', authController.requireAuth, require('./routes/medicineRoutes'));
app.use('/transactions', authController.requireAuth, require('./routes/transactions'));
app.use('/inventory', authController.requireAuth, require('./routes/inventory'));
app.use('/api/reports', authController.requireAuth, require('./routes/reports'));
app.use('/reports', authController.requireAuth, require('./routes/reports'));
app.use('/', authController.requireAuth, require('./routes/index'));

// Root redirect
app.get('/', (req, res) => {
    res.redirect('/reports/monthly');
});

// Error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).render('error', {
        title: 'Error',
        page: 'error',
        error: err.message,
        layout: 'layouts/main'
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).render('404', {
        title: '404 - Page Not Found',
        page: '404',
        layout: 'layouts/main'
    });
});

// Add session expiry handler before routes
app.use(handleSessionExpiry);

const PORT = process.env.PORT || 3000;
const DATABASE_PATH = process.env.DATABASE_PATH || path.join(__dirname, '../data/database.sqlite');
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

module.exports = app; 