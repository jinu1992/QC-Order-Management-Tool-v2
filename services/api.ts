
import { InventoryItem, PurchaseOrder, POStatus, POItem, ChannelConfig, StorePocMapping, User, UploadMetadata, Quotation } from '../types';

/**
 * !!! IMPORTANT !!!
 * Ensure this URL matches your LATEST 'Anyone' deployment in GAS
 */
const API_URL = import.meta.env.VITE_GAS_API_URL;

/**
 * Shared helper for POST requests to Google Apps Script.
 */
const postToScript = async (payload: any) => {
    if (!API_URL || API_URL.includes('template-id')) {
        throw new Error("Backend API URL is not configured.");
    }

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            mode: 'cors',
            redirect: 'follow',
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`Network Error: Server returned ${response.status}`);
        }

        const text = await response.text();
        if (!text) {
            return { status: 'success', message: 'Operation completed (No body returned).' };
        }

        let result: any;
        try {
            result = JSON.parse(text);
        } catch (e) {
            if (text.toLowerCase().includes('success') || text.toLowerCase().includes('ok')) {
                return { status: 'success', message: text || 'Action completed successfully.' };
            }
            throw new Error(text || "Invalid response from server.");
        }

        const status = result.status || 'success';
        const message = result.message || result.error || result.msg || result.details || (status === 'success' ? 'Operation completed.' : 'Operation failed.');

        if (Array.isArray(result)) {
            return { status, message, data: result };
        }

        return {
            ...result,
            status,
            message
        };
    } catch (error: any) {
        if (error.message === 'Failed to fetch') {
            throw new Error("Cannot reach backend. Please ensure your script is deployed as a Web App with access 'Anyone'.");
        }
        throw error;
    }
};

export const loginWithGoogle = async (credentialToken: string): Promise<{ status: string, message?: string, user?: User }> => {
    try {
        const response = await fetch('/api/login-google', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ idToken: credentialToken })
        });

        if (!response.ok) {
            const errorData = await response.json();
            return {
                status: 'error',
                message: errorData.message || `Server Error: ${response.status}`
            };
        }

        return await response.json();
    } catch (error: any) {
        console.error("Login API Error:", error);
        return {
            status: 'error',
            message: 'Failed to connect to authentication server.'
        };
    }
};

export const fetchPackingData = async (referenceCode: string): Promise<any[]> => {
    try {
        const response = await fetch(`${API_URL}?action=getPackingData&referenceCode=${encodeURIComponent(referenceCode)}`, { redirect: 'follow' });
        const json = await response.json();
        return json.status === 'success' ? json.data : [];
    } catch (error) { return []; }
};

export const logFileUpload = async (functionId: string, userName: string, fileData?: string, fileName?: string): Promise<{ status: string, message?: string }> => {
    return await postToScript({ action: 'logFileUpload', functionId, userName, fileData, fileName });
};

export const processFlipkartConsignment = async (poNumber: string, fileText: string, userEmail: string): Promise<{ status: string, message?: string, details?: any }> => {
    return await postToScript({ action: 'processFlipkartConsignment', poNumber, fileText, userEmail });
};

export const createZohoInvoice = async (eeReferenceCode: string, shippingCharge?: number): Promise<{ status: string, message?: string }> => {
    return await postToScript({ action: 'createZohoInvoice', eeReferenceCode, shippingCharge });
};

export const pushToShippingPartner = async (eeReferenceCode: string): Promise<{ status: string, message?: string, awb?: string }> => {
    return await postToScript({ action: 'pushToShippingPartner', eeReferenceCode });
};

export const updateFBAShipmentId = async (poNumber: string, fbaShipmentId: string): Promise<{ status: string, message?: string }> => {
    return await postToScript({ action: 'updateFBAShipmentId', poNumber, fbaShipmentId });
};

export const fetchUploadMetadata = async (): Promise<UploadMetadata[]> => {
    try {
        const response = await fetch(`${API_URL}?action=getUploadMetadata`, { redirect: 'follow' });
        const json = await response.json();
        return json.status === 'success' ? json.data : [];
    } catch (error) { return []; }
};

export const fetchQuotations = async (): Promise<Quotation[]> => {
    try {
        const response = await fetch(`${API_URL}?action=getQuotations`, { redirect: 'follow' });
        const json = await response.json();
        if (json.status === 'success' && Array.isArray(json.data)) {
            const groups: Record<string, Quotation> = {};

            json.data.forEach((row: any) => {
                const estimateId = String(row['Estimate ID'] || '').trim();
                if (!estimateId) return;

                if (!groups[estimateId]) {
                    groups[estimateId] = {
                        id: estimateId,
                        estimateId: estimateId,
                        customerId: String(row['Customer ID'] || ''),
                        customerName: String(row['Customer Name'] || ''),
                        date: formatSheetDate(row['Quotation Date'] || row['Date']),
                        quotationNumber: String(row['Quote Number'] || row['Quotation Number'] || ''),
                        referenceNumber: String(row['Reference Number'] || ''),
                        amount: 0,
                        shippingCharges: parseFloat(row['Shipping Charges']) || 0,
                        taxAmount: parseFloat(row['Tax Amount']) || 0,
                        status: row['Status'] || 'Pending',
                        expiryDate: formatSheetDate(row['Expiry Date']) || '',
                        items: []
                    };
                }

                const rate = parseFloat(row['Rate']) || 0;
                const quantity = parseInt(row['Quantity']) || 0;
                const lineAmount = rate * quantity;

                groups[estimateId].amount += lineAmount;
                groups[estimateId].items.push({
                    estimateId: estimateId,
                    zohoItemId: String(row['Zoho Item ID'] || ''),
                    sku: String(row['SKU'] || ''),
                    itemName: String(row['Item Name'] || ''),
                    rate: rate,
                    quantity: quantity
                });
            });

            return Object.values(groups).sort((a, b) => {
                const dateA = new Date(a.date).getTime();
                const dateB = new Date(b.date).getTime();
                return dateB - dateA;
            });
        }
        return [];
    } catch (error) { return []; }
};

export const acceptQuotation = async (quotation: Quotation) => {
    return await postToScript({ action: 'SEND_AND_ACCEPT_ESTIMATE', ...quotation });
};

export const refreshQuotationsFromBackend = async () => {
    return await postToScript({ action: 'FETCH_LAST_14_DAYS_QUOTATIONS' });
};

export const fetchUsers = async (): Promise<User[]> => {
    try {
        const response = await fetch(`${API_URL}?action=getUsers`, { redirect: 'follow' });
        const json = await response.json();
        if (json.status === 'success' && Array.isArray(json.data)) {
            return json.data.map((row: any, index: number) => ({
                id: String(row['ID'] || index),
                name: row['Name'] || '',
                email: row['Email'] || '',
                contactNumber: String(row['Contact'] || ''),
                role: row['Role'] || 'Limited Access',
                avatarInitials: row['Avatar'] || (row['Name'] ? row['Name'].charAt(0) : 'U'),
                isInitialized: !!row['IsInitialized']
            }));
        }
        return [];
    } catch (error) { return []; }
};

export const saveUserToSheet = async (user: User) => {
    return await postToScript({ action: 'saveUser', ...user });
};

export const deleteUserFromSheet = async (userId: string) => {
    return await postToScript({ action: 'deleteUser', userId });
};

export const fetchInventoryFromSheet = async (): Promise<InventoryItem[]> => {
    try {
        const response = await fetch(`${API_URL}?action=getInventory`, { redirect: 'follow' });
        const json = await response.json();
        if (json.status === 'success') return transformSheetDataToInventory(json.data);
        return [];
    } catch (error) { return []; }
};

export const syncInventoryFromEasyEcom = async (): Promise<{ status: string, message?: string }> => {
    return await postToScript({ action: 'syncInventory' });
};

export const manualInventoryAllocation = async (): Promise<{ status: string, message?: string }> => {
    return await postToScript({ action: 'manual_sync_inventory_allocation' });
};

export const fetchPurchaseOrders = async (poNumber?: string): Promise<PurchaseOrder[]> => {
    try {
        const url = poNumber
            ? `${API_URL}?action=getPurchaseOrders&poNumber=${encodeURIComponent(poNumber)}`
            : `${API_URL}?action=getPurchaseOrders`;
        const response = await fetch(url, { redirect: 'follow' });
        const json = await response.json();
        if (json.status === 'success' && Array.isArray(json.data)) return transformSheetDataToPOs(json.data);
        return [];
    } catch (error) { return []; }
};

export const fetchPurchaseOrder = async (poNumber: string): Promise<PurchaseOrder | null> => {
    const orders = await fetchPurchaseOrders(poNumber);
    return orders.length > 0 ? orders[0] : null;
};

export const fetchStorePocMappings = async (): Promise<StorePocMapping[]> => {
    try {
        const response = await fetch(`${API_URL}?action=getStorePocMappings`, { redirect: 'follow' });
        const json = await response.json();
        return json.status === 'success' ? json.data : [];
    } catch (error) { return []; }
};

export const sendAppointmentEmail = async (params: any) => {
    return await postToScript({ action: 'sendAppointmentEmail', ...params });
};

export const fetchChannelConfigs = async (): Promise<ChannelConfig[]> => {
    try {
        const response = await fetch(`${API_URL}?action=getChannelConfigs`, { redirect: 'follow' });
        const json = await response.json();
        if (json.status === 'success' && Array.isArray(json.data)) return transformSheetDataToChannelConfigs(json.data);
        return [];
    } catch (error) { return []; }
};

export const fetchSystemConfig = async (): Promise<any> => {
    try {
        const response = await fetch(`${API_URL}?action=getSystemConfig`, { redirect: 'follow' });
        const json = await response.json();
        return json.status === 'success' ? json.data : {};
    } catch (error) { return {}; }
};

const transformSheetDataToInventory = (rows: any[]): InventoryItem[] => {
    return rows.map((row, index) => ({
        id: `inv-${index}-${Date.now()}`,
        channel: row['Channel'] || 'Unknown',
        articleCode: String(row['Channel Item Code'] || ''),
        sku: String(row['Master SKU'] || ''),
        ean: String(row['EAN'] || ''),
        itemName: row['Itemname'] || '',
        mrp: Number(row['MRP'] || 0),
        basicPrice: 0,
        spIncTax: Number(row['Selling Price'] || 0),
        stock: Number(row['Inventory'] || 0),
        size: String(row['Size'] || '')
    }));
};

const transformSheetDataToChannelConfigs = (rows: any[]): ChannelConfig[] => {
    return rows.map((row) => ({
        id: row['Channel Name'] || '',
        channelName: row['Channel Name'] || '',
        status: (row['Status'] as 'Active' | 'Inactive') || 'Active',
        sourceEmail: row['Source Email'] || '',
        searchKeyword: row['Search Keyword'] || '',
        minOrderThreshold: Number(row['Min Order Threshold'] || 0),
        pocName: row['POC Name'] || '',
        pocEmail: row['POC Email'] || '',
        pocPhone: row['POC Phone'] || '',
        appointmentTo: row['Appointment To'] || '',
        appointmentCc: row['Appointment Cc'] || ''
    }));
};

const formatSheetDate = (dateVal: any): string => {
    if (!dateVal) return '';
    if (typeof dateVal === 'string' && dateVal.length < 15 && !dateVal.includes('T')) return dateVal;
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return String(dateVal);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

const transformSheetDataToPOs = (rows: any[]): PurchaseOrder[] => {
    const poMap = new Map<string, PurchaseOrder>();
    rows.forEach((row) => {
        const poNumber = row['PO Number'];
        if (!poNumber) return;

        const rawStatus = row['Status'] || 'New';
        let status = POStatus.NewPO;
        if (rawStatus === 'Below Threshold') status = POStatus.BelowThreshold;
        else if (Object.values(POStatus).includes(rawStatus as POStatus)) status = rawStatus as POStatus;

        const qty = Number(row['Qty'] || 0);
        const unitCost = Number(row['Unit Cost (Tax Exclusive)'] || 0);
        const itemAmount = qty * unitCost;
        const articleCode = String(row['Item Code'] || '').trim();

        const item: POItem = {
            articleCode,
            masterSku: String(row['Master SKU'] || ''),
            itemName: row['Item Name'] || '',
            qty,
            fulfillableQty: Number(row['Fulfillable qty'] || 0),
            unitCost,
            mrp: Number(row['MRP'] || 0),
            priceCheckStatus: String(row['Price Check'] || '').trim(),
            itemStatus: String(row['EE_item_item_status'] || rawStatus),
            eeOrderRefId: row['EE Order Ref ID'] ? String(row['EE Order Ref ID']) : undefined,
            eeReferenceCode: row['EE_reference_code'] ? String(row['EE_reference_code']) : undefined,
            eeOrderDate: formatSheetDate(row['EE_order_date']),
            eeOrderStatus: row['EE_order_status'] ? String(row['EE_order_status']) : undefined,
            eeBatchCreatedAt: formatSheetDate(row['EE_batch_created_at']),
            eeInvoiceDate: formatSheetDate(row['EE_invoice_date']),
            eeManifestDate: formatSheetDate(row['EE_manifest_date']),
            invoiceId: row['Invoice Id'] ? String(row['Invoice Id']) : undefined,
            invoiceStatus: row['Invoice Status'] ? String(row['Invoice Status']) : undefined,
            invoiceNumber: row['Invoice Number'] ? String(row['Invoice Number']) : undefined,
            invoiceDate: formatSheetDate(row['Invoice Date']),
            invoiceTotal: Number(row['Invoice Total'] || 0),
            invoiceUrl: row['Invoice Url'] ? String(row['Invoice Url']) : undefined,
            invoicePdfUrl: row['Invoice PDF Url'] ? String(row['Invoice PDF Url']) : undefined,
            eeBoxCount: Number(row['Box Data'] || 0),
            itemQuantity: Number(row['EE_item_item_quantity'] || 0),
            cancelledQuantity: Number(row['EE_item_cancelled_quantity'] || 0),
            shippedQuantity: Number(row['EE_item_shipped_quantity'] || 0),
            returnedQuantity: Number(row['EE_item_returned_quantity'] || 0),
            ewb: row['EWB'] ? String(row['EWB']) : undefined,
            fbaShipmentId: row['FBA Shipment IDs'] ? String(row['FBA Shipment IDs']) : undefined,
            inboundPlanId: row['Inbound Plan ID'] ? String(row['Inbound Plan ID']) : undefined,
            gst: row['GST'] ? String(row['GST']) : undefined,
            carrier: row['Carrier'] ? String(row['Carrier']) : undefined,
            awb: row['AWB'] ? String(row['AWB']) : undefined,
            bookedDate: formatSheetDate(row['Booked Date']),
            trackingUrl: row['Tracking URL'] ? String(row['Tracking URL']) : undefined,
            trackingStatus: row['Tracking Status'] ? String(row['Tracking Status']) : undefined,
            edd: formatSheetDate(row['EDD']),
            latestStatus: row['Latest Status'] ? String(row['Latest Status']) : undefined,
            latestStatusDate: formatSheetDate(row['Latest Status Date']),
            currentLocation: row['Current Location'] ? String(row['Current Location']) : undefined,
            deliveredDate: formatSheetDate(row['Delivered Date']),
            rtoStatus: row['RTO Status'] ? String(row['RTO Status']) : undefined,
            rtoAwb: row['RTO AWB'] ? String(row['RTO AWB']) : undefined,
            freightCharged: Number(row['Freight Charged'] || 0),
            zohoItemId: row['Zoho Item ID'] ? String(row['Zoho Item ID']) : undefined,
            appointmentRequestId: row['Appointment Request ID'] ? String(row['Appointment Request ID']) : undefined,
            appointmentRequestDate: formatSheetDate(row['Appointment Request Date']),
            appointmentRequestTimestamp: formatSheetDate(row['Appointment Request Timestamp']),
            appointmentDate: formatSheetDate(row['Appointment Date']),
            appointmentId: row['Appointment ID'] ? String(row['Appointment ID']) : undefined,
            pickupDate: formatSheetDate(row['Pickup Date']),
            labelUrl: row['Label URL'] ? String(row['Label URL']) : undefined,
        };

        if (poMap.has(poNumber)) {
            const po = poMap.get(poNumber)!;
            po.items?.push(item);
            po.qty += qty;
            po.amount += itemAmount;
            // Update metadata if item row has newer information
            if (!po.poPdfUrl && row['PO PDF']) po.poPdfUrl = String(row['PO PDF']);
            if (po.poExpiryDate === 'N/A' && row['PO Expiry Date']) po.poExpiryDate = formatSheetDate(row['PO Expiry Date']);
            if (!po.eeReferenceCode && row['EE_reference_code']) po.eeReferenceCode = String(row['EE_reference_code']);
            if (!po.appointmentRequestId && row['Appointment Request ID']) po.appointmentRequestId = String(row['Appointment Request ID']);
            if (!po.appointmentRequestDate && row['Appointment Request Date']) po.appointmentRequestDate = formatSheetDate(row['Appointment Request Date']);
            if (!po.appointmentRequestTimestamp && row['Appointment Request Timestamp']) po.appointmentRequestTimestamp = String(row['Appointment Request Timestamp']);
            if (!po.appointmentDate && row['Appointment Date']) po.appointmentDate = formatSheetDate(row['Appointment Date']);
            if (!po.appointmentId && row['Appointment ID']) po.appointmentId = String(row['Appointment ID']);
            if (!po.qrCodeUrl && row['QR Code URL']) po.qrCodeUrl = String(row['QR Code URL']);
            if (!po.fbaShipmentId && row['FBA Shipment IDs']) po.fbaShipmentId = String(row['FBA Shipment IDs']);
            if (po.consignmentQty === undefined && row['Consignment Qty']) po.consignmentQty = Number(row['Consignment Qty']);
            if (po.consignmentProducts === undefined && row['Consignment Products']) po.consignmentProducts = Number(row['Consignment Products']);
            if (!po.consignmentValue && row['Consignment Value']) po.consignmentValue = String(row['Consignment Value']);
            if (!po.pickupDate && row['Pickup Date']) po.pickupDate = formatSheetDate(row['Pickup Date']);
            if (!po.labelUrl && row['Label URL']) po.labelUrl = String(row['Label URL']);
            if (!po.orderNotes && row['Order Notes']) po.orderNotes = String(row['Order Notes']);
        } else {
            poMap.set(poNumber, {
                id: poNumber, poNumber, status,
                channel: row['Channel Name'] || 'Unknown',
                storeCode: row['Store Code'] || '',
                qty, amount: itemAmount,
                orderDate: formatSheetDate(row['PO Date']),
                poEdd: formatSheetDate(row['PO EDD']),
                poExpiryDate: formatSheetDate(row['PO Expiry Date']) || 'N/A',
                poPdfUrl: row['PO PDF'] ? String(row['PO PDF']) : undefined,
                eeCustomerId: row['EE Customer ID'] ? String(row['EE Customer ID']) : undefined,
                zohoContactId: row['Zoho Contact ID'] ? String(row['Zoho Contact ID']) : undefined,
                eeReferenceCode: row['EE_reference_code'] ? String(row['EE_reference_code']) : undefined,
                items: [item],
                appointmentDate: formatSheetDate(row['Appointment Date']),
                appointmentRequestDate: formatSheetDate(row['Appointment Request Date']),
                appointmentRequestId: row['Appointment Request ID'] ? String(row['Appointment Request ID']) : undefined,
                appointmentRequestTimestamp: row['Appointment Request Timestamp'] ? String(row['Appointment Request Timestamp']) : undefined,
                appointmentTime: row['Appointment Time'] ? String(row['Appointment Time']) : undefined,
                appointmentId: row['Appointment ID'] ? String(row['Appointment ID']) : undefined,
                qrCodeUrl: row['QR Code URL'] ? String(row['QR Code URL']) : undefined,
                contactVerified: !!row['Contact Verified'] || false,
                fbaShipmentId: row['FBA Shipment IDs'] ? String(row['FBA Shipment IDs']) : undefined,
                // Fix: Extracting consignment properties from sheet columns if they exist
                consignmentQty: row['Consignment Qty'] ? Number(row['Consignment Qty']) : undefined,
                consignmentProducts: row['Consignment Products'] ? Number(row['Consignment Products']) : undefined,
                consignmentValue: row['Consignment Value'] ? String(row['Consignment Value']) : undefined,
                shippingCharge: row['Shipping Charge'] ? Number(row['Shipping Charge']) : undefined,
                pickupDate: formatSheetDate(row['Pickup Date']),
                labelUrl: row['Label URL'] ? String(row['Label URL']) : undefined,
                orderNotes: row['Order Notes'] ? String(row['Order Notes']) : undefined,
            });
        }
    });
    return Array.from(poMap.values());
};

export const updateRTOStatus = async (eeReferenceCode: string, rtoStatus: string) => {
    return await postToScript({ action: 'updateRTOStatus', eeReferenceCode, rtoStatus });
};

export const saveOrderNote = async (poNumber: string, note: string, userName: string) => {
    return await postToScript({ action: 'addOrderNote', poNumber, note, userName });
};

export const createInventoryItem = async (item: Partial<InventoryItem>) => {
    return await postToScript({ action: 'createItem', ...item });
};

export const updateInventoryPrice = async (channel: string, articleCode: string, newPrice: number) => {
    return await postToScript({ action: 'updatePrice', channel, articleCode, newPrice });
};

export const saveChannelConfig = async (config: ChannelConfig) => {
    return await postToScript({ action: 'saveChannelConfig', ...config });
};

export const saveSystemConfig = async (config: any) => {
    return await postToScript({ action: 'saveSystemConfig', ...config });
};

export const syncZohoContacts = async () => {
    return await postToScript({ action: 'syncZohoContacts' });
};

export const syncSinglePO = async (poNumber: string) => {
    return await postToScript({ action: 'syncSinglePO', poNumber });
};

export const syncEasyEcomShipments = async () => {
    return await postToScript({ action: 'syncEasyEcomShipments' });
};

export const requestZohoSync = async (contactId: string) => {
    return await postToScript({ action: 'syncZohoContactToEasyEcom', contactId });
};

export const updatePOStatus = async (poNumber: string, status: string) => {
    return await postToScript({ action: 'updatePOStatus', poNumber, status });
};

export const cancelPOLineItem = async (poNumber: string, articleCode: string) => {
    return await postToScript({ action: 'cancelLineItem', poNumber, articleCode });
};

export const sendZeptoAppointmentRequestEmail = async (params: any) => {
    return await postToScript({ action: 'sendZeptoAppointmentRequestEmail', channelName: 'Zepto', ...params });
};

export const sendInstamartAppointmentRequestEmail = async (params: any) => {
    return await postToScript({ action: 'sendInstamartAppointmentRequestEmail', channelName: 'Instamart', ...params });
};

export const sendBBAppointmentRequestEmail = async (params: any) => {
    return await postToScript({ action: 'sendBBAppointmentRequestEmail', channelName: 'BB', ...params });
};

export const sendBBOrderConfirmationEmail = async (params: { poNumbers: string[] | string }) => {
    return await postToScript({ action: 'sendBBOrderConfirmationEmail', channelName: 'BB', ...params });
};

export const updateZeptoOrderStatus = async (poNumber: string, status: string) => {
    return await postToScript({ action: 'updateZeptoOrderStatus', poNumber, status });
};

export const updateZeptoAppointmentDetails = async (params: any) => {
    return await postToScript({ action: 'updateZeptoAppointmentDetails', ...params });
};

export const updateInstamartAppointmentDetails = async (params: any) => {
    return await postToScript({ action: 'updateInstamartAppointmentDetails', ...params });
};

export const updateZeptoASN = async (eeReferenceCode: string, asnNumber: string) => {
    return await postToScript({ action: 'updateZeptoASN', eeReferenceCode, asnNumber });
};

export const processBlinkitAppointmentPasses = async () => {
    return await postToScript({ action: 'processBlinkitAppointmentPasses' });
};

export const fetchBoxDetails = async (eeReferenceCode: string): Promise<{ status: string, message?: string, data?: any }> => {
    return await postToScript({ action: 'FETCH_BOX_DETAILS', eeReferenceCode });
};

export const pushToEasyEcom = async (po: PurchaseOrder, selectedArticleCodes: string[]) => {
    const itemsToSend = (po.items || [])
        .filter(item => selectedArticleCodes.includes(item.articleCode))
        .map(item => ({ ...item, unitCost: Number(((item.unitCost || 0) * 1.05).toFixed(2)) }));
    return await postToScript({
        action: 'pushToEasyEcom',
        ...po,
        items: itemsToSend,
        isPartial: po.items?.length !== itemsToSend.length,
        shippingCharge: po.shippingCharge
    });
};