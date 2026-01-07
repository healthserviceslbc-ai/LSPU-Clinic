const db = require('../config/database');
const Medicine = require('./Medicine');

class Inventory {
    static getDailyInventory(date, callback) {
        const sql = `
            SELECT 
                m.name, 
                m.unit, 
                m.expiry_date,
                COALESCE(SUM(t.quantity), 0) as quantity_issued,
                m.current_stock
            FROM medicines m
            LEFT JOIN medical_transactions t 
                ON m.name = t.medication 
                AND date(t.date) = ?
            GROUP BY m.id, m.name, m.unit, m.expiry_date, m.current_stock
            ORDER BY m.name`;
        
        db.all(sql, [date], callback);
    }

    static getMonthlyReport(year, month, callback) {
        // First, clean up previous months' data using Medicine model's method
        Medicine.cleanupPreviousMonths((err) => {
            if (err) {
                console.error('Error cleaning up previous months:', err);
                return callback(err);
            }

            // Check if this is a month before Nov 2024 or after current month
            const currentDate = new Date();
            const currentYear = currentDate.getFullYear();
            const currentMonth = currentDate.getMonth() + 1;
            const requestedDate = new Date(parseInt(year), parseInt(month) - 1);
            const sep2024 = new Date(2024, 8); // September is 8 in JS dates (0-based)

            if (requestedDate < sep2024) {
                // Return empty report for months before Sep 2024
                return callback(null, {
                    medicines: [],
                    medical_supplies: [],
                    dental_supplies: [],
                    other_supplies: []
                });
            }

            const sql = `
                WITH DailyUsage AS (
                    SELECT 
                        m.id as medicine_id,
                        strftime('%d', t.date) as day,
                        SUM(t.quantity) as quantity
                    FROM medicines m
                    LEFT JOIN medical_transactions t ON m.name = t.medication
                    WHERE strftime('%Y-%m', t.date) = ?
                    GROUP BY m.id, strftime('%d', t.date)
                )
                SELECT 
                    m.id,
                    m.name,
                    m.unit,
                    m.expiry_date,
                    m.current_stock,
                    m.category,
                    mi.beginning_stock,
                    COALESCE(mi.replenished_stock, 0) as replenished_stock,
                    json_group_array(
                        json_object(
                            'day', CAST(du.day AS INTEGER),
                            'quantity', COALESCE(du.quantity, 0)
                        )
                    ) as usage
                FROM monthly_inventory mi
                INNER JOIN medicines m ON m.id = mi.medicine_id
                LEFT JOIN DailyUsage du ON m.id = du.medicine_id
                WHERE mi.year = ? 
                AND mi.month = ?
                GROUP BY m.id
                ORDER BY 
                    CASE m.category
                        WHEN 'MEDICINES' THEN 1
                        WHEN 'MEDICAL SUPPLIES' THEN 2
                        WHEN 'DENTAL SUPPLIES' THEN 3
                        WHEN 'OTHER SUPPLIES' THEN 4
                        ELSE 5
                    END,
                    LOWER(m.name) COLLATE NOCASE ASC`;
            
            const yearMonth = `${year}-${month.padStart(2, '0')}`;
            
            db.all(sql, [yearMonth, year, month], (err, rows) => {
                if (err) return callback(err);
                
                // Process each row
                rows.forEach(row => {
                    try {
                        // Parse usage data
                        const usageData = JSON.parse(row.usage).filter(u => u.day !== null);
                        
                        // Initialize daily usage for all days
                        row.daily_usage = {};
                        for (let i = 1; i <= 31; i++) {
                            row.daily_usage[i] = '';
                        }
                        
                        // Fill in actual usage data
                        usageData.forEach(usage => {
                            if (usage.day && usage.quantity) {
                                row.daily_usage[usage.day] = usage.quantity;
                            }
                        });
                        
                        // Calculate total issued from daily usage
                        row.total_issued = Object.values(row.daily_usage)
                            .filter(q => q !== '')
                            .reduce((sum, q) => sum + parseInt(q), 0);
                        
                        // Keep expiry_date in YYYY-MM-DD format
                        if (row.expiry_date) {
                            row.expiry_date = new Date(row.expiry_date).toISOString().split('T')[0];
                        }
                        
                        delete row.usage; // Remove raw usage data
                    } catch (e) {
                        console.error('Error processing row:', e);
                    }
                });
                
                // Group medicines by category
                const report = {
                    medicines: rows.filter(r => r.category === 'MEDICINES'),
                    medical_supplies: rows.filter(r => r.category === 'MEDICAL SUPPLIES'),
                    dental_supplies: rows.filter(r => r.category === 'DENTAL SUPPLIES'),
                    other_supplies: rows.filter(r => r.category === 'OTHER SUPPLIES')
                };
                
                callback(null, report);
            });
        });
    }

    static getStockHistory(medicineId, startDate, endDate, callback) {
        const sql = `
            SELECT 
                di.date,
                di.quantity_issued,
                t.type,
                t.quantity as stock_change,
                t.current_stock
            FROM daily_inventory di
            LEFT JOIN (
                SELECT 
                    date,
                    'ISSUE' as type,
                    quantity as quantity,
                    NULL as current_stock
                FROM medical_transactions
                WHERE medicine_id = ?
                UNION ALL
                SELECT 
                    date,
                    'RESTOCK' as type,
                    quantity,
                    current_stock
                FROM stock_replenishment
                WHERE medicine_id = ?
            ) t ON date(di.date) = date(t.date)
            WHERE di.medicine_id = ?
            AND di.date BETWEEN ? AND ?
            ORDER BY di.date DESC`;
        
        db.all(sql, [medicineId, medicineId, medicineId, startDate, endDate], callback);
    }

    static getLowStockReport(threshold, callback) {
        const sql = `
            SELECT 
                m.name,
                m.unit,
                m.current_stock,
                m.expiry_date,
                (
                    SELECT AVG(daily_usage.qty)
                    FROM (
                        SELECT date, SUM(quantity) as qty
                        FROM medical_transactions
                        WHERE medication = m.name
                        GROUP BY date
                    ) daily_usage
                ) as avg_daily_usage
            FROM medicines m
            WHERE m.current_stock <= ?
            ORDER BY m.current_stock ASC`;
        
        db.all(sql, [threshold], callback);
    }

    static getExpiryReport(monthsThreshold, callback) {
        const sql = `
            SELECT 
                name,
                unit,
                current_stock,
                expiry_date,
                ROUND(
                    JULIANDAY(expiry_date) - JULIANDAY('now'),
                    0
                ) as days_until_expiry
            FROM medicines
            WHERE expiry_date IS NOT NULL
            AND days_until_expiry <= ?
            ORDER BY days_until_expiry ASC`;
        
        db.all(sql, [monthsThreshold * 30], callback);
    }

    static recordDailyIssue(medicineId, date, quantity, callback) {
        const sql = `INSERT INTO daily_inventory 
            (medicine_id, date, quantity_issued) 
            VALUES (?, ?, ?)`;
        
        db.run(sql, [medicineId, date, quantity], callback);
    }
}

module.exports = Inventory; 