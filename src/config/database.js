const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Create database connection
const db = new sqlite3.Database(
    path.join(__dirname, '../data/inventory.db'),
    sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
    (err) => {
        if (err) {
            console.error('Error connecting to database:', err);
        } else {
            console.log('Connected to SQLite database');
            initializeDatabase();
        }
    }
);

// Initialize database tables
function initializeDatabase() {
    console.log('Starting database initialization...');
    
    db.serialize(() => {
        // Medical Transaction Record table
        db.run(`CREATE TABLE IF NOT EXISTS medical_transactions (
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
        )`, err => {
            if (err) console.error('Error creating medical_transactions table:', err);
            else console.log('medical_transactions table ready');
        });

        // Medicine Inventory table
        db.run(`CREATE TABLE IF NOT EXISTS medicines (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            unit TEXT NOT NULL,
            expiry_date TEXT,
            current_stock INTEGER NOT NULL DEFAULT 0,
            category TEXT NOT NULL DEFAULT 'MEDICINE',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, err => {
            if (err) console.error('Error creating medicines table:', err);
            else console.log('medicines table ready');
        });

        // Create monthly_inventory table
        db.run(`CREATE TABLE IF NOT EXISTS monthly_inventory (
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
        )`);

        // Add replenished_stock column if it doesn't exist
        db.all(`PRAGMA table_info(monthly_inventory)`, (err, rows) => {
            if (err) {
                console.error('Error checking monthly_inventory table schema:', err);
                return;
            }
            
            const hasReplenishedStock = rows.some(row => row.name === 'replenished_stock');
            if (!hasReplenishedStock) {
                console.log('Adding replenished_stock column...');
                db.run(`ALTER TABLE monthly_inventory ADD COLUMN replenished_stock INTEGER NOT NULL DEFAULT 0`);
                console.log('Added replenished_stock column to monthly_inventory table');
            }
        });

        // Check if medicines table is empty
        db.get('SELECT COUNT(*) as count FROM medicines', [], (err, row) => {
            if (err) {
                console.error('Error checking medicines count:', err);
                return;
            }
            
            console.log('Current medicines count:', row.count);
            
            // If empty, initialize with default data
            if (row.count === 0) {
                console.log('Initializing medicines data...');
                const Medicine = require('../models/Medicine');
                Medicine.initializeMedicineInventory(err => {
                    if (err) {
                        console.error('Error initializing medicines:', err);
                    } else {
                        console.log('Medicines initialized successfully');
                        // After medicines are initialized, initialize September 2024 data
                        Medicine.initializeSeptember2024(err => {
                            if (err) console.error('Error initializing September 2024 data:', err);
                            else {
                                console.log('September 2024 data initialized successfully');
                                // Generate future records after September 2024
                                Medicine.generateFutureRecords(err => {
                                    if (err) console.error('Error generating future records:', err);
                                    else console.log('Future records generated successfully');
                                });
                            }
                        });
                    }
                });
            } else {
                // Check if monthly inventory needs initialization
                db.get('SELECT COUNT(*) as count FROM monthly_inventory', [], (err, row) => {
                    if (err) {
                        console.error('Error checking monthly inventory count:', err);
                        return;
                    }
                    
                    if (row.count === 0) {
                        console.log('Initializing monthly inventory data...');
                        const Medicine = require('../models/Medicine');
                        Medicine.initializeSeptember2024(err => {
                            if (err) console.error('Error initializing September 2024 data:', err);
                            else {
                                console.log('September 2024 data initialized successfully');
                                Medicine.generateFutureRecords(err => {
                                    if (err) console.error('Error generating future records:', err);
                                    else console.log('Future records generated successfully');
                                });
                            }
                        });
                    }
                });
            }
        });

        // Add category column if it doesn't exist
        db.all(`PRAGMA table_info(medicines)`, (err, rows) => {
            if (err) {
                console.error('Error checking medicines table schema:', err);
                return;
            }
            
            console.log('Current medicines table columns:', rows.map(r => r.name));
            
            const hasCategory = rows.some(row => row.name === 'category');
            if (!hasCategory) {
                console.log('Adding category column...');
                db.run(`ALTER TABLE medicines ADD COLUMN category TEXT NOT NULL DEFAULT 'MEDICINE'`);
                console.log('Added category column to medicines table');
                
                // Update existing records with appropriate categories
                db.run(`
                    UPDATE medicines 
                    SET category = CASE
                        WHEN unit IN ('BOT', 'PCS', 'BOX', 'PACK', 'ROLLS', 'BOXES') 
                            AND name NOT IN (
                                'LIDOCAINE HCL 2%', 'PROPHY BRUSH AND CUO', 
                                'TERUMO NEEDLE 1:30', 'TOPICAL LIDOCANE', 
                                'SALIVA SUCTION TIP', 'DENTAL BIB',
                                'BATHROOM TISSUE', 'DETERGENT POWDER', 
                                'DISHWASHING LIQUID', 'GLASS CLEANER',
                                'HYGIENIX HAND SANITIZER 100ML', 
                                'HYPOCHLORITE SOLUTION', 'KITCHEN TOWEL',
                                'LIQUID HAND SOAP', 'LIQUID SOLUTION LYSOL',
                                'LYSOL SPRAY'
                            ) THEN 'MEDICAL_SUPPLY'
                        WHEN name IN (
                            'LIDOCAINE HCL 2%', 'PROPHY BRUSH AND CUO', 
                            'TERUMO NEEDLE 1:30', 'TOPICAL LIDOCANE', 
                            'SALIVA SUCTION TIP', 'DENTAL BIB'
                        ) THEN 'DENTAL_SUPPLY'
                        WHEN name IN (
                            'BATHROOM TISSUE', 'DETERGENT POWDER', 
                            'DISHWASHING LIQUID', 'GLASS CLEANER',
                            'HYGIENIX HAND SANITIZER 100ML', 
                            'HYPOCHLORITE SOLUTION', 'KITCHEN TOWEL',
                            'LIQUID HAND SOAP', 'LIQUID SOLUTION LYSOL',
                            'LYSOL SPRAY'
                        ) THEN 'OTHER_SUPPLY'
                        ELSE 'MEDICINE'
                    END
                `, err => {
                    if (err) console.error('Error updating categories:', err);
                    else console.log('Updated categories for existing medicines');
                });
            }
        });

        // Daily Inventory Records table
        db.run(`CREATE TABLE IF NOT EXISTS daily_inventory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            medicine_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            quantity_issued INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (medicine_id) REFERENCES medicines (id)
        )`, err => {
            if (err) console.error('Error creating daily_inventory table:', err);
            else console.log('daily_inventory table ready');
        });

        // Stock Replenishment table
        db.run(`CREATE TABLE IF NOT EXISTS stock_replenishment (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            medicine_id INTEGER NOT NULL,
            quantity_added INTEGER NOT NULL,
            date TEXT NOT NULL,
            FOREIGN KEY (medicine_id) REFERENCES medicines (id)
        )`, err => {
            if (err) console.error('Error creating stock_replenishment table:', err);
            else console.log('stock_replenishment table ready');
        });

        console.log('Database tables initialization complete');
    });
}

module.exports = db; 