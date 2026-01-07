const db = require('../config/database');

function removeUnusedTables() {
    console.log('Starting removal of unused tables...');
    
    db.serialize(() => {
        // Drop daily_inventory table
        db.run(`DROP TABLE IF EXISTS daily_inventory`, err => {
            if (err) {
                console.error('Error dropping daily_inventory table:', err);
            } else {
                console.log('Successfully dropped daily_inventory table');
            }
        });
    });
}

// Run the migration
removeUnusedTables(); 