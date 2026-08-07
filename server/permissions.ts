import type { Role, ViewType } from '../types';

// Canonical Role x ViewType permission matrix, ported from data/mockData.ts
// (initialRolePermissions). This is the single source of truth for authorization --
// used both by the frontend (to decide what to render) and by Express middleware
// (to actually enforce access, since RLS is deny-by-default and not used for authz).
export const ROLE_PERMISSIONS: Record<Role, ViewType[]> = {
  'Admin': [
    'Dashboard', 'Quotations', 'Purchase Orders', 'File Uploader', 'POC Verification',
    'Appointments', 'Sales Orders', 'GRN / POD', 'Reports', 'Finance', 'Inventory',
    'Admin', 'Shipment Tracking', 'Dispatch Manager', 'Knowledge Base', 'Logs',
  ],
  'Key Account Manager': [
    'Dashboard', 'Quotations', 'Purchase Orders', 'File Uploader', 'POC Verification',
    'Appointments', 'Sales Orders', 'GRN / POD', 'Reports', 'Inventory',
    'Shipment Tracking', 'Dispatch Manager', 'Knowledge Base', 'Logs',
  ],
  'Finance Manager': [
    'Dashboard', 'Finance', 'Reports', 'Knowledge Base', 'Logs',
  ],
  'Supply Chain Manager': [
    'Dashboard', 'Purchase Orders', 'Sales Orders', 'Reports', 'Inventory',
    'Shipment Tracking', 'Dispatch Manager', 'Knowledge Base', 'Logs',
  ],
  'Limited Access': [
    'Dashboard', 'Purchase Orders', 'Knowledge Base', 'Logs',
  ],
};

export function roleCanAccess(role: Role, view: ViewType): boolean {
  return ROLE_PERMISSIONS[role]?.includes(view) ?? false;
}
