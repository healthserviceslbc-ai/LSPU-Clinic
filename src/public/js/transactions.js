console.log('Loading transactions.js');

document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM Content Loaded in transactions.js');
    initializeTransactions();
});

function initializeTransactions() {
    try {
        console.log('Initializing transactions');
        
        // Add click event listeners to all finish buttons
        const finishButtons = document.querySelectorAll('.finish-transaction-btn');
        console.log('Found finish buttons:', finishButtons.length);
        
        if (finishButtons.length === 0) {
            console.warn('No finish buttons found on the page');
            return;
        }
        
        finishButtons.forEach((button, index) => {
            console.log(`Setting up listener for button ${index + 1}`);
            
            button.addEventListener('click', async function(e) {
                e.preventDefault();
                console.log('Finish button clicked');
                
                const transactionId = this.getAttribute('data-transaction-id');
                if (!transactionId) {
                    console.error('No transaction ID found on button');
                    alert('Error: Could not find transaction ID');
                    return;
                }
                
                console.log('Transaction ID:', transactionId);
                
                if (confirm('Are you sure you want to finish this transaction?')) {
                    try {
                        const button = this;
                        button.disabled = true;
                        button.textContent = 'Processing...';
                        
                        console.log('Sending finish request for transaction:', transactionId);
                        
                        const response = await fetch(`/transactions/${transactionId}/finish`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            credentials: 'same-origin'
                        });
                        
                        console.log('Response status:', response.status);
                        
                        if (!response.ok) {
                            throw new Error(`HTTP error! status: ${response.status}`);
                        }
                        
                        const data = await response.json();
                        console.log('Response data:', data);
                        
                        if (data.success) {
                            console.log('Transaction finished successfully, reloading page');
                            window.location.reload();
                        } else {
                            throw new Error(data.error || 'Unknown error occurred');
                        }
                    } catch (error) {
                        console.error('Error in finish transaction:', error);
                        alert(error.message || 'Error finishing transaction');
                        button.disabled = false;
                        button.textContent = 'Finish';
                    }
                } else {
                    console.log('User cancelled transaction finish');
                }
            });
        });
        
        console.log('Transaction initialization complete');
    } catch (error) {
        console.error('Error in initializeTransactions:', error);
    }
}

// Export for direct use
window.initializeTransactions = initializeTransactions; 