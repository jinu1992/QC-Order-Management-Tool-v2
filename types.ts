
export type ViewType = 'Dashboard' | 'Quotations' | 'Purchase Orders' | 'File Uploader' | 'POC Verification' | 'Appointments' | 'Sales Orders' | 'GRN / POD' | 'Reports' | 'Finance' | 'Inventory' | 'Admin';

export enum POStatus {
    NewPO = 'New',
    WaitingForConfirmation = 'Waiting for Confirmation',
    ConfirmedToSend = 'Confirmed',
    BelowThreshold = 'Below Threshold',
    POCPending = 'POC Verification',
    AppointmentPending = 'Appointment to be taken',
    InTransit = 'In-Transit',
    Delivered = 'Delivered',
    GRNPending = 'GRN Pending',
    GRNUpdated = 'GRN Updated',
    RTO = 'RTO',
    Closed = 'Closed',
    Pushed = 'Pushed',
    PartiallyProcessed = 'Partially Processed',
    Cancelled = 'Cancelled'
}

export type PaymentStatus = 'Pending' | 'Partial' | 'Received' | 'Overdue';

export interface POItem {
    articleCode: string;
    qty: number;
    fulfillableQty?: number;
    masterSku?: string;
    itemName?: string;
    unitCost?: number;
    mrp?: number;
    priceCheckStatus?: string;
    eeOrderRefId?: string;
    eeReferenceCode?: string; 
    eeOrderDate?: string;
    itemStatus?: string;
    itemQuantity?: number;
    cancelledQuantity?: number;
    shippedQuantity?: number;
    returnedQuantity?: number;
    eeOrderStatus?: string;
    eeBatchCreatedAt?: string;
    eeInvoiceDate?: string;
    eeManifestDate?: string;
    invoiceId?: string;
    invoiceStatus?: string;
    invoiceNumber?: string;
    invoiceDate?: string;
    invoiceTotal?: number;
    invoiceUrl?: string;
    invoicePdfUrl?: string;
    eeBoxCount?: number;
    ewb?: string;
    fbaShipmentId?: string;
    inboundPlanId?: string;
    gst?: string;
    // Fulfillment specific tracking
    carrier?: string;
    awb?: string;
    bookedDate?: string;
    trackingUrl?: string;
    trackingStatus?: string;
    edd?: string;
    latestStatus?: string;
    latestStatusDate?: string;
    currentLocation?: string;
    deliveredDate?: string;
    rtoStatus?: string;
    rtoAwb?: string;
    freightCharged?: number;
    zohoItemId?: string;
}

export interface PurchaseOrder {
    id: string;
    poNumber: string;
    status: POStatus;
    channel: string;
    storeCode: string;
    qty: number;
    items?: POItem[];
    amount: number;
    orderDate: string;
    source?: 'Manual' | 'Email' | 'API';
    billDate?: string;
    invoiceId?: string;
    carrier?: string;
    awb?: string;
    dispatchDate?: string;
    boxes?: number;
    bookedDate?: string;
    trackingUrl?: string;
    appointmentDate?: string;
    grnDate?: string;
    latestTrackingStatus?: string;
    actionToBeTaken?: string;
    poPdfUrl?: string;
    podImageUrl?: string;
    pocPhoneNumber?: string;
    contactVerified: boolean;
    pocEmail?: string;
    appointmentRequestDate?: string;
    appointmentTime?: string;
    appointmentId?: string;
    qrCodeUrl?: string;
    followUpCount?: number;
    appointmentRemarks?: string;
    paymentStatus?: PaymentStatus;
    paymentDueDate?: string;
    amountReceived?: number;
    lastPaymentReminderDate?: string;
    paymentFollowUpCount?: number;
    poEdd?: string;
    poExpiryDate?: string;
    eeCustomerId?: string;
    zohoContactId?: string;
    eeReferenceCode?: string;
    eeOrderDate?: string;
    eeOrderId?: string;
    eeOrderStatus?: string;
    eeBatchCreatedAt?: string;
    eeInvoiceDate?: string;
    eeManifestDate?: string;
    trackingStatus?: string;
    edd?: string;
    latestStatus?: string;
    latestStatusDate?: string;
    currentLocation?: string;
    deliveredDate?: string;
    rtoStatus?: string;
    rtoAwb?: string;
    eeReferenceBoxCount?: number;
    ewb?: string;
    fbaShipmentId?: string;
    inboundPlanId?: string;
    gst?: string;
    freightCharged?: number;
    totalPoValue?: number;
    totalCostPrice?: number;
    // Fix: Added missing properties used in SalesOrderTable for Flipkart consignment handling
    consignmentQty?: number;
    consignmentProducts?: number;
    consignmentValue?: string;
}

export interface QuotationItem {
    estimateId: string;
    zohoItemId: string;
    sku: string;
    itemName: string;
    rate: number;
    quantity: number;
}

export interface Quotation {
    id: string;
    estimateId: string;
    customerId: string;
    customerName: string;
    date: string;
    quotationNumber: string;
    referenceNumber: string;
    amount: number;
    status: string;
    expiryDate?: string;
    items: QuotationItem[];
}

export interface User {
    id: string;
    name: string;
    email: string;
    contactNumber: string;
    role: Role;
    avatarInitials: string;
    password?: string;
    isInitialized?: boolean;
}

export interface Customer {
    id: string;
    customerCode: string;
    contactId: string;
    contactName: string;
    companyName: string;
    email: string;
    phone: string;
    gstNo: string;
    shippingAddressId: string;
    shippingAttention: string;
    shippingAddress: string;
    shippingStreet2: string;
    shippingCity: string;
    shippingStateCode: string;
    shippingState: string;
    shippingZip: string;
    shippingPhone: string;
    stateCode: string;
    stnCode: string;
}

export interface StorePocMapping {
    channel: string;
    storeCode: string;
    pocName: string;
    pocEmail: string;
    pocPhone?: string;
}

export interface UploadMetadata {
    id: string;
    functionName: string;
    lastUploadedBy: string;
    lastUploadedAt: string;
    status: 'Success' | 'Error' | 'Pending';
}

export type Role = 'Admin' | 'Key Account Manager' | 'Finance Manager' | 'Supply Chain Manager' | 'Limited Access';
export interface RolePermissions { [key: string]: ViewType[]; }
export interface ActivityLog { id: string; user: string; action: string; details: string; timestamp: string; }
export interface NotificationItem { id: string; message: string; timestamp: string; read: boolean; type: 'info' | 'success' | 'warning' | 'error'; }
export interface InventoryItem { id: string; channel: string; articleCode: string; sku: string; ean: string; itemName: string; mrp: number; basicPrice: number; spIncTax: number; stock: number; size: string; }
export interface ChannelConfig { 
  id: string; 
  channelName: string; 
  status: 'Active' | 'Inactive'; 
  sourceEmail: string; 
  searchKeyword: string; 
  minOrderThreshold: number; 
  pocName: string; 
  pocEmail: string; 
  pocPhone: string;
  appointmentTo?: string; // New: Comma separated emails
  appointmentCc?: string; // New: Comma separated emails
}
export type ReportTimeRange = '30_days' | 'last_month' | 'this_quarter' | 'ytd' | 'all';
