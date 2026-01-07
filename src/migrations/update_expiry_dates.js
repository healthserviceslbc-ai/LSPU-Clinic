const db = require('../config/database');

const medicineUpdates = [
    { name: 'AMBROXOL (MUCOSOLVAN 30MG)', expiry_date: '2026-12-01' },
    { name: 'AMOXICILLIN AMOXIL 500MG', expiry_date: '2026-05-01' },
    { name: 'ASCORBIC ACID POTEN CEE 500MG', expiry_date: '2026-05-01' },
    { name: 'B COMPLEX (NEUROBION)', expiry_date: '2026-10-01' },
    { name: 'BETAHISTINE SERC 8MG', expiry_date: '2026-04-01' },
    { name: 'BIOFLU', expiry_date: '2025-07-01' },
    { name: 'BUSCOPAN 10MG', expiry_date: '2026-12-01' },
    { name: 'BUTAMIRATE CITRATE SINECOD FOR', expiry_date: '2027-03-01' },
    { name: 'CARBOCISTEINE SOLMUX', expiry_date: '2028-01-01' },
    { name: 'CEFALEXIN CEPOREX 500MG', expiry_date: '2026-09-01' },
    { name: 'CEFUROXIME ZOLTAX 500MG', expiry_date: '2026-06-01' },
    { name: 'CETIRIZINE 10MG', expiry_date: '2026-06-01' },
    { name: 'CIPROFLOXACIN CIPROMED 500MG', expiry_date: '2027-08-01' },
    { name: 'CLONIDINE CATAPRES', expiry_date: '2026-09-01' },
    { name: 'CLOXACILLIN 500MG', expiry_date: '2025-06-01' },
    { name: 'CO-AMOXICLAV 625MG', expiry_date: '2025-06-01' },
    { name: 'COTRIMOXAZOLE 800MG', expiry_date: '2027-08-01' },
    { name: 'DECOLGEN', expiry_date: '2026-10-01' },
    { name: 'DECOLSIN/SYMDEX', expiry_date: '2027-03-01' },
    { name: 'DEQUADIN LOZENGES', expiry_date: '2026-08-01' },
    { name: 'ERCEFLORA', expiry_date: '2025-11-01' },
    { name: 'KREMIL S', expiry_date: '2026-01-01' },
    { name: 'LOPERAMIDE LOMOTIL', expiry_date: '2027-08-01' },
    { name: 'LORATADINE NEELERTA', expiry_date: '2025-07-01' },
    { name: 'MECLIZINE BONAMINE', expiry_date: '2025-08-01' },
    { name: 'MEFENAMIC ACID DOLFENAL 500MG', expiry_date: '2028-08-01' },
    { name: 'METOCLOPRAMIDE P.O. 10MG', expiry_date: '2025-08-01' },
    { name: 'MUPIROCIN BACTROBAN OINTMENT', expiry_date: '2025-07-01' },
    { name: 'NEOZEP', expiry_date: '2028-11-01' },
    { name: 'NORMAL SALINE SOLUTION/SALINAS', expiry_date: '2028-11-01' },
    { name: 'OMEPRAZOLE RISEK 20MG', expiry_date: '2025-04-01' },
    { name: 'ORS HYDRITE', expiry_date: '2026-09-01' },
    { name: 'PARACETAMOL BIOGESIC 500MG', expiry_date: '2026-09-01' },
    { name: 'PARACETAMOL TEMPRA 500MG', expiry_date: '2026-05-01' },
    { name: 'PROPANOLOL 10MG', expiry_date: '2026-05-01' },
    { name: 'SILVER SULFADIAZINE FLAMMAZINE', expiry_date: '2025-08-01' },
    { name: 'SINUPRET', expiry_date: '2025-08-01' },
    { name: 'SYSTANE OPTIC DROPS', expiry_date: '2026-09-01' },
    { name: 'TETRAHYDROZOLINE HCI (EYE MO RE', expiry_date: '2025-10-01' },
    { name: 'TRIDERM OINTMENT', expiry_date: '2026-09-01' },
    { name: 'IBUPROFEN', expiry_date: '2026-09-01' },
    { name: 'VENTOLIN NEBULES/DUAVENT', expiry_date: '2026-09-01' },
    // Medical Supplies
    { name: 'BACTIDOL SOLUTION FOR GARGLE', expiry_date: '2026-12-01' },
    { name: 'BETADINE SPRAY', expiry_date: '2027-02-01' }
];

function updateExpiryDates() {
    const db = require('../config/database');
    
    medicineUpdates.forEach(update => {
        const sql = `UPDATE medicines SET expiry_date = ? WHERE name = ?`;
        db.run(sql, [update.expiry_date, update.name], function(err) {
            if (err) {
                console.error(`Error updating ${update.name}:`, err);
            } else {
                console.log(`Updated ${update.name} with expiry date ${update.expiry_date}`);
            }
        });
    });
}

// Run the update
updateExpiryDates(); 