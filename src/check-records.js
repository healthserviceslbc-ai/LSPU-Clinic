const db = require('./config/database');

// Query to check records
const sql = `
    SELECT 
        year,
        month,
        COUNT(*) as count,
        (SELECT COUNT(*) FROM medicines) as total_medicines
    FROM monthly_inventory
    GROUP BY year, month
    ORDER BY year, month;
`;

// Execute query
db.all(sql, [], (err, records) => {
    if (err) {
        console.error('Error:', err);
        process.exit(1);
    }

    console.log('Monthly Records:');
    console.log('---------------');
    records.forEach(record => {
        console.log(`${record.year}-${record.month}: ${record.count} records (out of ${record.total_medicines} medicines)`);
    });

    // Close the database connection
    db.close(() => process.exit(0));
}); 