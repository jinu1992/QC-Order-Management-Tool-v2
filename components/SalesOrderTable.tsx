
import React, { useState, Fragment, useMemo, FC, useRef, useEffect } from 'react';
import { type PurchaseOrder, type InventoryItem, POItem } from '../types';
import { 
    DotsVerticalIcon, 
    CloudDownloadIcon, 
    ChevronDownIcon, 
    ChevronRightIcon, 
    TruckIcon, 
    CalendarIcon, 
    CheckCircleIcon, 
    CubeIcon, 
    InvoiceIcon, 
    ClipboardListIcon, 
    ExternalLinkIcon, 
    PaperclipIcon, 
    RefreshIcon, 
    PlusIcon, 
    SendIcon, 
    LockClosedIcon, 
    GlobeIcon, 
    InfoIcon,
    XCircleIcon,
    CurrencyIcon,
    SearchIcon,
    FilterIcon,
    ClockIcon,
    PrinterIcon,
    AlertIcon,
    QuestionMarkCircleIcon,
    DownloadIcon,
    UploadIcon
} from './icons/Icons';
import { createZohoInvoice, pushToNimbusPost, fetchPurchaseOrder, syncSinglePO, fetchPackingData, updateFBAShipmentId, syncEasyEcomShipments, updatePOStatus, processFlipkartConsignment, fetchBoxDetails, sendZeptoAppointmentRequestEmail, sendInstamartAppointmentRequestEmail, updateInstamartAppointmentDetails, processBlinkitAppointmentPasses, updateZeptoASN, updateRTOStatus } from '../services/api';
import AppointmentPass from './AppointmentPass';
import LoadingCube from './LoadingCube';

interface SalesOrderTableProps {
    activeFilter: string;
    setActiveFilter: (filter: string) => void;
    purchaseOrders: PurchaseOrder[];
    setPurchaseOrders: React.Dispatch<React.SetStateAction<PurchaseOrder[]>>;
    tabCounts: { [key: string]: number };
    addLog: (action: string, details: string) => void;
    addNotification: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
    onSync: () => void;
    isSyncing: boolean;
    inventoryItems?: InventoryItem[];
    googleTokens?: any;
    setGoogleTokens?: (tokens: any) => void;
}

interface GroupedSalesOrder {
    id: string;
    poReference: string;
    status: string;
    originalEeStatus: string;
    channel: string;
    storeCode: string;
    orderDate: string;
    poEdd?: string;
    poExpiryDate?: string;
    poPdfUrl?: string;
    qty: number;
    amount: number;
    items: POItem[];
    batchCreatedAt?: string;
    invoiceDate?: string;
    manifestDate?: string;
    invoiceId?: string;
    invoiceStatus?: string;
    invoiceNumber?: string;
    invoiceTotal?: number;
    invoiceUrl?: string;
    invoicePdfUrl?: string;
    carrier?: string;
    awb?: string;
    trackingStatus?: string;
    edd?: string;
    latestStatus?: string;
    latestStatusDate?: string;
    currentLocation?: string;
    trackingUrl?: string;
    deliveredDate?: string;
    rtoStatus?: string;
    rtoAwb?: string;
    boxCount: number;
    appointmentDate?: string;
    appointmentRequestDate?: string;
    appointmentRequestId?: string;
    appointmentRequestTimestamp?: string;
    appointmentId?: string;
    appointmentTime?: string;
    appointmentRemarks?: string;
    qrCodeUrl?: string;
    ewb?: string;
    fbaShipmentId?: string;
    // Specific for Flipkart
    consignmentQty?: number;
    consignmentProducts?: number;
    consignmentValue?: string;
}

// --- Formatters ---

const formatDisplayTime = (timeInput?: any): string => {
    if (!timeInput) return 'N/A';
    
    const timeStr = String(timeInput).trim();
    
    if (timeStr.toUpperCase().includes('AM') || timeStr.toUpperCase().includes('PM')) {
        return timeStr;
    }
    
    try {
        if (timeStr.includes('T') || timeStr.includes('GMT') || (timeStr.length > 12 && timeStr.includes('-'))) {
            const dateObj = new Date(timeStr);
            if (!isNaN(dateObj.getTime())) {
                let hours = dateObj.getHours();
                const minutes = String(dateObj.getMinutes()).padStart(2, '0');
                const ampm = hours >= 12 ? 'PM' : 'AM';
                hours = hours % 12;
                hours = hours ? hours : 12; // the hour '0' should be '12'
                const formatted = `${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
                return formatted;
            }
        }

        const parts = timeStr.match(/(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
        if (parts) {
            let hours = parseInt(parts[1], 10);
            const minutes = (parts[2] || '').padStart(2, '0');
            
            if (hours >= 0 && hours < 24) {
                const ampm = hours >= 12 ? 'PM' : 'AM';
                hours = hours % 12;
                hours = hours ? hours : 12;
                const formatted = `${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
                return formatted;
            }
        }
        
        return timeStr;
    } catch (e) {
        return timeStr;
    }
};

const formatDateForInput = (dateStr?: string): string => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    // Handle DD-MM-YYYY
    const parts = dateStr.split('-');
    if (parts.length === 3 && parts[2].length === 4) {
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
    return dateStr;
};

const formatTimeForInput = (timeInput?: any): string => {
    if (!timeInput) return '';
    const timeStr = String(timeInput).trim();

    // If it's an ISO string or similar, convert to local time
    if (timeStr.includes('T') || timeStr.includes('GMT') || (timeStr.length > 12 && timeStr.includes('-'))) {
        const dateObj = new Date(timeStr);
        if (!isNaN(dateObj.getTime())) {
            const hours = String(dateObj.getHours()).padStart(2, '0');
            const minutes = String(dateObj.getMinutes()).padStart(2, '0');
            return `${hours}:${minutes}`;
        }
    }

    // Handle HH:MM AM/PM
    const ampmMatch = timeStr.match(/(\d{1,2}):(\d{1,2})\s*(AM|PM)/i);
    if (ampmMatch) {
        let hours = parseInt(ampmMatch[1], 10);
        const minutes = ampmMatch[2].padStart(2, '0');
        const ampm = ampmMatch[3].toUpperCase();
        if (ampm === 'PM' && hours < 12) hours += 12;
        if (ampm === 'AM' && hours === 12) hours = 0;
        return `${String(hours).padStart(2, '0')}:${minutes}`;
    }
    // Handle HH:MM:SS or HH:MM
    const parts = timeStr.match(/(\d{1,2}):(\d{1,2})/);
    if (parts) {
        return `${parts[1].padStart(2, '0')}:${parts[2].padStart(2, '0')}`;
    }
    return timeStr;
};

// --- Flipkart Consignment Modal ---

const FlipkartConsignmentModal: FC<{ 
    so: GroupedSalesOrder, 
    onClose: () => void, 
    onSuccess: () => void,
    addNotification: any,
    userEmail: string
}> = ({ so, onClose, onSuccess, addNotification, userEmail }) => {
    const [isUploading, setIsUploading] = useState(false);
    const [uploadComplete, setUploadComplete] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const extractTextFromPdf = async (file: File): Promise<string> => {
        const arrayBuffer = await file.arrayBuffer();
        const pdfjsLib = (window as any)['pdfjs-dist/build/pdf'];
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = "";
        
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            const pageText = content.items.map((item: any) => item.str).join(" ");
            fullText += pageText + "\n";
        }
        return fullText;
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        
        try {
            // 1. Extract text from PDF using pdf.js
            const extractedText = await extractTextFromPdf(file);
            
            // 2. Send extracted text to backend API
            const res = await processFlipkartConsignment(so.poReference, extractedText, userEmail);
            
            if (res.status === 'success') {
                setUploadComplete(true);
                addNotification(res.message, 'success');
                onSuccess();
            } else {
                addNotification(res.message || 'Processing failed.', 'error');
                setIsUploading(false);
            }
        } catch (err: any) {
            console.error("PDF Extraction Error:", err);
            addNotification('Error reading PDF file. Ensure it is a valid Flipkart Consignment PDF.', 'error');
            setIsUploading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[150] p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-blue-100 animate-in fade-in zoom-in-95 duration-200">
                <div className="p-6 bg-blue-600 border-b border-blue-700 flex flex-col items-center text-center">
                    <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mb-4">
                        <GlobeIcon className="h-10 w-10 text-white" />
                    </div>
                    <h3 className="text-xl font-black text-white uppercase tracking-tight">Flipkart Consignment Portal</h3>
                    <p className="text-xs text-blue-100 mt-1">Order Ref: <span className="font-bold text-white">{so.id}</span></p>
                </div>
                
                <div className="p-8">
                    <div className="grid grid-cols-2 gap-4 mb-8">
                        <CopyField 
                            label="Target PO" 
                            value={so.poReference} 
                            icon={<ClipboardListIcon className="h-3 w-3"/>} 
                        />
                        <CopyField 
                            label="AWB / Tracking" 
                            value={so.awb || 'N/A'} 
                            icon={<GlobeIcon className="h-3 w-3"/>} 
                        />
                        <CopyField 
                            label="Carrier" 
                            value={so.carrier || 'N/A'} 
                            icon={<TruckIcon className="h-3 w-3"/>} 
                        />
                        <CopyField 
                            label="Status" 
                            value={so.status} 
                            icon={<InfoIcon className="h-3 w-3"/>} 
                        />
                        {so.consignmentValue && (
                            <div className="col-span-2">
                                <CopyField 
                                    label="Consignment Value" 
                                    value={so.consignmentValue} 
                                    copyValue={so.consignmentValue.replace(/[₹,]/g, '')}
                                    icon={<CurrencyIcon className="h-3 w-3"/>} 
                                />
                            </div>
                        )}
                    </div>

                    {!uploadComplete ? (
                        <div className="space-y-4">
                            <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100 flex gap-3">
                                <InfoIcon className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                                <p className="text-xs text-blue-800 leading-relaxed">Please upload the <b>Consignment PDF</b> file generated from the Flipkart portal. Our AI will extract the Consignment ID and Delivery Schedule automatically.</p>
                            </div>
                            
                            <input 
                                type="file" 
                                ref={fileInputRef} 
                                className="hidden" 
                                accept=".pdf" 
                                onChange={handleFileUpload} 
                            />
                            
                            <button 
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isUploading}
                                className="w-full py-6 bg-white border-4 border-dashed border-gray-200 text-gray-400 font-bold rounded-3xl hover:bg-blue-50 hover:border-blue-400 hover:text-blue-600 transition-all flex flex-col items-center gap-3 group disabled:opacity-50"
                            >
                                {isUploading ? (
                                    <RefreshIcon className="h-10 w-10 animate-spin text-blue-500" />
                                ) : (
                                    <UploadIcon className="h-10 w-10 text-gray-300 group-hover:text-blue-400 group-hover:scale-110 transition-transform" />
                                )}
                                <div className="text-center">
                                    <span className="text-sm block">{isUploading ? 'Extracting Data...' : 'Select Consignment PDF'}</span>
                                    {!isUploading && <span className="text-[10px] uppercase tracking-widest opacity-50">Click or Drag File Here</span>}
                                </div>
                            </button>
                        </div>
                    ) : (
                        <div className="text-center py-6 animate-in fade-in slide-in-from-bottom-2">
                            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <CheckCircleIcon className="h-12 w-12 text-green-600" />
                            </div>
                            <h4 className="text-lg font-bold text-gray-800">Linked Successfully</h4>
                            <p className="text-sm text-gray-500 mt-2">The PO database has been updated with real consignment details. You can now print box labels.</p>
                            <button 
                                onClick={onClose}
                                className="mt-8 w-full py-4 bg-gray-900 text-white font-bold rounded-2xl shadow-xl hover:bg-black transition-all active:scale-95"
                            >
                                Close & Refresh
                            </button>
                        </div>
                    )}

                    {!uploadComplete && (
                        <button 
                            onClick={onClose}
                            className="w-full py-3 mt-4 text-sm font-bold text-gray-400 hover:text-gray-600 transition-colors"
                        >
                            Cancel
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

// --- Amazon FBA Shipment ID Dialog ---

const FbaShipmentModal: FC<{ so: GroupedSalesOrder, onSave: (id: string) => void, onClose: () => void, isSaving: boolean }> = ({ so, onSave, onClose, isSaving }) => {
    const [fbaId, setFbaId] = useState(so.fbaShipmentId || '');
    
    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[150] p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-amber-100 animate-in fade-in zoom-in-95 duration-200">
                <div className="p-6 bg-[#232F3E] border-b border-gray-700 flex flex-col items-center text-center">
                    <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mb-4">
                        <GlobeIcon className="h-10 w-10 text-white" />
                    </div>
                    <h3 className="text-xl font-black text-white uppercase tracking-tight">Amazon FBA Requirement</h3>
                    <p className="text-xs text-gray-400 mt-1">Order Ref: <span className="font-bold text-partners-green">{so.id}</span></p>
                </div>
                <div className="p-8">
                    <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100 mb-6 flex gap-3">
                         <AlertIcon className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                         <p className="text-xs text-amber-800 leading-relaxed">FBA Shipment ID is required for Amazon fulfillment. This ID will be recorded in the PO Database before invoice generation.</p>
                    </div>
                    
                    <div className="space-y-4">
                        <div>
                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">FBA Shipment ID</label>
                            <input 
                                type="text"
                                autoFocus
                                value={fbaId}
                                onChange={(e) => setFbaId(e.target.value)}
                                placeholder="e.g. FBA15G89Z7J"
                                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#FF9900] focus:border-[#FF9900] transition-all outline-none font-mono font-bold"
                            />
                        </div>
                    </div>

                    <div className="flex flex-col gap-3 mt-8">
                        <button 
                            disabled={!fbaId.trim() || isSaving}
                            onClick={() => onSave(fbaId.trim())}
                            className="w-full py-4 bg-[#FF9900] text-gray-900 font-black rounded-2xl shadow-xl shadow-amber-100 hover:bg-[#FF8C00] transition-all active:scale-[0.98] text-sm uppercase flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {isSaving ? <RefreshIcon className="h-5 w-5 animate-spin"/> : <CheckCircleIcon className="h-5 w-5" />}
                            {isSaving ? 'Saving & Generating...' : 'Confirm & Create Invoice'}
                        </button>
                        <button 
                            disabled={isSaving}
                            onClick={onClose}
                            className="w-full py-3 text-sm font-bold text-gray-400 hover:text-gray-600 transition-colors"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- Combined Instamart Label Printing ---

const InstamartPrintManager: FC<{ so: GroupedSalesOrder, onClose: () => void, addNotification: any }> = ({ so, onClose, addNotification }) => {
    const [packingData, setPackingData] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            const data = await fetchPackingData(so.id);
            setPackingData(data);
            setIsLoading(false);
        };
        load();
    }, [so.id]);

    const groupedBoxes: Record<string, any[]> = useMemo(() => {
        const boxes: Record<string, any[]> = {};
        
        packingData.forEach(row => {
            const boxId = String(row['Box ID'] || 'UNKNOWN').trim();
            if (!boxes[boxId]) boxes[boxId] = [];
            
            const masterSku = String(row['SKU']).trim();
            const poItem = so.items.find(i => String(i.masterSku).trim() === masterSku || String(i.articleCode).trim() === masterSku);
            const itemCode = poItem?.articleCode || masterSku;
            const quantity = Number(row['Item Quantity'] || 0);

            const existingItem = (boxes[boxId] as any[]).find(item => item.itemCode === itemCode);
            
            if (existingItem) {
                existingItem.quantity += quantity;
            } else {
                boxes[boxId].push({
                    productName: row['Product Name'] || 'N/A',
                    ean: row['EAN'] || 'N/A',
                    itemCode: itemCode,
                    quantity: quantity
                });
            }
        });
        return boxes;
    }, [packingData, so.items]);

    const handlePrintPack = () => {
        const boxEntries = Object.entries(groupedBoxes) as [string, any[]][];
        const totalBoxes = boxEntries.length;
        if (totalBoxes === 0) {
            addNotification("No packing data found for this order ID.", "warning");
            return;
        }
        
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            addNotification("Popup blocked! Please allow popups to print labels.", "error");
            return;
        }

        const packingDate = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

        let html = `
            <html>
                <head>
                    <title>Instamart Labels - ${so.id}</title>
                    <script src="https://cdn.tailwindcss.com"></script>
                    <style>
                        @media print {
                            @page { size: 4in 6in; margin: 0; }
                            body { margin: 0; -webkit-print-color-adjust: exact; color: black; }
                            .page-break { page-break-after: always; }
                        }
                    </style>
                </head>
                <body>
        `;

        html += `
  <div class="min-h-screen p-6 font-mono page-break">
    <div class=" border-b-2 border-black pb-2 mb-4">
      <p class="text-xl font-black uppercase">MASTER PACKING SLIP</p>
    </div>
    <div class="space-y-4 mb-6">
      <div><p class="text-xs font-bold uppercase">PO Number</p><p class="text-3xl font-black uppercase">${so.poReference}</p></div>
      <div><p class="text-xs font-bold uppercase">Invoice No.</p><p class="text-3xl font-black uppercase">${so.invoiceNumber || 'N/A'}</p></div>
    </div>
    <div class="border-t-2 border-black pt-4 space-y-4">
      <div><p class="text-xs font-bold uppercase">Total Box Count</p><p class="text-3xl font-black">${totalBoxes}</p></div>
      <div><p class="text-xs font-bold uppercase">SKU Count</p><p class="text-3xl font-black">${so.items.length}</p></div>
      <div><p class="text-xs font-bold uppercase">Total Quantity</p><p class="text-3xl font-black">${so.qty}</p></div>
    </div>
  </div>
`;

boxEntries.forEach(([boxId, items], idx) => {
  html += `
  <div class="min-h-screen p-6 font-mono ${idx < totalBoxes - 1 ? 'page-break' : ''}">
    <div class="flex justify-between items-end gap-4 border-b-2 border-black pb-2 mb-4">
      <p class="text-xl font-black uppercase">Instamart Box Label</p>
      <p class="text-xl font-black text-right">BOX ${idx + 1}/${totalBoxes}</p>
    </div>
    <div class="border-b-2 border-black pb-3 mb-4 space-y-3">
      <div><p class="text-xs font-bold uppercase">PO Number</p><p class="text-xl font-black uppercase">${so.poReference}</p></div>
      <div><p class="text-xs font-bold uppercase">Invoice No.</p><p class="text-xl font-black uppercase">${so.invoiceNumber || 'N/A'}</p></div>
    </div>
    <div class="space-y-4 mb-4">
      ${items.map(item => `
        <div class="space-y-2">
          <div><p class="text-xs font-bold uppercase">SKU Name</p><p class="text-xl font-black uppercase">${item.productName}</p></div>
          <div><p class="text-xs font-bold uppercase">SKU Code</p><p class="text-xl font-black uppercase">${item.itemCode}</p></div>
          <div><p class="text-xs font-bold uppercase">EAN Barcode</p><p class="text-xl font-black uppercase">${item.ean}</p></div>
          <div><p class="text-xs font-bold uppercase">Quantity</p><p class="text-xl font-black">${item.quantity}</p></div>
        </div>
      `).join('')}
    </div>
    <div class="grid grid-cols-2 gap-4 border-t-2 border-black pt-4">
      <div><p class="text-xs font-bold uppercase">Box ID</p><p class="text-lg font-bold">${boxId}</p></div>
      <div class="text-right"><p class="text-xs font-bold uppercase">Packing Date</p><p class="text-lg font-bold">${packingDate}</p></div>
    </div>
  </div>
  `;
});

        html += `
                    <script>
                        window.onload = function() { 
                            setTimeout(function() {
                                window.print(); 
                                window.onafterprint = function() { window.close(); };
                            }, 500);
                        };
                    </script>
                </body>
            </html>
        `;

        printWindow.document.write(html);
        printWindow.document.close();
    };

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[120] p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-partners-green text-white rounded-lg"><PrinterIcon className="h-6 w-6"/></div>
                        <div>
                            <h3 className="text-xl font-bold text-gray-800">Instamart Label Pack (Master + Box)</h3>
                            <p className="text-xs text-gray-500">Order: <span className="font-bold text-partners-green">{so.id}</span></p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors"><XCircleIcon className="h-6 w-6 text-gray-400"/></button>
                </div>

                <div className="p-8 overflow-y-auto bg-gray-100 flex-1">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                            <LoadingCube label="Analyzing Packing Structure..." />
                        </div>
                    ) : packingData.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 text-center">
                            <AlertIcon className="h-12 w-12 text-amber-500 mb-4" />
                            <p className="font-bold text-gray-800">No Packing Data Found</p>
                            <p className="text-sm text-gray-500 max-w-sm mt-2">Could not find rows matching SO ID "{so.id}" in the Master_Packing_Data sheet.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                            <div className="bg-partners-light-green p-6 border rounded-2xl shadow-sm relative group overflow-hidden flex flex-col border-partners-green/30 col-span-1 sm:col-span-2">
                                <div className="absolute top-0 right-0 p-2 bg-partners-green/10 text-[10px] font-bold text-partners-green uppercase tracking-widest">Page 1: Master Slip</div>
                                <h4 className="text-sm font-black text-gray-900 mb-2">Master Packing Slip Header</h4>
                                <div className="grid grid-cols-3 gap-4">
                                    <div><p className="text-[10px] font-bold text-gray-400 uppercase">Total Boxes</p><p className="text-lg font-black text-partners-green">{Object.keys(groupedBoxes).length}</p></div>
                                    <div><p className="text-[10px] font-bold text-gray-400 uppercase">PO Ref</p><p className="text-xs font-bold truncate text-gray-800">{so.poReference}</p></div>
                                    <div><p className="text-[10px] font-bold text-gray-400 uppercase">Total Qty</p><p className="text-lg font-black text-gray-800">{so.qty}</p></div>
                                </div>
                            </div>

                            {(Object.entries(groupedBoxes) as [string, any[]][]).map(([boxId, items], i) => (
                                <div key={boxId} className="bg-white p-6 border rounded-2xl shadow-sm relative group overflow-hidden flex flex-col border-l-4 border-l-partners-green">
                                    <div className="absolute top-0 right-0 p-2 bg-gray-50 text-[10px] font-bold text-gray-400 uppercase tracking-widest">BOX {i+1} OF {Object.keys(groupedBoxes).length}</div>
                                    <div className="mb-4">
                                        <p className="text-[10px] font-bold text-gray-400 uppercase">Unique Box ID</p>
                                        <p className="text-xl font-black text-gray-900 leading-none">{boxId}</p>
                                    </div>
                                    <div className="space-y-3 flex-1">
                                        <div className="flex justify-between items-center border-b pb-1">
                                            <p className="text-[10px] font-bold text-gray-400 uppercase">Box Contents</p>
                                            <span className="text-[10px] font-bold text-gray-400">{(items as any[]).length} SKUs</span>
                                        </div>
                                        {(items as any[]).map((item, j) => (
                                            <div key={j} className="flex justify-between items-start gap-2 border-b border-gray-50 pb-2 last:border-0">
                                                <div className="flex-1">
                                                    <p className="text-xs font-bold text-gray-900 line-clamp-1">{item.productName}</p>
                                                    <p className="text-[10px] text-black font-black uppercase mt-1">Item Code: {item.itemCode}</p>
                                                    <p className="text-[9px] text-gray-500 font-bold uppercase tracking-tight">EAN: {item.ean}</p>
                                                </div>
                                                <div className="flex flex-col items-end">
                                                    <span className="bg-partners-light-green text-partners-green px-2 py-0.5 rounded font-bold text-xs border border-partners-green/20">x{item.quantity}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="p-6 bg-gray-50 border-t flex justify-end gap-3">
                    <button onClick={onClose} className="px-6 py-2.5 text-sm font-bold text-gray-500 bg-white border rounded-xl hover:bg-gray-100">Cancel</button>
                    <button 
                        onClick={handlePrintPack} 
                        disabled={packingData.length === 0}
                        className="px-10 py-2.5 bg-blue-600 text-white font-bold rounded-xl shadow-lg hover:bg-blue-700 transition-all flex items-center gap-2 active:scale-95 disabled:opacity-50"
                    >
                        <PrinterIcon className="h-5 w-5" /> Print All {Object.keys(groupedBoxes).length + 1} Labels (Master + Box)
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- Shipping Confirmation Modal ---

const ShippingConfirmationModal: FC<{ so: GroupedSalesOrder, onConfirm: () => void, onClose: () => void, onPrint: () => void }> = ({ so, onConfirm, onClose, onPrint }) => {
    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[150] p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-amber-100 animate-in fade-in zoom-in-95 duration-200">
                <div className="p-6 bg-amber-50 border-b border-amber-100 flex flex-col items-center text-center">
                    <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mb-4">
                        <AlertIcon className="h-10 w-10 text-amber-600" />
                    </div>
                    <h3 className="text-xl font-bold text-amber-900 uppercase tracking-tight">Final Label Check!</h3>
                    <p className="text-xs text-amber-700 mt-1">Order Ref: <span className="font-bold">{so.id}</span></p>
                </div>
                <div className="p-8">
                    <div className="bg-amber-50/50 p-4 rounded-2xl border border-amber-100 mb-6 flex gap-4">
                         <div className="bg-amber-100 p-2.5 rounded-xl h-fit shadow-sm"><PrinterIcon className="h-6 w-6 text-amber-600"/></div>
                         <div>
                            <p className="text-sm font-bold text-amber-900">Are the labels pasted on boxes?</p>
                            <p className="text-xs text-amber-700 mt-1.5 leading-relaxed">For Instamart fulfillment, labels must be physically pasted on all <span className="font-bold text-amber-900 underline">{so.boxCount} boxes</span> before triggering Nimbus shipment.</p>
                         </div>
                    </div>
                    <div className="flex flex-col gap-3">
                        <button 
                            onClick={onConfirm}
                            className="w-full py-4 bg-blue-600 text-white font-bold rounded-2xl shadow-xl shadow-blue-100 hover:bg-blue-700 transition-all active:scale-[0.98] text-sm"
                        >
                            Yes, Labels Pasted. Ship now.
                        </button>
                        <button 
                            onClick={onPrint}
                            className="w-full py-3 bg-partners-green/10 text-partners-green font-bold rounded-2xl border border-partners-green/20 hover:bg-partners-green/20 transition-all flex items-center justify-center gap-2 text-sm"
                        >
                            <PrinterIcon className="h-4 w-4" /> No, Print Labels First
                        </button>
                        <button 
                            onClick={onClose}
                            className="w-full py-3 text-sm font-bold text-gray-400 hover:text-gray-600 transition-colors"
                        >
                            Back to Table
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- Copy Field Helper ---

const CopyField = ({ label, value, icon, copyValue }: { label: string, value: string, icon: React.ReactNode, copyValue?: string }) => {
    const [copied, setCopied] = useState(false);
    const handleCopy = (e: React.MouseEvent) => {
        const textToCopy = copyValue || value;
        if (!textToCopy || textToCopy === 'N/A') return;
        navigator.clipboard.writeText(textToCopy);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    return (
        <div onClick={handleCopy} className="flex flex-col gap-1.5 p-3 bg-white border border-gray-200 rounded-xl hover:border-partners-green transition-colors group cursor-pointer active:bg-gray-50 select-none">
            <div className="flex justify-between items-center pointer-events-none">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1">{icon} {label}</span>
                <div className={`text-[10px] font-bold px-2 py-0.5 rounded transition-all ${copied ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500 group-hover:bg-partners-green group-hover:text-white'}`}>{copied ? 'COPIED!' : 'COPY'}</div>
            </div>
            <p className="text-sm font-bold text-gray-800 break-all pointer-events-none">{value || 'N/A'}</p>
        </div>
    );
};

const PortalHelperModal: FC<{ so: GroupedSalesOrder, onClose: () => void, addNotification: any }> = ({ so, onClose, addNotification }) => {
    const [showHelp, setShowHelp] = useState(false);
    const isZepto = so.channel.toLowerCase().includes('zepto');
    const isBlinkit = so.channel.toLowerCase().includes('blinkit');
    const isFlipkart = so.channel.toLowerCase().includes('flipkart');
    const portalName = isZepto ? 'Zepto Brands' : isBlinkit ? 'Blinkit Partners' : 'Flipkart Seller';
    const portalUrl = isZepto ? 'https://brands.zepto.co.in/' : isBlinkit ? 'https://partnersbiz.com' : 'https://seller.flipkart.com/';
    const brandColor = isZepto ? 'bg-purple-600' : isBlinkit ? 'bg-yellow-400' : 'bg-blue-600';
    const logoText = isZepto ? 'z' : isBlinkit ? 'b' : 'f';
    const shadowColor = isZepto ? 'shadow-purple-100' : isBlinkit ? 'shadow-yellow-100' : 'shadow-blue-100';

    const handleOpenPortal = () => {
        const win = window.open(portalUrl, '_blank');
        if (!win) {
            addNotification("Popup blocked! Please allow popups to open the portal.", "error");
        }
    };

    const amountWithTax = (so.amount * 1.05).toFixed(0);
    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
            <div className="bg-partners-gray-bg rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden border border-white flex flex-col max-h-[90vh]">
                <div className="p-6 bg-white border-b border-gray-100 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 ${brandColor} rounded-xl flex items-center justify-center text-white shadow-lg ${shadowColor}`}>
                            <span className="font-black italic text-xl">{logoText}</span>
                        </div>
                        <div><h3 className="text-lg font-bold text-gray-800">{portalName} Helper</h3><p className="text-xs text-gray-500">Portal: <span className="font-bold text-partners-green">{portalUrl.replace('https://', '')}</span></p></div>
                    </div>
                    <div className="flex items-center gap-2">
                        {isBlinkit && (
                            <button 
                                onClick={() => setShowHelp(!showHelp)} 
                                className={`p-2 rounded-full transition-all flex items-center gap-1.5 text-xs font-bold ${showHelp ? 'bg-partners-green text-white shadow-md' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                                title="Blinkit Portal Instructions"
                            >
                                <QuestionMarkCircleIcon className="h-5 w-5" />
                                <span className="hidden sm:inline">{showHelp ? 'Hide Guide' : 'How to Schedule?'}</span>
                            </button>
                        )}
                        <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><XCircleIcon className="h-6 w-6 text-gray-400"/></button>
                    </div>
                </div>

                <div className="p-6 space-y-6 overflow-y-auto">
                    {showHelp && isBlinkit && (
                        <div className="bg-partners-light-green border-2 border-partners-green/20 p-5 rounded-2xl animate-in slide-in-from-top-4 duration-300">
                            <div className="flex items-center gap-2 mb-4 text-partners-green">
                                <ClipboardListIcon className="h-5 w-5" />
                                <h4 className="font-bold uppercase text-xs tracking-wider">Steps to Schedule an Appointment on Partnerbiz</h4>
                            </div>
                            <ul className="text-xs text-gray-700 space-y-3 list-decimal ml-4 font-medium leading-relaxed">
                                <li>Log in to the <span className="font-bold">Partnerbiz Vendor Portal</span>.</li>
                                <li>From the left-hand menu, click on <span className="font-bold">Appointments</span>.</li>
                                <li>Select <span className="font-bold text-partners-green">Open Appointments</span>.</li>
                                <li>On the right-most side, click on <span className="font-bold">Action</span>.</li>
                                <li>Click on <span className="font-bold">Schedule</span>.</li>
                                <li>Enter the <span className="font-bold">AWB number</span> and the total PO quantity being supplied.</li>
                                <li>Select an appointment date <span className="font-bold text-partners-green">7-10 days</span> from the shipping date.
                                    <div className="mt-1 flex flex-col gap-1 pl-2 border-l-2 border-partners-green/10 ml-1">
                                        <span className="text-partners-green font-bold">• Prefer early morning slots (8-11am).</span>
                                        <span className="text-red-600 font-bold">• Do not select slots after 3pm.</span>
                                    </div>
                                </li>
                                <li>After scheduling, click on <span className="font-bold">Download QR</span> on the right-hand side. This QR code is the appointment pass for the PO.</li>
                            </ul>
                        </div>
                    )}

                    {!showHelp && (
                         <div className="bg-partners-light-green border-2 border-dashed border-partners-green/30 p-4 rounded-2xl flex gap-4 items-center shadow-sm">
                            <div className="bg-partners-green p-2 rounded-lg text-white shadow-sm shadow-green-100"><CalendarIcon className="h-5 w-5" /></div>
                            <div className="flex-1">
                                <p className="text-sm font-bold text-partners-green">Ready for Scheduling</p>
                                <p className="text-[11px] text-gray-500 font-medium">Click the button below to open the vendor portal and use the fields to copy-paste data.</p>
                            </div>
                            {isBlinkit && (
                                <button onClick={() => setShowHelp(true)} className="text-[10px] font-black uppercase text-partners-green underline hover:text-green-700 transition-colors">View Steps</button>
                            )}
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <CopyField label="PO Number" value={so.poReference} icon={<ClipboardListIcon className="h-3 w-3"/>} />
                        <CopyField label="Fulfilled Quantity" value={String(so.qty)} icon={<CubeIcon className="h-3 w-3"/>} />
                        <CopyField label="Courier Name" value={so.carrier || 'Standard'} icon={<TruckIcon className="h-3 w-3"/>} />
                        <CopyField label="AWB Number" value={so.awb || 'N/A'} icon={<GlobeIcon className="h-3 w-3"/>} />
                        <CopyField label="Invoice Number" value={so.invoiceNumber || 'N/A'} icon={<InvoiceIcon className="h-3 w-3"/>} />
                        <CopyField 
                            label="Total Amount (Inc. Tax)" 
                            value={`₹${amountWithTax}`} 
                            copyValue={amountWithTax}
                            icon={<CurrencyIcon className="h-3 w-3"/>} 
                        />
                        <div className="md:col-span-2"><CopyField label="Invoice PDF URL" value={so.invoicePdfUrl || 'N/A'} icon={<ExternalLinkIcon className="h-3 w-3"/>} /></div>
                    </div>
                    <div className="flex flex-col items-center pt-2">
                        <button onClick={handleOpenPortal} className={`w-full py-4 ${brandColor} text-white font-bold rounded-2xl shadow-xl ${shadowColor} hover:brightness-95 transition-all flex items-center justify-center gap-3 active:scale-95`}><ExternalLinkIcon className="h-5 w-5" /> Open {portalName} Portal</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const InstamartAppointmentModal: FC<{ 
    so: GroupedSalesOrder, 
    onClose: () => void, 
    addNotification: any, 
    onComplete: () => void 
}> = ({ so, onClose, addNotification, onComplete }) => {
    const [appointmentId, setAppointmentId] = useState(so.appointmentId || '');
    const [appointmentDate, setAppointmentDate] = useState(formatDateForInput(so.appointmentDate));
    const [appointmentTime, setAppointmentTime] = useState(formatTimeForInput(so.appointmentTime));
    const [isSubmitting, setIsSubmitting] = useState(false);

    const isZepto = so.channel.toLowerCase().includes('zepto');
    const isInstamart = so.channel.toLowerCase().includes('instamart');
    const isBB = so.channel.toLowerCase().includes('bb');
    const isRBL = so.channel.toLowerCase().includes('rbl');
    const hideIdField = isZepto || isInstamart || isBB || isRBL;

    const brandColor = isZepto ? 'bg-purple-600' : 'bg-orange-600';
    const brandText = isZepto ? 'text-purple-600' : 'text-orange-600';
    const brandBg = isZepto ? 'bg-purple-50' : 'bg-orange-50';
    const brandBorder = isZepto ? 'border-purple-100' : 'border-orange-100';
    const brandHover = isZepto ? 'hover:bg-purple-100' : 'hover:bg-orange-100';
    const brandShadow = isZepto ? 'shadow-purple-100' : 'shadow-orange-100';
    const brandRing = isZepto ? 'focus:ring-purple-500' : 'focus:ring-orange-500';

    const handleComplete = async () => {
        const hasId = !hideIdField && appointmentId.trim();
        const hasDate = appointmentDate.trim();
        const hasTime = appointmentTime.trim();

        if (!hasId && !hasDate && !hasTime) {
            const msg = hideIdField 
                ? "Please enter at least an Appointment Date or Time" 
                : "Please enter at least an Appointment ID, Date or Time";
            addNotification(msg, "error");
            return;
        }

        setIsSubmitting(true);
        try {
            const response = await updateInstamartAppointmentDetails({
                eeReferenceCode: so.id,
                appointmentId: appointmentId.trim(),
                appointmentDate: appointmentDate.trim(),
                appointmentTime: appointmentTime.trim()
            });

            if (response.status === 'success') {
                addNotification("Appointment Details Updated!", "success");
                onComplete();
                onClose();
            } else {
                addNotification(response.message || "Failed to update appointment details", "error");
            }
        } catch (error) {
            addNotification("Error updating appointment details", "error");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[150] p-4">
            <div className={`bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border ${brandBorder} flex flex-col animate-in fade-in zoom-in-95 duration-200`}>
                <div className={`p-6 ${brandBg} border-b ${brandBorder} flex justify-between items-center`}>
                    <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 ${brandColor} rounded-xl flex items-center justify-center text-white shadow-lg ${brandShadow}`}>
                            <CalendarIcon className="h-6 w-6" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-gray-800">{isZepto ? 'Zepto' : 'Instamart'} Appointment</h3>
                            <p className={`text-xs ${brandText} font-medium`}>Update confirmation details</p>
                        </div>
                    </div>
                    <button onClick={onClose} className={`p-2 ${brandHover} rounded-full transition-colors`}><XCircleIcon className="h-6 w-6 text-gray-400"/></button>
                </div>

                <div className="p-8 space-y-6">
                    <div className="space-y-4">
                        {!hideIdField && (
                            <div>
                                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Appointment / Consignment ID</label>
                                <input 
                                    type="text" 
                                    value={appointmentId}
                                    onChange={(e) => setAppointmentId(e.target.value)}
                                    placeholder="Enter ID from confirmation"
                                    className={`w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:ring-2 ${brandRing} focus:border-transparent transition-all`}
                                />
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Appointment Date</label>
                                <input 
                                    type="date" 
                                    value={appointmentDate}
                                    onChange={(e) => setAppointmentDate(e.target.value)}
                                    className={`w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:ring-2 ${brandRing} focus:border-transparent transition-all`}
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Appointment Time</label>
                                <input 
                                    type="time" 
                                    value={appointmentTime}
                                    onChange={(e) => setAppointmentTime(e.target.value)}
                                    className={`w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:ring-2 ${brandRing} focus:border-transparent transition-all`}
                                />
                            </div>
                        </div>
                    </div>

                    <div className={`${brandBg} border ${brandBorder} p-4 rounded-2xl flex gap-3`}>
                        <div className={`${isZepto ? 'bg-purple-200' : 'bg-orange-200'} p-1.5 rounded-lg h-fit`}><QuestionMarkCircleIcon className={`h-4 w-4 ${isZepto ? 'text-purple-700' : 'text-orange-700'}`} /></div>
                        <p className={`text-[11px] ${isZepto ? 'text-purple-800' : 'text-orange-800'} font-medium leading-relaxed`}>
                            Once updated, the order will be ready for <span className="font-bold">Nimbus Post</span> shipping or final processing.
                        </p>
                    </div>
                </div>

                <div className="p-6 bg-gray-50 border-t border-gray-100 flex gap-3">
                    <button onClick={onClose} className="flex-1 px-4 py-3 text-sm font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition-colors">Cancel</button>
                    <button 
                        onClick={handleComplete}
                        disabled={isSubmitting}
                        className={`flex-[2] px-4 py-3 ${brandColor} text-white text-sm font-bold rounded-xl shadow-lg ${brandShadow} hover:brightness-110 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2`}
                    >
                        {isSubmitting ? <RefreshIcon className="h-4 w-4 animate-spin" /> : <CheckCircleIcon className="h-4 w-4" />}
                        {isSubmitting ? 'Updating...' : 'Confirm Appointment'}
                    </button>
                </div>
            </div>
        </div>
    );
};

const ZeptoASNHelperModal: FC<{ 
    so: GroupedSalesOrder, 
    onClose: () => void, 
    addNotification: any, 
    onComplete: () => void,
    inventoryItems: InventoryItem[]
}> = ({ so, onClose, addNotification, onComplete, inventoryItems }) => {
    const [step, setStep] = useState(1);
    const [asnNumber, setAsnNumber] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleDownloadASN = () => {
        // Generate a simple CSV for Zepto ASN with specific headers
        const headers = ["SKU Name", "SKU Code", "SKU Image Url", "Po Quantity", "Asn Quantity", "Po MRP", "EAN Number"];
        const rows = so.items.map(item => {
            // Find mapping to get EAN and other details if missing
            const mapping = inventoryItems?.find(inv => 
                (inv.sku === item.masterSku || inv.articleCode === item.articleCode)
            );

            return [
                item.itemName || mapping?.itemName || '',
                item.articleCode || '',
                '', // SKU Image Url - not available in current data
                item.qty || 0, // Po Quantity
                item.itemQuantity || 0, // Asn Quantity
                item.mrp || mapping?.mrp || 0, // Po MRP
                mapping?.ean || '' // EAN Number
            ];
        });

        const csvContent = [headers, ...rows].map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(",")).join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `Zepto_ASN_${so.poReference}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        addNotification("ASN File Downloaded Successfully", "success");
    };

    const handleComplete = async () => {
        if (!asnNumber.trim()) {
            addNotification("Please enter a valid ASN number", "error");
            return;
        }

        setIsSubmitting(true);
        try {
            const response = await updateZeptoASN(so.id, asnNumber.trim());

            if (response.status === 'success') {
                addNotification("ASN Updated! Order moved to Ready to Ship.", "success");
                onComplete();
                onClose();
            } else {
                addNotification(response.message || "Failed to update ASN", "error");
            }
        } catch (error) {
            addNotification("Error updating ASN", "error");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[150] p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-purple-100 flex flex-col animate-in fade-in zoom-in-95 duration-200">
                <div className="p-6 bg-purple-50 border-b border-purple-100 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-purple-600 rounded-xl flex items-center justify-center text-white shadow-lg">
                            <span className="font-black italic text-xl">z</span>
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-gray-800">Zepto ASN Helper</h3>
                            <p className="text-[10px] font-bold text-purple-600 uppercase tracking-widest">Step {step} of 2</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-purple-100 rounded-full transition-colors">
                        <XCircleIcon className="h-6 w-6 text-gray-400"/>
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    {step === 1 ? (
                        <>
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <CopyField 
                                            label="PO Number" 
                                            value={so.poReference} 
                                            icon={<ClipboardListIcon className="h-3 w-3"/>} 
                                        />
                                        <div className="px-1">
                                            <a 
                                                href={`https://brands.zepto.co.in/vendor/po/lifecycle/${so.poReference}?tab=ASN`} 
                                                target="_blank" 
                                                rel="noreferrer" 
                                                className="text-[10px] font-black uppercase text-purple-600 hover:underline flex items-center gap-1"
                                            >
                                                <ExternalLinkIcon className="h-3 w-3" /> Open in Zepto Portal
                                            </a>
                                        </div>
                                    </div>
                                    <CopyField 
                                        label="Invoice No." 
                                        value={so.invoiceNumber || 'N/A'} 
                                        icon={<InvoiceIcon className="h-3 w-3"/>} 
                                    />
                                    <CopyField 
                                        label="Invoice Value" 
                                        value={`₹${so.invoiceTotal || '0'}`} 
                                        copyValue={String(so.invoiceTotal || '0')}
                                        icon={<CurrencyIcon className="h-3 w-3"/>} 
                                    />
                                    <CopyField 
                                        label="Delivery Date" 
                                        value={(() => {
                                            if (!so.appointmentDate || so.appointmentDate === 'TBD') return 'TBD';
                                            const d = new Date(so.appointmentDate);
                                            if (isNaN(d.getTime())) return so.appointmentDate;
                                            return `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}/${d.getFullYear()}`;
                                        })()} 
                                        icon={<CalendarIcon className="h-3 w-3"/>} 
                                    />
                                </div>
                                <div className="space-y-2">
                                    <CopyField 
                                        label="Invoice PDF URL" 
                                        value={so.invoicePdfUrl || 'N/A'} 
                                        icon={<ExternalLinkIcon className="h-3 w-3"/>} 
                                    />
                                    {so.invoicePdfUrl && (
                                        <div className="px-1">
                                            <a href={so.invoicePdfUrl} target="_blank" rel="noreferrer" className="text-[10px] font-black uppercase text-blue-600 hover:underline flex items-center gap-1">
                                                <ExternalLinkIcon className="h-3 w-3" /> Open File in New Tab
                                            </a>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="flex flex-col gap-3">
                                <button 
                                    onClick={handleDownloadASN}
                                    className="w-full py-3.5 bg-gray-100 text-gray-700 font-bold rounded-2xl hover:bg-gray-200 transition-all flex items-center justify-center gap-2 text-sm"
                                >
                                    <DownloadIcon className="h-4 w-4" /> Download ASN File
                                </button>
                                <button 
                                    onClick={() => setStep(2)}
                                    className="w-full py-3.5 bg-purple-600 text-white font-bold rounded-2xl shadow-xl shadow-purple-100 hover:bg-purple-700 transition-all active:scale-95 text-sm"
                                >
                                    Next Step: Enter ASN Number
                                </button>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="space-y-4">
                                <div className="p-4 bg-purple-50 rounded-2xl border border-purple-100">
                                    <p className="text-xs font-bold text-purple-800 mb-2">Enter ASN Number from Zepto Portal</p>
                                    <input 
                                        type="text" 
                                        value={asnNumber}
                                        onChange={(e) => setAsnNumber(e.target.value)}
                                        placeholder="e.g. ASN12345678"
                                        className="w-full px-4 py-3 rounded-xl border border-purple-200 focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono text-sm"
                                        autoFocus
                                    />
                                    <p className="text-[10px] text-purple-600 mt-2 italic">Once entered, the status will move to 'Ready to Ship'.</p>
                                </div>
                            </div>

                            <div className="flex flex-col gap-3">
                                <button 
                                    onClick={handleComplete}
                                    disabled={isSubmitting || !asnNumber.trim()}
                                    className="w-full py-3.5 bg-green-600 text-white font-bold rounded-2xl shadow-xl shadow-green-100 hover:bg-green-700 transition-all active:scale-95 text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {isSubmitting ? <RefreshIcon className="h-4 w-4 animate-spin" /> : <CheckCircleIcon className="h-4 w-4" />}
                                    Complete Process
                                </button>
                                <button 
                                    onClick={() => setStep(1)}
                                    className="w-full py-3 text-sm font-bold text-gray-400 hover:text-gray-600 transition-colors"
                                >
                                    Go Back
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

const AmazonBoxDetailsModal: FC<{ 
    so: GroupedSalesOrder, 
    onClose: () => void, 
    addNotification: any,
    data?: any[]
}> = ({ so, onClose, addNotification, data = [] }) => {
    const [boxDetails, setBoxDetails] = useState<any[]>(data);
    const [isLoading, setIsLoading] = useState(data.length === 0);

    useEffect(() => {
        if (data && data.length > 0) {
            setBoxDetails(data);
            setIsLoading(false);
            return;
        }
        const load = async () => {
            try {
                const res = await fetchBoxDetails(so.id);
                console.log("Amazon Box Details Response:", res);
                if (res.status === 'success' && res.data) {
                    setBoxDetails(res.data);
                } else {
                    addNotification(res.message || "Failed to fetch box details", "error");
                }
            } catch (err) {
                console.error("Error fetching box details:", err);
                addNotification("Error fetching box details", "error");
            } finally {
                setIsLoading(false);
            }
        };
        load();
    }, [so.id, addNotification, data]);

    const groupedBoxes = useMemo(() => {
        const groups: Record<string, { weight: string, dimensions: string, count: number, items: string }> = {};
        boxDetails.forEach(box => {
            const weight = box["Weight"] || box.weight || "N/A";
            const dims = box["Dimensions"] || box.dimensions || "N/A";
            const key = `${weight}-${dims}`;
            if (!groups[key]) {
                groups[key] = { weight, dimensions: dims, count: 1, items: box["Items"] || box.items || "N/A" };
            } else {
                groups[key].count++;
            }
        });
        // Sort by count descending
        return Object.values(groups).sort((a, b) => b.count - a.count);
    }, [boxDetails]);

    const formatDimensions = (dimStr: string) => {
        if (!dimStr || dimStr === 'N/A') return 'N/A';
        const parts = dimStr.split(/\s+/);
        const numbers = parts[0].split('x');
        if (numbers.length === 3) {
            return (
                <div className="flex gap-2 font-mono font-bold text-gray-800">
                    <span>{numbers[0]}</span><span className="text-gray-300">×</span>
                    <span>{numbers[1]}</span><span className="text-gray-300">×</span>
                    <span>{numbers[2]}</span>
                </div>
            );
        }
        return dimStr;
    };

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[150] p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden border border-orange-100 animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                <div className="p-6 bg-[#232F3E] border-b border-gray-700 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-[#FF9900] rounded-xl flex items-center justify-center text-gray-900 shadow-lg">
                            <CubeIcon className="h-6 w-6" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-white">Amazon Box Summary</h3>
                            <p className="text-xs text-gray-400">Order Ref: <span className="font-bold text-[#FF9900]">{so.id}</span></p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                        <XCircleIcon className="h-6 w-6 text-gray-400"/>
                    </button>
                </div>
                
                <div className="p-6 overflow-y-auto flex-1 bg-gray-50">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center h-64">
                            <RefreshIcon className="h-10 w-10 animate-spin text-[#FF9900] mb-4" />
                            <p className="text-sm font-bold text-gray-500">Fetching Box Structure...</p>
                        </div>
                    ) : boxDetails.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 text-center">
                            <AlertIcon className="h-12 w-12 text-amber-500 mb-4" />
                            <p className="font-bold text-gray-800">No Box Details Found</p>
                            <p className="text-sm text-gray-500 mt-2">Could not retrieve box summary for this shipment.</p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {/* Total Boxes Summary Card */}
                            <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm flex items-center justify-between">
                                <div className="flex gap-12">
                                    <div>
                                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Total Shipment Boxes</p>
                                        <p className="text-4xl font-black text-gray-900">{boxDetails.length}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Order Ref</p>
                                        <p className="text-4xl font-black text-[#FF9900]">{so.id}</p>
                                    </div>
                                </div>
                                <div className="p-4 bg-orange-50 rounded-2xl">
                                    <CubeIcon className="h-8 w-8 text-[#FF9900]" />
                                </div>
                            </div>

                            
                            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-gray-50 text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b">
                                        <tr>
                                            
                                            <th className="px-6 py-4">Box Qty</th>
                                            <th className="px-6 py-4">Weight (kg)</th>
                                            <th className="px-6 py-4">Dimensions  (L×B×H) in cms</th>

                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {groupedBoxes.map((group, idx) => (
                                            <tr key={idx} className="hover:bg-gray-50 transition-colors">
 
                                                <td className="text-xl px-6 py-4 font-bold text-gray-700 whitespace-nowrap">
                                                {group.count}
                                                </td>
                                                 <td className="text-xl px-6 py-4 font-bold text-gray-700 whitespace-nowrap">
                                                    {group.weight}
                                                </td>
                                                <td className="text-xl px-6 py-4 font-bold text-gray-700 whitespace-nowrap">
                                                    {formatDimensions(group.dimensions)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-6 bg-gray-50 border-t flex justify-end">
                    <button 
                        onClick={onClose}
                        className="px-8 py-3 bg-gray-900 text-white font-bold rounded-2xl shadow-xl hover:bg-black transition-all active:scale-95 text-sm"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

const parseDateString = (dateStr: string | undefined): number => {
    try {
        if (!dateStr || dateStr.trim() === "") return 0;
        const parts = dateStr.match(/(\d+)\s+(\w+)\s+(\d+)/);
        if (parts && parts.length === 4) {
            const day = parts[1];
            const month = parts[2];
            let year = parts[3];
            if (year.length === 2) year = '20' + year;
            return new Date(`${day} ${month} ${year}`).getTime();
        }
        return new Date(dateStr).getTime() || 0;
    } catch (e) { return 0; }
};

const SalesOrderTable: FC<SalesOrderTableProps> = ({ 
    activeFilter, 
    setActiveFilter, 
    purchaseOrders, 
    setPurchaseOrders, 
    addLog, 
    addNotification, 
    onSync, 
    isSyncing, 
    inventoryItems,
    googleTokens,
    setGoogleTokens
}) => {
    const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
    const [isCreatingInvoice, setIsCreatingInvoice] = useState<string | null>(null);
    const [isPushingNimbus, setIsPushingNimbus] = useState<string | null>(null);
    const [isRefreshingSo, setIsRefreshingSo] = useState<string | null>(null);
    const [isSendingZeptoAppointment, setIsSendingZeptoAppointment] = useState(false);
    const [isSendingInstamartAppointment, setIsSendingInstamartAppointment] = useState(false);
    const [isProcessingBlinkit, setIsProcessingBlinkit] = useState(false);
    const [isSyncingEE, setIsSyncingEE] = useState(false);
    const [portalHelper, setPortalHelper] = useState<{ isOpen: boolean, so: GroupedSalesOrder | null }>({ isOpen: false, so: null });
    const [instamartPrintPackModal, setInstamartPrintPackModal] = useState<{ isOpen: boolean, so: GroupedSalesOrder | null }>({ isOpen: false, so: null });
    const [shippingConfirm, setShippingConfirm] = useState<{ isOpen: boolean, so: GroupedSalesOrder | null }>({ isOpen: false, so: null });
    const [zeptoASNHelper, setZeptoASNHelper] = useState<{ isOpen: boolean, so: GroupedSalesOrder | null }>({ isOpen: false, so: null });
    const [instamartApptModal, setInstamartApptModal] = useState<{ isOpen: boolean, so: GroupedSalesOrder | null }>({ isOpen: false, so: null });
    const [fbaShipmentModal, setFbaShipmentModal] = useState<{ isOpen: boolean, so: GroupedSalesOrder | null }>({ isOpen: false, so: null });
    const [flipkartConsignmentModal, setFlipkartConsignmentModal] = useState<{ isOpen: boolean, so: GroupedSalesOrder | null }>({ isOpen: false, so: null });
    const [amazonBoxModal, setAmazonBoxModal] = useState<{ isOpen: boolean, so: GroupedSalesOrder | null, data?: any[] }>({ isOpen: false, so: null });
    const [isFetchingBoxDetails, setIsFetchingBoxDetails] = useState<string | null>(null);
    const [activeAppointmentPass, setActiveAppointmentPass] = useState<GroupedSalesOrder | null>(null);
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [isUpdatingRTO, setIsUpdatingRTO] = useState<string | null>(null);
    const [isUpdatingSheet, setIsUpdatingSheet] = useState(false);
    
    // Close menu on click outside
    useEffect(() => {
        const handleClickOutside = () => setOpenMenuId(null);
        window.addEventListener('click', handleClickOutside);
        return () => window.removeEventListener('click', handleClickOutside);
    }, []);

    const handleMarkAsRTOInitiated = async (so: GroupedSalesOrder) => {
        if (!window.confirm(`Are you sure you want to mark ${so.id} as RTO Initiated?`)) return;
        
        setIsUpdatingRTO(so.id);
        try {
            const timestamp = new Date().toLocaleString('en-IN', { 
                day: '2-digit', 
                month: '2-digit', 
                year: 'numeric', 
                hour: '2-digit', 
                minute: '2-digit', 
                second: '2-digit',
                hour12: false 
            }).replace(/\//g, '-');
            
            const res = await updateRTOStatus(so.id, timestamp);
            if (res.status === 'success') {
                addNotification(`Order ${so.id} marked as RTO Initiated`, 'success');
                onSync(); // Refresh data
            } else {
                addNotification(res.message || "Failed to update RTO status", "error");
            }
        } catch (err) {
            console.error("Error updating RTO status:", err);
            addNotification("Error updating RTO status", "error");
        } finally {
            setIsUpdatingRTO(null);
            setOpenMenuId(null);
        }
    };
    
    const handleFetchBoxDetails = async (so: GroupedSalesOrder) => {
        setIsFetchingBoxDetails(so.id);
        const payload = { action: 'FETCH_BOX_DETAILS', eeReferenceCode: so.id };
        console.log("FETCH_BOX_DETAILS request:", payload);
        try {
            const res = await fetchBoxDetails(so.id);
            console.log("FETCH_BOX_DETAILS response:", res);
            
            // Requirement 2 & 3: Success/Error Handling
            if (res && res.status === 'error') {
                addNotification(res.message || "Failed to fetch box details", "error");
            } else {
                // Success: either status is success or it's a raw array (handled by postToScript fix)
                const data = (res && res.status === 'success') ? res.data : res;
                setAmazonBoxModal({ isOpen: true, so, data });
            }
        } catch (err) {
            console.error("Error fetching box details:", err);
            addNotification("Error fetching box details", "error");
        } finally {
            setIsFetchingBoxDetails(null);
        }
    };
    
    const [columnFilters, setColumnFilters] = useState<{ [key: string]: string }>({});
    const [activeFilterColumn, setActiveFilterColumn] = useState<string | null>(null);
    const filterMenuRef = useRef<HTMLDivElement>(null);

    // Get current user email for logging (from bypass logic or system)
    const userEmail = "jainendra@cubelelo.com"; 

    const tabs = [
        { id: 'All POs', name: 'All POs' },
        { id: 'Confirmed', name: 'Confirmed' },
        { id: 'Batch Created', name: 'Batch Created' },
        { id: 'Invoiced', name: 'Invoiced' },
        { id: 'Awaiting Appointment Confirmation', name: 'Awaiting Appointment' },
        { id: 'Create ASN', name: 'Create ASN' },
        { id: 'Label Generated', name: 'Label Generated' },
        { id: 'Shipped', name: 'Shipped' },
        { id: 'Delivered', name: 'Delivered' },
        { id: 'RTO Initiated', name: 'RTO Initiated' },
        { id: 'Returned', name: 'Returned' },
        { id: 'Closed', name: 'Closed' },
    ];

    const { salesOrders, salesTabCounts, allSalesOrders } = useMemo(() => {
        const groups: Record<string, GroupedSalesOrder> = {};
        const counts: Record<string, number> = { 
            'All POs': 0, 
            'Confirmed': 0, 
            'Batch Created': 0, 
            'Invoiced': 0, 
            'Awaiting Appointment Confirmation': 0,
            'Create ASN': 0,
            'Label Generated': 0, 
            'Shipped': 0, 
            'Delivered': 0, 
            'RTO Initiated': 0,
            'Returned': 0, 
            'Closed': 0 
        };

        purchaseOrders.forEach(po => {
            (po.items || []).forEach(item => {
                const rawRef = item.eeReferenceCode;
                if (!rawRef || String(rawRef).trim() === "") return;
                const refCode = String(rawRef).trim();
                
                const effectiveQty = item.shippedQuantity || 0;
                const effectiveLineAmount = effectiveQty * (item.unitCost || 0);
                
                const eeBoxCount = Number(item.eeBoxCount || 0);
                const carrier = item.carrier || po.carrier;
                const awb = item.awb || po.awb;
                const trackingStatus = item.trackingStatus || po.trackingStatus;
                const trackingUrl = item.trackingUrl || po.trackingUrl;

                const batchDate = item.eeBatchCreatedAt || po.eeBatchCreatedAt;
                const invNum = item.invoiceNumber;
                const hasInvoice = !!invNum && invNum !== 'GENERATING...';
                
                const isAmazon = po.channel.toLowerCase().includes('amazon');
                const isAmazonFbaYeio = (po.channel.toLowerCase().includes('amazon_fba') || po.channel.toLowerCase().includes('amazon fba')) && 
                                        (po.storeCode.toUpperCase() === 'YEIO');
                const statusHasInvoice = hasInvoice || isAmazonFbaYeio;

                const maniDate = item.eeManifestDate || po.eeManifestDate;
                const eeStatus = (item.eeOrderStatus || po.eeOrderStatus || 'Processing').trim();
                const eeStatusLower = eeStatus.toLowerCase();
                
                const effectiveOrderDate = item.eeOrderDate || po.eeOrderDate || 'N/A';
                
                let displayStatus = 'Processing';

                const trackingStatusLower = (trackingStatus || '').toLowerCase();
                const isOutOfDelivery = trackingStatusLower === 'out for delivery';
                const isActuallyDelivered = (trackingStatusLower === 'delivered' || trackingStatusLower === 'successfully delivered' || !!item.deliveredDate || !!po.deliveredDate);
                const isDeliveredStatus = isActuallyDelivered && !isOutOfDelivery;

                const rtoStatus = item.rtoStatus || po.rtoStatus;
                const isRTOInitiated = eeStatusLower === 'shipped' && rtoStatus;

                if (eeStatusLower === 'returned' || eeStatusLower === 'rto') displayStatus = 'Returned';
                else if (isRTOInitiated) displayStatus = 'RTO Initiated';
                else if (rtoStatus) displayStatus = 'Returned';
                else if (eeStatusLower === 'closed') displayStatus = 'Closed';
                else if (isDeliveredStatus) displayStatus = statusHasInvoice ? 'Delivered' : 'Batch Created';
                else if (eeStatusLower === 'shipped' || maniDate || trackingStatusLower === 'in transit' || isOutOfDelivery || (trackingStatusLower === 'booked' && eeStatusLower !== 'confirmed')) {
                    displayStatus = statusHasInvoice ? (isAmazon ? 'Delivered' : 'Shipped') : 'Batch Created';
                }
                else if (awb) displayStatus = statusHasInvoice ? 'Label Generated' : 'Batch Created';
                else if (statusHasInvoice) displayStatus = isAmazonFbaYeio && (eeStatusLower === 'shipped' || maniDate) ? 'Delivered' : 'Invoiced'; 
                else if (batchDate || eeStatusLower === 'picking' || eeStatusLower === 'batched') displayStatus = 'Batch Created';
                else if (eeStatusLower === 'confirmed' || eeStatusLower === 'open') displayStatus = 'Confirmed';

                const isZepto = po.channel.toLowerCase().includes('zepto');
                
                // Use item-level appointment data if available (Sales Order ID reference)
                const apptDate = item.appointmentDate || po.appointmentDate;
                const apptId = item.appointmentId || po.appointmentId;
                const apptReqId = item.appointmentRequestId || po.appointmentRequestId;
                const apptReqDate = item.appointmentRequestDate || po.appointmentRequestDate;
                const apptReqTimestamp = item.appointmentRequestTimestamp || po.appointmentRequestTimestamp;

                if (isZepto && !['Returned', 'Shipped', 'Delivered', 'Closed', 'Label Generated'].includes(displayStatus)) {
                    if (apptId) {
                        // ASN already created, keep normal status (e.g. Invoiced)
                    } else if (apptDate) {
                        displayStatus = 'Create ASN';
                    } else if (apptReqId || apptReqDate) {
                        displayStatus = 'Awaiting Appointment Confirmation';
                    }
                }

                const isInstamart = po.channel.toLowerCase().includes('instamart');
                if (isInstamart && !['Returned', 'Shipped', 'Delivered', 'Closed', 'Label Generated'].includes(displayStatus)) {
                    if (apptId || apptDate) {
                        // Appointment confirmed, keep normal status (e.g. Invoiced)
                    } else if (apptReqId || apptReqDate) {
                        displayStatus = 'Awaiting Appointment Confirmation';
                    }
                }

                if (!groups[refCode]) {
                    groups[refCode] = { 
                        id: refCode, 
                        poReference: String(po.id || ''), 
                        status: displayStatus, 
                        originalEeStatus: eeStatus, 
                        channel: po.channel, 
                        storeCode: po.storeCode, 
                        orderDate: effectiveOrderDate, 
                        poEdd: po.poEdd, 
                        poExpiryDate: po.poExpiryDate, 
                        poPdfUrl: po.poPdfUrl, 
                        qty: 0, 
                        amount: 0, 
                        items: [], 
                        batchCreatedAt: batchDate, 
                        invoiceDate: item.invoiceDate, 
                        manifestDate: maniDate, 
                        invoiceId: item.invoiceId, 
                        invoiceStatus: item.invoiceStatus, 
                        invoiceNumber: invNum, 
                        invoiceTotal: item.invoiceTotal, 
                        invoiceUrl: item.invoiceUrl, 
                        invoicePdfUrl: item.invoicePdfUrl, 
                        carrier: carrier, 
                        awb: awb, 
                        trackingStatus: trackingStatus, 
                        trackingUrl: trackingUrl,
                        edd: item.edd || po.edd, 
                        latestStatus: item.latestStatus || po.latestStatus, 
                        latestStatusDate: item.latestStatusDate || po.latestStatusDate, 
                        currentLocation: item.currentLocation || po.currentLocation, 
                        deliveredDate: item.deliveredDate || po.deliveredDate, 
                        rtoStatus: item.rtoStatus || po.rtoStatus, 
                        rtoAwb: item.rtoAwb || po.rtoAwb, 
                        boxCount: eeBoxCount,
                        appointmentDate: item.appointmentDate || po.appointmentDate,
                        appointmentRequestDate: item.appointmentRequestDate || po.appointmentRequestDate,
                        appointmentRequestId: item.appointmentRequestId || po.appointmentRequestId,
                        appointmentRequestTimestamp: item.appointmentRequestTimestamp || po.appointmentRequestTimestamp,
                        appointmentId: item.appointmentId || po.appointmentId,
                        appointmentTime: po.appointmentTime,
                        appointmentRemarks: po.appointmentRemarks,
                        qrCodeUrl: po.qrCodeUrl,
                        ewb: item.ewb || po.ewb,
                        fbaShipmentId: item.fbaShipmentId || po.fbaShipmentId,
                        consignmentQty: po.consignmentQty,
                        consignmentProducts: po.consignmentProducts,
                        consignmentValue: po.consignmentValue
                    };
                } else {
                    const curPo = String(po.id || '');
                    if (!groups[refCode].poReference.includes(curPo)) groups[refCode].poReference += `, ${curPo}`;
                    const statusRank = (s: string) => { 
                        if (s === 'Returned') return 13;
                        if (s === 'RTO Initiated') return 12;
                        if (s === 'Closed') return 11;
                        if (s === 'Delivered') return 10;
                        if (s === 'Shipped') return 9; 
                        if (s === 'Label Generated') return 8;
                        if (s === 'Create ASN') return 7;
                        if (s === 'Awaiting Appointment Confirmation') return 6;
                        if (s === 'Invoiced') return 4; 
                        if (s === 'Batch Created') return 3; 
                        if (s === 'Confirmed') return 2; 
                        return 1; 
                    };
                    if (statusRank(displayStatus) > statusRank(groups[refCode].status)) groups[refCode].status = displayStatus;
                    if (groups[refCode].orderDate === 'N/A' && effectiveOrderDate !== 'N/A') groups[refCode].orderDate = effectiveOrderDate;
                    if (!groups[refCode].batchCreatedAt) groups[refCode].batchCreatedAt = batchDate;
                    if (!groups[refCode].invoiceDate) groups[refCode].invoiceDate = item.invoiceDate;
                    if (!groups[refCode].manifestDate) groups[refCode].manifestDate = maniDate;
                    if (!groups[refCode].invoiceNumber) groups[refCode].invoiceNumber = invNum;
                    
                    groups[refCode].boxCount = eeBoxCount;

                    if (!groups[refCode].awb && awb) groups[refCode].awb = awb;
                    if (!groups[refCode].trackingStatus && trackingStatus) groups[refCode].trackingStatus = trackingStatus;
                    if (!groups[refCode].trackingUrl && trackingUrl) groups[refCode].trackingUrl = trackingUrl;
                    if (!groups[refCode].ewb) groups[refCode].ewb = item.ewb || po.ewb;
                    if (!groups[refCode].fbaShipmentId) groups[refCode].fbaShipmentId = item.fbaShipmentId || po.fbaShipmentId;
                    if (!groups[refCode].appointmentId) groups[refCode].appointmentId = po.appointmentId;
                    if (!groups[refCode].qrCodeUrl) groups[refCode].qrCodeUrl = po.qrCodeUrl;
                }
                groups[refCode].items.push(item);
                groups[refCode].qty += effectiveQty;
                groups[refCode].amount += effectiveLineAmount;
            });
        });

        const results = Object.values(groups);

        results.forEach(so => {
            const hasInvoice = !!so.invoiceNumber && so.invoiceNumber !== 'GENERATING...';
            const progressRequiringInvoice = ['Label Generated', 'Shipped', 'Delivered'].includes(so.status);
            
            const isAmazonFbaYeio = (so.channel.toLowerCase().includes('amazon_fba') || so.channel.toLowerCase().includes('amazon fba')) && 
                                    (so.storeCode.toUpperCase() === 'YEIO');

            if (!hasInvoice && progressRequiringInvoice && !isAmazonFbaYeio) {
                so.status = 'Batch Created';
            }
        });

        results.forEach(so => {
            counts['All POs']++;
            if (counts[so.status] !== undefined) counts[so.status]++;
        });

        let filteredResults = results;
        if (activeFilter !== 'All POs') filteredResults = results.filter(so => so.status === activeFilter);
        Object.keys(columnFilters).forEach(key => {
            const val = columnFilters[key].toLowerCase();
            if (!val) return;
            filteredResults = filteredResults.filter(so => String((so as any)[key] || '').toLowerCase().includes(val));
        });
        filteredResults.sort((a, b) => parseDateString(b.orderDate) - parseDateString(a.orderDate));
        return { salesOrders: filteredResults, salesTabCounts: counts, allSalesOrders: results };
    }, [purchaseOrders, activeFilter, columnFilters]);

    const zeptoEligibility = useMemo(() => {
        const zeptoOrders = allSalesOrders.filter(so => so.channel.toLowerCase().includes('zepto'));
        if (zeptoOrders.length === 0) return { show: false, canRequest: false, reason: 'No Zepto orders' };

        // Only consider orders that haven't had an appointment request yet
        const activeZeptoOrders = zeptoOrders.filter(so => !so.appointmentRequestId && !so.appointmentDate && !so.appointmentId);
        
        const openZeptoOrders = activeZeptoOrders.filter(so => 
            ['Confirmed', 'Batch Created'].includes(so.status)
        );

        const invoicedZeptoOrders = activeZeptoOrders.filter(so => 
            so.status === 'Invoiced' && !so.awb
        );

        const hasOpen = openZeptoOrders.length > 0;
        const missingBoxDetails = invoicedZeptoOrders.some(so => (so.boxCount || 0) === 0);

        if (hasOpen) return { show: true, canRequest: false, reason: 'Waiting for other Zepto orders to be invoiced', hasOpen: true, missingBoxDetails: false };
        if (invoicedZeptoOrders.length === 0) return { show: true, canRequest: false, reason: 'No eligible invoiced Zepto orders', hasOpen: false, missingBoxDetails: false };
        if (missingBoxDetails) return { show: true, canRequest: false, reason: 'Box details missing for some orders', hasOpen: false, missingBoxDetails: true };

        return { show: true, canRequest: true, orders: invoicedZeptoOrders, hasOpen: false, missingBoxDetails: false };
    }, [allSalesOrders]);

    const handleSendZeptoAppointmentRequest = async () => {
        if (!zeptoEligibility.canRequest || isSendingZeptoAppointment) return;
        
        setIsSendingZeptoAppointment(true);
        try {
            const res = await sendZeptoAppointmentRequestEmail({
                orders: zeptoEligibility.orders?.map(o => ({
                    id: o.id,
                    poReference: o.poReference,
                    boxCount: o.boxCount
                }))
            });

            if (res.status === 'success') {
                addNotification(res.message || 'Appointment request sent successfully.', 'success');
                // Refresh data to show updated statuses
                onSync();
            } else {
                addNotification(res.message || 'Failed to send appointment request', 'error');
            }
        } catch (err) {
            console.error('Error sending Zepto appointment request:', err);
            addNotification('Error sending appointment request', 'error');
        } finally {
            setIsSendingZeptoAppointment(false);
        }
    };
    
    const instamartEligibility = useMemo(() => {
        const instamartOrders = allSalesOrders.filter(so => so.channel.toLowerCase().includes('instamart'));
        if (instamartOrders.length === 0) return { show: false, canRequest: false, reason: 'No Instamart orders' };

        // Only consider orders that haven't had an appointment request yet
        const activeInstamartOrders = instamartOrders.filter(so => !so.appointmentRequestId && !so.appointmentDate && !so.appointmentId);
        
        const openInstamartOrders = activeInstamartOrders.filter(so => 
            ['Confirmed', 'Batch Created'].includes(so.status)
        );

        const invoicedInstamartOrders = activeInstamartOrders.filter(so => 
            so.status === 'Invoiced' && !so.awb
        );

        const hasOpen = openInstamartOrders.length > 0;
        const missingBoxDetails = invoicedInstamartOrders.some(so => (so.boxCount || 0) === 0);

        if (hasOpen) return { show: true, canRequest: false, reason: 'Waiting for other Instamart orders to be invoiced', hasOpen: true, missingBoxDetails: false };
        if (invoicedInstamartOrders.length === 0) return { show: true, canRequest: false, reason: 'No eligible invoiced Instamart orders', hasOpen: false, missingBoxDetails: false };
        if (missingBoxDetails) return { show: true, canRequest: false, reason: 'Box details missing for some orders', hasOpen: false, missingBoxDetails: true };

        return { show: true, canRequest: true, orders: invoicedInstamartOrders, hasOpen: false, missingBoxDetails: false };
    }, [allSalesOrders]);

    const handleSendInstamartAppointmentRequest = async () => {
        if (!instamartEligibility.canRequest || isSendingInstamartAppointment) return;
        
        setIsSendingInstamartAppointment(true);
        try {
            const res = await sendInstamartAppointmentRequestEmail({
                orders: instamartEligibility.orders?.map(o => ({
                    id: o.id,
                    poReference: o.poReference,
                    boxCount: o.boxCount
                }))
            });

            if (res.status === 'success') {
                addNotification(res.message || 'Instamart appointment request sent successfully.', 'success');
                onSync();
            } else {
                addNotification(res.message || 'Failed to send Instamart appointment request', 'error');
            }
        } catch (err) {
            console.error('Error sending Instamart appointment request:', err);
            addNotification('Error sending Instamart appointment request', 'error');
        } finally {
            setIsSendingInstamartAppointment(false);
        }
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (filterMenuRef.current && !filterMenuRef.current.contains(event.target as Node)) {
                setActiveFilterColumn(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const refreshSingleSOState = async (poReference: string) => {
        setIsRefreshingSo(poReference);
        const poIds = poReference.split(',').map(s => s.trim());
        let successCount = 0;
        let failCount = 0;
        let lastMessage = '';

        for (const id of poIds) {
            try {
                // Trigger sync (POST) - we don't block on failure here to match PoTable behavior
                try {
                    const syncRes = await syncSinglePO(id);
                    if (syncRes && syncRes.message) {
                        lastMessage = syncRes.message;
                    }
                } catch (syncErr) {
                    console.warn("Sync failed for", id, syncErr);
                }

                // Fetch updated data (GET) - this is what the user says "works" in PoTable
                const updated = await fetchPurchaseOrder(id);
                if (updated) {
                    setPurchaseOrders(prev => prev.map(p => p.poNumber === id ? updated : p));
                    successCount++;
                    if (!lastMessage) lastMessage = `Refreshed ${id}`;
                } else {
                    failCount++;
                    lastMessage = `Could not find ${id} in database`;
                }
            } catch (e: any) {
                failCount++;
                lastMessage = e.message || 'Network error';
                console.error("Failed refresh for SO sub-po", id);
            }
        }

        if (poIds.length === 1) {
            if (successCount === 1) {
                addNotification(lastMessage || `Refreshed ${poIds[0]} successfully`, 'success');
            } else {
                addNotification(lastMessage || `Failed to refresh ${poIds[0]}`, 'error');
            }
        } else {
            if (successCount > 0) {
                addNotification(`Refreshed ${successCount} orders. ${failCount > 0 ? `${failCount} failed.` : ''}`, failCount > 0 ? 'warning' : 'success');
            } else if (failCount > 0) {
                addNotification(`Failed to refresh orders: ${lastMessage}`, 'error');
            }
        }
        
        setIsRefreshingSo(null);
    };

    const handleFlipkartConsignmentSuccess = () => {
        // Since backend already updated the database, we just need to refresh our frontend data.
        onSync();
    };

    const handlePrintFlipkartLabels = (so: GroupedSalesOrder) => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            addNotification("Popup blocked! Please allow popups to print labels.", "error");
            return;
        }

        const deliveryDate = so.appointmentDate || 'TBD';
        const consignmentId = so.appointmentId || 'N/A';
        const supplierName = "Brainlytic Solutions Pvt Ltd";
        const totalQty = so.consignmentQty || so.qty || 0; 
        const productCount = so.consignmentProducts || so.items.length || 0;
        const totalValue = so.consignmentValue || (so.amount * 1.05).toFixed(2);

let html = `
<html>
  <head>
    <title>Flipkart Minutes Packing Slip - ${so.id}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
      @media print {
        @page { size: 4in 6in; margin: 0; }
        body { margin: 0; -webkit-print-color-adjust: exact; color: black; }
      }
    </style>
  </head>

  <body class="font-mono bg-white text-black">
    <div class="min-h-screen p-6 page-break">

      <!-- HEADER -->
      <div class="border-b-2 border-black pb-2 mb-4">
        <p class="text-xl font-black uppercase">Flipkart Minutes – Box Label</p>
      </div>

      <!-- PRIMARY IDENTIFIERS -->
      <div class="space-y-4 mb-6">
        <div>
          <p class="text-xs font-bold uppercase">PO Number</p>
          <p class="text-3xl font-black uppercase">${so.poReference}</p>
        </div>

        <div>
          <p class="text-xs font-bold uppercase">Consignment Number</p>
          <p class="text-3xl font-black uppercase">${consignmentId}</p>
        </div>

      </div>

      <!-- DIVIDER -->
      <div class="border-t-2 border-black pt-4 space-y-4">

        <div>
          <p class="text-xs font-bold uppercase">Supplier Name</p>
          <p class="text-xl font-black uppercase">${supplierName}</p>
        </div>

        <div>
          <p class="text-xs font-bold uppercase">Delivery Date</p>
          <p class="text-2xl font-black uppercase">${deliveryDate}</p>
        </div>

        <div>
          <p class="text-xs font-bold uppercase">Consignment Quantity</p>
          <p class="text-2xl font-black">${totalQty}</p>
        </div>

        <div>
          <p class="text-xs font-bold uppercase">Consignment Products</p>
          <p class="text-2xl font-black">${productCount}</p>
        </div>

        <div>
          <p class="text-xs font-bold uppercase">Consignment Value</p>
          <p class="text-2xl font-black">₹${Math.floor(Number(totalValue))}</p>
        </div>

      </div>


    </div>

    <script>
      window.onload = function () {
        setTimeout(function () {
          window.print();
          window.onafterprint = function () { window.close(); };
        }, 500);
      };
    </script>
  </body>
</html>
`;


        printWindow.document.write(html);
        printWindow.document.close();
    };

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (event.data?.type === 'GOOGLE_AUTH_SUCCESS' && setGoogleTokens) {
                setGoogleTokens(event.data.tokens);
                localStorage.setItem('google_sheets_tokens', JSON.stringify(event.data.tokens));
                addNotification('Google account connected successfully!', 'success');
            }
        };
        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [setGoogleTokens, addNotification]);

    const parseAppointmentDateTime = (date?: string, time?: string) => {
        if (!date) return 0;
        try {
            let d = new Date(date);
            if (isNaN(d.getTime())) {
                const parts = date.split('-');
                if (parts.length === 3) {
                    if (parts[2].length === 4) {
                        d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
                    } else {
                        d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
                    }
                }
            }
            
            if (time && !isNaN(d.getTime())) {
                const timeStr = String(time).trim();
                const ampmMatch = timeStr.match(/(\d{1,2}):(\d{1,2})\s*(AM|PM)/i);
                if (ampmMatch) {
                    let hours = parseInt(ampmMatch[1], 10);
                    const minutes = parseInt(ampmMatch[2], 10);
                    const ampm = ampmMatch[3].toUpperCase();
                    if (ampm === 'PM' && hours < 12) hours += 12;
                    if (ampm === 'AM' && hours === 12) hours = 0;
                    d.setHours(hours, minutes, 0, 0);
                } else if (timeStr.includes('T')) {
                    const t = new Date(timeStr);
                    d.setHours(t.getHours(), t.getMinutes(), t.getSeconds());
                } else {
                    const parts = timeStr.match(/(\d{1,2}):(\d{1,2})/);
                    if (parts) {
                        d.setHours(parseInt(parts[1]), parseInt(parts[2]), 0, 0);
                    }
                }
            }
            return d.getTime();
        } catch (e) {
            return 0;
        }
    };

    const handleUpdateGoogleSheet = async () => {
        const inTransitOrders = allSalesOrders.filter(so => {
            const channelLower = so.channel.toLowerCase();
            const allowedChannels = ['instamart', 'zepto', 'bb', 'rbl', 'flipkart', 'blinkit'];
            const isAllowedChannel = allowedChannels.some(c => channelLower.includes(c));
            if (!isAllowedChannel) return false;
            const isAmazon = channelLower.includes('amazon');
            const trackingStatusLower = (so.trackingStatus || '').toLowerCase();
            const isActuallyDelivered = (trackingStatusLower === 'delivered' || trackingStatusLower === 'successfully delivered' || !!so.deliveredDate);
            if (so.status === 'Shipped') return true;
            if (isAmazon && so.status === 'Delivered' && !isActuallyDelivered) return true;
            return false;
        }).sort((a, b) => {
            const timeA = parseAppointmentDateTime(a.appointmentDate, a.appointmentTime);
            const timeB = parseAppointmentDateTime(b.appointmentDate, b.appointmentTime);
            return timeA - timeB; // Ascending order
        });

        if (inTransitOrders.length === 0) {
            addNotification('No in-transit orders found to update.', 'warning');
            return;
        }

        if (!googleTokens) {
            try {
                const res = await fetch('/api/auth/google/url');
                if (!res.ok) {
                    const text = await res.text();
                    console.error('Failed to get auth URL:', text);
                    throw new Error(`Server returned ${res.status}`);
                }
                const { url } = await res.json();
                window.open(url, 'google_auth', 'width=600,height=700');
                return;
            } catch (err: any) {
                console.error('Error initiating Google login:', err);
                addNotification(`Failed to initiate Google login: ${err.message || 'Unknown error'}`, 'error');
                return;
            }
        }

        setIsUpdatingSheet(true);
        try {
            const headers = [
                'Booked Date', 'PO Number', 'Channel', 'Store Code', 'AWB', 
                'Tracking Status', 'Latest Status', 'Current Location', 'EDD', 
                'Appointment Date & Time', 'Appointment ID', 'PO PDF', 'Invoice Url'
            ];

            const rows = inTransitOrders.map(so => {
                const appointmentDateTime = so.appointmentDate ? `${so.appointmentDate} ${formatDisplayTime(so.appointmentTime)}`.trim() : 'N/A';
                return [
                    so.manifestDate || so.batchCreatedAt || 'N/A',
                    so.poReference,
                    so.channel,
                    so.storeCode,
                    so.awb || 'N/A',
                    so.trackingStatus || 'N/A',
                    so.latestStatus || 'N/A',
                    so.currentLocation || 'N/A',
                    so.edd || 'N/A',
                    appointmentDateTime,
                    so.appointmentId || 'N/A',
                    so.poPdfUrl || 'N/A',
                    so.invoicePdfUrl || 'N/A'
                ];
            });

            const spreadsheetId = import.meta.env.VITE_GOOGLE_SPREADSHEET_ID || '1NxB2W6zEB8qGf4QyHXVbvLCa09eBTgZTk-GCTJy4Zfk';
            const sheetId = import.meta.env.VITE_GOOGLE_SHEET_ID || '1014733683';

            const response = await fetch('/api/update-google-sheet', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tokens: googleTokens,
                    spreadsheetId,
                    sheetId,
                    data: [headers, ...rows]
                })
            });

            const result = await response.json();
            if (result.success) {
                addNotification('Google Sheet updated successfully!', 'success');
                addLog('Google Sheet Update', `Updated sheet with ${inTransitOrders.length} orders`);
            } else {
                if (result.error?.includes('invalid_grant') || result.error?.includes('expired')) {
                    if (setGoogleTokens) setGoogleTokens(null);
                    localStorage.removeItem('google_sheets_tokens');
                    addNotification('Session expired. Please click again to reconnect Google account.', 'warning');
                } else {
                    addNotification('Failed to update Google Sheet: ' + result.error, 'error');
                }
            }
        } catch (err) {
            addNotification('Network error updating Google Sheet', 'error');
        } finally {
            setIsUpdatingSheet(false);
        }
    };

    const handleExportInTransitCSV = () => {
        const inTransitOrders = allSalesOrders.filter(so => {
            const channelLower = so.channel.toLowerCase();
            const allowedChannels = ['instamart', 'zepto', 'bb', 'rbl', 'flipkart', 'blinkit'];
            const isAllowedChannel = allowedChannels.some(c => channelLower.includes(c));
            
            if (!isAllowedChannel) return false;

            const isAmazon = channelLower.includes('amazon');
            const trackingStatusLower = (so.trackingStatus || '').toLowerCase();
            const isActuallyDelivered = (trackingStatusLower === 'delivered' || trackingStatusLower === 'successfully delivered' || !!so.deliveredDate);
            
            if (so.status === 'Shipped') return true;
            if (isAmazon && so.status === 'Delivered' && !isActuallyDelivered) return true;
            return false;
        }).sort((a, b) => {
            const timeA = parseAppointmentDateTime(a.appointmentDate, a.appointmentTime);
            const timeB = parseAppointmentDateTime(b.appointmentDate, b.appointmentTime);
            return timeA - timeB; // Ascending order
        });

        if (inTransitOrders.length === 0) {
            addNotification('No in-transit orders found to export.', 'warning');
            return;
        }

        const headers = [
            'Booked Date',
            'PO Number',
            'Channel',
            'Store Code',
            'AWB',
            'Tracking Status',
            'Latest Status',
            'Current Location',
            'EDD',
            'Appointment Date & Time',
            'Appointment ID',
            'PO PDF',
            'Invoice Url'
        ];

        const rows = inTransitOrders.map(so => {
            const appointmentDateTime = so.appointmentDate ? `${so.appointmentDate} ${formatDisplayTime(so.appointmentTime)}`.trim() : 'N/A';
            return [
                so.manifestDate || so.batchCreatedAt || 'N/A',
                so.poReference,
                so.channel,
                so.storeCode,
                so.awb || 'N/A',
                so.trackingStatus || 'N/A',
                so.latestStatus || 'N/A',
                so.currentLocation || 'N/A',
                so.edd || 'N/A',
                appointmentDateTime,
                so.appointmentId || 'N/A',
                so.poPdfUrl || 'N/A',
                so.invoicePdfUrl || 'N/A'
            ].map(val => `"${String(val).replace(/"/g, '""')}"`).join(',');
        });

        const csvContent = [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `In_Transit_Orders_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleProcessBlinkitPasses = async () => {
        setIsProcessingBlinkit(true);
        addNotification('Processing Blinkit appointment passes...', 'info');
        try {
            const res = await processBlinkitAppointmentPasses();
            if (res.status === 'success') {
                addNotification(res.message || 'Blinkit passes processed successfully.', 'success');
                onSync();
            } else {
                addNotification('Failed: ' + (res.message || 'Unknown error'), 'error');
            }
        } catch (e) {
            addNotification('Error processing Blinkit passes.', 'error');
        } finally {
            setIsProcessingBlinkit(false);
        }
    };

    const handleEESync = async () => {
        setIsSyncingEE(true);
        addNotification('Triggering EasyEcom API sync...', 'info');
        try {
            const res = await syncEasyEcomShipments();
            if (res.status === 'success') {
                addNotification(res.message || 'EasyEcom sync successful.', 'success');
                addLog('EasyEcom Sync', 'Manual shipment fetch triggered.');
                onSync();
            } else {
                addNotification('Sync Failed: ' + (res.message || 'Unknown error'), 'error');
            }
        } catch (e) {
            addNotification('Network error during sync.', 'error');
        } finally {
            setIsSyncingEE(false);
        }
    };

    const handleCreateZohoInvoiceAction = async (eeRef: string, poRef: string, soObj?: GroupedSalesOrder) => {
        if (soObj && (soObj.channel.toLowerCase().includes('amazon_fba') || soObj.channel.toLowerCase().includes('amazon fba'))) {
            setFbaShipmentModal({ isOpen: true, so: soObj });
            return;
        }

        setIsCreatingInvoice(eeRef);
        
        const parentPoNumbers = poRef.split(',').map(s => s.trim());
        setPurchaseOrders(prev => prev.map(po => {
            if (parentPoNumbers.includes(po.poNumber)) {
                return {
                    ...po,
                    items: po.items?.map(item => 
                        item.eeReferenceCode === eeRef ? { ...item, invoiceNumber: 'GENERATING...', invoiceStatus: 'PROCESSING' } : item
                    )
                };
            }
            return po;
        }));

        try {
            const res = await createZohoInvoice(eeRef);
            if (res.status === 'success') {
                addNotification(res.message || 'Invoice triggered successfully.', 'success');
                addLog('Invoice Creation', `EE Ref: ${eeRef}`);
                await refreshSingleSOState(poRef);
            } else {
                addNotification('Error: ' + (res.message || 'Failed to trigger invoice generation.'), 'error');
                setPurchaseOrders(prev => prev.map(po => {
                    if (parentPoNumbers.includes(po.poNumber)) {
                        return {
                            ...po,
                            items: po.items?.map(item => 
                                (item.eeReferenceCode === eeRef && item.invoiceNumber === 'GENERATING...') ? { ...item, invoiceNumber: undefined, invoiceStatus: undefined } : item
                            )
                        };
                    }
                    return po;
                }));
            }
        } catch (e) {
            addNotification('Network error during invoice creation.', 'error');
        } finally {
            setIsCreatingInvoice(null);
        }
    };

    const handleFbaSaveAndInvoice = async (fbaId: string) => {
        const so = fbaShipmentModal.so;
        if (!so) return;

        setIsCreatingInvoice(so.id);
        
        const parentPoNumbers = so.poReference.split(',').map(s => s.trim());
        setPurchaseOrders(prev => prev.map(po => {
            if (parentPoNumbers.includes(po.poNumber)) {
                return {
                    ...po,
                    fbaShipmentId: fbaId,
                    items: po.items?.map(item => 
                        item.eeReferenceCode === so.id ? { ...item, invoiceNumber: 'GENERATING...', fbaShipmentId: fbaId } : item
                    )
                };
            }
            return po;
        }));

        try {
            const updateRes = await updateFBAShipmentId(so.poReference, fbaId);
            if (updateRes.status !== 'success') {
                throw new Error(updateRes.message || "Failed to save FBA ID.");
            }

            const res = await createZohoInvoice(so.id);
            if (res.status === 'success') {
                addNotification(res.message || 'FBA ID Saved & Invoice triggered.', 'success');
                addLog('Amazon FBA Invoice', `FBA ID: ${fbaId}, Ref: ${so.id}`);
                await refreshSingleSOState(so.poReference);
                setFbaShipmentModal({ isOpen: false, so: null });
            } else {
                addNotification('Zoho Error: ' + (res.message || 'Unknown invoice error'), 'error');
            }
        } catch (e: any) {
            addNotification(e.message || 'Workflow failed.', 'error');
        } finally {
            setIsCreatingInvoice(null);
        }
    };

    const handlePushToNimbusAction = async (eeRef: string, poRef: string) => {
        setIsPushingNimbus(eeRef);
        
        const parentPoNumbers = poRef.split(',').map(s => s.trim());
        setPurchaseOrders(prev => prev.map(po => {
            if (parentPoNumbers.includes(po.poNumber)) {
                return {
                    ...po,
                    awb: 'SYNCING...',
                    items: po.items?.map(item => 
                        item.eeReferenceCode === eeRef ? { ...item, awb: 'SYNCING...', carrier: 'Nimbus Post', trackingStatus: 'Assigned' } : item
                    )
                };
            }
            return po;
        }));

        try {
            const res = await pushToNimbusPost(eeRef);
            if (res.status === 'success') {
                addNotification(res.message || 'Pushed to Nimbus successfully.', 'success');
                addLog('Nimbus Shipping', `EE Ref: ${eeRef}`);
                await refreshSingleSOState(poRef);
            } else {
                addNotification('Shipping Error: ' + (res.message || 'Failed to push to Nimbus.'), 'error');
                setPurchaseOrders(prev => prev.map(po => {
                    if (parentPoNumbers.includes(po.poNumber)) {
                        return {
                            ...po,
                            items: po.items?.map(item => 
                                (item.eeReferenceCode === eeRef && item.awb === 'SYNCING...') ? { ...item, awb: undefined, carrier: undefined, trackingStatus: undefined } : item
                            )
                        };
                    }
                    return po;
                }));
            }
        } catch (e) {
            addNotification('Network error while shipping.', 'error');
        } finally {
            setIsPushingNimbus(null);
        }
    };

    /**
     * Special function for Flipkart Packing Slip CSV generation
     */
    const handleDownloadFlipkartPackingSlip = (so: GroupedSalesOrder) => {
        if (!inventoryItems) {
            addNotification('Inventory mappings not loaded.', 'error');
            return;
        }

        const headers = ["FSN", "Article Code", "EAN Code", "MRP", "Size", "Qty", "Unit Price", "Tax %", "Invoice No", "PO No"];
        const rows = so.items.map(item => {
            // Locate the mapping based on SKU and Flipkart channel
            const mapping = inventoryItems.find(inv => 
                (inv.sku === item.masterSku || inv.articleCode === item.articleCode) && 
                inv.channel.toLowerCase().includes('flipkart')
            );

            // Row construction based on specification
            return [
                mapping?.articleCode || '', // FSN is the Channel Item Code
                mapping?.itemName || item.itemName || '', // Article Code is Itemname
                mapping?.ean || '',
                mapping?.mrp || 0,
                mapping?.size || '',
                item.shippedQuantity || item.itemQuantity || item.qty,
                item.unitCost || 0,
                "5", // Tax % hardcoded to 5
                so.invoiceNumber || 'N/A',
                so.poReference
            ];
        });

        if (rows.length === 0) {
            addNotification('No items found in this order.', 'warning');
            return;
        }

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `Flipkart_PackingSlip_${so.id}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        addLog('CSV Download', `Downloaded Flipkart Packing Slip for ${so.id}`);
    };

    /**
     * Special function for Zepto ASN CSV generation
     */

    const TimelineStep = ({ label, date, icon, isLast = false }: { label: string, date?: string, icon: React.ReactNode, isLast?: boolean }) => {
        const isActive = !!date;
        return (
            <div className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center">
                    <div className={`flex items-center justify-center w-8 h-8 rounded-full border-2 transition-colors ${isActive ? 'bg-partners-green border-partners-green text-white shadow-sm' : 'bg-white border-gray-200 text-gray-300'}`}>{icon}</div>
                    <div className="mt-2 text-center"><p className={`text-[10px] font-bold uppercase tracking-wider ${isActive ? 'text-gray-800' : 'text-gray-400'}`}>{label}</p><p className="text-[11px] font-medium text-gray-500 whitespace-nowrap mt-0.5">{date || 'Pending'}</p></div>
                </div>
                {!isLast && <div className={`h-0.5 flex-1 mx-4 -mt-6 transition-colors ${isActive ? 'bg-partners-green' : 'bg-gray-200'}`}></div>}
            </div>
        );
    };

    const uniqueChannels = useMemo(() => Array.from(new Set(salesOrders.map(s => s.channel))), [salesOrders]);

    const getPrimaryAction = (so: GroupedSalesOrder) => {
        const isExecuting = isCreatingInvoice === so.id || isPushingNimbus === so.id;
        const eeStatusLower = so.originalEeStatus.toLowerCase().trim();
        const isZepto = so.channel.toLowerCase().includes('zepto');
        
        // Delivered, RTO, Returned orders should only show Track Order or Details
        if (so.status === 'Delivered' || so.status === 'RTO Initiated' || so.status === 'Returned') {
            if (so.awb || so.status === 'Delivered') {
                return { label: 'Track Order', color: 'bg-partners-green text-white hover:bg-green-700', onClick: () => setExpandedRowId(so.id), disabled: isExecuting };
            }
            return { label: 'Details', color: 'bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100', onClick: () => setExpandedRowId(so.id), disabled: isExecuting };
        }

        const isAmazonFbaYeio = (so.channel.toLowerCase().includes('amazon_fba') || so.channel.toLowerCase().includes('amazon fba')) && 
                                (so.storeCode.toUpperCase() === 'YEIO');
                                
        const canInvoice = !isAmazonFbaYeio && !so.invoiceNumber && eeStatusLower !== 'open' && (eeStatusLower === 'confirmed' || so.status === 'Batch Created');

        if (canInvoice) return { label: isCreatingInvoice === so.id ? 'Creating...' : 'Create Invoice', color: 'bg-purple-600 text-white hover:bg-purple-700', onClick: () => handleCreateZohoInvoiceAction(so.id, so.poReference, so), disabled: isExecuting };
        
        if (isZepto) {
            if (so.status === 'Create ASN') return { label: 'Create ASN', color: 'bg-green-600 text-white hover:bg-green-700', onClick: () => setZeptoASNHelper({ isOpen: true, so }), disabled: isExecuting };
            if (so.status === 'Awaiting Appointment Confirmation') return { label: 'Awaiting Appt.', color: 'bg-yellow-500 text-white hover:bg-yellow-600', onClick: () => setInstamartApptModal({ isOpen: true, so }), disabled: isExecuting };
            if (so.status === 'Invoiced' && !so.awb && !so.appointmentId) return { label: 'Appt. Pending', color: 'bg-orange-500 text-white hover:bg-orange-600', onClick: () => setInstamartApptModal({ isOpen: true, so }), disabled: isExecuting };
        }

        const isInstamart = so.channel.toLowerCase().includes('instamart');
        if (isInstamart) {
            if (so.status === 'Awaiting Appointment Confirmation') return { label: 'Awaiting Appt.', color: 'bg-yellow-500 text-white hover:bg-yellow-600', onClick: () => setInstamartApptModal({ isOpen: true, so }), disabled: isExecuting };
            if (so.status === 'Invoiced' && !so.awb && !so.appointmentId) return { label: 'Appt. Pending', color: 'bg-orange-500 text-white hover:bg-orange-600', onClick: () => setInstamartApptModal({ isOpen: true, so }), disabled: isExecuting };
        }

        if (so.status === 'Invoiced' && !so.awb) {
            if (so.boxCount === 0 && !so.channel.toLowerCase().includes('flipkart')) {
                return { 
                    label: 'Box Data Missing', 
                    color: 'bg-orange-50 text-orange-600 border border-orange-200 cursor-default', 
                    onClick: () => addNotification('Update box count in backend to enable shipping.', 'warning'), 
                    disabled: false 
                };
            }

            const isInstamart = so.channel.toLowerCase().includes('instamart');
            const isAmazonFba = so.channel.toLowerCase().includes('amazon_fba') || so.channel.toLowerCase().includes('amazon fba');
            const ewbMissing = (so.invoiceTotal || 0) >= 50000 && !so.ewb;

            if (isAmazonFba) {
                return { 
                    label: 'FBA Handled', 
                    color: 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed', 
                    onClick: () => addNotification('Amazon FBA orders are fulfilled by Amazon, not Nimbus.', 'info'), 
                    disabled: true 
                };
            }

            if (ewbMissing) {
                return { 
                    label: 'EWB Missing', 
                    color: 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed', 
                    onClick: () => addNotification('E-Way Bill required for orders >= ₹50,000.', 'warning'), 
                    disabled: true 
                };
            }

            return { 
                label: isPushingNimbus === so.id ? 'Shipping...' : 'Ship Nimbus', 
                color: 'bg-blue-600 text-white hover:bg-blue-700', 
                onClick: () => {
                    if (isInstamart) {
                        setShippingConfirm({ isOpen: true, so });
                    } else {
                        handlePushToNimbusAction(so.id, so.poReference);
                    }
                }, 
                disabled: isExecuting 
            };
        }
        if (so.status === 'Label Generated' || so.status === 'Shipped' || so.awb) return { label: 'Track Order', color: 'bg-partners-green text-white hover:bg-green-700', onClick: () => setExpandedRowId(so.id), disabled: isExecuting };
        return { label: 'Details', color: 'bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100', onClick: () => setExpandedRowId(so.id), disabled: isExecuting };
    };

    return (
        <div className="bg-white p-6 rounded-xl shadow-sm">
            {portalHelper.isOpen && portalHelper.so && (
                <PortalHelperModal 
                    so={portalHelper.so} 
                    onClose={() => setPortalHelper({ isOpen: false, so: null })} 
                    addNotification={addNotification}
                />
            )}

            {zeptoASNHelper.isOpen && zeptoASNHelper.so && (
                <ZeptoASNHelperModal 
                    so={zeptoASNHelper.so} 
                    onClose={() => setZeptoASNHelper({ isOpen: false, so: null })} 
                    addNotification={addNotification}
                    onComplete={onSync}
                    inventoryItems={inventoryItems || []}
                />
            )}
            {instamartPrintPackModal.isOpen && instamartPrintPackModal.so && (
                <InstamartPrintManager 
                    so={instamartPrintPackModal.so} 
                    onClose={() => setInstamartPrintPackModal({ isOpen: false, so: null })} 
                    addNotification={addNotification}
                />
            )}
            
            {flipkartConsignmentModal.isOpen && flipkartConsignmentModal.so && (
                <FlipkartConsignmentModal 
                    so={flipkartConsignmentModal.so} 
                    userEmail={userEmail}
                    addNotification={addNotification}
                    onClose={() => setFlipkartConsignmentModal({ isOpen: false, so: null })}
                    onSuccess={handleFlipkartConsignmentSuccess}
                />
            )}

            {fbaShipmentModal.isOpen && fbaShipmentModal.so && (
                <FbaShipmentModal 
                    so={fbaShipmentModal.so} 
                    isSaving={isCreatingInvoice === fbaShipmentModal.so.id}
                    onClose={() => setFbaShipmentModal({ isOpen: false, so: null })}
                    onSave={handleFbaSaveAndInvoice}
                />
            )}
            {amazonBoxModal.isOpen && amazonBoxModal.so && (
                <AmazonBoxDetailsModal 
                    so={amazonBoxModal.so}
                    onClose={() => setAmazonBoxModal({ isOpen: false, so: null })}
                    addNotification={addNotification}
                    data={amazonBoxModal.data}
                />
            )}
            {instamartApptModal.isOpen && instamartApptModal.so && (
                <InstamartAppointmentModal 
                    so={instamartApptModal.so} 
                    onClose={() => setInstamartApptModal({ isOpen: false, so: null })} 
                    addNotification={addNotification}
                    onComplete={onSync}
                />
            )}
            {shippingConfirm.isOpen && shippingConfirm.so && (
                <ShippingConfirmationModal 
                    so={shippingConfirm.so} 
                    onClose={() => setShippingConfirm({ isOpen: false, so: null })} 
                    onConfirm={() => {
                        const so = shippingConfirm.so!;
                        setShippingConfirm({ isOpen: false, so: null });
                        handlePushToNimbusAction(so.id, so.poReference);
                    }}
                    onPrint={() => {
                        const so = shippingConfirm.so!;
                        setShippingConfirm({ isOpen: false, so: null });
                        setInstamartPrintPackModal({ isOpen: true, so });
                    }}
                />
            )}

            {activeAppointmentPass && (
                <AppointmentPass 
                    appointmentId={activeAppointmentPass.appointmentId || 'PENDING'}
                    appointmentDate={activeAppointmentPass.appointmentDate || 'TBD'}
                    appointmentTime={formatDisplayTime(activeAppointmentPass.appointmentTime)}
                    facilityName={`${activeAppointmentPass.channel} - ${activeAppointmentPass.storeCode}`}
                    qrCodeUrl={activeAppointmentPass.qrCodeUrl}
                    purchaseManagerName="BRAINLYTIC SOLUTIONS PVT LTD"
                    purchaseManagerPhone="N/A"
                    unloadingSlot={activeAppointmentPass.appointmentRemarks || 'Standard'}
                    purchaseOrderId={activeAppointmentPass.poReference}                 
                    onClose={() => setActiveAppointmentPass(null)}
                    addNotification={addNotification}
                />
            )}
            
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-6">
                <div className="flex flex-wrap items-center gap-2">
                    {tabs.map(tab => (
                        <button key={tab.id} onClick={() => setActiveFilter(tab.id)} className={`px-3 py-1.5 text-sm font-semibold rounded-full border transition-all ${activeFilter === tab.id ? 'bg-partners-green text-white border-partners-green shadow-sm' : 'bg-white text-gray-600 border-partners-border hover:bg-gray-50'}`}>{tab.name} <span className="ml-1 text-[10px] opacity-70">({salesTabCounts[tab.id] || 0})</span></button>
                    ))}
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2 ml-auto">
                    {zeptoEligibility.show && (
                        <button 
                            onClick={handleSendZeptoAppointmentRequest}
                            disabled={!zeptoEligibility.canRequest || isSendingZeptoAppointment}
                            className={`flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white bg-indigo-600 rounded-lg shadow-sm hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-50 group ${!zeptoEligibility.canRequest ? 'grayscale' : ''}`}
                            title={zeptoEligibility.canRequest ? "All Zepto orders invoiced. Ready to send appointment request." : zeptoEligibility.reason}
                        >
                            <SendIcon className={`h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 ${isSendingZeptoAppointment ? 'animate-pulse' : ''}`} />
                            <span>{zeptoEligibility.missingBoxDetails ? 'Box Data Missing' : 'Zepto Appt.'}</span>
                        </button>
                    )}
                    {instamartEligibility.show && (
                        <button 
                            onClick={handleSendInstamartAppointmentRequest}
                            disabled={!instamartEligibility.canRequest || isSendingInstamartAppointment}
                            className={`flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white bg-orange-600 rounded-lg shadow-sm hover:bg-orange-700 transition-all active:scale-95 disabled:opacity-50 group ${!instamartEligibility.canRequest ? 'grayscale' : ''}`}
                            title={instamartEligibility.canRequest ? "All Instamart orders invoiced. Ready to send appointment request." : instamartEligibility.reason}
                        >
                            <SendIcon className={`h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 ${isSendingInstamartAppointment ? 'animate-pulse' : ''}`} />
                            <span>{instamartEligibility.missingBoxDetails ? 'Box Data Missing' : 'Instamart Appt.'}</span>
                        </button>
                    )}
                    <button 
                        onClick={handleProcessBlinkitPasses} 
                        disabled={isProcessingBlinkit || isSyncing} 
                        className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white bg-orange-600 rounded-lg shadow-sm hover:bg-orange-700 transition-all active:scale-95 disabled:opacity-50 group"
                        title="Update Blinkit Appointment Passes from portal"
                    >
                        <CalendarIcon className={`h-3.5 w-3.5 ${isProcessingBlinkit ? 'animate-bounce' : 'group-hover:scale-110 transition-transform'}`} /> 
                        <span>Blinkit Pass</span>
                    </button>
                    <button 
                        onClick={handleEESync} 
                        disabled={isSyncingEE || isSyncing} 
                        className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white bg-purple-600 rounded-lg shadow-sm hover:bg-purple-700 transition-all active:scale-95 disabled:opacity-50 group"
                    >
                        <RefreshIcon className={`h-3.5 w-3.5 ${isSyncingEE ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'}`} /> 
                        <span>Sync EE</span>
                    </button>
                    <button 
                        onClick={onSync} 
                        disabled={isSyncing || isSyncingEE} 
                        className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white bg-blue-600 rounded-lg shadow-sm hover:bg-blue-700 transition-all active:scale-95 disabled:opacity-50 group"
                    >
                        <CloudDownloadIcon className={`h-3.5 w-3.5 ${isSyncing ? 'animate-bounce' : 'group-hover:-translate-y-0.5 transition-transform'}`} /> 
                        <span>Refresh</span>
                    </button>
                    <button 
                        onClick={handleExportInTransitCSV} 
                        className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white bg-emerald-700 rounded-lg shadow-sm hover:bg-emerald-800 transition-all active:scale-95 group"
                    >
                        <ClipboardListIcon className="h-3.5 w-3.5 group-hover:scale-110 transition-transform" /> 
                        <span>Export CSV</span>
                    </button>
                    <button 
                        onClick={handleUpdateGoogleSheet} 
                        disabled={isUpdatingSheet}
                        className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white bg-green-600 rounded-lg shadow-sm hover:bg-green-700 transition-all active:scale-95 group disabled:opacity-50"
                    >
                        <GlobeIcon className={`h-3.5 w-3.5 ${isUpdatingSheet ? 'animate-spin' : 'group-hover:scale-110 transition-transform'}`} /> 
                        <span>{isUpdatingSheet ? 'Updating...' : 'Update Sheet'}</span>
                    </button>
                </div>
            </div>

            <div className="mt-6 overflow-x-auto border border-gray-100 rounded-xl shadow-inner max-h-[70vh]">
                <table className="w-full text-sm text-left text-gray-600 border-collapse">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-50 sticky top-0 z-20">
                        <tr>
                            <th className="p-4 w-4 sticky left-0 bg-gray-50 z-30 border-r border-gray-100"></th>
                            <th className="px-6 py-3 text-blue-600 sticky left-12 bg-gray-50 z-30 border-r border-gray-100 min-w-[150px]">
                                <div className="flex items-center gap-2">SO ID (EE Ref)<button onClick={() => setActiveFilterColumn(activeFilterColumn === 'id' ? null : 'id')} className={`p-1 rounded hover:bg-gray-200 ${columnFilters.id ? 'text-partners-green' : 'text-gray-400'}`}><SearchIcon className="h-3 w-3"/></button></div>
                                {activeFilterColumn === 'id' && (<div ref={filterMenuRef} className="absolute top-full left-0 mt-1 w-48 bg-white rounded-lg shadow-xl border border-gray-100 p-2 z-40 normal-case"><input type="text" autoFocus placeholder="Search ID..." className="w-full px-3 py-1.5 text-xs border rounded-md focus:ring-1 focus:ring-partners-green" value={columnFilters.id || ''} onChange={(e: any) => setColumnFilters({...columnFilters, id: e.target.value})} /></div>)}
                            </th>
                            <th className="px-6 py-3">EE Status</th>
                            <th className="px-6 py-3 min-w-[140px]">
                                <div className="flex items-center gap-2">Channel<button onClick={() => setActiveFilterColumn(activeFilterColumn === 'channel' ? null : 'channel')} className={`p-1 rounded hover:bg-gray-200 ${columnFilters.channel ? 'text-partners-green' : 'text-gray-400'}`}><FilterIcon className="h-3 w-3"/></button></div>
                                {activeFilterColumn === 'channel' && (<div ref={filterMenuRef} className="absolute top-full left-0 mt-1 w-48 bg-white rounded-lg shadow-xl border border-gray-100 p-2 z-40 normal-case"><select className="w-full px-2 py-1.5 text-xs border rounded-md" value={columnFilters.channel || ''} onChange={(e: any) => setColumnFilters({...columnFilters, channel: e.target.value})}><option value="">All Channels</option>{uniqueChannels.map(c => <option key={c} value={c}>{c}</option>)}</select></div>)}
                            </th>
                            <th className="px-6 py-3">Store</th>
                            <th className="px-6 py-3">Qty / Total</th>
                            <th className="px-6 py-3">Order Date (EE)</th>
                            <th className="px-6 py-3 text-center sticky right-0 bg-gray-50 z-30 border-l border-gray-100 min-w-[200px]">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100/50">
                        {salesOrders.length === 0 ? (
                            <tr><td colSpan={8} className="px-6 py-10 text-center text-gray-500 italic">No sales orders found matching current criteria.</td></tr>
                        ) : (
                            salesOrders.map((so) => {
                                const isExpanded = expandedRowId === so.id;
                                const totalAmountIncTax = so.amount * 1.05;
                                const action = getPrimaryAction(so);
                                const isRefreshing = isRefreshingSo === so.poReference;
                                
                                const isInstamart = so.channel.toLowerCase().includes('instamart');
                                const isFlipkart = so.channel.toLowerCase().includes('flipkart');
                                const isBlinkit = so.channel.toLowerCase().includes('blinkit');
                                const isZepto = so.channel.toLowerCase().includes('zepto');
                                const isBB = so.channel.toLowerCase().includes('bb');
                                const isRBL = so.channel.toLowerCase().includes('rbl');
                                const isFlipkartMinutes = so.channel.toLowerCase().includes('flipkart minutes') || so.channel.toLowerCase().includes('flipkartminutes');
                                
                                const isInstamartChannel = so.channel.toLowerCase().includes('instamart');
                                const isFinalStatus = so.status === 'Delivered' || so.status === 'RTO Initiated' || so.status === 'Returned';
                                const isGreyedOut = (isZepto && so.status === 'Invoiced' && (zeptoEligibility.hasOpen || zeptoEligibility.missingBoxDetails)) || 
                                                    (isInstamartChannel && so.status === 'Invoiced' && (instamartEligibility.hasOpen || instamartEligibility.missingBoxDetails));
                                const zeptoTooltip = isGreyedOut ? `Waiting for other ${isZepto ? 'Zepto' : 'Instamart'} orders to be invoiced` : undefined;
                                
                                const hasLabel = so.status === 'Label Generated' || so.status === 'Shipped' || so.status === 'Delivered' || !!so.awb;
                                const hasAppointmentId = !!so.appointmentId; // Stores the Consignment ID for Flipkart
                                
                                const showInstamartPrintAction = isInstamart && so.boxCount > 0 && hasLabel && !isFinalStatus;
                                const showFlipkartPrintAction = isFlipkart && hasAppointmentId && !isFinalStatus;
                                
                                const showFlipkartDownload = isFlipkart && hasLabel && !isFinalStatus;
                                const showZeptoDownload = false;

                                const showBlinkitAppointmentBtn = (isBlinkit || isFlipkart) && hasLabel && !isFinalStatus;
                                const showFlipkartAppointmentBtn = isFlipkart && hasLabel && !hasAppointmentId && !isFinalStatus;
                                const isAmazon = so.channel.toLowerCase().includes('amazon');
                                const eeStatusLower = so.originalEeStatus.toLowerCase().trim();
                                const isAmazonFbaYeio = (so.channel.toLowerCase().includes('amazon_fba') || so.channel.toLowerCase().includes('amazon fba')) && 
                                                        (so.storeCode.toUpperCase() === 'YEIO');
                                const canInvoice = !isAmazonFbaYeio && !so.invoiceNumber && eeStatusLower !== 'open' && (eeStatusLower === 'confirmed' || so.status === 'Batch Created');

                                const showAmazonBoxDetails = isAmazon && !isFinalStatus && (
                                    (so.status === 'Invoiced' || so.status === 'Label Generated' || so.status === 'Shipped' || so.status === 'Delivered') ||
                                    (eeStatusLower === 'confirmed' && canInvoice)
                                );

                                const showApptMissing = (isZepto || isInstamart || isBlinkit || isFlipkartMinutes || isBB || isRBL) && !so.appointmentDate && (so.status === 'Shipped' || so.status === 'Invoiced' || so.status === 'Label Generated');
                                const canUpdateAppt = (isZepto || isInstamart || isBB || isRBL) && (so.status === 'Shipped' || so.status === 'Invoiced' || so.status === 'Label Generated');

                                return (
                                    <Fragment key={so.id}>
                                        <tr 
                                            className={`border-b hover:bg-gray-50 cursor-pointer ${isExpanded ? 'bg-gray-50' : 'bg-white'} ${isGreyedOut ? 'opacity-50 grayscale-[0.5]' : ''}`} 
                                            onClick={() => setExpandedRowId(isExpanded ? null : so.id)}
                                            title={zeptoTooltip}
                                        >
                                            <td className="p-4 text-center sticky left-0 z-10 bg-inherit border-r border-gray-100 shadow-[2px_0_4px_rgba(0,0,0,0.02)]"><div className="text-gray-400 hover:text-partners-green">{isExpanded ? <ChevronDownIcon className="h-4 w-4" /> : <ChevronRightIcon className="h-4 w-4" />}</div></td>
                                            <td className="px-6 py-4 font-bold text-blue-600 whitespace-nowrap sticky left-12 z-10 bg-inherit border-r border-gray-100 shadow-[2px_0_4px_rgba(0,0,0,0.02)]">{so.id}</td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col gap-1">
                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase w-fit ${
                                                        so.status === 'Returned' ? 'bg-red-100 text-red-700' : 
                                                        so.status === 'RTO Initiated' ? 'bg-orange-100 text-orange-700 border border-orange-200' :
                                                        so.status === 'Delivered' ? 'bg-green-600 text-white shadow-sm' : 
                                                        so.status === 'Shipped' ? 'bg-emerald-100 text-emerald-700' : 
                                                        so.status === 'Label Generated' ? 'bg-amber-100 text-amber-700' : 
                                                        so.status === 'Box Data Upload Pending' ? 'bg-red-50 text-red-700 border border-red-100' : 
                                                        so.status === 'Invoiced' ? 'bg-orange-100 text-orange-700' : 
                                                        so.status === 'Awaiting Appointment Confirmation' ? 'bg-yellow-100 text-yellow-700' :
                                                        so.status === 'Create ASN' ? 'bg-green-100 text-green-700' :
                                                        so.status === 'Batch Created' ? 'bg-purple-100 text-purple-700' :
                                                        so.status === 'Confirmed' ? 'bg-blue-100 text-blue-700' :
                                                        'bg-gray-100 text-gray-700'
                                                    }`}>
                                                        {so.status}
                                                    </span>
                                                    {showApptMissing && (
                                                        <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-red-50 text-red-600 border border-red-100 w-fit flex items-center gap-1 animate-pulse">
                                                            <div className="h-1 w-1 rounded-full bg-red-600"></div>
                                                            Appt. Missing
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 font-medium text-gray-800">{so.channel}</td>
                                            <td className="px-6 py-4">{so.storeCode}</td>
                                            <td className="px-6 py-4 font-medium text-gray-900">{so.qty} / ₹{totalAmountIncTax.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-gray-400">{so.orderDate}</td>
                                            <td className="px-6 py-4 text-center sticky right-0 z-10 bg-inherit border-l border-gray-100 shadow-[-2px_0_4px_rgba(0,0,0,0.02)]" onClick={(e: any) => e.stopPropagation()}>
                                                <div className="flex items-center justify-center gap-2">
                                                    {showFlipkartDownload && (
                                                        <button 
                                                            onClick={(e: any) => { e.stopPropagation(); handleDownloadFlipkartPackingSlip(so); }}
                                                            className="px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all shadow-sm active:scale-95 whitespace-nowrap bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 flex items-center gap-1.5"
                                                            title="Download Flipkart Minutes CSV Packing Slip"
                                                        >
                                                            <DownloadIcon className="h-3.5 w-3.5" /> Packing Slip
                                                        </button>
                                                    )}
                                                    {showZeptoDownload && (
                                                        <button 
                                                            onClick={(e: any) => { e.stopPropagation(); }}
                                                            className="px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all shadow-sm active:scale-95 whitespace-nowrap bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 flex items-center gap-1.5"
                                                            title="Download Zepto ASN CSV"
                                                        >
                                                            <DownloadIcon className="h-3.5 w-3.5" /> ASN CSV
                                                        </button>
                                                    )}
                                                    {showBlinkitAppointmentBtn && (
                                                        <button 
                                                            onClick={(e: any) => { 
                                                                e.stopPropagation(); 
                                                                if (isFlipkart) setFlipkartConsignmentModal({ isOpen: true, so });
                                                                else if (hasAppointmentId) setActiveAppointmentPass(so);
                                                                else setPortalHelper({ isOpen: true, so });
                                                            }}
                                                            className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all shadow-sm active:scale-95 whitespace-nowrap flex items-center gap-1.5 ${isFlipkart ? 'bg-blue-600 text-white hover:bg-blue-700' : (hasAppointmentId ? 'bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100' : 'bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100')}`}
                                                        >
                                                            {isFlipkart ? <GlobeIcon className="h-3.5 w-3.5" /> : (hasAppointmentId ? <PrinterIcon className="h-3.5 w-3.5" /> : <PlusIcon className="h-3.5 w-3.5" />)}
                                                            {isFlipkart ? 'Link Consignment' : (hasAppointmentId ? 'Print Appt Pass' : 'Take Appointment')}
                                                        </button>
                                                    )}
                                                    {showFlipkartAppointmentBtn && (
                                                        <button 
                                                            onClick={(e: any) => { e.stopPropagation(); setFlipkartConsignmentModal({ isOpen: true, so }); }}
                                                            className="px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all shadow-sm active:scale-95 whitespace-nowrap bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-1.5"
                                                        >
                                                            <GlobeIcon className="h-3.5 w-3.5" /> Link Consignment
                                                        </button>
                                                    )}
                                                    {showFlipkartPrintAction && (
                                                        <button 
                                                            onClick={(e: any) => { e.stopPropagation(); handlePrintFlipkartLabels(so); }}
                                                            className="px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all shadow-sm active:scale-95 whitespace-nowrap bg-partners-green text-white hover:bg-green-700 flex items-center gap-1.5"
                                                            title="Print Flipkart Box Labels"
                                                        >
                                                            <PrinterIcon className="h-3.5 w-3.5" /> Print Labels
                                                        </button>
                                                    )}
                                                     {showInstamartPrintAction && (
                                                        <button 
                                                            onClick={(e: any) => { e.stopPropagation(); setInstamartPrintPackModal({ isOpen: true, so }); }}
                                                            className="px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all shadow-sm active:scale-95 whitespace-nowrap bg-partners-green text-white hover:bg-green-700 flex items-center gap-1.5"
                                                            title="Print Instamart Box Labels"
                                                        >
                                                            <PrinterIcon className="h-3.5 w-3.5" /> Print Labels
                                                        </button>
                                                    )}
                                                    {showAmazonBoxDetails && (
                                                        <button 
                                                            onClick={(e: any) => { e.stopPropagation(); handleFetchBoxDetails(so); }}
                                                            disabled={isFetchingBoxDetails === so.id}
                                                            className="px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all shadow-sm active:scale-95 whitespace-nowrap bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                                                        >
                                                            {isFetchingBoxDetails === so.id ? <RefreshIcon className="h-3.5 w-3.5 animate-spin" /> : <CubeIcon className="h-3.5 w-3.5" />}
                                                            {isFetchingBoxDetails === so.id ? 'Fetching...' : 'Box Details'}
                                                        </button>
                                                    )}
                                                    <button onClick={(e: any) => { e.stopPropagation(); action.onClick?.(); }} disabled={action.disabled} className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all shadow-sm active:scale-95 whitespace-nowrap ${action.color} ${action.disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>{action.label}</button>
                                                    <div 
                                                        className="text-gray-400 hover:text-gray-600 p-1 relative cursor-pointer"
                                                        onClick={(e: any) => {
                                                            e.stopPropagation();
                                                            setOpenMenuId(openMenuId === so.id ? null : so.id);
                                                        }}
                                                    >
                                                        <DotsVerticalIcon className="h-4 w-4" />
                                                        {openMenuId === so.id && (
                                                            <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-xl border border-gray-100 py-2 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                                                                {canUpdateAppt && (
                                                                    <button 
                                                                        onClick={(e: any) => {
                                                                            e.stopPropagation();
                                                                            setInstamartApptModal({ isOpen: true, so });
                                                                            setOpenMenuId(null);
                                                                        }}
                                                                        className="w-full px-4 py-2.5 text-left text-[11px] font-bold text-partners-green hover:bg-partners-light-green flex items-center gap-2 transition-colors"
                                                                    >
                                                                        <CalendarIcon className="h-3.5 w-3.5" />
                                                                        Update Appointment
                                                                    </button>
                                                                )}
                                                                {so.status === 'Shipped' && (
                                                                    <button 
                                                                        onClick={(e: any) => {
                                                                            e.stopPropagation();
                                                                            handleMarkAsRTOInitiated(so);
                                                                        }}
                                                                        disabled={isUpdatingRTO === so.id}
                                                                        className="w-full px-4 py-2.5 text-left text-[11px] font-bold text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors disabled:opacity-50"
                                                                    >
                                                                        {isUpdatingRTO === so.id ? <RefreshIcon className="h-3.5 w-3.5 animate-spin" /> : <XCircleIcon className="h-3.5 w-3.5" />}
                                                                        Mark as RTO Initiated
                                                                    </button>
                                                                )}
                                                                <div className="px-4 py-2 text-[9px] font-bold text-gray-400 uppercase tracking-widest bg-gray-50/50 border-t border-gray-50 mt-1">More Actions Coming Soon</div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>

                                        {isExpanded && (
                                            <tr className="bg-gray-50">
                                                <td colSpan={8} className="px-4 py-8 sm:px-12">
                                                    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-8">
                                                        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 items-start">
                                                            <div>
                                                                <div className="flex justify-between items-center mb-4">
                                                                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2"><CalendarIcon className="h-4 w-4 text-blue-500" /> Fulfillment Ref</h4>
                                                                    <button 
                                                                        onClick={() => refreshSingleSOState(so.poReference)}
                                                                        disabled={isRefreshing}
                                                                        className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-100 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50"
                                                                    >
                                                                        <RefreshIcon className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                                                                        {isRefreshing ? 'Refreshing...' : 'Refresh Targeted'}
                                                                    </button>
                                                                </div>
                                                                <div className="grid grid-cols-2 md:grid-cols-6 gap-4 p-4 bg-gray-50 rounded-lg border border-gray-100">
                                    <div><p className="text-[10px] uppercase font-bold text-gray-400">Order Ref</p><p className="text-xs font-bold text-partners-green truncate">{so.poReference}</p></div>
                                    <div><p className="text-[10px] uppercase font-bold text-gray-400">Order Date</p><p className="text-xs font-bold text-gray-700">{so.orderDate || 'N/A'}</p></div>
                                    <div><p className="text-[10px] uppercase font-bold text-gray-400">Shipping Chg</p><p className="text-xs font-bold text-gray-900">{so.shippingCharge ? `₹${so.shippingCharge}` : 'N/A'}</p></div>
                                    <div><p className="text-[10px] uppercase font-bold text-gray-400">EasyEcom Cust ID</p><p className={`text-xs font-bold ${so.eeCustomerId ? 'text-blue-600' : 'text-red-500 italic'}`}>{so.eeCustomerId || 'Not Mapped'}</p></div>
                                    <div><p className="text-[10px] uppercase font-bold text-gray-400">Expiry Date</p><p className="text-xs font-bold text-red-600">{so.poExpiryDate || 'N/A'}</p></div>
                                    <div><p className="text-[10px] uppercase font-bold text-gray-400">Order PDF</p>{so.poPdfUrl ? <a href={so.poPdfUrl} target="_blank" rel="noopener noreferrer" className="text-partners-green hover:underline flex items-center gap-1 text-xs font-bold mt-0.5"><PaperclipIcon className="h-3 w-3" /> View Order PDF</a> : <p className="text-xs text-gray-300 font-bold italic mt-0.5">Not Uploaded</p>}</div>
                                </div>                                                      </div>
                                                            </div>
                                                            <div className="lg:col-span-1">
                                                                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2"><InvoiceIcon className="h-4 w-4 text-partners-purple" /> Invoice Information</h4>
                                                                <div className={`grid grid-cols-2 gap-x-4 gap-y-3 p-4 rounded-lg border min-h-[140px] transition-all ${so.invoiceNumber ? 'bg-purple-50 border-purple-100' : 'bg-gray-50 border-gray-200'}`}>
                                                                    {so.invoiceNumber ? <>
                                                                        <div className="col-span-2"><p className="text-[10px] uppercase font-bold text-purple-400">Invoice ID</p><p className="text-xs font-bold text-purple-700 font-mono truncate" title={so.invoiceId}>{so.invoiceId || 'N/A'}</p></div>
                                                                        <div><p className="text-[10px] uppercase font-bold text-purple-400">Invoice Number</p><p className="text-xs font-bold text-purple-700">{so.invoiceNumber || 'N/A'}</p></div>
                                                                        <div><p className="text-[10px] uppercase font-bold text-purple-400">Status</p><p className="text-xs font-bold text-purple-700">{so.invoiceStatus || 'N/A'}</p></div>
                                                                        <div><p className="text-[10px] uppercase font-bold text-purple-400">Total (Inc. Tax)</p><p className="text-xs font-bold text-purple-700">₹{so.invoiceTotal?.toLocaleString('en-IN') || '0'}</p></div>
                                                                        <div><p className="text-[10px] uppercase font-bold text-purple-400">Link</p>{so.invoicePdfUrl ? <a href={so.invoicePdfUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-1 text-xs font-bold">View PDF <ExternalLinkIcon className="h-3 w-3" /></a> : <p className="text-xs text-purple-300 font-bold italic">No URL</p>}</div>
                                                                    </> : (
                                                                        <div className="col-span-2 flex flex-col items-center justify-center py-4 text-center">
                                                                            <InvoiceIcon className="h-8 w-8 text-purple-200 mb-2" />
                                                                            <p className="text-xs font-bold text-purple-400 uppercase">No Invoice Generated</p>
                                                                            {(!so.invoiceNumber && so.originalEeStatus.toLowerCase().trim() !== 'open' && (so.originalEeStatus.toLowerCase().trim() === 'confirmed' || so.status === 'Batch Created') && !((so.channel.toLowerCase().includes('amazon_fba') || so.channel.toLowerCase().includes('amazon fba')) && (so.storeCode.toUpperCase() === 'YEIO'))) ? (
                                                                                <button onClick={() => handleCreateZohoInvoiceAction(so.id, so.poReference, so)} disabled={!!isCreatingInvoice} className="mt-4 px-4 py-2 bg-purple-600 text-white text-[11px] font-bold rounded-lg shadow-sm hover:bg-purple-700 flex items-center gap-2 transition-all active:scale-95">{isCreatingInvoice === so.id ? <RefreshIcon className="h-3 w-3 animate-spin" /> : <PlusIcon className="h-3 w-3" />}{isCreatingInvoice === so.id ? 'Creating...' : 'Create Zoho Invoice'}</button>
                                                                            ) : (<p className="mt-3 text-[10px] text-gray-400 italic bg-gray-100 px-3 py-1 rounded-full border border-gray-200">
                                                                                {((so.channel.toLowerCase().includes('amazon_fba') || so.channel.toLowerCase().includes('amazon fba')) && (so.storeCode.toUpperCase() === 'YEIO')) 
                                                                                    ? 'Invoicing not required for this store' 
                                                                                    : (so.originalEeStatus.toLowerCase().trim() === 'open' ? 'Awaiting Confirmation (Status: Open)' : 'Pending Picking/Batching in EasyEcom')}
                                                                            </p>)}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <div className="lg:col-span-2">
                                                                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2"><TruckIcon className="h-4 w-4 text-partners-green" /> Logistics Timeline</h4>
                                                                <div className="flex px-4 pt-2 overflow-x-auto pb-4 gap-2">
                                                                    <TimelineStep label="Batch Created" date={so.batchCreatedAt} icon={<CubeIcon className="h-4 w-4" />} />
                                                                    <TimelineStep label="Invoiced" date={so.invoiceDate} icon={<InvoiceIcon className="h-4 w-4" />} />
                                                                    {isZepto && <TimelineStep label="Appt. Requested" date={so.appointmentRequestTimestamp || so.appointmentRequestDate} icon={<SendIcon className="h-4 w-4" />} />}
                                                                    <TimelineStep label="Shipped" date={so.manifestDate} icon={<CheckCircleIcon className="h-4 w-4" />} />
                                                                    <TimelineStep label="Out for Delivery" date={so.latestStatus === 'Out for Delivery' ? so.latestStatusDate : undefined} icon={<TruckIcon className="h-4 w-4" />} />
                                                                    <TimelineStep label="Delivered" date={so.deliveredDate || (so.status === 'Delivered' ? so.latestStatusDate : undefined)} icon={<CheckCircleIcon className="h-4 w-4" />} isLast />
                                                                </div>
                                                                {so.awb && (
                                                                    <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4 bg-emerald-50 border border-emerald-100 rounded-xl shadow-sm">
                                                                        <div>
                                                                            <p className="text-[10px] uppercase font-bold text-emerald-400">Latest Status</p>
                                                                            <p className="text-xs font-bold text-emerald-700">{so.latestStatus || 'In Transit'}</p>
                                                                        </div>
                                                                        <div>
                                                                            <p className="text-[10px] uppercase font-bold text-emerald-400">Status Date</p>
                                                                            <p className="text-xs font-bold text-emerald-700">{so.latestStatusDate || 'N/A'}</p>
                                                                        </div>
                                                                        <div>
                                                                            <p className="text-[10px] uppercase font-bold text-emerald-400">Current Location</p>
                                                                            <p className="text-xs font-bold text-emerald-700">{so.currentLocation || 'N/A'}</p>
                                                                        </div>
                                                                        <div>
                                                                            <p className="text-[10px] uppercase font-bold text-emerald-400">Tracking URL</p>
                                                                            {so.trackingUrl ? (
                                                                                <a href={so.trackingUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-1 text-xs font-bold">
                                                                                    Track Shipment <ExternalLinkIcon className="h-3 w-3" />
                                                                                </a>
                                                                            ) : <p className="text-xs text-emerald-300 font-bold italic">N/A</p>}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                                {so.appointmentRequestId && (
                                                                    <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded-lg">
                                                                        <p className="text-[10px] uppercase font-bold text-blue-400">Appointment Request ID</p>
                                                                        <p className="text-xs font-bold text-blue-700">{so.appointmentRequestId}</p>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="pt-6 border-t border-gray-100">
                                                            <div className="flex justify-between items-center mb-4">
                                                                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2"><GlobeIcon className="h-4 w-4 text-blue-600" /> Logistics & Shipment Status</h4>
                                                                <div className="flex items-center gap-3">
                                                                    {showFlipkartDownload && (
                                                                        <button 
                                                                            onClick={(e: any) => { e.stopPropagation(); handleDownloadFlipkartPackingSlip(so); }}
                                                                            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white text-[11px] font-bold rounded-lg shadow-md hover:bg-blue-700 transition-all active:scale-95"
                                                                        >
                                                                            <DownloadIcon className="h-4 w-4" /> Download Flipkart CSV Slip
                                                                        </button>
                                                                    )}
                                                                    {showZeptoDownload && (
                                                                        <button 
                                                                            onClick={(e: any) => { e.stopPropagation(); }}
                                                                            className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white text-[11px] font-bold rounded-lg shadow-md hover:bg-indigo-700 transition-all active:scale-95"
                                                                        >
                                                                            <DownloadIcon className="h-4 w-4" /> Download Zepto ASN CSV
                                                                        </button>
                                                                    )}
                                                                    {showBlinkitAppointmentBtn && (
                                                                        <button 
                                                                            onClick={(e: any) => { 
                                                                                e.stopPropagation(); 
                                                                                if (hasAppointmentId) setActiveAppointmentPass(so);
                                                                                else setPortalHelper({ isOpen: true, so });
                                                                            }}
                                                                            className={`px-6 py-2 text-[11px] font-bold rounded-lg shadow-md transition-all active:scale-95 flex items-center gap-2 ${hasAppointmentId ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
                                                                        >
                                                                            {hasAppointmentId ? <PrinterIcon className="h-4 w-4" /> : <PlusIcon className="h-4 w-4" />}
                                                                            {hasAppointmentId ? 'Print Appointment Pass' : 'Generate Appointment Pass'}
                                                                        </button>
                                                                    )}
                                                                    {showFlipkartAppointmentBtn && (
                                                                        <button 
                                                                            onClick={(e: any) => { e.stopPropagation(); setFlipkartConsignmentModal({ isOpen: true, so }); }}
                                                                            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white text-[11px] font-bold rounded-lg shadow-md hover:bg-blue-700 transition-all active:scale-95"
                                                                        >
                                                                            <GlobeIcon className="h-4 w-4" /> Link Consignment Details
                                                                        </button>
                                                                    )}
                                                                    {isFlipkart && hasAppointmentId && (
                                                                         <button 
                                                                            onClick={(e: any) => { e.stopPropagation(); handlePrintFlipkartLabels(so); }}
                                                                            className="flex items-center gap-2 px-6 py-2 bg-partners-green text-white text-[11px] font-bold rounded-lg shadow-md hover:bg-green-700 transition-all active:scale-95"
                                                                        >
                                                                            <PrinterIcon className="h-4 w-4" /> Print Box Labels
                                                                        </button>
                                                                    )}
                                                                    {(so.channel.toLowerCase().includes('instamart') && so.boxCount > 0) && (
                                                                        <div className="flex gap-2">
                                                                            <button 
                                                                                onClick={(e: any) => { e.stopPropagation(); setInstamartPrintPackModal({ isOpen: true, so }); }}
                                                                                className="flex items-center gap-2 px-6 py-2 bg-partners-green text-white text-[11px] font-bold rounded-lg shadow-md hover:bg-green-700 transition-all active:scale-95 animate-in fade-in zoom-in-95"
                                                                            >
                                                                                <PrinterIcon className="h-4 w-4" /> Print Full Packset (PDF)
                                                                            </button>
                                                                        </div>
                                                                    )}
                                                                    {(so.invoiceNumber && !so.awb) && (
                                                                        <div className="flex flex-col items-center gap-1">
                                                                            <button 
                                                                                onClick={() => {
                                                                                    if (so.boxCount === 0 && !isFlipkart) { // Flipkart handles boxes differently via consignment
                                                                                        addNotification('Please update box count first.', 'warning');
                                                                                        return;
                                                                                    }
                                                                                    if (so.channel.toLowerCase().includes('instamart')) {
                                                                                        setShippingConfirm({ isOpen: true, so });
                                                                                    } else {
                                                                                        handlePushToNimbusAction(so.id, so.poReference);
                                                                                    }
                                                                                }} 
                                                                                disabled={!!isPushingNimbus || (so.boxCount === 0 && !isFlipkart) || ((so.invoiceTotal || 0) >= 50000 && !so.ewb) || (so.channel.toLowerCase().includes('amazon_fba') || so.channel.toLowerCase().includes('amazon fba'))} 
                                                                                className={`flex items-center gap-2 px-6 py-2 bg-blue-600 text-white text-[11px] font-bold rounded-lg shadow-md transition-all active:scale-95 disabled:bg-gray-300 disabled:shadow-none disabled:cursor-not-allowed`}
                                                                            >
                                                                                {isPushingNimbus === so.id ? <RefreshIcon className="h-3 w-3 animate-spin" /> : <SendIcon className="h-3 w-3" />}
                                                                                {(so.channel.toLowerCase().includes('amazon_fba') || so.channel.toLowerCase().includes('amazon fba')) ? 'FBA Fulfillment' : (isPushingNimbus === so.id ? 'Shipping...' : ((so.boxCount === 0 && !isFlipkart) ? 'Box Data Pending' : 'Ship with Nimbus Post'))}
                                                                            </button>
                                                                            {((so.invoiceTotal || 0) >= 50000 && !so.ewb) && (
                                                                                <p className="text-[10px] text-red-600 font-black animate-pulse uppercase tracking-tighter">EWB Missing</p>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                                                                <div className={`p-4 rounded-xl border transition-all ${isFlipkart || so.boxCount > 0 ? 'bg-partners-light-green border-partners-green/20' : 'bg-red-50 border-red-100'}`}><p className="text-[10px] font-bold text-gray-400 uppercase mb-2">Package Detail</p><div className="flex items-center gap-2"><CubeIcon className={`h-5 w-5 ${isFlipkart || so.boxCount > 0 ? 'text-partners-green' : 'text-red-400'}`} /><div><p className="text-sm font-bold text-gray-800">Box Count</p><p className={`text-lg font-black ${isFlipkart || so.boxCount > 0 ? 'text-partners-green' : 'text-red-600'}`}>{isFlipkart ? (so.consignmentQty || 60) : (so.boxCount || 0)}</p></div></div></div>
                                                                
                                                                <div className="p-4 bg-partners-light-blue rounded-xl border border-blue-100 flex flex-col">
                                                                    <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest mb-3">{isFlipkart ? 'Consignment Details' : 'Appointment Details'}</p>
                                                                    <div className="flex-1 flex flex-col justify-between space-y-3">
                                                                        <div>
                                                                            <div className="flex items-center gap-2 mb-1">
                                                                                <CalendarIcon className="h-5 w-5 text-blue-600" />
                                                                                <p className="text-base font-black text-blue-800">{so.appointmentDate || so.appointmentRequestDate || 'TBD'}</p>
                                                                            </div>
                                                                            <p className="text-[9px] font-bold text-blue-400 uppercase tracking-tighter">
                                                                                {so.appointmentDate ? 'Confirmed' : so.appointmentRequestDate ? 'Requested' : 'No Slot Taken'}
                                                                            </p>
                                                                        </div>
                                                                        
                                                                        <div className="flex items-center gap-2">
                                                                            <ClockIcon className="h-4 w-4 text-blue-600" />
                                                                            <p className="text-sm font-bold text-blue-800">{formatDisplayTime(so.appointmentTime)}</p>
                                                                        </div>

                                                                        <div className="pt-2 border-t border-blue-100">
                                                                            <p className="text-[8px] font-bold text-blue-400 uppercase mb-0.5">{isFlipkart ? 'Consignment ID' : 'Appointment ID'}:</p>
                                                                            <p className="text-xs font-black text-blue-700 font-mono tracking-tight">{so.appointmentId || 'N/A'}</p>
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {so.awb ? <>
                                                                <div className="p-4 bg-blue-50 rounded-xl border border-blue-100 col-span-1 md:col-span-1"><div className="flex flex-col h-full justify-between"><div><p className="text-[10px] font-bold text-blue-400 uppercase">Carrier & AWB</p><p className="text-sm font-bold text-gray-900 truncate">{so.carrier || 'Pending'}</p><p className="text-xs font-mono text-blue-600 font-bold tracking-wider">{so.awb}</p></div><span className={`mt-2 w-fit px-2 py-0.5 rounded text-[10px] font-bold border ${so.trackingStatus?.toLowerCase() === 'delivered' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>{so.trackingStatus || 'In-Transit'}</span></div></div>
                                                                <div className="p-4 bg-gray-50 rounded-xl border border-gray-100"><p className="text-[10px] font-bold text-gray-400 uppercase mb-2">Delivery SLA</p><div className="space-y-3"><div><p className="text-[9px] font-bold text-gray-400">Exp Delivery Date</p><p className="text-sm font-bold text-partners-green">{so.edd || 'TBD'}</p></div><div><p className="text-[9px] font-bold text-gray-400">Delivered Date</p><p className="text-sm font-bold text-gray-800">{so.deliveredDate || '-'}</p></div></div></div>
                                                                <div className={`p-4 rounded-xl border ${so.status === 'Returned' ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-100'}`}><p className="text-[10px] font-bold text-gray-400 uppercase mb-2">Return Status (RTO)</p>{so.status === 'Returned' ? <div className="space-y-2"><p className="text-xs font-bold text-red-600">{so.rtoStatus || 'Returned'}</p><div><p className="text-[9px] font-bold text-gray-400">Return AWB</p><p className="text-xs font-mono font-bold text-red-600">{so.rtoAwb || 'N/A'}</p></div></div> : <div className="flex flex-col items-center justify-center py-2"><CheckCircleIcon className="h-6 w-6 text-gray-200" /><p className="text-[10px] font-bold text-gray-400 mt-1 uppercase">No Returns</p></div>}</div>
                                                            </> : <div className="md:col-span-3 p-12 border-2 border-dashed border-gray-100 rounded-2xl flex flex-col items-center justify-center text-center">{(!so.invoiceNumber && !(isAmazon && canInvoice)) ? <><LockClosedIcon className="h-8 w-8 text-gray-200 mb-3" /><p className="text-sm font-bold text-gray-400 uppercase">Logistics Pending Invoice Generation</p></> : (so.boxCount === 0 && !isFlipkart) ? <><div className="p-4 bg-red-50 rounded-xl border border-red-100 mb-3"><CubeIcon className="h-8 w-8 text-red-500 mx-auto mb-2" /><p className="text-sm font-bold text-red-600 uppercase">Missing Physical Box Data</p></div><p className="text-xs text-red-400">Update box count in the backend to enable shipping.</p></> : <><TruckIcon className="h-8 w-8 text-blue-200 mb-3" /><p className="text-sm font-bold text-blue-400 uppercase">{so.invoiceNumber ? 'Invoice Ready for Shipment' : 'Box Data Ready - Pending Invoice'}</p><p className="text-xs text-blue-300 mt-1">{so.invoiceNumber ? "Generate AWB by clicking the 'Ship with Nimbus' button above." : "Invoice generation is pending. Box details are confirmed."}</p></>}</div>}
                                                            </div>
                                                            {so.awb && (so.channel.toLowerCase().includes('blinkit') || so.channel.toLowerCase().includes('zepto') || so.channel.toLowerCase().includes('flipkart')) && so.status !== 'Shipped' && so.status !== 'Delivered' && so.status !== 'Returned' && (
                                                                <div className={`mt-4 border p-4 rounded-2xl flex flex-col sm:flex-row justify-between items-center gap-4 animate-in fade-in slide-in-from-top-2 ${so.channel.toLowerCase().includes('zepto') ? 'bg-partners-light-purple border-partners-purple/30' : so.channel.toLowerCase().includes('flipkart') ? 'bg-blue-50 border-blue-200/30' : 'bg-partners-light-yellow border-partners-yellow/30'}`}>
                                                                    <div className="flex items-center gap-3">
                                                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-lg ${so.channel.toLowerCase().includes('zepto') ? 'bg-purple-600' : so.channel.toLowerCase().includes('flipkart') ? 'bg-blue-600' : 'bg-yellow-400'}`}>
                                                                            <span className="font-black italic text-xl">{so.channel.toLowerCase().includes('zepto') ? 'z' : so.channel.toLowerCase().includes('flipkart') ? 'f' : 'b'}</span>
                                                                        </div>
                                                                        <div>
                                                                            <p className={`text-xs font-bold uppercase ${so.channel.toLowerCase().includes('zepto') ? 'text-purple-800' : so.channel.toLowerCase().includes('flipkart') ? 'text-blue-800' : 'text-yellow-800'}`}>{so.channel.toLowerCase().includes('zepto') ? 'Zepto Brands' : so.channel.toLowerCase().includes('flipkart') ? 'Flipkart Minutes' : 'Blinkit'} Portal Action Required</p>
                                                                            <p className={`text-[10px] font-medium ${so.channel.toLowerCase().includes('zepto') ? 'text-purple-600' : so.channel.toLowerCase().includes('flipkart') ? 'text-blue-600' : 'text-yellow-600'}`}>AWB assigned. Generate appointment pass before dispatching.</p>
                                                                        </div>
                                                                    </div>
                                                                    <button 
                                                                        onClick={(e: any) => { e.stopPropagation(); setPortalHelper({ isOpen: true, so }); }} 
                                                                        className={`px-6 py-2.5 text-white text-[11px] font-bold rounded-xl shadow-md transition-all flex items-center gap-2 ${so.channel.toLowerCase().includes('zepto') ? 'bg-purple-600 hover:bg-purple-700' : 'bg-yellow-50 hover:bg-yellow-600'}`}
                                                                    >
                                                                        <CalendarIcon className="h-4 w-4" />Get Appointment Details
                                                                    </button>
                                                                </div>
                                                            )}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div>
                                                            <div className="flex justify-between items-center mb-4">
                                                                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2"><DotsVerticalIcon className="h-4 w-4 text-partners-green rotate-90" /> SKU Breakdown</h4>
                                                            </div>
                                                            <div className="overflow-x-auto border rounded-xl"><table className="w-full text-[11px] text-left"><thead className="bg-gray-50 text-gray-500 uppercase"><tr><th className="py-2.5 px-4">Item Name / SKU</th><th className="py-2.5 text-right w-24">EE Item Qty</th><th className="py-2.5 text-right w-24 text-red-600">Cancelled</th><th className="py-2.5 text-right w-24 text-green-600">Shipped</th><th className="py-2.5 text-right w-24 text-orange-600">Returned</th><th className="py-2.5 px-4 text-center w-28">Item status</th></tr></thead><tbody className="divide-y divide-gray-100">{so.items.map((item, idx) => (<tr key={idx} className="hover:bg-gray-50"><td className="py-3 px-4"><p className="font-bold text-gray-800">{item.itemName}</p><p className="text-[10px] text-gray-400 font-mono">{item.masterSku || item.articleCode}</p></td><td className="py-3 text-right font-bold text-gray-900">{item.itemQuantity || 0}</td><td className="py-3 text-right text-red-600 font-bold">{item.cancelledQuantity || 0}</td><td className="py-3 text-right text-green-600 font-bold">{item.shippedQuantity || 0}</td><td className="py-3 text-right text-orange-600 font-bold">{item.returnedQuantity || 0}</td><td className="py-3 px-4 text-center"><span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase inline-block w-full ${item.itemStatus?.toLowerCase().includes('ship') ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{item.itemStatus || 'Processing'}</span></td></tr>))}</tbody></table></div>
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </Fragment>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const PortalHelperModal_ = PortalHelperModal;

export default SalesOrderTable;