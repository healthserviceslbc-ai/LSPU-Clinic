const os = require('os');
const { execSync } = require('child_process');

const platform = os.platform();

// Check if this is being run as a postinstall script
const isPostInstall = process.env.npm_lifecycle_event === 'postinstall';

try {
  if (platform === 'darwin') {
    console.log('MacOS detected...');
    if (!isPostInstall) {
      console.log('Running macOS installation...');
      execSync('npm run install-mac', { stdio: 'inherit' });
    }
  } else if (platform === 'win32') {
    console.log('Windows detected...');
    if (!isPostInstall) {
      console.log('Running Windows installation...');
      execSync('npm run install-win', { stdio: 'inherit' });
    }
  } else {
    console.log('Unsupported platform');
    process.exit(1);
  }
} catch (error) {
  console.error('Installation failed:', error);
  process.exit(1);
}