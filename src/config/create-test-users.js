const db = require('./database');
const User = require('../models/User');
const bcrypt = require('bcrypt');

// Create test users
const createTestUsers = () => {
    const users = [
        {
            username: 'admin',
            password: 'admin123',
            full_name: 'System Administrator',
            role: 'admin',
            status: 'active',
            formatted_id: '0000-0000'
        },
        {
            username: 'user',
            password: 'user123',
            full_name: 'Regular User',
            role: 'user',
            status: 'active',
            formatted_id: '1111-1111'
        }
    ];

    let created = 0;
    users.forEach(user => {
        bcrypt.hash(user.password, 10, (err, hash) => {
            if (err) {
                console.error(`Error hashing password for ${user.role}:`, err);
                process.exit(1);
            }

            const sql = `INSERT INTO users (formatted_id, username, password, full_name, role, status)
                        VALUES (?, ?, ?, ?, ?, ?)`;
            
            db.run(sql, [
                user.formatted_id,
                user.username, 
                hash, 
                user.full_name, 
                user.role,
                user.status
            ], (err) => {
                if (err) {
                    console.error(`Error creating ${user.role}:`, err);
                    process.exit(1);
                }
                console.log(`${user.role} user created successfully`);
                created++;
                if (created === users.length) {
                    console.log('All test users created successfully');
                    // List all users
                    User.getAllUsers((err, users) => {
                        if (err) {
                            console.error('Error listing users:', err);
                            process.exit(1);
                        }
                        console.log('\nCreated Users:');
                        users.forEach(user => {
                            console.log(`- ${user.full_name} (${user.username})`);
                            console.log(`  Role: ${user.role}`);
                            console.log(`  ID: ${user.formatted_id}\n`);
                        });
                        process.exit(0);
                    });
                }
            });
        });
    });
};

// First drop the users table and recreate it
const dropTable = `DROP TABLE IF EXISTS users`;
const createTable = `CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    formatted_id TEXT UNIQUE NOT NULL,
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
                // Now create the test users
                createTestUsers();
            });
        });
    });
}); 