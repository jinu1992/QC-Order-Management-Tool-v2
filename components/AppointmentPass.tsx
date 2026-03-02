import React from 'react';
import { XIcon, PrinterIcon } from './icons/Icons';

interface AppointmentPassProps {
    appointmentId: string | number;
    appointmentDate: string;
    appointmentTime: string;
    facilityName: string;
    qrCodeUrl?: string;
    purchaseManagerName: string;
    purchaseManagerPhone: string;
    unloadingSlot: string;
    purchaseOrderId?: string;
    onClose: () => void;
    addNotification: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
}

const AppointmentPass: React.FC<AppointmentPassProps> = ({
    appointmentId,
    appointmentDate,
    appointmentTime,
    facilityName,
    qrCodeUrl,
    purchaseManagerName,
    purchaseManagerPhone,
    unloadingSlot,
    purchaseOrderId,
    onClose,
    addNotification
}) => {
    const handlePrint = () => {
        const printContent = document.getElementById('appointment-pass-print-content');
        if (!printContent) return;

        const printWindow = window.open('', '', 'width=600,height=900');
        if (!printWindow) {
            addNotification("Popup blocked! Please allow popups to print the appointment pass.", "error");
            return;
        }

        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
                <head>
                    <title>Appointment Pass - ${appointmentId}</title>
                    <style>
                        @page {
                            size: 4in 6in;
                            margin: 0;
                        }
                        
                        * {
                            margin: 0;
                            padding: 0;
                            box-sizing: border-box;
                        }
                        
                        body {
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                            background: white;
                            color: black;
                            -webkit-print-color-adjust: exact;
                            print-color-adjust: exact;
                        }

                        .font-mono {
                            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
                        }

                        .uppercase {
                            text-transform: uppercase;
                        }
                        
                        @media print {
                            body {
                                background: white;
                                color: black !important;
                            }
                        }
                    </style>
                </head>
                <body>
                    ${printContent.innerHTML}
                </body>
            </html>
        `);

        printWindow.document.close();
        
        // Wait for images to load before printing
        setTimeout(() => {
            printWindow.print();
            printWindow.close();
        }, 1000);
    };

    // Format the appointment ID
    const formattedId = String(appointmentId || '');

    // Format date to readable format
    const formatDate = (dateStr: string) => {
        if (!dateStr) return 'TBD';
        
        // If already in a readable format, return as-is
        if (dateStr.includes(',') || dateStr.length > 15) return dateStr;
        
        // Handle DD/MM/YYYY format
        if (dateStr.includes('/')) {
            const parts = dateStr.split('/');
            if (parts.length === 3) {
                const [day, month, year] = parts;
                const months = ['January', 'February', 'March', 'April', 'May', 'June', 
                               'July', 'August', 'September', 'October', 'November', 'December'];
                const monthName = months[parseInt(month) - 1] || month;
                return `${monthName} ${day}, ${year}`;
            }
        }
        
        return dateStr;
    };

    const formattedDate = formatDate(appointmentDate);
    const formattedTime = appointmentTime; // It's already formatted by SalesOrderTable

    // Process Google Drive URL for better printing quality
    const processedQrUrl = (() => {
        if (!qrCodeUrl) return undefined;
        
        // Handle Google Drive URLs
        if (qrCodeUrl.includes('drive.google.com')) {
            // Extract file ID from various Google Drive URL formats
            let fileId = '';
            
            // Format: /file/d/FILE_ID/view
            const match1 = qrCodeUrl.match(/\/file\/d\/([^\/\?]+)/);
            if (match1) fileId = match1[1];
            
            // Format: /d/FILE_ID/
            const match2 = qrCodeUrl.match(/\/d\/([^\/\?]+)/);
            if (match2) fileId = match2[1];
            
            // Format: ?id=FILE_ID
            const match3 = qrCodeUrl.match(/[?&]id=([^&]+)/);
            if (match3) fileId = match3[1];
            
            // If we found a file ID, create a direct image URL
            if (fileId) {
                // Use thumbnail API for better loading
                return `https://drive.google.com/thumbnail?id=${fileId}&sz=w400`;
            }
        }
        
        // Return original URL if not a Google Drive link or couldn't parse
        return qrCodeUrl;
    })();

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[200] p-4 overflow-y-auto print:hidden">
            {/* Preview Container */}
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden relative">
                <button onClick={onClose} className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-full transition-colors z-10">
                    <XIcon className="h-6 w-6 text-gray-600" />
                </button>
                
                <div className="p-6">
                    <h2 className="text-xl font-bold text-gray-900 mb-2 text-center">Appointment Pass Preview</h2>
                    <p className="text-sm text-gray-500 mb-6 text-center">4×6 Thermal Label Format</p>
                    
                    {/* Print Preview - Exact 4x6 ratio */}
                    <div className="border-2 border-gray-200 rounded-lg overflow-hidden mb-6 shadow-sm mx-auto" style={{ width: '320px', height: '480px' }}>
                        <div id="appointment-pass-print-content" style={{ width: '100%', height: '100%', transform: 'scale(0.833)', transformOrigin: 'top left' }}>
                            <div  className = "font-mono uppercase" style={{ width: '384px', height: '576px', padding: '20px', display: 'flex', flexDirection: 'column', background: 'white', color: 'black' }}>

                            <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: '28px', fontWeight: '900', color: 'black', letterSpacing: '-0.5px', marginBottom: '15px', textTransform: 'lowercase' }}>partnersbiz</div>
                                </div>

                                <div style={{ marginBottom: '10px' }}>
                                    <div style={{ fontSize: '26px', fontWeight: '900', color: 'black', borderBottom: '2px solid black', paddingBottom: '2px', letterSpacing: '-0.5px' }}>ID : {formattedId}</div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '2px' }}>
                                    <div style={{ marginBottom: '8px' }}>
                                        <div style={{ fontSize: '11px', color: 'black', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.3px', fontWeight: '600' }}>Date</div>
                                        <div style={{ fontSize: '18px', fontWeight: '900', color: 'black', lineHeight: '1.2' }}>{formattedDate}</div>
                                    </div>

                                    <div style={{ marginBottom: '8px' }}>
                                        <div style={{ fontSize: '11px', color: 'black', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.3px', fontWeight: '600' }}>Reporting Time</div>
                                        <div style={{ fontSize: '18px', fontWeight: '900', color: 'black', lineHeight: '1.2' }}>{formattedTime}</div>
                                    </div>

                                    <div style={{ marginBottom: '8px' }}>
                                        <div style={{ fontSize: '11px', color: 'black', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.3px', fontWeight: '600' }}>Facility</div>
                                        <div style={{ fontSize: '14px', fontWeight: '700', color: 'black', lineHeight: '1.2' }}>{facilityName}</div>
                                    </div>

                                    <div style={{ marginBottom: '8px' }}>
                                        <div style={{ fontSize: '11px', color: 'black', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.3px', fontWeight: '600' }}>Vendor Name</div>
                                        <div style={{ fontSize: '14px', fontWeight: '700', color: 'black', lineHeight: '1.2' }}>{purchaseManagerName}</div>
                                    </div>

                                    {purchaseOrderId && (
                                        <div style={{ gridColumn: '1 / -1', marginBottom: '2px' }}>
                                            <div style={{ fontSize: '11px', color: 'black', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.3px', fontWeight: '600' }}>Purchase Order ID</div>
                                            <div style={{ fontSize: '20px', fontWeight: '900', color: 'black', lineHeight: '1.2' }}>{purchaseOrderId}</div>
                                        </div>
                                    )}
                                </div>

                                <div style={{ height: '2px', background: 'black', margin: '15px 0' }}></div>

                                <div style={{ textAlign: 'center', flex: '1', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                                    <div style={{ fontSize: '18px', fontWeight: '900', color: 'black', marginBottom: '4px' }}>Appointment Pass</div>
                                    <div style={{ display: 'inline-block', width: '180px', height: '180px', background: 'white' }}>
                                        {processedQrUrl ? (
                                            <img 
                                                src={processedQrUrl} 
                                                alt="Appointment QR Code"
                                                style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                                            />
                                        ) : (
                                            <div style={{ 
                                                width: '100%', 
                                                height: '100%', 
                                                display: 'flex', 
                                                alignItems: 'center', 
                                                justifyContent: 'center',
                                                background: 'white',
                                                fontSize: '13px',
                                                color: 'black',
                                                fontWeight: 'bold',
                                                textAlign: 'center',
                                                padding: '10px'
                                            }}>
                                                QR CODE<br/>NOT PROVIDED
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-3">
                        <button 
                            onClick={handlePrint}
                            className="flex-1 px-6 font-mono uppercase py-3 bg-gray-900 text-white font-bold rounded-lg shadow-lg hover:bg-gray-800 transition-all flex items-center justify-center gap-2"
                        >
                            <PrinterIcon className="h-5 w-5" />
                            Print Pass
                        </button>
                        <button 
                            onClick={onClose}
                            className="px-6 py-3 bg-gray-100 text-gray-700 font-bold rounded-lg hover:bg-gray-200 transition-all"
                        >
                            Close
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AppointmentPass;