const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// Get the database paths
const sourceDbPath = path.join(__dirname, '../data/working/inventory.db');
const targetDbPath = path.join(__dirname, '../data/inventory.db');

async function restoreWorkingDatabase() {
    try {
        // Create data directory if it doesn't exist
        const dataDir = path.dirname(targetDbPath);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        // Check if source database exists
        if (!fs.existsSync(sourceDbPath)) {
            console.error('Working database not found at:', sourceDbPath);
            console.log('\nPlease copy your working database to:', path.join(__dirname, '../data/working/inventory.db'));
            process.exit(1);
        }

        // Verify source database integrity
        const sourceDb = new sqlite3.Database(sourceDbPath, sqlite3.OPEN_READONLY);
        
        console.log('Checking source database integrity...');
        await new Promise((resolve, reject) => {
            sourceDb.get("PRAGMA integrity_check", [], (err, result) => {
                if (err) {
                    reject(new Error(`Source database integrity check failed: ${err.message}`));
                    return;
                }
                if (result.integrity_check !== 'ok') {
                    reject(new Error('Source database failed integrity check'));
                    return;
                }
                resolve();
            });
        });

        // Close source database connection
        await new Promise((resolve, reject) => {
            sourceDb.close((err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        console.log('Source database verified. Starting restore...');

        // Remove existing target database if it exists
        if (fs.existsSync(targetDbPath)) {
            console.log('Removing existing database...');
            fs.unlinkSync(targetDbPath);
        }

        // Copy the database file
        console.log('Copying database...');
        fs.copyFileSync(sourceDbPath, targetDbPath);

        // Verify the restored database
        const targetDb = new sqlite3.Database(targetDbPath, sqlite3.OPEN_READONLY);
        
        console.log('Verifying restored database...');
        await new Promise((resolve, reject) => {
            targetDb.get("PRAGMA integrity_check", [], (err, result) => {
                if (err) {
                    reject(new Error(`Restored database integrity check failed: ${err.message}`));
                    return;
                }
                if (result.integrity_check !== 'ok') {
                    reject(new Error('Restored database failed integrity check'));
                    return;
                }
                resolve();
            });
        });

        // Close target database connection
        await new Promise((resolve, reject) => {
            targetDb.close((err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        console.log('\nDatabase restored successfully!');
        console.log('Source:', sourceDbPath);
        console.log('Target:', targetDbPath);
        
    } catch (error) {
        console.error('\nError restoring database:', error.message);
        process.exit(1);
    }
}

// Run the restore
restoreWorkingDatabase(); 