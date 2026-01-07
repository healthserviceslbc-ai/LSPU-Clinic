const db = require('../config/database');

class Medicine {
    static cleanupPreviousMonths(callback) {
        db.serialize(() => {
            db.run('BEGIN TRANSACTION');

            // Only delete records before September 2024
            const deleteMonthlySQL = `
                DELETE FROM monthly_inventory 
                WHERE (year < '2024')
                OR (year = '2024' AND month < '09')`;
            
            // Delete all transactions before September 2024
            const deleteTransactionsSQL = `
                DELETE FROM medical_transactions 
                WHERE strftime('%Y-%m', date) < '2024-09'`;

            // Delete all stock replenishments before September 2024
            const deleteReplenishmentsSQL = `
                DELETE FROM stock_replenishment 
                WHERE strftime('%Y-%m', date) < '2024-09'`;
            
            // Reset current_stock in medicines table to the latest balance
            const resetMedicinesSQL = `
                UPDATE medicines 
                SET current_stock = COALESCE(
                    (
                        SELECT balance 
                        FROM monthly_inventory 
                        WHERE medicine_id = medicines.id 
                        ORDER BY year DESC, month DESC
                        LIMIT 1
                    ),
                    100  -- Default to 100 if no record exists
                )`;

            db.run(deleteMonthlySQL, [], (err) => {
                if (err) {
                    console.error('Error deleting monthly inventory:', err);
                    db.run('ROLLBACK');
                    return callback(err);
                }

                db.run(deleteTransactionsSQL, [], (err) => {
                    if (err) {
                        console.error('Error deleting transactions:', err);
                        db.run('ROLLBACK');
                        return callback(err);
                    }

                    db.run(deleteReplenishmentsSQL, [], (err) => {
                        if (err) {
                            console.error('Error deleting replenishments:', err);
                            db.run('ROLLBACK');
                            return callback(err);
                        }

                        db.run(resetMedicinesSQL, [], (err) => {
                            if (err) {
                                console.error('Error resetting medicines current_stock:', err);
                                db.run('ROLLBACK');
                                return callback(err);
                            }

                            db.run('COMMIT', callback);
                        });
                    });
                });
            });
        });
    }

    static getAllMedicines(year, month, callback) {
        // Ensure callback is a function
        if (typeof callback !== 'function') {
            console.error('Callback is not a function');
            return;
        }

        // Get current system date
        const currentDate = new Date();
        const currentYear = currentDate.getFullYear().toString();
        const currentMonth = (currentDate.getMonth() + 1).toString().padStart(2, '0');

        console.log('Current system date:', { currentYear, currentMonth });
        console.log('Requested date:', { year, month });

        // Ensure year and month are properly formatted
        if (!year || !month) {
            year = year || currentYear;
            month = month || currentMonth;
        }
        
        // Ensure month is a string padded with leading zero
        month = month.toString().padStart(2, '0');

        // Check if this is a month before Sep 2024
        const requestedDate = new Date(parseInt(year), parseInt(month) - 1);
        const sep2024 = new Date(2024, 8); // September is 8 in JS dates (0-based)

        // Return empty data for invalid dates (only check for dates before Sep 2024)
        if (requestedDate < sep2024) {
            console.log('Invalid date requested:', { year, month });
            return callback(null, {
                medicines: [],
                medical_supplies: [],
                dental_supplies: [],
                other_supplies: []
            });
        }

        console.log('Getting medicines from database for year:', year, 'month:', month);

        // Calculate previous month and year
        let prevMonth = parseInt(month) - 1;
        let prevYear = parseInt(year);
        if (prevMonth === 0) {
            prevMonth = 12;
            prevYear--;
        }
        prevMonth = prevMonth.toString().padStart(2, '0');
        prevYear = prevYear.toString();

        db.serialize(() => {
            db.run('BEGIN TRANSACTION');

            // Check if records exist for the requested month
            const checkMonthSQL = `
                SELECT COUNT(*) as count
                FROM monthly_inventory
                WHERE year = ? AND month = ?`;

            db.get(checkMonthSQL, [year, month], (err, result) => {
                if (err) {
                    console.error('Error checking month records:', err);
                    db.run('ROLLBACK');
                    return callback(err);
                }

                console.log('Month record count:', result.count);

                if (result.count === 0) {
                    console.log('No records exist for month, creating from previous month');
                    // No records exist for month, create them from previous month
                    const createMonthSQL = `
                        INSERT INTO monthly_inventory (
                            medicine_id, year, month, beginning_stock, 
                            total_issued, balance, replenished_stock
                        )
                        SELECT 
                            m.id as medicine_id,
                            ?,
                            ?,
                            COALESCE(prev.balance, 0) as beginning_stock,
                            0 as total_issued,
                            COALESCE(prev.balance, 0) as balance,
                            0 as replenished_stock
                        FROM medicines m
                        LEFT JOIN monthly_inventory prev ON 
                            m.id = prev.medicine_id 
                            AND prev.year = ? 
                            AND prev.month = ?
                        WHERE NOT EXISTS (
                            SELECT 1 
                            FROM monthly_inventory curr
                            WHERE curr.medicine_id = m.id
                            AND curr.year = ?
                            AND curr.month = ?
                        )`;

                    db.run(createMonthSQL, [year, month, prevYear, prevMonth, year, month], (err) => {
                        if (err) {
                            console.error('Error creating month records:', err);
                            db.run('ROLLBACK');
                            return callback(err);
                        }
                        console.log('Successfully created records for month');
                        fetchData();
                    });
                } else {
                    console.log('Records already exist for month');
                    fetchData();
                }
            });

            const fetchData = () => {
                // Get medicines with their inventory data for the selected month
        const sql = `
                    WITH prev_month_balance AS (
                        SELECT 
                            medicine_id,
                            balance as prev_balance
                        FROM monthly_inventory
                        WHERE year = ? 
                        AND month = ?
                    )
            SELECT 
                m.*,
                mi.beginning_stock,
                mi.replenished_stock,
                mi.total_issued,
                        COALESCE(mi.beginning_stock, 0) + COALESCE(mi.replenished_stock, 0) - COALESCE(mi.total_issued, 0) as balance,
                        pmb.prev_balance
                    FROM monthly_inventory mi
                    INNER JOIN medicines m ON m.id = mi.medicine_id
                    LEFT JOIN prev_month_balance pmb ON pmb.medicine_id = mi.medicine_id
                    WHERE mi.year = ? 
                AND mi.month = ?
            ORDER BY 
                CASE m.category
                    WHEN 'MEDICINES' THEN 1
                    WHEN 'MEDICAL SUPPLIES' THEN 2
                    WHEN 'DENTAL SUPPLIES' THEN 3
                    WHEN 'OTHER SUPPLIES' THEN 4
                    ELSE 5
                END,
                m.name`;
        
                // Then get the data
                db.all(sql, [prevYear, prevMonth, year, month], (err, rows) => {
            if (err) {
                console.error('Error fetching medicines:', err);
                        db.run('ROLLBACK');
                return callback(err);
            }
            
            try {
                // Group medicines by category
                const report = {
                    medicines: rows.filter(r => r.category === 'MEDICINES') || [],
                    medical_supplies: rows.filter(r => r.category === 'MEDICAL SUPPLIES') || [],
                    dental_supplies: rows.filter(r => r.category === 'DENTAL SUPPLIES') || [],
                    other_supplies: rows.filter(r => r.category === 'OTHER SUPPLIES') || []
                };
                
                        db.run('COMMIT', (err) => {
                            if (err) {
                                console.error('Error committing transaction:', err);
                                return callback(err);
                            }
                callback(null, report);
                        });
            } catch (e) {
                console.error('Error processing medicine data:', e);
                        db.run('ROLLBACK');
                callback(e);
            }
                });
            };
        });
    }

    static addMedicine(medicineData, callback) {
        console.log('Adding new medicine:', medicineData);

        // Validate required fields
        if (!medicineData.year || !medicineData.month) {
            return callback(new Error('Year and month are required'));
        }

        // Ensure month is a two-digit string
        const month = medicineData.month.toString().padStart(2, '0');
        const year = medicineData.year.toString();

        db.serialize(() => {
            db.run('BEGIN TRANSACTION');

            // First, insert into medicines table
            const insertMedicineSQL = `
                INSERT OR IGNORE INTO medicines (name, unit, category, expiry_date, current_stock) 
                VALUES (?, ?, ?, ?, ?)`;
                
                db.run(insertMedicineSQL, 
                [medicineData.name, medicineData.unit, medicineData.category, medicineData.expiry_date, medicineData.beginning_stock],
                    function(err) {
                        if (err) {
                            console.error('Error inserting medicine:', err);
                            db.run('ROLLBACK');
                            return callback(err);
                        }

                    const medicineId = this.lastID;
                    console.log('Created medicine with ID:', medicineId);
                    console.log('Creating monthly records starting from:', year, month);

                    // Now create monthly inventory records from the selected month onwards
                    const createMonthlyRecordsSQL = `
                        WITH RECURSIVE future_months AS (
                            -- Start from the selected month
                            SELECT CAST(? AS INTEGER) as year, CAST(? AS INTEGER) as month
                            
                            UNION ALL
                            
                            -- Generate subsequent months until December 2034
                            SELECT
                                CASE 
                                    WHEN month = 12 THEN year + 1
                                    ELSE year
                                END,
                                CASE 
                                    WHEN month = 12 THEN 1
                                    ELSE month + 1
                                END
                            FROM future_months
                            WHERE year < 2035 AND NOT (year = 2034 AND month > 12)
                        )
                        INSERT INTO monthly_inventory 
                            (medicine_id, year, month, beginning_stock, replenished_stock, total_issued, balance)
                        SELECT 
                            ?,
                            CAST(year AS TEXT),
                            printf('%02d', month),
                            ?,
                            0,
                            0,
                            ?
                        FROM future_months
                        WHERE (year >= ? OR (year = ? AND month >= ?))`;

                    const params = [
                        year,                           // Start year
                        parseInt(month),                // Start month
                        medicineId,                     // Medicine ID
                        medicineData.beginning_stock,   // Beginning stock
                        medicineData.beginning_stock,   // Balance
                        year,                           // For WHERE clause
                        year,                           // For WHERE clause
                        parseInt(month)                 // For WHERE clause
                    ];

                    console.log('Executing monthly records creation with params:', params);

                    db.run(createMonthlyRecordsSQL, params, function(err) {
                                if (err) {
                            console.error('Error creating monthly records:', err);
                                    db.run('ROLLBACK');
                                    return callback(err);
                                }

                        const recordsCreated = this.changes;
                        console.log(`Created ${recordsCreated} monthly records`);

                        db.run('COMMIT', (err) => {
                            if (err) {
                                console.error('Error committing transaction:', err);
                                db.run('ROLLBACK');
                                return callback(err);
                            }
                            callback(null, { 
                                medicineId, 
                                recordsCreated,
                                message: `Medicine added successfully with ${recordsCreated} monthly records created`
                            });
                        });
                    });
                    }
                );
        });
    }

    static updateStock(id, quantity, isReplenishment = false, year, month, callback) {
        // Get specified month's inventory record
        const getInventorySQL = `
            SELECT id, beginning_stock, total_issued, replenished_stock 
            FROM monthly_inventory 
            WHERE medicine_id = ? 
            AND year = ?
            AND month = ?`;

        db.get(getInventorySQL, [id, year, month], (err, inventory) => {
            if (err) {
                return callback(err);
            }

            if (!inventory) {
                return callback(new Error('No inventory record found for the selected month'));
            }

            // Validate the date - only check if it's not before September 2024
            const requestedDate = new Date(parseInt(year), parseInt(month) - 1);
            const sep2024 = new Date(2024, 8); // September is 8 in JS dates (0-based)

            // Return error only for dates before September 2024
            if (requestedDate < sep2024) {
                return callback(new Error('Cannot update stock before September 2024'));
            }

            db.serialize(() => {
                db.run('BEGIN TRANSACTION');

                // Only update medicines table if it's not a replenishment
                const updatePromise = new Promise((resolve, reject) => {
                    if (!isReplenishment) {
                        const updateMedicineSQL = `
                            UPDATE medicines 
                            SET current_stock = current_stock + ? 
                            WHERE id = ?`;
                        
                        db.run(updateMedicineSQL, [quantity, id], (err) => {
                            if (err) {
                                reject(err);
                            } else {
                                resolve();
                            }
                        });
                    } else {
                        resolve();
                    }
                });

                updatePromise.then(() => {
                    // Update monthly inventory
                    const updateInventorySQL = isReplenishment
                        ? `UPDATE monthly_inventory 
                           SET replenished_stock = replenished_stock + ?,
                               balance = beginning_stock + (replenished_stock + ?) - total_issued
                           WHERE id = ?`
                        : `UPDATE monthly_inventory 
                           SET total_issued = total_issued + ?,
                               balance = (beginning_stock + replenished_stock) - (total_issued + ?)
                           WHERE id = ?`;

                    const params = [quantity, quantity, inventory.id];

                    db.run(updateInventorySQL, params, (err) => {
                        if (err) {
                            db.run('ROLLBACK');
                            return callback(err);
                        }

                        // Get the updated balance immediately after updating
                        const getUpdatedBalanceSQL = `
                            SELECT balance, medicine_id
                            FROM monthly_inventory
                            WHERE id = ?`;

                        db.get(getUpdatedBalanceSQL, [inventory.id], (err, result) => {
                            if (err) {
                                db.run('ROLLBACK');
                                return callback(err);
                            }

                            // Create records for all future months up to January 2025
                            const createFutureMonthsSQL = `
                                WITH RECURSIVE months(year, month) AS (
                                    -- Initial values: next month after current
                                    SELECT 
                                        CASE 
                                            WHEN ? = '12' THEN CAST(? AS INTEGER) + 1
                                            ELSE CAST(? AS INTEGER)
                                        END,
                                        CASE 
                                            WHEN ? = '12' THEN '01'
                                            ELSE printf('%02d', CAST(? AS INTEGER) + 1)
                                        END
                                    
                                    UNION ALL
                                    
                                    -- Generate subsequent months until January 2025
                                    SELECT
                                        CASE 
                                            WHEN month = '12' THEN year + 1
                                            ELSE year
                                        END,
                                        CASE 
                                            WHEN month = '12' THEN '01'
                                            ELSE printf('%02d', CAST(month AS INTEGER) + 1)
                                        END
                                    FROM months
                                    WHERE (year < 2025 OR (year = 2025 AND month <= '01'))
                                )
                                INSERT OR IGNORE INTO monthly_inventory 
                                    (medicine_id, year, month, beginning_stock, total_issued, balance, replenished_stock)
                                SELECT 
                                    ?, 
                                    year,
                                    month,
                                    ?,
                                    0,
                                    ?,
                                    0
                                FROM months`;

                            db.run(createFutureMonthsSQL, 
                                [month, year, year, month, month, result.medicine_id, result.balance, result.balance],
                                (err) => {
                                    if (err) {
                                        db.run('ROLLBACK');
                                        return callback(err);
                                    }

                                    // Then update all future months recursively
                                    const updateFutureMonthsSQL = `
                                        WITH RECURSIVE future_months AS (
                                            -- Get the current month's data
                                            SELECT 
                                                medicine_id,
                                                year,
                                                month,
                                                balance as prev_balance
                                            FROM monthly_inventory
                                            WHERE medicine_id = ?
                                            AND year = ?
                                            AND month = ?
                                            
                                            UNION ALL
                                            
                                            -- Get subsequent months
                                            SELECT 
                                                mi.medicine_id,
                                                mi.year,
                                                mi.month,
                                                f.prev_balance
                                            FROM monthly_inventory mi
                                            JOIN future_months f ON mi.medicine_id = f.medicine_id
                                            WHERE (
                                                (mi.year = f.year AND mi.month > f.month)
                                                OR
                                                (mi.year > f.year)
                                            )
                                            AND (mi.year < 2025 OR (mi.year = 2025 AND mi.month <= '01'))
                                        )
                                        UPDATE monthly_inventory
                                        SET beginning_stock = (
                                            SELECT prev_balance
                                            FROM future_months f
                                            WHERE f.medicine_id = monthly_inventory.medicine_id
                                            AND f.year = monthly_inventory.year
                                            AND f.month = monthly_inventory.month
                                        ),
                                        balance = (
                                            SELECT prev_balance
                                            FROM future_months f
                                            WHERE f.medicine_id = monthly_inventory.medicine_id
                                            AND f.year = monthly_inventory.year
                                            AND f.month = monthly_inventory.month
                                        ) + COALESCE(replenished_stock, 0) - COALESCE(total_issued, 0)
                                        WHERE medicine_id = ?
                                        AND (
                                            (year = ? AND month > ?)
                                            OR
                                            (year > ?)
                                        )
                                        AND (year < 2025 OR (year = 2025 AND month <= '01'))`;

                                    db.run(updateFutureMonthsSQL, 
                                        [id, year, month, id, year, month, year], 
                                        (err) => {
                                            if (err) {
                                                console.error('Error updating future months:', err);
                            db.run('ROLLBACK');
                            return callback(err);
                        }
                        db.run('COMMIT', callback);
                                        }
                                    );
                                }
                            );
                        });
                    });
                }).catch(err => {
                    db.run('ROLLBACK');
                    callback(err);
                });
            });
        });
    }

    static getLowStock(threshold = 10, callback) {
        const sql = `
            SELECT m.*, mi.balance as current_stock
            FROM medicines m
            LEFT JOIN monthly_inventory mi ON m.id = mi.medicine_id
            WHERE mi.year = strftime('%Y', 'now')
            AND mi.month = strftime('%m', 'now')
            AND mi.balance <= ?
            AND mi.balance >= 0
            ORDER BY 
                CASE m.category
                    WHEN 'MEDICINES' THEN 1
                    WHEN 'MEDICAL SUPPLIES' THEN 2
                    WHEN 'DENTAL SUPPLIES' THEN 3
                    ELSE 4
                END,
                mi.balance ASC`;
        db.all(sql, [threshold], callback);
    }

    static initializeMedicineInventory(callback) {
        const medicines = [
            // Medicines
            ['TAB', 'AMBROXOL (MUCOSOLVAN 30MG)', '2026-12-01', 161, 'MEDICINES'],
            ['CAP', 'AMOXICILLIN AMOXIL 500MG', null, 37, 'MEDICINES'],
            ['TAB', 'ASCORBIC ACID POTEN CEE 500MG', '2026-05-01', 867, 'MEDICINES'],
            ['TAB', 'B COMPLEX (NEUROBION)', '2026-06-01', 80, 'MEDICINES'],
            ['TAB', 'BETAHISTINE SERC 8MG', '2026-04-01', 32, 'MEDICINES'],
            ['TAB', 'BIOFLU', '2025-07-01', 95, 'MEDICINES'],
            ['TAB', 'BUSCOPAN 10MG', '2026-12-01', 189, 'MEDICINES'],
            ['TAB', 'BUTAMIRATE CITRATE SINECOD FOR', '2027-03-01', 48, 'MEDICINES'],
            ['CAP', 'CARBOCISTEINE SOLMUX', '2028-11-01', 121, 'MEDICINES'],
            ['CAP', 'CEFALEXIN CEPOREX 500MG', null, 0, 'MEDICINES'],
            ['TAB', 'CEFUROXIME ZOLTAX 500MG', null, 0, 'MEDICINES'],
            ['TAB', 'CETIRIZINE 10MG', null, 0, 'MEDICINES'],
            ['TAB', 'CIPROFLOXACIN CIPROMET 500MG', null, 0, 'MEDICINES'],
            ['TAB', 'CLONIDINE CATAPRES', '2026-09-01', 56, 'MEDICINES'],
            ['CAP', 'CLOXACILLIN 500MG', '2026-06-01', 100, 'MEDICINES'],
            ['TAB', 'CO-AMOXICLAV 625MG', null, 90, 'MEDICINES'],
            ['TAB', 'COTRIMOXAZOLE 800MG', '2027-08-01', 84, 'MEDICINES'],
            ['TAB', 'DECOLGEN', '2026-10-01', 110, 'MEDICINES'],
            ['TAB', 'DECOLSIN/SYMDEX', '2027-03-01', 138, 'MEDICINES'],
            ['LOZ', 'DEQUALINE LOZENGES', '2026-08-01', 201, 'MEDICINES'],
            ['VIAL', 'ERCEFLORA', '2026-11-01', 66, 'MEDICINES'],
            ['TAB', 'IBUPROFEN', '2026-09-01', 48, 'MEDICINES'],
            ['TAB', 'KREMIL-S', null, 0, 'MEDICINES'],
            ['TAB', 'LOPERAMIDE LOMOTIL', '2027-08-01', 20, 'MEDICINES'],
            ['TAB', 'LORATADINE ALLERTA', '2025-07-01', 217, 'MEDICINES'],
            ['TAB', 'MECLIZINE BONAMINE', null, 44, 'MEDICINES'],
            ['TAB', 'MEFENAMIC ACID DOLFENAL 500MG', '2028-08-01', 81, 'MEDICINES'],
            ['TAB', 'METOCLOPRAMIDE PLASIL 10MG', null, 79, 'MEDICINES'],
            ['TUBE', 'MUPIROCIN BACTROBAN OINTMENT', '2025-07-01', 3, 'MEDICINES'],
            ['TAB', 'NEOZEP', '2025-08-01', 40, 'MEDICINES'],
            ['PCS', 'NORMAL SALINE SOLUTION/SALINAS', '2028-11-01', 5, 'MEDICINES'],
            ['CAP', 'OMEPRAZOLE RISEK 20MG', '2026-09-01', 90, 'MEDICINES'],
            ['PACK', 'ORS HYDRITE', '2026-09-01', 25, 'MEDICINES'],
            ['TAB', 'PARACETAMOL BIOGESIC 500MG', '2026-09-01', 1569, 'MEDICINES'],
            ['TAB', 'PARACETAMOL TEMPRA 500MG', null, 0, 'MEDICINES'],
            ['TAB', 'PROPANOLOL 10MG', '2026-05-01', 3, 'MEDICINES'],
            ['TUBE', 'SILVER SULFADIAZINE FLAMMAZINE', '2026-05-01', 2, 'MEDICINES'],
            ['TAB', 'SINUPRET', null, 0, 'MEDICINES'],
            ['PCS', 'SYSTANE OPTIC DROPS', '2025-08-01', 2, 'MEDICINES'],
            ['PCS', 'TETRAHYDROZOLINE HCL(EYE MO RE', '2026-09-01', 2, 'MEDICINES'],
            ['TUBE', 'TRIDERM OINTMENT', '2026-05-01', 1, 'MEDICINES'],
            ['VIAL', 'VENTOLIN NEBULES/DUAVENT', null, 0, 'MEDICINES'],

            // Medical Supplies
            ['BOT', 'ALCOHOL 70% (ETHYL)', null, 13, 'MEDICAL SUPPLIES'],
            ['PCS', 'ARM SLING', null, 4, 'MEDICAL SUPPLIES'],
            ['BOT', 'BACTIDOL SOLUTION FOR GARGLE', '2026-12-01', 2, 'MEDICAL SUPPLIES'],
            ['BOX', 'BAND AID STRIPS', null, 150, 'MEDICAL SUPPLIES'],
            ['PCS', 'BANDAGE SCISSORS', null, 3, 'MEDICAL SUPPLIES'],
            ['BOT', 'BETADINE SPRAY', '2027-02-01', 3, 'MEDICAL SUPPLIES'],
            ['BOT', 'BETADINE SOLUTION', '2025-07-01', 3, 'MEDICAL SUPPLIES'],
            ['SET', 'BLOOD SUGAR ONE TOUCH GLUCOMETER', '2028-09-01', 1, 'MEDICAL SUPPLIES'],
            ['BOX', 'BLOOD SUGAR ONE TOUCH STRIP\'S', '2026-09-01', 5, 'MEDICAL SUPPLIES'],
            ['SET', 'BLOOD SUGAR ONE TOUCH LANCET', null, 10, 'MEDICAL SUPPLIES'],
            ['PACK', 'COTTON BALLS 300\'S', null, 9, 'MEDICAL SUPPLIES'],
            ['PACK', 'COTTON BUDS', null, 10, 'MEDICAL SUPPLIES'],
            ['PACK', 'ECG PAPER', null, 14, 'MEDICAL SUPPLIES'],
            ['ROLL', 'ELASTIC BANDAGE', null, 24, 'MEDICAL SUPPLIES'],
            ['BOX', 'FACE MASK (SURGICAL)', null, 20, 'MEDICAL SUPPLIES'],
            ['BOX', 'GLOVES MEDIUM BOX', null, 3, 'MEDICAL SUPPLIES'],
            ['BOX', 'GLOVES SMALL BOX', null, 3, 'MEDICAL SUPPLIES'],
            ['BOT', 'KATINKO SPRAY', null, 1, 'MEDICAL SUPPLIES'],
            ['SET', 'KELLY FORCEP (STRAIGHT & CURVE)', null, 4, 'MEDICAL SUPPLIES'],
            ['SET', 'MEDICAL OXYGEN GAUGE REGULATOR', null, 1, 'MEDICAL SUPPLIES'],
            ['BOX', 'MICROPORE', null, 0, 'MEDICAL SUPPLIES'],
            ['BOT', 'MAXITROL', null, 0, 'MEDICAL SUPPLIES'],
            ['BOT', 'OMEGA PAIN LINIMENT', '2027-11-01', 34, 'MEDICAL SUPPLIES'],
            ['PCS', 'O2 CANNULA', null, 5, 'MEDICAL SUPPLIES'],
            ['BOT', 'PAU SPORTS SPRAY', null, 0, 'MEDICAL SUPPLIES'],
            ['PACK', 'SALONPAS', null, 27, 'MEDICAL SUPPLIES'],
            ['PCS', 'TONGUE DEPRESSOR', null, 3, 'MEDICAL SUPPLIES'],
            ['PCS', 'TRANSPORE', null, 12, 'MEDICAL SUPPLIES'],
            ['PCS', 'TRIANGULAR BANDAGE', null, 5, 'MEDICAL SUPPLIES'],
            ['BOT', 'WHITE FLOWER 20ML', '2028-03-01', 6, 'MEDICAL SUPPLIES'],
        
            // Dental Supplies (all with 0 stock as per image)
            ['BOT', 'LIDOCAINE HCL 2%', null, 0, 'DENTAL SUPPLIES'],
            ['SET', 'PROPHY BRUSH AND CUP', null, 0, 'DENTAL SUPPLIES'],
            ['BOX', 'TERUMO NEEDLE 1:30', null, 0, 'DENTAL SUPPLIES'],
            ['BOT', 'TOPICAL LIDOCAINE', null, 0, 'DENTAL SUPPLIES'],
            ['PCS', 'SALIVA SUCTION TIP', null, 0, 'DENTAL SUPPLIES'],
            ['PACK', 'DENTAL BIB', null, 0, 'DENTAL SUPPLIES'],
        
            // Other Supplies (all with 0 stock as per image)
            ['ROLL', 'BATHROOM TISSUE', null, 0, 'OTHER SUPPLIES'],
            ['BAG', 'DETERGENT POWDER', null, 0, 'OTHER SUPPLIES'],
            ['PACK', 'DISHWASHING LIQUID', null, 0, 'OTHER SUPPLIES'],
            ['BOT', 'GLASS CLEANER', null, 0, 'OTHER SUPPLIES'],
            ['BOT', 'HYGIENIX HAND SANITIZER 100ML', null, 0, 'OTHER SUPPLIES'],
            ['BOT', 'HYPOCHLORITE SOLUTION', null, 0, 'OTHER SUPPLIES'],
            ['ROLL', 'KITCHEN TOWEL', null, 0, 'OTHER SUPPLIES'],
            ['BOT', 'LIQUID HAND SOAP', null, 0, 'OTHER SUPPLIES'],
            ['BOT', 'LIQUID SOLUTION LYSOL', null, 0, 'OTHER SUPPLIES'],
            ['BOT', 'LYSOL SPRAY', null, 0, 'OTHER SUPPLIES']
        ];

        db.serialize(() => {
            db.run('BEGIN TRANSACTION');

            const insertSQL = `
                INSERT OR REPLACE INTO medicines (unit, name, expiry_date, current_stock, category)
                VALUES (?, ?, ?, ?, ?)`;

            let completed = 0;
            let hasError = false;

            medicines.forEach((medicine) => {
                const [unit, name, expiry, stock, category] = medicine;
                db.run(insertSQL, [unit, name, expiry, stock, category], (err) => {
                    if (err && !hasError) {
                        hasError = true;
                        db.run('ROLLBACK');
                        return callback(err);
                    }

                    completed++;
                    if (completed === medicines.length && !hasError) {
                        db.run('COMMIT', callback);
                    }
                });
            });
        });
    }

    static updateMedicine(id, name, unit, category, expiry_date, beginning_stock, replenished_stock, year, month, callback) {
        // Validate the date
        const requestedDate = new Date(year, parseInt(month) - 1);
        const sep2024 = new Date(2024, 8); // September is 8 in JS dates (0-based)
        const currentDate = new Date();
        const firstDayOfNextMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);

        // Return error for invalid dates
        if (requestedDate < sep2024 || requestedDate >= firstDayOfNextMonth) {
            return callback(new Error('Cannot update medicines before September 2024 or in future months'));
        }

        // Calculate previous month and year for getting the previous balance
        let prevMonth = parseInt(month) - 1;
        let prevYear = parseInt(year);
        if (prevMonth === 0) {
            prevMonth = 12;
            prevYear--;
        }
        prevMonth = prevMonth.toString().padStart(2, '0');
        prevYear = prevYear.toString();

        db.serialize(() => {
            // Update medicine details
            const updateMedicineSQL = `
                UPDATE medicines 
                SET name = ?, 
                    unit = ?, 
                    category = ?, 
                    expiry_date = ?
                WHERE id = ?`;

            // Get previous month's balance
            const getPrevBalanceSQL = `
                SELECT balance as prev_balance
                FROM monthly_inventory
                WHERE medicine_id = ?
                AND year = ?
                AND month = ?`;

            // Update monthly inventory replenished stock and recalculate balance
            const updateMonthlyInventorySQL = `
                UPDATE monthly_inventory 
                SET replenished_stock = ?,
                    beginning_stock = ?,
                    balance = ? + ? - total_issued
                WHERE medicine_id = ? 
                AND year = ? 
                AND month = ?`;

            // Capitalize all text fields
            const capitalizedName = name.toUpperCase().trim();
            const capitalizedUnit = unit.toUpperCase().trim();
            const capitalizedCategory = category.toUpperCase().trim();
            const formattedExpiryDate = expiry_date || null;

            db.run('BEGIN TRANSACTION');

                // Update medicine details
                db.run(updateMedicineSQL, 
                    [capitalizedName, capitalizedUnit, capitalizedCategory, formattedExpiryDate, id], 
                    (err) => {
                        if (err) {
                            console.error('Error updating medicine:', err);
                            db.run('ROLLBACK');
                            return callback(err);
                        }

                    // Get previous month's balance
                    db.get(getPrevBalanceSQL, [id, prevYear, prevMonth], (err, prevResult) => {
                                if (err) {
                            console.error('Error getting previous balance:', err);
                                    db.run('ROLLBACK');
                                    return callback(err);
                                }

                        // Use previous month's balance as beginning stock, or keep existing if it's September 2024
                        const actualBeginningStock = (prevYear === '2024' && prevMonth === '08') ? 
                            beginning_stock : 
                            (prevResult ? prevResult.prev_balance : beginning_stock);

                        // Update monthly inventory
                        db.run(updateMonthlyInventorySQL, 
                            [replenished_stock, actualBeginningStock, actualBeginningStock, replenished_stock, id, year, month], 
                            (err) => {
                        if (err) {
                                    console.error('Error updating monthly inventory:', err);
                            db.run('ROLLBACK');
                            return callback(err);
                        }

                                // Get the updated balance and inventory ID
                                const getUpdatedBalanceSQL = `
                                    SELECT id, balance
                                    FROM monthly_inventory
                                    WHERE medicine_id = ? 
                                    AND year = ? 
                                    AND month = ?`;

                                db.get(getUpdatedBalanceSQL, [id, year, month], (err, result) => {
                                if (err) {
                                        console.error('Error getting updated balance:', err);
                                    db.run('ROLLBACK');
                                    return callback(err);
                                }

                                    // Update all future months recursively
                                    const updateFutureMonthsSQL = `
                                        WITH RECURSIVE future_months AS (
                                            -- Get the current month's data
                                            SELECT 
                                                medicine_id,
                                                year,
                                                month,
                                                balance as prev_balance
                                            FROM monthly_inventory
                                            WHERE medicine_id = ?
                                            AND year = ?
                                            AND month = ?
                                            
                                            UNION ALL
                                            
                                            -- Get subsequent months
                                            SELECT 
                                                mi.medicine_id,
                                                mi.year,
                                                mi.month,
                                                f.prev_balance
                                            FROM monthly_inventory mi
                                            JOIN future_months f ON mi.medicine_id = f.medicine_id
                                            WHERE (
                                                (mi.year = f.year AND mi.month > f.month)
                                                OR
                                                (mi.year > f.year)
                                            )
                                            AND (mi.year < 2025 OR (mi.year = 2025 AND mi.month <= '01'))
                                        )
                                        UPDATE monthly_inventory
                                        SET beginning_stock = (
                                            SELECT prev_balance
                                            FROM future_months f
                                            WHERE f.medicine_id = monthly_inventory.medicine_id
                                            AND f.year = monthly_inventory.year
                                            AND f.month = monthly_inventory.month
                                        ),
                                        balance = (
                                            SELECT prev_balance
                                            FROM future_months f
                                            WHERE f.medicine_id = monthly_inventory.medicine_id
                                            AND f.year = monthly_inventory.year
                                            AND f.month = monthly_inventory.month
                                        ) + COALESCE(replenished_stock, 0) - COALESCE(total_issued, 0)
                                        WHERE medicine_id = ?
                                        AND (
                                            (year = ? AND month > ?)
                                            OR
                                            (year > ?)
                                        )
                                        AND (year < 2025 OR (year = 2025 AND month <= '01'))`;

                                    db.run(updateFutureMonthsSQL, 
                                        [id, year, month, id, year, month, year], 
                                    (err) => {
                                        if (err) {
                                                console.error('Error updating future months:', err);
                                            db.run('ROLLBACK');
                                            return callback(err);
                                        }
                                        db.run('COMMIT', callback);
                                    }
                                );
                                });
                            }
                        );
                    });
                    }
                );
        });
    }

    static deleteMedicine(id, year, month, callback) {
        console.log(`Deleting medicine ${id} from ${year}-${month} onwards...`);

        // Begin transaction
        db.run('BEGIN TRANSACTION', (err) => {
            if (err) {
                console.error('Error starting transaction:', err);
                return callback(err);
            }

            // Delete monthly inventory records from the specified month onwards
            const deleteInventorySQL = `
                DELETE FROM monthly_inventory 
                WHERE medicine_id = ? 
                AND (
                    year > ? 
                    OR (year = ? AND month >= ?)
                )`;

            db.run(deleteInventorySQL, [id, year, year, month], function(err) {
                if (err) {
                    console.error('Error deleting monthly inventory records:', err);
                    db.run('ROLLBACK', () => callback(err));
                    return;
                }

                const recordsDeleted = this.changes;
                console.log(`Deleted ${recordsDeleted} monthly inventory records`);

                // Commit the transaction
                db.run('COMMIT', (err) => {
                    if (err) {
                        console.error('Error committing transaction:', err);
                        db.run('ROLLBACK', () => callback(err));
                        return;
                    }
                    console.log('Successfully deleted medicine records');
                    callback(null, { recordsDeleted });
                });
            });
        });
    }

    static replenishStock(id, quantity, year, month, callback) {
        if (!id || !quantity || quantity <= 0) {
            return callback(new Error('Invalid medicine ID or quantity'));
        }

        // First record the replenishment
        const insertReplenishmentSQL = `
            INSERT INTO stock_replenishment (medicine_id, quantity_added, date)
            VALUES (?, ?, date('now'))`;

        db.run(insertReplenishmentSQL, [id, quantity], (err) => {
            if (err) {
                return callback(err);
            }

            // Then update the stock using our existing updateStock method
            this.updateStock(id, quantity, true, year, month, callback);
        });
    }

    static initializeSeptember2024(callback) {
        console.log('Starting initializeSeptember2024...');
        
        // Get the medicines array from the initialization list
        const medicines = [
            // Medicines
            ['TAB', 'AMBROXOL (MUCOSOLVAN 30MG)', '2026-12-01', 161, 'MEDICINES'],
            ['CAP', 'AMOXICILLIN AMOXIL 500MG', null, 37, 'MEDICINES'],
            ['TAB', 'ASCORBIC ACID POTEN CEE 500MG', '2026-05-01', 867, 'MEDICINES'],
            ['TAB', 'B COMPLEX (NEUROBION)', '2026-06-01', 80, 'MEDICINES'],
            ['TAB', 'BETAHISTINE SERC 8MG', '2026-04-01', 32, 'MEDICINES'],
            ['TAB', 'BIOFLU', '2025-07-01', 95, 'MEDICINES'],
            ['TAB', 'BUSCOPAN 10MG', '2026-12-01', 189, 'MEDICINES'],
            ['TAB', 'BUTAMIRATE CITRATE SINECOD FOR', '2027-03-01', 48, 'MEDICINES'],
            ['CAP', 'CARBOCISTEINE SOLMUX', '2028-11-01', 121, 'MEDICINES'],
            ['CAP', 'CEFALEXIN CEPOREX 500MG', null, 0, 'MEDICINES'],
            ['TAB', 'CEFUROXIME ZOLTAX 500MG', null, 0, 'MEDICINES'],
            ['TAB', 'CETIRIZINE 10MG', null, 0, 'MEDICINES'],
            ['TAB', 'CIPROFLOXACIN CIPROMET 500MG', null, 0, 'MEDICINES'],
            ['TAB', 'CLONIDINE CATAPRES', '2026-09-01', 56, 'MEDICINES'],
            ['CAP', 'CLOXACILLIN 500MG', '2026-06-01', 100, 'MEDICINES'],
            ['TAB', 'CO-AMOXICLAV 625MG', null, 90, 'MEDICINES'],
            ['TAB', 'COTRIMOXAZOLE 800MG', '2027-08-01', 84, 'MEDICINES'],
            ['TAB', 'DECOLGEN', '2026-10-01', 110, 'MEDICINES'],
            ['TAB', 'DECOLSIN/SYMDEX', '2027-03-01', 138, 'MEDICINES'],
            ['LOZ', 'DEQUALINE LOZENGES', '2026-08-01', 201, 'MEDICINES'],
            ['VIAL', 'ERCEFLORA', '2026-11-01', 66, 'MEDICINES'],
            ['TAB', 'IBUPROFEN', '2026-09-01', 48, 'MEDICINES'],
            ['TAB', 'KREMIL-S', null, 0, 'MEDICINES'],
            ['TAB', 'LOPERAMIDE LOMOTIL', '2027-08-01', 20, 'MEDICINES'],
            ['TAB', 'LORATADINE ALLERTA', '2025-07-01', 217, 'MEDICINES'],
            ['TAB', 'MECLIZINE BONAMINE', null, 44, 'MEDICINES'],
            ['TAB', 'MEFENAMIC ACID DOLFENAL 500MG', '2028-08-01', 81, 'MEDICINES'],
            ['TAB', 'METOCLOPRAMIDE PLASIL 10MG', null, 79, 'MEDICINES'],
            ['TUBE', 'MUPIROCIN BACTROBAN OINTMENT', '2025-07-01', 3, 'MEDICINES'],
            ['TAB', 'NEOZEP', '2025-08-01', 40, 'MEDICINES'],
            ['PCS', 'NORMAL SALINE SOLUTION/SALINAS', '2028-11-01', 5, 'MEDICINES'],
            ['CAP', 'OMEPRAZOLE RISEK 20MG', '2026-09-01', 90, 'MEDICINES'],
            ['PACK', 'ORS HYDRITE', '2026-09-01', 25, 'MEDICINES'],
            ['TAB', 'PARACETAMOL BIOGESIC 500MG', '2026-09-01', 1569, 'MEDICINES'],
            ['TAB', 'PARACETAMOL TEMPRA 500MG', null, 0, 'MEDICINES'],
            ['TAB', 'PROPANOLOL 10MG', '2026-05-01', 3, 'MEDICINES'],
            ['TUBE', 'SILVER SULFADIAZINE FLAMMAZINE', '2026-05-01', 2, 'MEDICINES'],
            ['TAB', 'SINUPRET', null, 0, 'MEDICINES'],
            ['PCS', 'SYSTANE OPTIC DROPS', '2025-08-01', 2, 'MEDICINES'],
            ['PCS', 'TETRAHYDROZOLINE HCL(EYE MO RE', '2026-09-01', 2, 'MEDICINES'],
            ['TUBE', 'TRIDERM OINTMENT', '2026-05-01', 1, 'MEDICINES'],
            ['VIAL', 'VENTOLIN NEBULES/DUAVENT', null, 0, 'MEDICINES'],

            // Medical Supplies
            ['BOT', 'ALCOHOL 70% (ETHYL)', null, 13, 'MEDICAL SUPPLIES'],
            ['PCS', 'ARM SLING', null, 4, 'MEDICAL SUPPLIES'],
            ['BOT', 'BACTIDOL SOLUTION FOR GARGLE', '2026-12-01', 2, 'MEDICAL SUPPLIES'],
            ['BOX', 'BAND AID STRIPS', null, 150, 'MEDICAL SUPPLIES'],
            ['PCS', 'BANDAGE SCISSORS', null, 3, 'MEDICAL SUPPLIES'],
            ['BOT', 'BETADINE SPRAY', '2027-02-01', 3, 'MEDICAL SUPPLIES'],
            ['BOT', 'BETADINE SOLUTION', '2025-07-01', 3, 'MEDICAL SUPPLIES'],
            ['SET', 'BLOOD SUGAR ONE TOUCH GLUCOMETER', '2028-09-01', 1, 'MEDICAL SUPPLIES'],
            ['BOX', 'BLOOD SUGAR ONE TOUCH STRIP\'S', '2026-09-01', 5, 'MEDICAL SUPPLIES'],
            ['SET', 'BLOOD SUGAR ONE TOUCH LANCET', null, 10, 'MEDICAL SUPPLIES'],
            ['PACK', 'COTTON BALLS 300\'S', null, 9, 'MEDICAL SUPPLIES'],
            ['PACK', 'COTTON BUDS', null, 10, 'MEDICAL SUPPLIES'],
            ['PACK', 'ECG PAPER', null, 14, 'MEDICAL SUPPLIES'],
            ['ROLL', 'ELASTIC BANDAGE', null, 24, 'MEDICAL SUPPLIES'],
            ['BOX', 'FACE MASK (SURGICAL)', null, 20, 'MEDICAL SUPPLIES'],
            ['BOX', 'GLOVES MEDIUM BOX', null, 3, 'MEDICAL SUPPLIES'],
            ['BOX', 'GLOVES SMALL BOX', null, 3, 'MEDICAL SUPPLIES'],
            ['BOT', 'KATINKO SPRAY', null, 1, 'MEDICAL SUPPLIES'],
            ['SET', 'KELLY FORCEP (STRAIGHT & CURVE)', null, 4, 'MEDICAL SUPPLIES'],
            ['SET', 'MEDICAL OXYGEN GAUGE REGULATOR', null, 1, 'MEDICAL SUPPLIES'],
            ['BOX', 'MICROPORE', null, 0, 'MEDICAL SUPPLIES'],
            ['BOT', 'MAXITROL', null, 0, 'MEDICAL SUPPLIES'],
            ['BOT', 'OMEGA PAIN LINIMENT', '2027-11-01', 34, 'MEDICAL SUPPLIES'],
            ['PCS', 'O2 CANNULA', null, 5, 'MEDICAL SUPPLIES'],
            ['BOT', 'PAU SPORTS SPRAY', null, 0, 'MEDICAL SUPPLIES'],
            ['PACK', 'SALONPAS', null, 27, 'MEDICAL SUPPLIES'],
            ['PCS', 'TONGUE DEPRESSOR', null, 3, 'MEDICAL SUPPLIES'],
            ['PCS', 'TRANSPORE', null, 12, 'MEDICAL SUPPLIES'],
            ['PCS', 'TRIANGULAR BANDAGE', null, 5, 'MEDICAL SUPPLIES'],
            ['BOT', 'WHITE FLOWER 20ML', '2028-03-01', 6, 'MEDICAL SUPPLIES'],

            // Dental Supplies (all with 0 stock as per image)
            ['BOT', 'LIDOCAINE HCL 2%', null, 0, 'DENTAL SUPPLIES'],
            ['SET', 'PROPHY BRUSH AND CUP', null, 0, 'DENTAL SUPPLIES'],
            ['BOX', 'TERUMO NEEDLE 1:30', null, 0, 'DENTAL SUPPLIES'],
            ['BOT', 'TOPICAL LIDOCAINE', null, 0, 'DENTAL SUPPLIES'],
            ['PCS', 'SALIVA SUCTION TIP', null, 0, 'DENTAL SUPPLIES'],
            ['PACK', 'DENTAL BIB', null, 0, 'DENTAL SUPPLIES'],

            // Other Supplies (all with 0 stock as per image)
            ['ROLL', 'BATHROOM TISSUE', null, 0, 'OTHER SUPPLIES'],
            ['BAG', 'DETERGENT POWDER', null, 0, 'OTHER SUPPLIES'],
            ['PACK', 'DISHWASHING LIQUID', null, 0, 'OTHER SUPPLIES'],
            ['BOT', 'GLASS CLEANER', null, 0, 'OTHER SUPPLIES'],
            ['BOT', 'HYGIENIX HAND SANITIZER 100ML', null, 0, 'OTHER SUPPLIES'],
            ['BOT', 'HYPOCHLORITE SOLUTION', null, 0, 'OTHER SUPPLIES'],
            ['ROLL', 'KITCHEN TOWEL', null, 0, 'OTHER SUPPLIES'],
            ['BOT', 'LIQUID HAND SOAP', null, 0, 'OTHER SUPPLIES'],
            ['BOT', 'LIQUID SOLUTION LYSOL', null, 0, 'OTHER SUPPLIES'],
            ['BOT', 'LYSOL SPRAY', null, 0, 'OTHER SUPPLIES']
        ];

        // Start a single transaction for all operations
        db.run('BEGIN TRANSACTION', (err) => {
            if (err) {
                console.error('Error starting transaction:', err);
                return callback(err);
            }

            console.log('Started transaction');

            // First, ensure all medicines exist with correct data
            const insertMedicineSQL = `
                INSERT OR REPLACE INTO medicines (unit, name, expiry_date, current_stock, category)
                VALUES (?, ?, ?, ?, ?)`;

        // Then create September 2024 inventory records
        const createInventorySQL = `
            INSERT INTO monthly_inventory (
                medicine_id, year, month, beginning_stock, 
                total_issued, balance, replenished_stock
            )
            SELECT 
                m.id,
                '2024' as year,
                '09' as month,
                ? as beginning_stock,
                0 as total_issued,
                ? as balance,
                0 as replenished_stock
            FROM medicines m
            WHERE m.unit = ? AND m.name = ?
            AND NOT EXISTS (
                SELECT 1 
                FROM monthly_inventory mi 
                WHERE mi.medicine_id = m.id 
                AND mi.year = '2024' 
                AND mi.month = '09'
        )
        LIMIT 1`;  

            let processed = 0;
            const total = medicines.length;

            // Process each medicine
            medicines.forEach((medicine) => {
                const [unit, name, expiry_date, stock, category] = medicine;

                // First insert/update the medicine
                db.run(insertMedicineSQL, [unit, name, expiry_date, stock, category], function(err) {
                    if (err) {
                        console.error(`Error inserting medicine ${name}:`, err);
                        db.run('ROLLBACK', () => callback(err));
                        return;
                    }

                    // Then create/update the inventory record
                    db.run(createInventorySQL, [stock, stock, unit, name], (err) => {
                        if (err) {
                            console.error(`Error creating inventory for ${name}:`, err);
                            db.run('ROLLBACK', () => callback(err));
                            return;
                        }

                        processed++;
                        console.log(`Processed ${processed}/${total} medicines`);

                        // If all medicines are processed, commit the transaction
                        if (processed === total) {
                            db.run('COMMIT', (err) => {
                                if (err) {
                                    console.error('Error committing transaction:', err);
                                    db.run('ROLLBACK', () => callback(err));
                                    return;
                                }
                                console.log('Successfully initialized September 2024 data');
                                callback(null);
                            });
                        }
                    });
                });
            });
        });
    }

    static generateFutureRecords(callback) {
        console.log('Starting generation of future monthly records...');

        // SQL to generate all months from September 2024 to December 2034
        const sql = `
            WITH RECURSIVE months(year, month) AS (
                -- Start from September 2024
                SELECT 2024 as year, 9 as month
                
                UNION ALL
                
                -- Generate subsequent months until December 2034
                SELECT
                    CASE 
                        WHEN month = 12 THEN year + 1
                        ELSE year
                    END,
                    CASE 
                        WHEN month = 12 THEN 1
                        ELSE month + 1
                    END
                FROM months
                WHERE year < 2035 AND NOT (year = 2034 AND month > 12)
            ),
            formatted_months AS (
                SELECT 
                    CAST(year AS TEXT) as year,
                    printf('%02d', month) as month
                FROM months
            ),
            base_records AS (
                -- Get September 2024 data as our base
                SELECT 
                    medicine_id,
                    COALESCE(beginning_stock, 0) as base_beginning_stock,
                    COALESCE(balance, 0) as base_balance
                FROM monthly_inventory
                WHERE year = '2024' AND month = '09'
            )
            INSERT INTO monthly_inventory 
                (medicine_id, year, month, beginning_stock, total_issued, balance, replenished_stock)
            SELECT 
                br.medicine_id,
                fm.year,
                fm.month,
                COALESCE(br.base_balance, 0) as beginning_stock,
                0 as total_issued,
                COALESCE(br.base_balance, 0) as balance,
                0 as replenished_stock
            FROM formatted_months fm
            CROSS JOIN base_records br
            WHERE NOT EXISTS (
                SELECT 1 
                FROM monthly_inventory mi 
                WHERE mi.medicine_id = br.medicine_id 
                AND mi.year = fm.year 
                AND mi.month = fm.month
            )
            AND NOT (fm.year = '2024' AND fm.month = '09')`;

        db.run(sql, [], function(err) {
            if (err) {
                console.error('Error generating future records:', err);
                return callback(err);
            }
            console.log(`Successfully generated ${this.changes} future records`);
            callback(null, this.changes);
        });
    }

    static cleanupMonthlyRecords(callback) {
        console.log('Starting cleanup of monthly records...');

        db.run('BEGIN TRANSACTION', (err) => {
            if (err) {
                console.error('Error starting transaction:', err);
                return callback(err);
            }

            // Step 1: Remove any medicines that are not in our initialization list
            const removeExtraMedicinesSQL = `
                DELETE FROM medicines 
                WHERE name NOT IN (
                    "AMBROXOL (MUCOSOLVAN 30MG)", "AMOXICILLIN AMOXIL 500MG", "ASCORBIC ACID POTEN CEE 500MG",
                    "B COMPLEX (NEUROBION)", "BETAHISTINE SERC 8MG", "BIOFLU", "BUSCOPAN 10MG",
                    "BUTAMIRATE CITRATE SINECOD FOR", "CARBOCISTEINE SOLMUX", "CEFALEXIN CEPOREX 500MG",
                    "CEFUROXIME ZOLTAX 500MG", "CETIRIZINE 10MG", "CIPROFLOXACIN CIPROMET 500MG",
                    "CLONIDINE CATAPRES", "CLOXACILLIN 500MG", "CO-AMOXICLAV 625MG", "COTRIMOXAZOLE 800MG",
                    "DECOLGEN", "DECOLSIN/SYMDEX", "DEQUALINE LOZENGES", "ERCEFLORA", "IBUPROFEN",
                    "KREMIL-S", "LOPERAMIDE LOMOTIL", "LORATADINE ALLERTA", "MECLIZINE BONAMINE",
                    "MEFENAMIC ACID DOLFENAL 500MG", "METOCLOPRAMIDE PLASIL 10MG", "MUPIROCIN BACTROBAN OINTMENT",
                    "NEOZEP", "NORMAL SALINE SOLUTION/SALINAS", "OMEPRAZOLE RISEK 20MG", "ORS HYDRITE",
                    "PARACETAMOL BIOGESIC 500MG", "PARACETAMOL TEMPRA 500MG", "PROPANOLOL 10MG",
                    "SILVER SULFADIAZINE FLAMMAZINE", "SINUPRET", "SYSTANE OPTIC DROPS",
                    "TETRAHYDROZOLINE HCL(EYE MO RE", "TRIDERM OINTMENT", "VENTOLIN NEBULES/DUAVENT",
                    "ALCOHOL 70% (ETHYL)", "ARM SLING", "BACTIDOL SOLUTION FOR GARGLE", "BAND AID STRIPS",
                    "BANDAGE SCISSORS", "BETADINE SPRAY", "BETADINE SOLUTION", "BLOOD SUGAR ONE TOUCH GLUCOMETER",
                    "BLOOD SUGAR ONE TOUCH STRIP'S", "BLOOD SUGAR ONE TOUCH LANCET", "COTTON BALLS 300'S",
                    "COTTON BUDS", "ECG PAPER", "ELASTIC BANDAGE", "FACE MASK (SURGICAL)", "GLOVES MEDIUM BOX",
                    "GLOVES SMALL BOX", "KATINKO SPRAY", "KELLY FORCEP (STRAIGHT & CURVE)",
                    "MEDICAL OXYGEN GAUGE REGULATOR", "MICROPORE", "MAXITROL", "OMEGA PAIN LINIMENT",
                    "O2 CANNULA", "PAU SPORTS SPRAY", "SALONPAS", "TONGUE DEPRESSOR", "TRANSPORE",
                    "TRIANGULAR BANDAGE", "WHITE FLOWER 20ML", "LIDOCAINE HCL 2%", "PROPHY BRUSH AND CUP",
                    "TERUMO NEEDLE 1:30", "TOPICAL LIDOCAINE", "SALIVA SUCTION TIP", "DENTAL BIB",
                    "BATHROOM TISSUE", "DETERGENT POWDER", "DISHWASHING LIQUID", "GLASS CLEANER",
                    "HYGIENIX HAND SANITIZER 100ML", "HYPOCHLORITE SOLUTION", "KITCHEN TOWEL",
                    "LIQUID HAND SOAP", "LIQUID SOLUTION LYSOL", "LYSOL SPRAY"
                )`;

            // Step 2: Remove any monthly inventory records for medicines that no longer exist
            const removeOrphanedRecordsSQL = `
                DELETE FROM monthly_inventory 
                WHERE medicine_id NOT IN (SELECT id FROM medicines)`;

            // Step 3: Remove duplicate records, keeping only the first record for each medicine in each month
            const removeDuplicatesSQL = `
                WITH duplicates AS (
                    SELECT 
                        medicine_id, year, month,
                        ROW_NUMBER() OVER (PARTITION BY medicine_id, year, month ORDER BY medicine_id) as rn
                    FROM monthly_inventory
                )
                DELETE FROM monthly_inventory 
                WHERE EXISTS (
                    SELECT 1 FROM duplicates d 
                    WHERE d.medicine_id = monthly_inventory.medicine_id 
                    AND d.year = monthly_inventory.year 
                    AND d.month = monthly_inventory.month 
                    AND d.rn > 1
                )`;

            // Step 4: Ensure all medicines have records for each month
            const normalizeRecordsSQL = `
                WITH RECURSIVE all_months AS (
                    SELECT DISTINCT year, month
                    FROM monthly_inventory
                    ORDER BY year, month
                ),
                all_medicines AS (
                    SELECT id as medicine_id
                    FROM medicines
                ),
                missing_records AS (
                    SELECT 
                        m.medicine_id,
                        am.year,
                        am.month
                    FROM all_months am
                    CROSS JOIN all_medicines m
                    WHERE NOT EXISTS (
                        SELECT 1
                        FROM monthly_inventory mi
                        WHERE mi.medicine_id = m.medicine_id
                        AND mi.year = am.year
                        AND mi.month = am.month
                    )
                )
                INSERT INTO monthly_inventory 
                    (medicine_id, year, month, beginning_stock, total_issued, balance, replenished_stock)
                SELECT 
                    mr.medicine_id,
                    mr.year,
                    mr.month,
                    0 as beginning_stock,
                    0 as total_issued,
                    0 as balance,
                    0 as replenished_stock
                FROM missing_records mr`;

            // Execute all cleanup steps in sequence
            db.run(removeExtraMedicinesSQL, [], function(err) {
                if (err) {
                    console.error('Error removing extra medicines:', err);
                    db.run('ROLLBACK', () => callback(err));
                    return;
                }

                console.log(`Removed extra medicines`);

                db.run(removeOrphanedRecordsSQL, [], function(err) {
                    if (err) {
                        console.error('Error removing orphaned records:', err);
                        db.run('ROLLBACK', () => callback(err));
                        return;
                    }

                    console.log(`Removed orphaned records`);

                    db.run(removeDuplicatesSQL, [], function(err) {
                        if (err) {
                            console.error('Error removing duplicates:', err);
                            db.run('ROLLBACK', () => callback(err));
                            return;
                        }

                        console.log(`Removed duplicate records`);

                        db.run(normalizeRecordsSQL, [], function(err) {
                            if (err) {
                                console.error('Error normalizing records:', err);
                                db.run('ROLLBACK', () => callback(err));
                                return;
                            }

                            console.log(`Added missing records`);

                            // Commit the transaction
                                db.run('COMMIT', (err) => {
                                    if (err) {
                                        console.error('Error committing transaction:', err);
                                        db.run('ROLLBACK', () => callback(err));
                                        return;
                                    }
                                console.log('Successfully cleaned up monthly records');
                                callback(null, {
                                    success: true,
                                    message: 'Successfully cleaned up records to match exactly with initialization list'
                                });
                            });
                        });
                    });
                });
            });
        });
    }

    static ensureStockContinuity(callback) {
        console.log('Starting stock continuity update...');
    
        db.serialize(() => {
            db.run('BEGIN TRANSACTION');
    
            const updateStockContinuitySQL = `
                WITH RECURSIVE months_sequence AS (
                    -- Start with September 2024 data
                    SELECT 
                        medicine_id,
                        '2024' as year,
                        '09' as month,
                        COALESCE(beginning_stock, 0) as beginning_stock,
                        COALESCE(replenished_stock, 0) as replenished_stock,
                        COALESCE(total_issued, 0) as total_issued,
                        COALESCE(beginning_stock, 0) + COALESCE(replenished_stock, 0) - COALESCE(total_issued, 0) as ending_balance
                    FROM monthly_inventory
                    WHERE year = '2024' AND month = '09'
    
                    UNION ALL
    
                    -- Get subsequent months and calculate their values based on previous month
                    SELECT 
                        mi.medicine_id,
                        mi.year,
                        mi.month,
                        COALESCE(ms.ending_balance, 0) as beginning_stock,
                        COALESCE(mi.replenished_stock, 0) as replenished_stock,
                        COALESCE(mi.total_issued, 0) as total_issued,
                        COALESCE(ms.ending_balance, 0) + COALESCE(mi.replenished_stock, 0) - COALESCE(mi.total_issued, 0) as ending_balance
                    FROM monthly_inventory mi
                    JOIN months_sequence ms ON mi.medicine_id = ms.medicine_id
                    WHERE (
                        (CAST(mi.year AS INTEGER) * 12 + CAST(mi.month AS INTEGER)) = 
                        (CAST(ms.year AS INTEGER) * 12 + CAST(ms.month AS INTEGER) + 1)
                    )
                )
                UPDATE monthly_inventory
                SET 
                    beginning_stock = (
                        SELECT ms.ending_balance
                        FROM months_sequence ms
                        WHERE ms.medicine_id = monthly_inventory.medicine_id
                        AND ms.year = monthly_inventory.year
                        AND ms.month = monthly_inventory.month
                    ),
                    balance = (
                        SELECT ms.ending_balance + COALESCE(monthly_inventory.replenished_stock, 0) - COALESCE(monthly_inventory.total_issued, 0)
                        FROM months_sequence ms
                        WHERE ms.medicine_id = monthly_inventory.medicine_id
                        AND ms.year = monthly_inventory.year
                        AND ms.month = monthly_inventory.month
                    )
                WHERE (CAST(year AS INTEGER) > 2024 OR (year = '2024' AND CAST(month AS INTEGER) >= 10))`;
    
            db.run(updateStockContinuitySQL, function(err) {
                if (err) {
                    console.error('Error updating stock continuity:', err);
                    db.run('ROLLBACK');
                    return callback(err);
                }
    
                console.log(`Updated ${this.changes} records for stock continuity`);
    
                db.run('COMMIT', (err) => {
                    if (err) {
                        console.error('Error committing transaction:', err);
                        db.run('ROLLBACK');
                        return callback(err);
                    }
                    console.log('Successfully updated stock continuity');
                    callback(null, { recordsUpdated: this.changes });
                });
            });
        });
    }

    static removeAllMonthlyRecords(callback) {
        console.log('Starting removal of all monthly records...');
        
        // First try the normal way
        db.serialize(() => {
            db.run('BEGIN TRANSACTION');

            // Delete all monthly inventory records
            db.run('DELETE FROM monthly_inventory', [], function(err) {
                if (err) {
                    console.error('Error removing monthly records normally:', err);
                    console.log('Database may be corrupted, trying alternative method...');
                    
                    // If normal delete fails, try dropping and recreating the table
                    db.serialize(() => {
                        // Drop the existing table
                        db.run('DROP TABLE IF EXISTS monthly_inventory', [], (dropErr) => {
                            if (dropErr) {
                                console.error('Error dropping monthly_inventory table:', dropErr);
                                return callback(dropErr);
                            }

                            // Recreate the table with the original schema
                            db.run(`CREATE TABLE monthly_inventory (
                                id INTEGER PRIMARY KEY AUTOINCREMENT,
                                medicine_id INTEGER NOT NULL,
                                year INTEGER NOT NULL,
                                month INTEGER NOT NULL,
                                beginning_stock INTEGER NOT NULL,
                                replenished_stock INTEGER NOT NULL DEFAULT 0,
                                total_issued INTEGER NOT NULL DEFAULT 0,
                                balance INTEGER NOT NULL,
                                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                                FOREIGN KEY (medicine_id) REFERENCES medicines(id),
                                UNIQUE(medicine_id, year, month)
                            )`, [], (createErr) => {
                                if (createErr) {
                                    console.error('Error recreating monthly_inventory table:', createErr);
                                    return callback(createErr);
                                }
                                
                                console.log('Successfully recreated monthly_inventory table');
                                callback(null, { recordsRemoved: 'all', tableRecreated: true });
                            });
                        });
                    });
                    return;
                }

                const recordsRemoved = this.changes;
                console.log(`Removed ${recordsRemoved} monthly records`);

                // Commit the transaction
                db.run('COMMIT', (err) => {
                    if (err) {
                        console.error('Error committing transaction:', err);
                        db.run('ROLLBACK');
                        return callback(err);
                    }
                    callback(null, { recordsRemoved });
                });
            });
        });
    }
}

// Helper function to convert month abbreviation to number
function getMonthNumber(monthAbbr) {
    const months = {
        'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
        'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08',
        'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
    };
    return months[monthAbbr] || '01';
}

module.exports = Medicine; 