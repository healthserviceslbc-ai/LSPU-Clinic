const express = require('express');
const router = express.Router();
const transactionController = require('../controllers/transactionController');

// GET /transactions
router.get('/', transactionController.listTransactions);

// API Routes for Statistics
router.get('/api/transactions/last-7-days', transactionController.getLast7DaysTransactions);
router.get('/api/statistics', transactionController.getStatistics);

// GET /transactions/new
router.get('/new', transactionController.newTransactionForm);

// POST /transactions
router.post('/', transactionController.createTransaction);

// POST /transactions/:id/finish
router.post('/:id/finish', transactionController.finishTransaction);

// POST /transactions/:id/cancel
router.post('/:id/cancel', transactionController.cancelTransaction);

// Admin routes
// GET /transactions/:id/edit - Get transaction details for editing
router.get('/:id/edit', transactionController.getTransactionDetails);

// POST /transactions/:id/update - Update transaction
router.post('/:id/update', transactionController.updateTransaction);

// POST /transactions/:id/delete - Delete transaction
router.post('/:id/delete', transactionController.deleteTransaction);

module.exports = router; 