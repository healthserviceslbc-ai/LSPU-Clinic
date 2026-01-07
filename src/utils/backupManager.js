const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

class BackupManager {
    constructor() {
        this.backupDir = path.join(__dirname, '..', 'data', 'backups');
        this.dbPath = path.join(__dirname, '..', 'data', 'inventory.db');
        
        // Ensure backup directory exists
        if (!fs.existsSync(this.backupDir)) {
            try {
                fs.mkdirSync(this.backupDir, { recursive: true });
                console.log('Created backup directory:', this.backupDir);
            } catch (error) {
                console.error('Error creating backup directory:', error);
            }
        }
    }

    async createBackup(fileName, type = 'Auto') {
        return new Promise((resolve, reject) => {
            try {
                const backupPath = path.join(this.backupDir, fileName);
                console.log('Creating backup at:', backupPath);

                // First check if source database exists
                if (!fs.existsSync(this.dbPath)) {
                    reject(new Error('Source database not found'));
                    return;
                }

                // Check if we can write to the backup directory
                try {
                    fs.accessSync(this.backupDir, fs.constants.W_OK);
                } catch (error) {
                    reject(new Error('Cannot write to backup directory'));
                    return;
                }

                // Create backup using file system copy instead of SQLite backup
                fs.copyFile(this.dbPath, backupPath, (err) => {
                    if (err) {
                        console.error('Backup error:', err);
                        reject(err);
                        return;
                    }
                    console.log('Backup completed successfully at:', backupPath);
                    resolve({ success: true, type });
                });
            } catch (error) {
                console.error('Unexpected error during backup:', error);
                reject(error);
            }
        });
    }

    async restoreBackup(fileName) {
        return new Promise((resolve, reject) => {
            try {
                const backupPath = path.join(this.backupDir, fileName);
                
                if (!fs.existsSync(backupPath)) {
                    reject(new Error('Backup file not found'));
                    return;
                }

                // Create a temporary backup of the current database
                const tempBackupPath = this.dbPath + '.temp';
                fs.copyFileSync(this.dbPath, tempBackupPath);

                try {
                    // Copy the backup file to the main database location
                    fs.copyFileSync(backupPath, this.dbPath);
                    // Remove the temporary backup
                    fs.unlinkSync(tempBackupPath);
                    resolve(true);
                } catch (error) {
                    // If restore fails, try to recover the original database
                    if (fs.existsSync(tempBackupPath)) {
                        fs.copyFileSync(tempBackupPath, this.dbPath);
                        fs.unlinkSync(tempBackupPath);
                    }
                    reject(error);
                }
            } catch (error) {
                console.error('Error during restore:', error);
                reject(error);
            }
        });
    }

    getBackupHistory() {
        try {
            if (!fs.existsSync(this.backupDir)) {
                console.log('Backup directory does not exist:', this.backupDir);
                return [];
            }

            console.log('Reading backup directory:', this.backupDir);
            const files = fs.readdirSync(this.backupDir);
            
            // Filter for .db files and get their stats
            const backups = files
                .filter(file => file.endsWith('.db'))
                .map(file => {
                    const filePath = path.join(this.backupDir, file);
                    const stats = fs.statSync(filePath);
                    // Determine backup type from filename
                    const type = file.startsWith('Manualbackup_') ? 'Manual Backup' : 
                               file.startsWith('Autobackup_') ? 'Auto Backup' : 
                               'Unknown';
                    return {
                        fileName: file,
                        date: stats.mtime,
                        size: stats.size,
                        type: type
                    };
                })
                .sort((a, b) => b.date - a.date); // Sort by date, newest first

            console.log(`Found ${backups.length} backup files`);
            return backups;
        } catch (error) {
            console.error('Error reading backup history:', error);
            return [];
        }
    }

    downloadBackup(fileName) {
        const backupPath = path.join(this.backupDir, fileName);
        if (!fs.existsSync(backupPath)) {
            throw new Error('Backup file not found');
        }
        return backupPath;
    }

    cleanOldBackups(retentionYears = 5) {
        try {
            if (!fs.existsSync(this.backupDir)) {
                return;
            }

            const files = fs.readdirSync(this.backupDir);
            const now = new Date();
            const cutoffDate = new Date(now.setFullYear(now.getFullYear() - retentionYears));

            files.forEach(file => {
                const filePath = path.join(this.backupDir, file);
                const stats = fs.statSync(filePath);
                if (stats.mtime < cutoffDate) {
                    try {
                        fs.unlinkSync(filePath);
                        console.log(`Removed old backup: ${file}`);
                    } catch (error) {
                        console.error(`Error removing backup ${file}:`, error);
                    }
                }
            });
        } catch (error) {
            console.error('Error cleaning old backups:', error);
        }
    }
}

module.exports = new BackupManager(); 