const db = require('../config/database');

function convertDate(oldDate) {
    if (!oldDate) return null;

    try {
        // Parse MMM-YY format (e.g., "Nov-27")
        const [month, year] = oldDate.split('-');
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const monthIndex = monthNames.indexOf(month);
        
        if (monthIndex === -1) return null;

        // Convert 2-digit year to 4-digit year
        const fullYear = parseInt('20' + year);
        
        // Format as YYYY-MM-DD (using 01 as the day)
        return `${fullYear}-${(monthIndex + 1).toString().padStart(2, '0')}-01`;
    } catch (error) {
        console.error('Error converting date:', oldDate, error);
        return null;
    }
}

function migrateDates() {
    console.log('Starting date migration...');

    // Get all medicines with expiry dates
    const selectSql = `SELECT id, name, expiry_date FROM medicines WHERE expiry_date IS NOT NULL`;
    
    db.all(selectSql, [], (err, rows) => {
        if (err) {
            console.error('Error selecting medicines:', err);
            return;
        }

        console.log(`Found ${rows.length} medicines with expiry dates to migrate`);

        // Start a transaction
        db.serialize(() => {
            db.run('BEGIN TRANSACTION');

            let completed = 0;
            let errors = 0;

            rows.forEach(row => {
                const newDate = convertDate(row.expiry_date);
                console.log(`Converting ${row.name}: ${row.expiry_date} -> ${newDate}`);

                const updateSql = `UPDATE medicines SET expiry_date = ? WHERE id = ?`;
                db.run(updateSql, [newDate, row.id], (err) => {
                    if (err) {
                        console.error(`Error updating medicine ${row.name}:`, err);
                        errors++;
                    }
                    
                    completed++;
                    
                    // Check if all updates are done
                    if (completed === rows.length) {
                        if (errors > 0) {
                            console.error(`Migration completed with ${errors} errors`);
                            db.run('ROLLBACK');
                        } else {
                            console.log('Migration completed successfully');
                            db.run('COMMIT');
                        }
                    }
                });
            });
        });
    });
}

// Run the migration
migrateDates(); 