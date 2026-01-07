const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// Get the database path
const dbPath = path.join(__dirname, '../data/inventory.db');
const backupPath = path.join(__dirname, '../data/inventory.db.backup');

// Function to initialize a new database
function initializeDatabase(dbFile) {
    return new Promise((resolve, reject) => {
        // Remove corrupted database if it exists
        if (fs.existsSync(dbFile)) {
            fs.unlinkSync(dbFile);
        }

        // Create a new database
        const db = new sqlite3.Database(dbFile, (err) => {
            if (err) {
                reject(new Error(`Failed to create new database: ${err.message}`));
                return;
            }

            db.serialize(() => {
                // Create tables
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
                )`);

                db.run(`CREATE TABLE IF NOT EXISTS medicines (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    unit TEXT NOT NULL,
                    expiry_date TEXT,
                    current_stock INTEGER NOT NULL DEFAULT 0,
                    category TEXT NOT NULL DEFAULT 'MEDICINE',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )`);

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

                db.run(`CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    formatted_id TEXT UNIQUE NOT NULL,
                    username TEXT UNIQUE NOT NULL,
                    password TEXT NOT NULL,
                    full_name TEXT NOT NULL,
                    role TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    last_login DATETIME,
                    status TEXT DEFAULT 'offline'
                )`);

                db.close((err) => {
                    if (err) {
                        reject(new Error(`Failed to close database: ${err.message}`));
                    } else {
                        resolve();
                    }
                });
            });
        });
    });
}

// Function to safely restore database from backup
async function restoreFromBackup(source, destination) {
    return new Promise((resolve, reject) => {
        const readStream = fs.createReadStream(source);
        const writeStream = fs.createWriteStream(destination);

        readStream.on('error', (err) => {
            reject(new Error(`Failed to read backup: ${err.message}`));
        });

        writeStream.on('error', (err) => {
            reject(new Error(`Failed to write database: ${err.message}`));
        });

        writeStream.on('finish', () => {
            // Verify the restored database
            const db = new sqlite3.Database(destination, sqlite3.OPEN_READONLY, (err) => {
                if (err) {
                    reject(new Error(`Failed to verify restored database: ${err.message}`));
                    return;
                }

                db.get("PRAGMA integrity_check", [], (err, row) => {
                    db.close();
                    if (err || row.integrity_check !== 'ok') {
                        reject(new Error('Restored database failed integrity check'));
                    } else {
                        resolve();
                    }
                });
            });
        });

        readStream.pipe(writeStream);
    });
}

// Function to create a backup
async function createBackup() {
    try {
        // Check if database exists
        if (!fs.existsSync(dbPath)) {
            console.error('Database file not found!');
            process.exit(1);
        }

        // Create data directory if it doesn't exist
        const dataDir = path.dirname(dbPath);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        // Create backup
        await restoreFromBackup(dbPath, backupPath);
        console.log('Database backup created successfully!');
    } catch (error) {
        console.error('Error creating backup:', error.message);
        process.exit(1);
    }
}

// Function to restore from backup
async function restoreBackup() {
    try {
        // Check if backup exists
        if (!fs.existsSync(backupPath)) {
            console.error('Backup file not found!');
            process.exit(1);
        }

        // Create data directory if it doesn't exist
        const dataDir = path.dirname(dbPath);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        console.log('Initializing new database...');
        await initializeDatabase(dbPath);

        console.log('Restoring from backup...');
        await restoreFromBackup(backupPath, dbPath);
        
        console.log('Database restored successfully!');
    } catch (error) {
        console.error('Error restoring backup:', error.message);
        
        // If restore fails, try to initialize a fresh database
        try {
            console.log('Attempting to initialize fresh database...');
            await initializeDatabase(dbPath);
            console.log('Fresh database initialized. You will need to set up the data again.');
        } catch (initError) {
            console.error('Failed to initialize fresh database:', initError.message);
        }
        process.exit(1);
    }
}

// Handle command line arguments
const command = process.argv[2];
if (command === 'backup') {
    createBackup();
} else if (command === 'restore') {
    restoreBackup();
} else {
    console.log('Usage: node backup-database.js [backup|restore]');
    process.exit(1);
} 