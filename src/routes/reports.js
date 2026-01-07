const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const db = require('../config/database');
const Medicine = require('../models/Medicine');
const bcrypt = require('bcrypt');
const User = require('../models/User');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
const backupManager = require('../utils/backupManager');

// Authentication middleware
function isAuthenticated(req, res, next) {
    if (req.session && req.session.user) {
        return next();
    }
    
    // Check if it's an AJAX request
    const isAjax = req.xhr || 
                   req.headers.accept?.toLowerCase().includes('application/json') || 
                   req.headers['content-type']?.toLowerCase().includes('application/json');
    
    if (isAjax) {
        return res.status(401).json({ 
            success: false, 
            error: 'Please log in first'
        });
    }
    
    // For regular requests, redirect to login
    res.redirect('/auth/login');
}

// Apply authentication to all routes
router.use(isAuthenticated);

// Helper function to convert month number to name
function getMonthName(monthNum) {
    const months = [
        'January', 'February', 'March', 'April',
        'May', 'June', 'July', 'August',
        'September', 'October', 'November', 'December'
    ];
    return months[parseInt(monthNum) - 1];
}

// Initialize September 2024 data
router.post('/initialize-september', (req, res) => {
    console.log('Starting September 2024 initialization...');
    
    Medicine.initializeSeptember2024((err) => {
        if (err) {
            console.error('Error initializing September 2024:', err);
            return res.status(500).json({ 
                success: false, 
                error: err.message || 'Error initializing September 2024 data' 
            });
        }
        console.log('Successfully initialized September 2024 data');
        res.json({ success: true });
    });
});

// Check database contents
router.get('/check-db', (req, res) => {
    // Render the page even if database is corrupted
    res.render('reports/check-db', {
        title: 'Check Database Records',
        records: [],
        layout: 'layouts/main',
        error: req.query.error
    });
});

// Add separate endpoint for fetching records
router.get('/check-db/records', (req, res) => {
    const sql = `
        WITH base_count AS (
            SELECT COUNT(*) as total 
            FROM monthly_inventory 
            WHERE year = '2024' AND month = '09'
        )
        SELECT 
            year,
            month,
            COUNT(*) as count,
            (SELECT total FROM base_count) as total_medicines,
            ROUND(CAST(COUNT(*) AS FLOAT) / (SELECT total FROM base_count) * 100, 2) as percentage
        FROM monthly_inventory
        GROUP BY year, month
        ORDER BY year DESC, month DESC`;

    db.all(sql, [], (err, records) => {
        if (err) {
            console.error('Error fetching records:', err);
            return res.json({ error: err.message, records: [] });
        }

        // Format the month numbers to include leading zeros
        records = records.map(record => ({
            ...record,
            month: record.month.toString().padStart(2, '0'),
            percentage: record.percentage || 0
        }));

        res.json({ records });
    });
});

// Remove monthly records
router.post('/remove-record', (req, res) => {
    const { year, month } = req.body;

    // Validate input
    if (!year || !month) {
        return res.status(400).json({ success: false, error: 'Year and month are required' });
    }

    // Convert month name back to number for comparison
    const monthNum = new Date(Date.parse(month + " 1, 2000")).getMonth() + 1;
    const monthStr = monthNum.toString().padStart(2, '0');

    // Prevent removing records from September 2024
    if (year === '2024' && monthStr === '09') {
        return res.status(400).json({ 
            success: false, 
            error: 'Cannot remove records from September 2024 as it is the initial month' 
        });
    }

    const sql = `
        DELETE FROM monthly_inventory
        WHERE year = ? AND month = ?`;

    db.run(sql, [year, monthStr], function(err) {
        if (err) {
            console.error('Error removing records:', err);
            return res.status(500).json({ success: false, error: 'Database error' });
        }
        res.json({ success: true });
    });
});

// Check all monthly inventory data
router.get('/check-all', (req, res) => {
    const sql = `
        SELECT m.name, m.unit, m.category, mi.*
        FROM monthly_inventory mi
        JOIN medicines m ON m.id = mi.medicine_id
        ORDER BY mi.year, mi.month, m.name`;
    
    db.all(sql, [], (err, records) => {
        if (err) {
            console.error('Error checking all inventory:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(records);
    });
});

// Get monthly report
router.get('/monthly', reportController.getMonthlyReport);

// Get daily report
router.get('/daily', reportController.getDailyReport);

// Get low stock report
router.get('/low-stock', reportController.getLowStockReport);

// Create October 2024 records
router.post('/create-october', (req, res) => {
    console.log('Starting creation of October 2024 records...');

    // First check if October records already exist
    db.get('SELECT COUNT(*) as count FROM monthly_inventory WHERE year = ? AND month = ?', ['2024', '10'], (err, result) => {
        if (err) {
            console.error('Error checking existing October records:', err);
            return res.status(500).json({ 
                success: false, 
                error: 'Error checking existing records' 
            });
        }

        if (result.count > 0) {
            console.log('October records already exist');
            return res.status(400).json({
                success: false,
                error: 'October 2024 records already exist'
            });
        }

        // Check if September records exist
        db.get('SELECT COUNT(*) as count FROM monthly_inventory WHERE year = ? AND month = ?', ['2024', '09'], (err, result) => {
            if (err) {
                console.error('Error checking September records:', err);
                return res.status(500).json({ 
                    success: false, 
                    error: 'Error checking September records' 
                });
            }

            if (result.count === 0) {
                console.log('September records not found');
                return res.status(400).json({
                    success: false,
                    error: 'September 2024 records not found. Please initialize September first.'
                });
            }

            // Create October records
            const sql = `
                INSERT INTO monthly_inventory 
                    (medicine_id, year, month, beginning_stock, replenished_stock, total_issued, balance)
                SELECT 
                    medicine_id,
                    '2024' as year,
                    '10' as month,
                    balance as beginning_stock,
                    0 as replenished_stock,
                    0 as total_issued,
                    balance
                FROM monthly_inventory 
                WHERE year = '2024' AND month = '09'`;

            console.log('Executing SQL to create October records...');
            
            db.run(sql, function(err) {
                if (err) {
                    console.error('Error creating October records:', err);
                    return res.status(500).json({ 
                        success: false, 
                        error: 'Error creating October records: ' + err.message 
                    });
                }
                console.log('October records created successfully');
                res.json({ 
                    success: true, 
                    message: 'October 2024 records created successfully',
                    recordsCreated: this.changes
                });
            });
        });
    });
});

// Delete medicine from specific month onwards
router.post('/medicines/delete', (req, res) => {
    const { id, year, month, password } = req.body;

    // Validate input
    if (!id || !year || !month) {
        return res.status(400).json({ 
            success: false, 
            error: 'Missing required parameters' 
        });
    }

    // Verify password
    if (!password) {
        return res.status(400).json({ 
            success: false, 
            error: 'Password is required' 
        });
    }

    // Get the user's hashed password from the database
    const userId = req.session.user.id;
    console.log('Attempting to verify password for user:', userId);

    User.findById(userId, (err, user) => {
        if (err) {
            console.error('Error finding user:', err);
            return res.status(500).json({ 
                success: false, 
                error: 'Error verifying password' 
            });
        }

        if (!user) {
            console.error('User not found:', userId);
            return res.status(401).json({ 
                success: false, 
                error: 'User not found' 
            });
        }

        if (!user.password) {
            console.error('User has no password hash:', userId);
            return res.status(500).json({ 
                success: false, 
                error: 'User password not set properly' 
            });
        }

        console.log('Found user, comparing passwords...');
        
        // Compare the provided password with the hashed password
        try {
            bcrypt.compare(password, user.password, (err, isMatch) => {
                if (err) {
                    console.error('Error comparing passwords:', err);
                    return res.status(500).json({ 
                        success: false, 
                        error: 'Error verifying password' 
                    });
                }

                if (!isMatch) {
                    console.log('Password mismatch for user:', userId);
                    return res.status(401).json({ 
                        success: false, 
                        error: 'Invalid password' 
                    });
                }

                console.log('Password verified, proceeding with deletion...');

                // Password is correct, proceed with deletion
                Medicine.deleteMedicine(id, year, month, (err, result) => {
                    if (err) {
                        console.error('Error deleting medicine:', err);
                        return res.status(500).json({ 
                            success: false, 
                            error: err.message || 'Error deleting medicine' 
                        });
                    }
                    res.json({ 
                        success: true,
                        message: `Successfully deleted medicine records from ${month}/${year} onwards`,
                        recordsDeleted: result.recordsDeleted
                    });
                });
            });
        } catch (error) {
            console.error('Exception during password comparison:', error);
            return res.status(500).json({ 
                success: false, 
                error: 'Error during password verification' 
            });
        }
    });
});

// Generate future monthly records
router.post('/generate-future-records', (req, res) => {
    // Additional authentication check
    if (!req.session || !req.session.user) {
        return res.status(401).json({
            success: false,
            error: 'Please log in first'
        });
    }

    console.log('Starting generation of future monthly records...');
    
    Medicine.generateFutureRecords((err, recordsCreated) => {
        if (err) {
            console.error('Error generating future records:', err);
            return res.status(500).json({ 
                success: false, 
                error: err.message || 'Error generating future records' 
            });
        }
        res.json({ 
            success: true, 
            message: `Successfully generated ${recordsCreated} future records`,
            recordsCreated
        });
    });
});

// Verify future records
router.get('/verify-future-records', (req, res) => {
    const sql = `
        SELECT 
            year,
            month,
            COUNT(*) as record_count,
            (SELECT COUNT(*) FROM medicines) as total_medicines,
            ROUND(CAST(COUNT(*) AS FLOAT) / (SELECT COUNT(*) FROM medicines) * 100, 2) as completion_percentage
        FROM monthly_inventory
        WHERE year >= '2024' AND month >= '09'
        GROUP BY year, month
        ORDER BY year, month`;

    db.all(sql, [], (err, records) => {
        if (err) {
            console.error('Error verifying future records:', err);
            return res.status(500).json({ 
                success: false, 
                error: 'Error verifying future records' 
            });
        }
        res.json({ 
            success: true, 
            records,
            totalMonths: records.length,
            averageCompletion: records.reduce((acc, r) => acc + r.completion_percentage, 0) / (records.length || 1)
        });
    });
});

// Clean up monthly records
router.post('/cleanup-records', (req, res) => {
    console.log('Starting cleanup of monthly records...');
    
    Medicine.cleanupMonthlyRecords((err, result) => {
        if (err) {
            console.error('Error cleaning up records:', err);
            return res.status(500).json({ 
                success: false, 
                error: err.message || 'Error cleaning up records' 
            });
        }
        res.json({ 
            success: true, 
            message: 'Successfully cleaned up monthly records',
            ...result
        });
    });
});

// Update stock continuity
router.post('/update-stock-continuity', (req, res) => {
    console.log('Starting update of stock continuity...');
    
    Medicine.ensureStockContinuity((err, result) => {
        if (err) {
            console.error('Error updating stock continuity:', err);
            return res.status(500).json({ 
                success: false, 
                error: err.message || 'Error updating stock continuity' 
            });
        }
        res.json({ 
            success: true, 
            message: 'Successfully updated stock continuity',
            ...result
        });
    });
});

// Remove all monthly records
router.post('/remove-all-records', (req, res) => {
    console.log('Removing all monthly records...');
    
    Medicine.removeAllMonthlyRecords((err, result) => {
        if (err) {
            console.error('Error removing monthly records:', err);
            return res.status(500).json({ 
                success: false, 
                error: err.message || 'Error removing monthly records' 
            });
        }
        res.json({ 
            success: true, 
            message: `Successfully removed ${result.recordsRemoved} monthly records`,
            recordsRemoved: result.recordsRemoved
        });
    });
});

// Add diagnostic route
router.get('/diagnose-db', (req, res) => {
    console.log('Starting database diagnosis...');
    
    // Check database connection
    db.get("PRAGMA integrity_check", [], (err, integrityResult) => {
        if (err) {
            console.error('Database integrity check failed:', err);
            return res.json({
                status: 'error',
                error: err.message,
                step: 'integrity_check'
            });
        }

        // Check tables exist
        db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, tables) => {
            if (err) {
                console.error('Error checking tables:', err);
                return res.json({
                    status: 'error',
                    error: err.message,
                    step: 'table_check',
                    integrity: integrityResult
                });
            }

            // Check monthly_inventory structure
            db.all("PRAGMA table_info(monthly_inventory)", [], (err, columns) => {
                if (err) {
                    console.error('Error checking monthly_inventory structure:', err);
                    return res.json({
                        status: 'error',
                        error: err.message,
                        step: 'structure_check',
                        integrity: integrityResult,
                        tables: tables
                    });
                }

                // Check record counts
                db.get("SELECT COUNT(*) as count FROM monthly_inventory", [], (err, count) => {
                    if (err) {
                        console.error('Error counting records:', err);
                        return res.json({
                            status: 'error',
                            error: err.message,
                            step: 'count_check',
                            integrity: integrityResult,
                            tables: tables,
                            structure: columns
                        });
                    }

                    // Return all diagnostic information
                    res.json({
                        status: 'success',
                        integrity: integrityResult,
                        tables: tables,
                        monthly_inventory_structure: columns,
                        record_count: count,
                        database_path: db.filename
                    });
                });
            });
        });
    });
});

// Export database
router.get('/export-db', (req, res) => {
    const dbPath = path.join(__dirname, '../data/inventory.db');
    res.download(dbPath, `inventory_backup_${new Date().toISOString().split('T')[0]}.db`);
});

// Import database
router.post('/import-db', upload.single('database'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const dbPath = path.join(__dirname, '../data/inventory.db');
    const backupPath = path.join(__dirname, '../data/inventory.db.backup');

    try {
        // Create backup of current database
        fs.copyFileSync(dbPath, backupPath);

        // Copy uploaded file to database location
        fs.copyFileSync(req.file.path, dbPath);

        // Clean up uploaded file
        fs.unlinkSync(req.file.path);

        res.json({ success: true });
    } catch (error) {
        console.error('Error importing database:', error);
        // Try to restore from backup if import fails
        if (fs.existsSync(backupPath)) {
            try {
                fs.copyFileSync(backupPath, dbPath);
            } catch (restoreError) {
                console.error('Error restoring backup:', restoreError);
            }
        }
        res.status(500).json({ success: false, error: error.message });
    }
});

// Create backup
router.post('/create-backup', async (req, res) => {
    try {
        const { fileName, type } = req.body;
        if (!fileName) {
            throw new Error('Filename is required');
        }

        // Create backup using the BackupManager
        const result = await backupManager.createBackup(fileName, type || 'Auto');
        
        console.log(`Backup created successfully: ${fileName} (Type: ${type || 'Auto'})`);
        res.json({ 
            success: true,
            message: 'Backup created successfully',
            fileName: fileName,
            type: type || 'Auto',
            backupPath: path.join('src', 'data', 'backups', fileName)
        });
    } catch (error) {
        console.error('Error creating backup:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message || 'Error creating backup'
        });
    }
});

// Get backup status and history
router.get('/backup-status', (req, res) => {
    try {
        const backupHistory = backupManager.getBackupHistory();
        res.json({
            success: true,
            backupHistory
        });
    } catch (error) {
        console.error('Error getting backup status:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Revert to backup
router.post('/revert-backup', async (req, res) => {
    try {
        const { backupId } = req.body;
        await backupManager.restoreBackup(backupId);
        res.json({ success: true });
    } catch (error) {
        console.error('Error reverting backup:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Download backup
router.get('/download-backup/:fileName', (req, res) => {
    try {
        const { fileName } = req.params;
        const filePath = backupManager.downloadBackup(fileName);
        res.download(filePath);
    } catch (error) {
        console.error('Error downloading backup:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Extend records by 10 years
router.post('/extend-records', (req, res) => {
    console.log('Starting record extension...');

    const sql = `
        WITH current_range AS (
            SELECT MIN(year) as min_year, MAX(year) as max_year
            FROM monthly_inventory
        ),
        medicine_list AS (
            SELECT id, current_stock
            FROM medicines
        )
        SELECT 
            cr.min_year,
            cr.max_year,
            COUNT(DISTINCT m.id) as medicine_count
        FROM current_range cr
        CROSS JOIN medicine_list m`;

    db.get(sql, [], (err, range) => {
        if (err) {
            console.error('Error getting current range:', err);
            return res.status(500).json({ 
                success: false, 
                error: 'Error getting current range' 
            });
        }

        const { min_year, max_year, medicine_count } = range;
        const new_max_year = parseInt(max_year) + 10;

        // First, remove old records
        const removeOldRecordsSql = `
            DELETE FROM monthly_inventory
            WHERE year < ?`;

        db.run(removeOldRecordsSql, [max_year - 9], function(err) {
            if (err) {
                console.error('Error removing old records:', err);
                return res.status(500).json({ 
                    success: false, 
                    error: 'Error removing old records' 
                });
            }

            const removedRecords = this.changes;

            // Generate new records for the next 10 years
            const insertNewRecordsSql = `
                WITH RECURSIVE
                months(year, month) AS (
                    SELECT 
                        CAST(strftime('%Y', 'now') AS INTEGER),
                        CAST(strftime('%m', 'now') AS INTEGER)
                    UNION ALL
                    SELECT
                        CASE 
                            WHEN month = 12 THEN year + 1
                            ELSE year
                        END,
                        CASE 
                            WHEN month = 12 THEN 1
                            ELSE month + 1
                        END
                    FROM months
                    WHERE year < ?
                ),
                last_records AS (
                    SELECT 
                        medicine_id,
                        balance as last_balance
                    FROM monthly_inventory mi1
                    WHERE (year, month) = (
                        SELECT year, month
                        FROM monthly_inventory mi2
                        ORDER BY year DESC, month DESC
                        LIMIT 1
                    )
                )
                INSERT INTO monthly_inventory 
                    (medicine_id, year, month, beginning_stock, replenished_stock, total_issued, balance)
                SELECT 
                    m.id,
                    mo.year,
                    mo.month,
                    COALESCE(lr.last_balance, m.current_stock) as beginning_stock,
                    0 as replenished_stock,
                    0 as total_issued,
                    COALESCE(lr.last_balance, m.current_stock) as balance
                FROM months mo
                CROSS JOIN medicines m
                LEFT JOIN last_records lr ON lr.medicine_id = m.id
                WHERE (mo.year > ? OR (mo.year = ? AND mo.month > ?))
                AND NOT EXISTS (
                    SELECT 1 
                    FROM monthly_inventory mi 
                    WHERE mi.medicine_id = m.id 
                    AND mi.year = mo.year 
                    AND mi.month = mo.month
                )`;

            const currentDate = new Date();
            const currentYear = currentDate.getFullYear();
            const currentMonth = currentDate.getMonth() + 1;

            db.run(insertNewRecordsSql, [new_max_year, currentYear, currentYear, currentMonth], function(err) {
                if (err) {
                    console.error('Error generating new records:', err);
                    return res.status(500).json({ 
                        success: false, 
                        error: 'Error generating new records' 
                    });
                }

                console.log(`Extended records successfully. Added: ${this.changes}, Removed: ${removedRecords}`);
                res.json({ 
                    success: true,
                    addedRecords: this.changes,
                    removedRecords: removedRecords
                });
            });
        });
    });
});

// Add route for server-side PDF generation
router.get('/generate-pdf', reportController.generatePdfServer);

// Recreate database with original schema
router.post('/recreate-database', async (req, res) => {
    const fs = require('fs').promises;
    const path = require('path');
    const dbPath = path.join(__dirname, '../data/inventory.db');
    const backupPath = path.join(__dirname, '../data/inventory.db.backup');

    try {
        // Create backup of current database
        await fs.copyFile(dbPath, backupPath);

        // Close the database connection and wait for it to complete
        await new Promise((resolve, reject) => {
            db.serialize(() => {
                // Finalize all statements
                db.run("PRAGMA optimize", () => {
                    db.close((err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });
            });
        });

        // Wait a bit to ensure the file is fully released
        await new Promise(resolve => setTimeout(resolve, 1000));

        try {
            // Delete the current database
            await fs.unlink(dbPath);
        } catch (unlinkError) {
            if (unlinkError.code === 'ENOENT') {
                // File doesn't exist, which is fine
                console.log('Database file did not exist, will create new one');
            } else {
                throw unlinkError;
            }
        }

        // Create new database connection
        const sqlite3 = require('sqlite3').verbose();
        const newDb = new sqlite3.Database(
            dbPath,
            sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
            async (err) => {
                if (err) {
                    console.error('Error creating new database:', err);
                    try {
                        await fs.copyFile(backupPath, dbPath);
                        return res.status(500).json({
                            success: false,
                            error: 'Failed to recreate database. Restored from backup.'
                        });
                    } catch (restoreErr) {
                        return res.status(500).json({
                            success: false,
                            error: 'Critical error: Failed to recreate database and restore backup.'
                        });
                    }
                }

                // Initialize the database with original schema
                newDb.serialize(() => {
                    // Create tables
                    const createTables = [
                        // Medical Transaction Record table
                        `CREATE TABLE IF NOT EXISTS medical_transactions (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            date TEXT NOT NULL,
                            patient_name TEXT NOT NULL,
                            course_year_section TEXT NOT NULL,
                            complaints TEXT NOT NULL,
                            time_started TEXT NOT NULL,
                            time_finished TEXT,
                            medication TEXT NOT NULL,
                            quantity INTEGER NOT NULL,
                            remarks TEXT,
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                        )`,
                        // Medicine Inventory table
                        `CREATE TABLE IF NOT EXISTS medicines (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            name TEXT NOT NULL,
                            unit TEXT NOT NULL,
                            expiry_date TEXT,
                            current_stock INTEGER NOT NULL DEFAULT 0,
                            category TEXT NOT NULL DEFAULT 'MEDICINE',
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                        )`,
                        // Monthly Inventory table
                        `CREATE TABLE IF NOT EXISTS monthly_inventory (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            medicine_id INTEGER NOT NULL,
                            year INTEGER NOT NULL,
                            month INTEGER NOT NULL,
                            beginning_stock INTEGER NOT NULL,
                            replenished_stock INTEGER NOT NULL DEFAULT 0,
                            total_issued INTEGER NOT NULL DEFAULT 0,
                            balance INTEGER NOT NULL,
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                            FOREIGN KEY (medicine_id) REFERENCES medicines(id),
                            UNIQUE(medicine_id, year, month)
                        )`,
                        // Daily Inventory Records table
                        `CREATE TABLE IF NOT EXISTS daily_inventory (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            medicine_id INTEGER NOT NULL,
                            date TEXT NOT NULL,
                            quantity_issued INTEGER NOT NULL DEFAULT 0,
                            FOREIGN KEY (medicine_id) REFERENCES medicines (id)
                        )`,
                        // Stock Replenishment table
                        `CREATE TABLE IF NOT EXISTS stock_replenishment (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            medicine_id INTEGER NOT NULL,
                            quantity_added INTEGER NOT NULL,
                            date TEXT NOT NULL,
                            FOREIGN KEY (medicine_id) REFERENCES medicines (id)
                        )`,
                        // Users table
                        `CREATE TABLE IF NOT EXISTS users (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            formatted_id TEXT UNIQUE NOT NULL,
                            username TEXT UNIQUE NOT NULL,
                            password TEXT NOT NULL,
                            full_name TEXT NOT NULL,
                            role TEXT NOT NULL,
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                            last_login DATETIME,
                            status TEXT DEFAULT 'offline'
                        )`
                    ];

                    let tablesCreated = 0;
                    createTables.forEach(sql => {
                        newDb.run(sql, err => {
                            if (err) {
                                console.error('Error creating table:', err);
                                return res.status(500).json({
                                    success: false,
                                    error: 'Error creating database tables'
                                });
                            }
                            tablesCreated++;
                            if (tablesCreated === createTables.length) {
                                // Create admin user
                                const bcrypt = require('bcrypt');
                                bcrypt.hash('admin123', 10, (err, hash) => {
                                    if (err) {
                                        return res.status(500).json({
                                            success: false,
                                            error: 'Error creating admin user'
                                        });
                                    }
                                    newDb.run(`
                                        INSERT INTO users (formatted_id, username, password, full_name, role, status)
                                        VALUES (?, ?, ?, ?, ?, ?)
                                    `, [
                                        '0000-0000',
                                        'admin',
                                        hash,
                                        'System Administrator',
                                        'admin',
                                        'active'
                                    ], err => {
                                        if (err) {
                                            return res.status(500).json({
                                                success: false,
                                                error: 'Error creating admin user'
                                            });
                                        }

                                        // Close the new database connection
                                        newDb.close((err) => {
                                            if (err) {
                                                console.error('Error closing new database:', err);
                                            }

                                            // Force restart the application to reinitialize all connections
                                            res.json({
                                                success: true,
                                                message: 'Database recreated successfully with original schema'
                                            });
                                            
                                            // Give time for the response to be sent
                                            setTimeout(() => {
                                                process.exit(0); // This will force PM2 or similar process manager to restart the app
                                            }, 1000);
                                        });
                                    });
                                });
                            }
                        });
                    });
                });
            }
        );
    } catch (error) {
        console.error('Error during database recreation:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to recreate database: ' + error.message
        });
    }
});

module.exports = router; 