
import { POStatus, type PurchaseOrder, type Customer, type User, type RolePermissions, type InventoryItem } from '../types';

// Helper to generate dynamic dates relative to today
const getDate = (offsetDays: number): string => {
    const date = new Date();
    date.setDate(date.getDate() - offsetDays);
    // Fix: 'digit' is not a valid value for year option, changed to 'numeric'
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

// Helper to get a future date
const getFutureDate = (offsetDays: number): string => {
    const date = new Date();
    date.setDate(date.getDate() + offsetDays);
    // Fix: 'digit' is not a valid value for year option, changed to 'numeric'
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

export const initialPurchaseOrders: PurchaseOrder[] = [];

export const initialCustomers: Customer[] = [];

// Empty initial users - will be fetched from API
export const initialUsers: User[] = [];

export const initialRolePermissions: RolePermissions = {
    'Admin': ['Dashboard', 'Quotations', 'Purchase Orders', 'File Uploader', 'POC Verification', 'Appointments', 'Sales Orders', 'GRN / POD', 'Reports', 'Finance', 'Inventory', 'Admin', 'Shipment Tracking', 'Dispatch Manager', 'Knowledge Base', 'Notifications'],
    'Key Account Manager': ['Dashboard', 'Quotations', 'Purchase Orders', 'File Uploader', 'POC Verification', 'Appointments', 'Sales Orders', 'GRN / POD', 'Reports', 'Inventory', 'Shipment Tracking', 'Dispatch Manager', 'Knowledge Base', 'Notifications'],
    'Finance Manager': ['Dashboard', 'Finance', 'Reports', 'Knowledge Base', 'Notifications'],
    'Supply Chain Manager': ['Dashboard', 'Purchase Orders', 'Sales Orders', 'Reports', 'Inventory', 'Shipment Tracking', 'Dispatch Manager', 'Knowledge Base', 'Notifications'],
    'Limited Access': ['Dashboard', 'Purchase Orders', 'Knowledge Base', 'Notifications'],
};

export const initialInventory: InventoryItem[] = [];
