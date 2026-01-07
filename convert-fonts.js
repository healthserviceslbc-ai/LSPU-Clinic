const fs = require('fs');
const path = require('path');

// Function to convert TTF to base64
async function convertFont() {
    try {
        console.log('Starting font conversion...');
        
        // Read the TTF file
        const fontPath = path.join(__dirname, 'public', 'fonts', 'Canterbury.ttf');
        console.log('Reading font from:', fontPath);
        
        if (!fs.existsSync(fontPath)) {
            throw new Error(`Font file not found at: ${fontPath}`);
        }
        
        // Read and convert to base64
        const fontBuffer = fs.readFileSync(fontPath);
        const fontBase64 = fontBuffer.toString('base64');
        
        // Create output directory if it doesn't exist
        const outputDir = path.join(__dirname, 'public', 'js');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        
        // Create the output JavaScript file with the raw base64 data
        const outputPath = path.join(outputDir, 'canterbury-font.js');
        const jsContent = `
// This file is auto-generated. Do not edit manually.
window.canterburyFontData = '${fontBase64}';`;
        
        // Write the converted font to a JS file
        fs.writeFileSync(outputPath, jsContent);
        
        console.log('Font conversion completed successfully!');
        console.log(`Output saved to: ${outputPath}`);
        
    } catch (error) {
        console.error('Error converting font:', error);
        process.exit(1);
    }
}

// Run the conversion
convertFont(); 