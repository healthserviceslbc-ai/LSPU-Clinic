# LSPU Medicine Inventory System

A medical inventory system for LSPU university clinic.

## System Requirements

- Node.js 16.x
- npm 8.x
- Windows, macOS, or Linux operating system

## Installation Instructions

1. Install Node.js and npm:
   - Download and install Node.js 16.x from [https://nodejs.org/](https://nodejs.org/)
   - npm 8.x will be installed automatically with Node.js

2. Download and extract the application files to your desired location

3. Open a terminal/command prompt and navigate to the application directory

4. Install dependencies (SUPPORTS WINDOWS & MACOS ONLY):
   Type the following command in Git Bash Terminal:
      `npm run setup`

5. Create a `.env` file in the root directory with the following content:
   ```
   PORT=3000
   SESSION_SECRET=your_session_secret_here
   NODE_ENV=production
   ```

6. Start the application:
   ```
   npm start
   ```

7. Open your web browser and navigate to:
   ```
   http://localhost:3000
   ```

## Default Login Credentials
- Username: admin
- Password: admin123

## Support
For any issues or questions, please contact the system administrator.

## License

## Common Issues

- If you encounter SQLITE_CORRUPT: database disk image is malformed, you can try to:
   a. restore the database from the backup. 
   b. delete the database file (inventory.db) and run the application again. 

