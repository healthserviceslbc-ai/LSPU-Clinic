const Inventory = require('../models/Inventory');
const db = require('../config/database');
const puppeteer = require('puppeteer');
const path = require('path');

exports.getDailyReport = (req, res) => {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    
    Inventory.getDailyInventory(date, (err, inventory) => {
        if (err) {
            console.error(err);
            return res.status(500).render('error', {
                title: 'Error',
                page: 'error',
                error: 'Error generating daily report'
            });
        }
        res.render('reports/daily', {
            title: 'Daily Report',
            page: 'reports',
            date: date,
            inventory: inventory,
            message: req.session.message
        });
        delete req.session.message;
    });
};

exports.getMonthlyReport = (req, res) => {
    const today = new Date();
    const year = req.query.year || today.getFullYear().toString();
    const month = req.query.month || (today.getMonth() + 1).toString().padStart(2, '0');

    // First check available months from check-db
    const sql = `
        SELECT DISTINCT year, month 
        FROM monthly_inventory 
        ORDER BY year, month`;
    
    db.all(sql, [], (err, availableMonths) => {
        if (err) {
            console.error('Error checking available months:', err);
            return res.status(500).render('error', {
                title: 'Error',
                page: 'error',
                error: 'Error checking available months'
            });
        }

        // Check if selected month is available
        const isMonthAvailable = availableMonths.some(m => 
            m.year.toString() === year && m.month.toString() === parseInt(month).toString()
        );

        if (!isMonthAvailable) {
            // Return empty report if month is not available
            return res.render('reports/monthly', {
                title: 'Medicine Inventory Sheet',
                page: 'reports',
                year: year,
                month: month,
                report: {
                    medicines: [],
                    medical_supplies: [],
                    dental_supplies: [],
                    other_supplies: []
                },
                message: req.session.message
            });
        }

        // If month is available, proceed with getting the report
        Inventory.getMonthlyReport(year, month, (err, report) => {
            if (err) {
                console.error('Error getting monthly report:', err);
                return res.status(500).render('error', {
                    title: 'Error',
                    page: 'error',
                    error: 'Error generating monthly report'
                });
            }

            res.render('reports/monthly', {
                title: 'Medicine Inventory Sheet',
                page: 'reports',
                year: year,
                month: month,
                report: report,
                message: req.session.message
            });
            delete req.session.message;
        });
    });
};

exports.getLowStockReport = (req, res) => {
    const threshold = parseInt(req.query.threshold) || 10;

    Inventory.getLowStockReport(threshold, (err, medicines) => {
        if (err) {
            console.error(err);
            return res.status(500).render('error', {
                title: 'Error',
                page: 'error',
                error: 'Error generating low stock report'
            });
        }
        res.render('reports/low-stock', {
            title: 'Low Stock Report',
            page: 'reports',
            threshold: threshold,
            medicines: medicines,
            message: req.session.message
        });
        delete req.session.message;
    });
};

exports.getExpiryReport = (req, res) => {
    const monthsThreshold = parseInt(req.query.months) || 3;

    Inventory.getExpiryReport(monthsThreshold, (err, medicines) => {
        if (err) {
            console.error(err);
            return res.status(500).render('error', {
                title: 'Error',
                page: 'error',
                error: 'Error generating expiry report'
            });
        }
        res.render('reports/expiry', {
            title: 'Expiry Report',
            page: 'reports',
            monthsThreshold: monthsThreshold,
            medicines: medicines,
            message: req.session.message
        });
        delete req.session.message;
    });
};

exports.getStockHistory = (req, res) => {
    const { medicineId } = req.params;
    const startDate = req.query.startDate || new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().split('T')[0];
    const endDate = req.query.endDate || new Date().toISOString().split('T')[0];

    Inventory.getStockHistory(medicineId, startDate, endDate, (err, history) => {
        if (err) {
            console.error(err);
            return res.status(500).render('error', {
                title: 'Error',
                page: 'error',
                error: 'Error retrieving stock history'
            });
        }
        res.render('reports/stock-history', {
            title: 'Stock History',
            page: 'reports',
            medicineId: medicineId,
            startDate: startDate,
            endDate: endDate,
            history: history,
            message: req.session.message
        });
        delete req.session.message;
    });
};

// Export all functions
module.exports = {
    getDailyReport: exports.getDailyReport,
    getMonthlyReport: exports.getMonthlyReport,
    getLowStockReport: exports.getLowStockReport,
    getExpiryReport: exports.getExpiryReport,
    getStockHistory: exports.getStockHistory,
    generatePdfServer: async function(req, res) {
        try {
            const { month, year } = req.query;
            
            // Launch browser with memory-efficient settings
            const browser = await puppeteer.launch({
                headless: 'new',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--disable-gpu',
                    '--js-flags=--max-old-space-size=4096',
                    '--font-render-hinting=none'
                ]
            });

            const page = await browser.newPage();
            
            // Intercept font requests to optimize loading
            await page.setRequestInterception(true);
            page.on('request', request => {
                if (request.resourceType() === 'font') {
                    request.respond({
                        status: 200,
                        contentType: 'font/ttf',
                        body: Buffer.alloc(0) // Send empty response for font requests
                    });
                } else {
                    request.continue();
                }
            });
            
            // Set viewport
            await page.setViewport({
                width: 1920,
                height: 1080,
                deviceScaleFactor: 1 // Reduced from 2 to save memory
            });

            // Navigate to the reports page with font optimization flag
            const reportUrl = `${req.protocol}://${req.get('host')}/reports/monthly?month=${month}&year=${year}&optimize=true`;
            await page.goto(reportUrl, { 
                waitUntil: 'networkidle0',
                timeout: 60000 // Increased timeout
            });

            // Wait for table to be visible
            await page.waitForSelector('#inventoryTable', { timeout: 60000 });

            // Use system fonts instead of custom fonts
            await page.evaluate(() => {
                document.body.style.fontFamily = 'Arial, sans-serif';
            });

            // Generate PDF with optimized settings
            const pdf = await page.pdf({
                format: 'A4',
                landscape: true,
                printBackground: true,
                preferCSSPageSize: true,
                margin: {
                    top: '20mm',
                    right: '20mm',
                    bottom: '20mm',
                    left: '20mm'
                },
                scale: 0.8 // Slightly reduce scale to fit more content
            });

            await browser.close();

            // Send PDF with compression
            res.contentType('application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="report-${month}-${year}.pdf"`);
            res.setHeader('Content-Length', pdf.length);
            res.send(pdf);

        } catch (error) {
            console.error('Server-side PDF generation error:', error);
            await browser?.close().catch(() => {}); // Ensure browser closes even on error
            res.status(500).json({ error: 'Failed to generate PDF. Please try downloading instead of preview.' });
        }
    }
}; 