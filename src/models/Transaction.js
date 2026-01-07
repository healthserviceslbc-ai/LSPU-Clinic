const db = require('../config/database');

class Transaction {
    static getOngoingTransactions(callback) {
        const sql = `SELECT * FROM medical_transactions 
                    WHERE time_finished IS NULL 
                    ORDER BY date DESC, time_started DESC`;
        db.all(sql, [], callback);
    }

    static getFinishedTransactions(callback) {
        const sql = `SELECT * FROM medical_transactions 
                    WHERE time_finished IS NOT NULL 
                    ORDER BY date DESC, time_finished DESC`;
        db.all(sql, [], callback);
    }

    static getRecentTransactions(callback) {
        const sql = `
            SELECT * FROM medical_transactions 
            WHERE DATE(date) = DATE('now', 'localtime')
            ORDER BY time_started DESC
            LIMIT 5`;
        db.all(sql, [], callback);
    }

    static addTransaction(transaction, callback) {
        db.serialize(() => {
            db.run('BEGIN TRANSACTION');

            // First get the medicine name if an ID is provided
            if (transaction.medication) {
                const getMedicineSQL = `
                    SELECT name, current_stock 
                    FROM medicines 
                    WHERE id = ?`;

                db.get(getMedicineSQL, [transaction.medication], (err, medicine) => {
                    if (err) {
                        db.run('ROLLBACK');
                        return callback(err);
                    }

                    if (!medicine) {
                        db.run('ROLLBACK');
                        return callback(new Error('Medicine not found'));
                    }

                    if (medicine.current_stock < transaction.quantity) {
                        db.run('ROLLBACK');
                        return callback(new Error('Insufficient stock'));
                    }

                    // Get year and month from transaction date
                    const transactionDate = new Date(transaction.date);
                    const year = transactionDate.getFullYear().toString();
                    const month = (transactionDate.getMonth() + 1).toString().padStart(2, '0');

                    // Insert transaction with medicine name
                    const insertTransactionSQL = `
                        INSERT INTO medical_transactions (
                            date, patient_name, course_year_section, complaints,
                            time_started, medication, quantity, remarks, time_finished
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
                    `;

                    const insertValues = [
                        transaction.date,
                        transaction.patient_name,
                        transaction.course_year_section,
                        transaction.complaints,
                        transaction.time_started,
                        medicine.name,
                        transaction.quantity,
                        transaction.remarks
                    ];

                    db.run(insertTransactionSQL, insertValues, function(err) {
                        if (err) {
                            db.run('ROLLBACK');
                            return callback(err);
                        }

                        // Update medicine stock
                        const updateStockSQL = `
                            UPDATE medicines 
                            SET current_stock = current_stock - ? 
                            WHERE id = ?
                        `;

                        db.run(updateStockSQL, [transaction.quantity, transaction.medication], (err) => {
                            if (err) {
                                db.run('ROLLBACK');
                                return callback(err);
                            }

                            // Update monthly inventory
                            const updateMonthlyInventorySQL = `
                                UPDATE monthly_inventory 
                                SET total_issued = total_issued + ?,
                                    balance = balance - ?
                                WHERE medicine_id = ? 
                                AND year = ?
                                AND month = ?`;

                            db.run(updateMonthlyInventorySQL, 
                                [transaction.quantity, transaction.quantity, transaction.medication, year, month], 
                                (err) => {
                                    if (err) {
                                        db.run('ROLLBACK');
                                        return callback(err);
                                    }

                                    db.run('COMMIT', callback);
                                }
                            );
                        });
                    });
                });
            } else {
                const insertTransactionSQL = `
                    INSERT INTO medical_transactions (
                        date, patient_name, course_year_section, complaints,
                        time_started, medication, quantity, remarks, time_finished
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
                `;

                const insertValues = [
                    transaction.date,
                    transaction.patient_name,
                    transaction.course_year_section,
                    transaction.complaints,
                    transaction.time_started,
                    '',  // Empty string instead of null
                    0,   // No quantity
                    transaction.remarks
                ];

                db.run(insertTransactionSQL, insertValues, function(err) {
                    if (err) {
                        db.run('ROLLBACK');
                        return callback(err);
                    }

                    db.run('COMMIT', callback);
                });
            }
        });
    }

    static finishTransaction(id, time_finished, callback) {
        console.log('Model: Finishing transaction:', id, 'with time:', time_finished);
        
        const sql = `UPDATE medical_transactions 
                    SET time_finished = ? 
                    WHERE id = ?`;
        
        db.run(sql, [time_finished, id], function(err) {
            if (err) {
                console.error('Database error finishing transaction:', err);
                return callback(err);
            }
            
            if (this.changes === 0) {
                console.error('No transaction found with ID:', id);
                return callback(new Error('Transaction not found'));
            }
            
            console.log('Transaction updated successfully. Changes:', this.changes);
            callback(null);
        });
    }

    static cancelTransaction(id, callback) {
        console.log('Model: Canceling transaction:', id);
        
        db.serialize(() => {
            db.run('BEGIN TRANSACTION');

            // First get the transaction details
            const getTransactionSQL = `
                SELECT t.*, m.id as medicine_id 
                FROM medical_transactions t
                LEFT JOIN medicines m ON t.medication = m.name
                WHERE t.id = ?`;

            db.get(getTransactionSQL, [id], (err, transaction) => {
                if (err) {
                    console.error('Error getting transaction:', err);
                    db.run('ROLLBACK');
                    return callback(err);
                }

                if (!transaction) {
                    console.error('Transaction not found:', id);
                    db.run('ROLLBACK');
                    return callback(new Error('Transaction not found'));
                }

                // Get year and month from transaction date
                const transactionDate = new Date(transaction.date);
                const year = transactionDate.getFullYear().toString();
                const month = (transactionDate.getMonth() + 1).toString().padStart(2, '0');

                // Delete the transaction
                const deleteSQL = `DELETE FROM medical_transactions WHERE id = ?`;
                db.run(deleteSQL, [id], function(err) {
                    if (err) {
                        console.error('Error deleting transaction:', err);
                        db.run('ROLLBACK');
                        return callback(err);
                    }

                    if (this.changes === 0) {
                        console.error('No transaction deleted with ID:', id);
                        db.run('ROLLBACK');
                        return callback(new Error('Transaction not found'));
                    }

                    // If medication was used, restore stock
                    if (transaction.medication && transaction.medicine_id) {
                        // Update medicine stock
                        const updateStockSQL = `
                            UPDATE medicines 
                            SET current_stock = current_stock + ? 
                            WHERE id = ?`;

                        db.run(updateStockSQL, [transaction.quantity, transaction.medicine_id], (err) => {
                            if (err) {
                                console.error('Error updating stock:', err);
                                db.run('ROLLBACK');
                                return callback(err);
                            }

                            // Update monthly inventory
                            const updateMonthlyInventorySQL = `
                                UPDATE monthly_inventory 
                                SET total_issued = total_issued - ?,
                                    balance = balance + ?
                                WHERE medicine_id = ? 
                                AND year = ?
                                AND month = ?`;

                            db.run(updateMonthlyInventorySQL, 
                                [transaction.quantity, transaction.quantity, transaction.medicine_id, year, month], 
                                (err) => {
                                    if (err) {
                                        console.error('Error updating monthly inventory:', err);
                                        db.run('ROLLBACK');
                                        return callback(err);
                                    }

                                    db.run('COMMIT', callback);
                                }
                            );
                        });
                    } else {
                        db.run('COMMIT', callback);
                    }
                });
            });
        });
    }

    static getTransactionById(id, callback) {
        const sql = `SELECT * FROM medical_transactions WHERE id = ?`;
        db.get(sql, [id], callback);
    }

    static getLast7DaysTransactions() {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT 
                    date,
                    COUNT(*) as count
                FROM medical_transactions
                WHERE date >= date('now', '-6 days')
                GROUP BY date
                ORDER BY date ASC`;

            db.all(sql, [], (err, rows) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(rows);
            });
        });
    }

    static getStatistics() {
        return new Promise((resolve, reject) => {
            db.serialize(() => {
                // Debug query to see actual data
                const debugSQL = `
                    SELECT 
                        patient_name,
                        date,
                        medication,
                        remarks,
                        time_finished,
                        strftime('%Y', date) as year
                    FROM medical_transactions 
                    ORDER BY date DESC`;
                
                // Get patient counts for different time periods
                const patientStatsSQL = `
                    WITH DateRanges AS (
                        SELECT 
                            date('now', 'localtime') as today,
                            date('now', 'localtime', '-7 days') as week_start,
                            strftime('%Y-%m', 'now', 'localtime') as current_month,
                            strftime('%Y', 'now', 'localtime') as current_year,
                            date(strftime('%Y', 'now', 'localtime') || '-01-01') as year_start,
                            date(strftime('%Y', 'now', 'localtime') || '-12-31') as year_end
                    )
                    SELECT 
                        COUNT(CASE WHEN date = (SELECT today FROM DateRanges) 
                            THEN 1 END) as today_patients,
                        COUNT(CASE WHEN date >= (SELECT week_start FROM DateRanges) 
                            THEN 1 END) as weekly_patients,
                        COUNT(CASE WHEN strftime('%Y-%m', date) = (SELECT current_month FROM DateRanges) 
                            THEN 1 END) as monthly_patients,
                        COUNT(CASE WHEN date >= (SELECT year_start FROM DateRanges) 
                            AND date <= (SELECT year_end FROM DateRanges)
                            THEN 1 END) as yearly_patients,
                        COUNT(*) as total_patients
                    FROM medical_transactions`;

                // Get complaint statistics with counts (including treatment-only transactions)
                const complaintStatsSQL = `
                    WITH AllComplaints AS (
                        SELECT 
                            CASE 
                                WHEN complaints IS NOT NULL AND complaints != '' THEN complaints
                                WHEN remarks LIKE '%Treatment/Advice:%' THEN 
                                    substr(remarks, 
                                          instr(remarks, 'Treatment/Advice: ') + 17,
                                          CASE 
                                              WHEN instr(substr(remarks, instr(remarks, 'Treatment/Advice: ') + 17), '\n\n') > 0 
                                              THEN instr(substr(remarks, instr(remarks, 'Treatment/Advice: ') + 17), '\n\n') - 1
                                              ELSE length(substr(remarks, instr(remarks, 'Treatment/Advice: ') + 17))
                                          END)
                            END as complaint_or_treatment,
                            COUNT(*) as count
                        FROM medical_transactions
                        WHERE (complaints IS NOT NULL AND complaints != '') 
                           OR remarks LIKE '%Treatment/Advice:%'
                        GROUP BY complaint_or_treatment
                    )
                    SELECT 
                        complaint_or_treatment as complaints,
                        count,
                        ROUND(count * 100.0 / (SELECT SUM(count) FROM AllComplaints), 2) as percentage
                    FROM AllComplaints
                    WHERE complaint_or_treatment IS NOT NULL
                    ORDER BY count DESC`;

                // Get general statistics
                const generalStatsSQL = `
                    SELECT 
                        COUNT(*) as total_transactions,
                        COUNT(CASE WHEN time_finished IS NOT NULL THEN 1 END) as completed_transactions,
                        COUNT(CASE WHEN time_finished IS NULL THEN 1 END) as ongoing_transactions,
                        COUNT(DISTINCT patient_name) as unique_patients,
                        COUNT(CASE WHEN medication != '' AND medication IS NOT NULL THEN 1 END) as transactions_with_medication,
                        COUNT(CASE WHEN (medication = '' OR medication IS NULL) AND remarks LIKE '%Treatment/Advice:%' THEN 1 END) as transactions_with_treatment
                    FROM medical_transactions`;

                // First run the debug query
                db.all(debugSQL, [], (err, debugData) => {
                    if (err) {
                        console.error('Debug query error:', err);
                    } else {
                        console.log('All patients and dates:', debugData);
                    }

                    // Then continue with the regular statistics
                    db.get(patientStatsSQL, [], (err, patientStats) => {
                        if (err) {
                            reject(err);
                            return;
                        }

                        console.log('Patient stats results:', patientStats);

                        db.all(complaintStatsSQL, [], (err, complaintStats) => {
                            if (err) {
                                reject(err);
                                return;
                            }

                            db.get(generalStatsSQL, [], (err, generalStats) => {
                                if (err) {
                                    reject(err);
                                    return;
                                }

                                // Combine all statistics
                                resolve({
                                    patients: {
                                        today: patientStats.today_patients || 0,
                                        thisWeek: patientStats.weekly_patients || 0,
                                        thisMonth: patientStats.monthly_patients || 0,
                                        thisYear: patientStats.yearly_patients || 0
                                    },
                                    complaints: complaintStats.map(complaint => ({
                                        name: complaint.complaints,
                                        count: complaint.count,
                                        percentage: complaint.percentage
                                    })),
                                    general: {
                                        total: generalStats.total_transactions,
                                        completed: generalStats.completed_transactions,
                                        ongoing: generalStats.ongoing_transactions,
                                        uniquePatients: generalStats.unique_patients,
                                        withMedication: generalStats.transactions_with_medication,
                                        withTreatment: generalStats.transactions_with_treatment
                                    }
                                });
                            });
                        });
                    });
                });
            });
        });
    }

    static updateTransaction(id, transaction, callback) {
        db.serialize(() => {
            db.run('BEGIN TRANSACTION');

            // First get the original transaction
            const getOriginalSQL = `
                SELECT t.*, m.id as medicine_id 
                FROM medical_transactions t
                LEFT JOIN medicines m ON t.medication = m.name
                WHERE t.id = ?`;

            db.get(getOriginalSQL, [id], (err, originalTransaction) => {
                if (err) {
                    console.error('Error getting original transaction:', err);
                    db.run('ROLLBACK');
                    return callback(err);
                }

                if (!originalTransaction) {
                    console.error('Transaction not found:', id);
                    db.run('ROLLBACK');
                    return callback(new Error('Transaction not found'));
                }

                // Get year and month from transaction date
                const transactionDate = new Date(originalTransaction.date);
                const year = transactionDate.getFullYear().toString();
                const month = (transactionDate.getMonth() + 1).toString().padStart(2, '0');

                // Update the transaction
                const updateSQL = `
                    UPDATE medical_transactions 
                    SET patient_name = ?,
                        course_year_section = ?,
                        complaints = ?,
                        medication = ?,
                        quantity = ?,
                        remarks = ?
                    WHERE id = ?`;

                db.run(updateSQL, [
                    transaction.patient_name,
                    transaction.course_year_section,
                    transaction.complaints,
                    transaction.medication,
                    transaction.quantity,
                    transaction.remarks,
                    id
                ], function(err) {
                    if (err) {
                        console.error('Error updating transaction:', err);
                        db.run('ROLLBACK');
                        return callback(err);
                    }

                    if (this.changes === 0) {
                        console.error('No transaction updated with ID:', id);
                        db.run('ROLLBACK');
                        return callback(new Error('Transaction not found'));
                    }

                    // If medication or quantity changed, update inventory
                    if (originalTransaction.medication !== transaction.medication ||
                        originalTransaction.quantity !== transaction.quantity) {
                        
                        // Restore original quantity if medication was used
                        if (originalTransaction.medication && originalTransaction.medicine_id) {
                            const restoreSQL = `
                                UPDATE medicines 
                                SET current_stock = current_stock + ? 
                                WHERE id = ?`;

                            db.run(restoreSQL, [originalTransaction.quantity, originalTransaction.medicine_id], (err) => {
                                if (err) {
                                    console.error('Error restoring stock:', err);
                                    db.run('ROLLBACK');
                                    return callback(err);
                                }

                                // Update monthly inventory to restore original quantity
                                const restoreMonthlySQL = `
                                    UPDATE monthly_inventory 
                                    SET total_issued = total_issued - ?,
                                        balance = balance + ?
                                    WHERE medicine_id = ? 
                                    AND year = ?
                                    AND month = ?`;

                                db.run(restoreMonthlySQL, 
                                    [originalTransaction.quantity, originalTransaction.quantity, originalTransaction.medicine_id, year, month], 
                                    (err) => {
                                        if (err) {
                                            console.error('Error updating monthly inventory:', err);
                                            db.run('ROLLBACK');
                                            return callback(err);
                                        }

                                        // Deduct new quantity if medication is used
                                        if (transaction.medication) {
                                            // Get the new medicine ID
                                            const getMedicineSQL = `SELECT id FROM medicines WHERE name = ?`;
                                            db.get(getMedicineSQL, [transaction.medication], (err, medicine) => {
                                                if (err) {
                                                    console.error('Error getting new medicine:', err);
                                                    db.run('ROLLBACK');
                                                    return callback(err);
                                                }

                                                if (!medicine) {
                                                    console.error('New medicine not found:', transaction.medication);
                                                    db.run('ROLLBACK');
                                                    return callback(new Error('Medicine not found'));
                                                }

                                                const deductSQL = `
                                                    UPDATE medicines 
                                                    SET current_stock = current_stock - ? 
                                                    WHERE id = ?`;

                                                db.run(deductSQL, [transaction.quantity, medicine.id], (err) => {
                                                    if (err) {
                                                        console.error('Error updating new stock:', err);
                                                        db.run('ROLLBACK');
                                                        return callback(err);
                                                    }

                                                    // Update monthly inventory for new medication
                                                    const updateMonthlySQL = `
                                                        UPDATE monthly_inventory 
                                                        SET total_issued = total_issued + ?,
                                                            balance = balance - ?
                                                        WHERE medicine_id = ? 
                                                        AND year = ?
                                                        AND month = ?`;

                                                    db.run(updateMonthlySQL, 
                                                        [transaction.quantity, transaction.quantity, medicine.id, year, month], 
                                                        (err) => {
                                                            if (err) {
                                                                console.error('Error updating monthly inventory:', err);
                                                                db.run('ROLLBACK');
                                                                return callback(err);
                                                            }

                                                            db.run('COMMIT', callback);
                                                        }
                                                    );
                                                });
                                            });
                                        } else {
                                            db.run('COMMIT', callback);
                                        }
                                    }
                                );
                            });
                        } else if (transaction.medication) {
                            // Get the new medicine ID
                            const getMedicineSQL = `SELECT id FROM medicines WHERE name = ?`;
                            db.get(getMedicineSQL, [transaction.medication], (err, medicine) => {
                                if (err) {
                                    console.error('Error getting new medicine:', err);
                                    db.run('ROLLBACK');
                                    return callback(err);
                                }

                                if (!medicine) {
                                    console.error('New medicine not found:', transaction.medication);
                                    db.run('ROLLBACK');
                                    return callback(new Error('Medicine not found'));
                                }

                                const deductSQL = `
                                    UPDATE medicines 
                                    SET current_stock = current_stock - ? 
                                    WHERE id = ?`;

                                db.run(deductSQL, [transaction.quantity, medicine.id], (err) => {
                                    if (err) {
                                        console.error('Error updating stock:', err);
                                        db.run('ROLLBACK');
                                        return callback(err);
                                    }

                                    // Update monthly inventory for new medication
                                    const updateMonthlySQL = `
                                        UPDATE monthly_inventory 
                                        SET total_issued = total_issued + ?,
                                            balance = balance - ?
                                        WHERE medicine_id = ? 
                                        AND year = ?
                                        AND month = ?`;

                                    db.run(updateMonthlySQL, 
                                        [transaction.quantity, transaction.quantity, medicine.id, year, month], 
                                        (err) => {
                                            if (err) {
                                                console.error('Error updating monthly inventory:', err);
                                                db.run('ROLLBACK');
                                                return callback(err);
                                            }

                                            db.run('COMMIT', callback);
                                        }
                                    );
                                });
                            });
                        } else {
                            db.run('COMMIT', callback);
                        }
                    } else {
                        db.run('COMMIT', callback);
                    }
                });
            });
        });
    }

    static deleteTransaction(id, callback) {
        db.serialize(() => {
            db.run('BEGIN TRANSACTION');

            // First get the transaction details
            const getTransactionSQL = `
                SELECT t.*, m.id as medicine_id 
                FROM medical_transactions t
                LEFT JOIN medicines m ON t.medication = m.name
                WHERE t.id = ?`;

            db.get(getTransactionSQL, [id], (err, transaction) => {
                if (err) {
                    console.error('Error getting transaction:', err);
                    db.run('ROLLBACK');
                    return callback(err);
                }

                if (!transaction) {
                    console.error('Transaction not found:', id);
                    db.run('ROLLBACK');
                    return callback(new Error('Transaction not found'));
                }

                // Get year and month from transaction date
                const transactionDate = new Date(transaction.date);
                const year = transactionDate.getFullYear().toString();
                const month = (transactionDate.getMonth() + 1).toString().padStart(2, '0');

                // Delete the transaction
                const deleteSQL = `DELETE FROM medical_transactions WHERE id = ?`;
                db.run(deleteSQL, [id], function(err) {
                    if (err) {
                        console.error('Error deleting transaction:', err);
                        db.run('ROLLBACK');
                        return callback(err);
                    }

                    if (this.changes === 0) {
                        console.error('No transaction deleted with ID:', id);
                        db.run('ROLLBACK');
                        return callback(new Error('Transaction not found'));
                    }

                    // If medication was used, restore stock
                    if (transaction.medication && transaction.medicine_id) {
                        // Update medicine stock
                        const updateStockSQL = `
                            UPDATE medicines 
                            SET current_stock = current_stock + ? 
                            WHERE id = ?`;

                        db.run(updateStockSQL, [transaction.quantity, transaction.medicine_id], (err) => {
                            if (err) {
                                console.error('Error updating stock:', err);
                                db.run('ROLLBACK');
                                return callback(err);
                            }

                            // Update monthly inventory
                            const updateMonthlyInventorySQL = `
                                UPDATE monthly_inventory 
                                SET total_issued = total_issued - ?,
                                    balance = balance + ?
                                WHERE medicine_id = ? 
                                AND year = ?
                                AND month = ?`;

                            db.run(updateMonthlyInventorySQL, 
                                [transaction.quantity, transaction.quantity, transaction.medicine_id, year, month], 
                                (err) => {
                                    if (err) {
                                        console.error('Error updating monthly inventory:', err);
                                        db.run('ROLLBACK');
                                        return callback(err);
                                    }

                                    db.run('COMMIT', callback);
                                }
                            );
                        });
                    } else {
                        db.run('COMMIT', callback);
                    }
                });
            });
        });
    }
}

module.exports = Transaction; 