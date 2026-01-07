const Medicine = require('../models/Medicine');
const Inventory = require('../models/Inventory');

exports.getMedicineForm = (req, res) => {
    res.render('inventory/add', {
        title: 'Add Medicine',
        page: 'inventory'
    });
};

exports.addMedicine = (req, res) => {
    const medicine = {
        name: req.body.name,
        unit: req.body.unit,
        expiry_date: req.body.expiry_date,
        current_stock: req.body.current_stock
    };

    Medicine.addMedicine(medicine, (err) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Error adding medicine');
        }
        res.redirect('/inventory');
    });
};

exports.listInventory = (req, res) => {
    Medicine.getAllMedicines((err, medicines) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Error loading inventory');
        }
        res.render('inventory/list', {
            title: 'Inventory',
            page: 'inventory',
            medicines: medicines
        });
    });
};

exports.updateStock = (req, res) => {
    const { id, quantity } = req.body;
    Medicine.updateStock(id, quantity, (err) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Error updating stock');
        }
        res.redirect('/inventory');
    });
}; 