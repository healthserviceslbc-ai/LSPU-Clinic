const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

console.log('Starting setup process...');

// Ensure directories exist
const directories = [
    path.join(__dirname, '..', 'src', 'data'),
    path.join(__dirname, '..', 'src', 'data', 'backups'),
    path.join(__dirname, '..', 'uploads')
];

directories.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`Created directory: ${dir}`);
    }
});

// Database setup
const dbPath = path.join(__dirname, '..', 'src', 'data', 'inventory.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error connecting to database:', err);
        process.exit(1);
    }
    console.log('Connected to database');

    // Create tables
    const tables = [
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

    // Create each table
    db.serialize(() => {
        tables.forEach(sql => {
            db.run(sql, err => {
                if (err) {
                    console.error('Error creating table:', err);
                }
            });
        });

        // Create default admin user
        const bcrypt = require('bcrypt');
        bcrypt.hash('admin123', 10, (err, hash) => {
            if (err) {
                console.error('Error hashing password:', err);
                return;
            }

            const createAdmin = `
                INSERT OR IGNORE INTO users (formatted_id, username, password, full_name, role, status)
                VALUES (?, ?, ?, ?, ?, ?)
            `;

            db.run(createAdmin, [
                '0000-0000',
                'admin',
                hash,
                'System Administrator',
                'admin',
                'active'
            ], err => {
                if (err) {
                    console.error('Error creating admin user:', err);
                } else {
                    console.log('Admin user created or already exists');
                }

                // Close database connection
                db.close(err => {
                    if (err) {
                        console.error('Error closing database:', err);
                    } else {
                        console.log('Setup completed successfully!');
                    }
                });
            });
        });
    });
}); 