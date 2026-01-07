const db = require('./database');

// Drop and recreate users table
const recreateTable = () => {
    const dropTable = `DROP TABLE IF EXISTS users`;
    const createTable = `CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        formatted_id TEXT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        full_name TEXT NOT NULL,
        role TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login DATETIME,
        status TEXT DEFAULT 'offline'
    )`;

    db.serialize(() => {
        db.run(dropTable, (err) => {
            if (err) {
                console.error('Error dropping table:', err);
                process.exit(1);
            }
            console.log('Users table dropped successfully');

            db.run(createTable, (err) => {
                if (err) {
                    console.error('Error creating table:', err);
                    process.exit(1);
                }
                console.log('Users table created successfully');

                // Create unique index for formatted_id
                db.run("CREATE UNIQUE INDEX idx_users_formatted_id ON users(formatted_id)", (err) => {
                    if (err) {
                        console.error('Error creating index:', err);
                        process.exit(1);
                    }
                    console.log('Unique index created successfully');
                    process.exit(0);
                });
            });
        });
    });
};

recreateTable(); 