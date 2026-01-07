import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

// Export the PDF generation functions
export async function generatePdfPreview(isDownload = false) {
    try {
        console.log('Starting PDF generation...');
        // Log initial memory usage
        const initialMemory = window.performance.memory ? 
            `${(window.performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(2)}MB` : 'Not available';
        console.log(`Initial memory usage: ${initialMemory}`);

        // Create new jsPDF instance with memory-efficient settings
        const doc = new jsPDF({
            orientation: 'landscape',
            unit: 'mm',
            format: 'a4',
            compress: true // Enable compression
        });

        // ... rest of your PDF generation code ...
        
        // Use smaller chunks for data processing
        const CHUNK_SIZE = 50; // Process 50 rows at a time
        for(let i = 0; i < tableData.body.length; i += CHUNK_SIZE) {
            const chunk = tableData.body.slice(i, i + CHUNK_SIZE);
            doc.autoTable({
                startY: i === 0 ? 55 : doc.lastAutoTable.finalY + 10,
                head: i === 0 ? tableData.head : [], // Only add header for first chunk
                body: chunk,
                // ... rest of your autoTable settings ...
            });
            
            // Force garbage collection between chunks
            if (window.gc) window.gc();
        }

        // Log memory usage after generation
        const finalMemory = window.performance.memory ? 
            `${(window.performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(2)}MB` : 'Not available';
        console.log(`Final memory usage: ${finalMemory}`);

        // Create blob with compression
        const pdfBlob = new Blob([doc.output('blob')], { 
            type: 'application/pdf'
        });

        // Handle download or preview
        if (isDownload) {
            const link = document.createElement('a');
            link.href = URL.createObjectURL(pdfBlob);
            link.download = `Medicine_Inventory_${new Date().toISOString()}.pdf`;
            link.click();
            URL.revokeObjectURL(link.href);
        } else {
            const blobUrl = URL.createObjectURL(pdfBlob);
            window.open(blobUrl, '_blank');
            setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
        }

    } catch (error) {
        console.error('PDF Generation Error:', error);
        throw error;
    }
} 