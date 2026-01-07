const fs = require('fs');
const path = require('path');
const os = require('os');

console.log('Starting cleanup process...');

// Function to safely remove a path
async function removePath(pathToClean) {
    try {
        if (fs.existsSync(pathToClean)) {
            const stats = fs.lstatSync(pathToClean);
            if (stats.isDirectory()) {
                await fs.promises.rm(pathToClean, { recursive: true, force: true });
                console.log(`Removed directory: ${pathToClean}`);
            } else {
                await fs.promises.unlink(pathToClean);
                console.log(`Removed file: ${pathToClean}`);
            }
        } else {
            console.log(`Path does not exist (skipping): ${pathToClean}`);
        }
    } catch (error) {
        console.error(`Error cleaning ${pathToClean}:`, error.message);
    }
}

// Function to safely create a directory
async function createDir(dir) {
    try {
        if (!fs.existsSync(dir)) {
            await fs.promises.mkdir(dir, { recursive: true });
            console.log(`Created directory: ${dir}`);
        }
    } catch (error) {
        console.error(`Error creating directory ${dir}:`, error.message);
    }
}

// Paths to clean (using path.join for cross-platform compatibility)
const pathsToClean = [
    path.join(__dirname, '..', 'src', 'data', 'backups'),
    path.join(__dirname, '..', 'src', 'data', 'inventory.db'),
    path.join(__dirname, '..', 'src', 'data', 'inventory.db.backup'),
    path.join(__dirname, '..', 'uploads'),
    path.join(__dirname, '..', 'node_modules'),
    path.join(__dirname, '..', 'package-lock.json')
];

// Directories to create after cleaning
const dirsToCreate = [
    path.join(__dirname, '..', 'src', 'data'),
    path.join(__dirname, '..', 'src', 'data', 'backups'),
    path.join(__dirname, '..', 'uploads')
];

// Clean npm cache if specified
if (process.argv.includes('--clean-cache')) {
    const npmCache = os.platform() === 'win32' 
        ? path.join(os.homedir(), 'AppData', 'Roaming', 'npm-cache')
        : path.join(os.homedir(), '.npm');
    pathsToClean.push(npmCache);
}

// Main cleanup function
async function cleanup() {
    try {
        // Clean paths
        for (const pathToClean of pathsToClean) {
            await removePath(pathToClean);
        }

        // Create necessary directories
        for (const dir of dirsToCreate) {
            await createDir(dir);
        }

        console.log('Cleanup completed successfully!');
    } catch (error) {
        console.error('Cleanup failed:', error);
        process.exit(1);
    }
}

// Run cleanup
cleanup(); 