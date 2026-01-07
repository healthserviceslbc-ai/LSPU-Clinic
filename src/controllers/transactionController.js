const Transaction = require('../models/Transaction');
const Medicine = require('../models/Medicine');

exports.listTransactions = (req, res) => {
    Transaction.getOngoingTransactions((err, ongoingTransactions) => {
        if (err) {
            console.error('Error getting ongoing transactions:', err);
            return res.status(500).send('Error loading transactions');
        }

        Transaction.getFinishedTransactions((err, finishedTransactions) => {
            if (err) {
                console.error('Error getting finished transactions:', err);
                return res.status(500).send('Error loading transactions');
            }

            res.render('transactions/list', {
                title: 'Transactions',
                page: 'transactions',
                ongoingTransactions,
                finishedTransactions
            });
        });
    });
};

exports.newTransactionForm = (req, res) => {
    // Get the current year and month
    const now = new Date();
    const year = now.getFullYear().toString();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');

    // Fetch medicines with properly formatted parameters
    Medicine.getAllMedicines(year, month, (err, medicineData) => {
        if (err) {
            console.error('Error fetching medicines:', err);
            return res.status(500).send('Error loading medicines');
        }

        // Combine all medicine categories
        const medicines = [
            ...medicineData.medicines || [],
            ...medicineData.medical_supplies || [],
            ...medicineData.dental_supplies || [],
            ...medicineData.other_supplies || []
        ];

        res.render('transactions/new', {
            title: 'New Transaction',
            page: 'transactions',
            medicines: medicines
        });
    });
};

exports.createTransaction = (req, res) => {
    console.log('\n=== New Transaction Request ===');
    console.log('Request Body:', {
        date: req.body.date,
        time_started: req.body.time_started,
        patient_name: req.body.patient_name,
        course_year_section: req.body.course_year_section,
        complaints: req.body.complaints,
        medication: req.body.medication || '',
        quantity: req.body.quantity || 0,
        remarks: req.body.remarks || ''
    });

    const transaction = {
        date: req.body.date,
        patient_name: req.body.patient_name,
        course_year_section: req.body.course_year_section,
        complaints: req.body.complaints,
        time_started: req.body.time_started,
        medication: req.body.medication || '',
        quantity: req.body.quantity || 0,
        remarks: req.body.remarks || ''
    };

    console.log('\nProcessed Transaction Data:', transaction);

    if (transaction.medication && transaction.medication !== '' && transaction.quantity <= 0) {
        console.log('\nValidation Error: Quantity must be greater than 0 when medication is selected');
        return res.status(400).json({
            success: false,
            error: 'Quantity must be greater than 0 when medication is selected'
        });
    }

    console.log('\nAttempting to add transaction to database...');
    Transaction.addTransaction(transaction, (err) => {
        if (err) {
            console.error('\nDatabase Error:', err);
            return res.status(500).json({
                success: false,
                error: err.message || 'Error creating transaction'
            });
        }

        console.log('\nTransaction created successfully');
        console.log('=== End Transaction Request ===\n');
        
        res.json({
            success: true,
            message: 'Transaction created successfully'
        });
    });
};

exports.finishTransaction = (req, res) => {
    const transactionId = req.params.id;
    const time_finished = new Date().toLocaleTimeString('en-US', { hour12: false });

    Transaction.finishTransaction(transactionId, time_finished, (err) => {
        if (err) {
            console.error('Error finishing transaction:', err);
            return res.status(500).json({
                success: false,
                error: err.message
            });
        }

        res.json({
            success: true,
            message: 'Transaction finished successfully'
        });
    });
};

exports.cancelTransaction = (req, res) => {
    const transactionId = req.params.id;
    console.log('Controller: Canceling transaction:', transactionId);

    Transaction.cancelTransaction(transactionId, (err) => {
        if (err) {
            console.error('Controller: Error canceling transaction:', err);
            return res.status(500).json({
                success: false,
                error: err.message || 'Error canceling transaction'
            });
        }

        console.log('Controller: Transaction canceled successfully');
        res.json({
            success: true,
            message: 'Transaction canceled successfully'
        });
    });
};

exports.getTransactionDetails = (req, res) => {
    const transactionId = req.params.id;

    // Check if user is admin
    if (!req.session.isAdmin) {
        return res.status(403).json({
            success: false,
            error: 'Unauthorized access'
        });
    }

    Transaction.getTransactionById(transactionId, (err, transaction) => {
        if (err) {
            console.error('Error getting transaction details:', err);
            return res.status(500).json({
                success: false,
                error: err.message || 'Error getting transaction details'
            });
        }

        if (!transaction) {
            return res.status(404).json({
                success: false,
                error: 'Transaction not found'
            });
        }

        res.json(transaction);
    });
};

exports.updateTransaction = (req, res) => {
    const transactionId = req.params.id;

    // Check if user is admin
    if (!req.session.isAdmin) {
        return res.status(403).json({
            success: false,
            error: 'Unauthorized access'
        });
    }

    const updatedTransaction = {
        patient_name: req.body.patient_name,
        course_year_section: req.body.course_year_section,
        complaints: req.body.complaints,
        medication: req.body.medication || '',
        quantity: req.body.quantity || 0,
        remarks: req.body.remarks || ''
    };

    // Only validate quantity if medication is selected
    if (updatedTransaction.medication && updatedTransaction.medication !== '' && updatedTransaction.quantity <= 0) {
        return res.status(400).json({
            success: false,
            error: 'Quantity must be greater than 0 when medication is selected'
        });
    }

    Transaction.updateTransaction(transactionId, updatedTransaction, (err) => {
        if (err) {
            console.error('Error updating transaction:', err);
            return res.status(500).json({
                success: false,
                error: err.message || 'Error updating transaction'
            });
        }

        res.json({
            success: true,
            message: 'Transaction updated successfully'
        });
    });
};

exports.deleteTransaction = (req, res) => {
    const transactionId = req.params.id;

    // Check if user is admin
    if (!req.session.isAdmin) {
        return res.status(403).json({
            success: false,
            error: 'Unauthorized access'
        });
    }

    Transaction.deleteTransaction(transactionId, (err) => {
        if (err) {
            console.error('Error deleting transaction:', err);
            return res.status(500).json({
                success: false,
                error: err.message || 'Error deleting transaction'
            });
        }

        res.json({
            success: true,
            message: 'Transaction deleted successfully'
        });
    });
};

exports.getLast7DaysTransactions = async (req, res) => {
    try {
        const data = await Transaction.getLast7DaysTransactions();
        res.json(data);
    } catch (err) {
        console.error('Error getting last 7 days transactions:', err);
        res.status(500).json({ error: err.message });
    }
};

exports.getStatistics = async (req, res) => {
    try {
        const data = await Transaction.getStatistics();
        res.json(data);
    } catch (err) {
        console.error('Error getting statistics:', err);
        res.status(500).json({ error: err.message });
    }
}; 