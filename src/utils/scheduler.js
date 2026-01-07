const schedule = require('node-schedule');
const backupManager = require('./backupManager');
const path = require('path');
const fs = require('fs');

class Scheduler {
    constructor() {
        console.log('=== Scheduler Constructor Started ===');
        this.setupAutomaticBackups();
        console.log('=== Scheduler Constructor Completed ===');
    }

    getFormattedBackupName(date) {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const month = months[date.getMonth()];
        const day = date.getDate().toString().padStart(2, '0');
        const year = date.getFullYear();
        const fileName = `Autobackup_${month}_${day}_${year}.db`;
        console.log('Generated automatic backup filename:', fileName);
        return fileName;
    }

    setupAutomaticBackups() {
        console.log('\n=== Setting up Automatic Backups ===');
        console.log('Current time:', new Date().toLocaleString());
        
        // Ensure backup directory exists
        const backupDir = path.join(__dirname, '..', 'data', 'backups');
        console.log('Backup directory path:', backupDir);
        
        if (!fs.existsSync(backupDir)) {
            try {
                fs.mkdirSync(backupDir, { recursive: true });
                console.log('Created backup directory successfully');
            } catch (error) {
                console.error('Error creating backup directory:', error);
            }
        } else {
            console.log('Backup directory already exists');
        }

        // Schedule monthly backups (runs on the 1st of each month at 00:00)
        try {
            const monthlyJob = schedule.scheduleJob('0 0 1 * *', async () => {
                console.log('\n=== Monthly Backup Triggered ===');
                console.log('Trigger time:', new Date().toLocaleString());
                
                try {
                    const fileName = this.getFormattedBackupName(new Date());
                    console.log('Starting monthly backup with filename:', fileName);
                    
                    await backupManager.createBackup(fileName);
                    console.log('Monthly backup file created successfully');
                    
                    console.log('Starting cleanup of old backups...');
                    backupManager.cleanOldBackups(5);
                    console.log('Monthly backup cleanup completed');
                    
                    console.log('=== Monthly Backup Completed Successfully ===\n');
                } catch (error) {
                    console.error('Error during monthly backup process:', error);
                }
            });

            if (monthlyJob && monthlyJob.nextInvocation()) {
                console.log('Monthly backup schedule set successfully');
                console.log('Next monthly backup scheduled for:', monthlyJob.nextInvocation().toString());
            } else {
                console.error('Failed to set up monthly backup schedule');
            }
        } catch (error) {
            console.error('Error setting up monthly backup schedule:', error);
        }
    }
}

// Create and export scheduler instance
console.log('\n=== Creating Scheduler Instance ===');
const scheduler = new Scheduler();
console.log('=== Scheduler Instance Created ===\n');

module.exports = scheduler; 