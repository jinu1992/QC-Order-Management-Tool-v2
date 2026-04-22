# QuickCommerce Order Management Tool - Knowledge Base

This document provides a comprehensive technical and operational overview of the order management tool, covering the lifecycle of orders from Purchase Orders (PO) to final dispatch across various channels.

---

## 1. Dashboard Navigation & UI Features

### 1.1 SLA Countdown (Hours Left)
- **Purpose**: Tracks operational urgency for each shipment.
- **Logic**: Calculated based on the `EE_date_date` (EasyEcom order date).
- **Thresholds**:
    - <span style="color:red">**RED (< 2h)**</span>: Critical urgency.
    - <span style="color:orange">**ORANGE (< 6h)**</span>: High priority.
    - <span style="color:green">**GREEN (> 6h)**</span>: Standard priority.
- **Stops When**: The order reaches 'Awaiting Appointment Confirmation' or 'Label Generated' status.

### 1.2 "RTD" (Ready to Dispatch) Standardization
- **Naming**: All UI references to "Ready to Dispatch" have been shortened to **"RTD"** for better visibility.
- **Persistence**: Status checks are case-insensitive and match both `Ready to Dispatch` (legacy) and `RTD`.
- **Visibility**: Once an order is marked as RTD, all post-dispatch action buttons (Mark as RTD, Scan to Dispatch, etc.) are hidden to prevent redundant operations.

### 1.3 Processing Tab & External Statuses
- **Original Status**: The 'Processing' tab displays the specific status from EasyEcom (e.g., 'Awaiting Stock', 'Batch Created') in the badge to provide more granular visibility than a generic 'Processing' label.

### 1.4 Logistics Visibility
- **Pickup Date**: In the RTD tab, the **Pickup Date** is displayed in **bold indigo** within the main table row to assist logistics staff in prioritizing load-outs.

---

## 2. Channel-Specific Operations

### 2.1 Blinkit (Compliance Heavy)
- **Mandatory Logic**: An order **cannot** be marked as "RTD" without a valid `Appointment ID`.
- **Validation**: If the Appointment ID is missing, the "Mark as RTD" button is greyed out, and a blinking **"Appt. Missing"** badge is shown.
- **Verification**: Staff are prompted with a channel-specific checklist (ASNs, Box Labels, Packing Slips) before the status can be updated.

### 2.2 Flipkart (Marketplace Handled)
- **Flow**: Orders are handled via the Flipkart portal.
- **Auto-Extraction**: The tool extracts the `Consignment Number` and `Appointment Date` automatically when a Consignment PDF is uploaded.
- **E-Invoice Integration**: Users must generate the E-Invoice on the Flipkart portal and upload it to the dashboard to link with Zoho records.

### 2.3 Zepto & Swiggy Instamart
- **Partner Handled**: Generally uses "Ship with Partner" logistics.
- **Appointment Email**: Appointment request emails are generated with the required 13-column metadata directly from the dashboard.

### 2.4 Amazon & Generic Channels
- **Self-Ship**: For orders not covered by automated partner logistics, a "Self-Ship" workflow allows manual entry of courier and tracking details.
- **Fixed Statuses**: Specific overrides ensure Amazon orders marked as "Dispatched" in EasyEcom are correctly reflected on the dashboard.

---

## 3. Logistics & Automated Reporting

### 3.1 Nimbus Scheduler
- **Automation**: A Google Apps Script sends a summary email every 4 hours.
- **Content**: Summary of all pending and completed appointments, sorted by time.
- **Error Handling**: Missing fields are highlighted to ensure data integrity before reporting.

### 3.2 Appointment Manager
- **Missed Deliveries**: A dedicated tab filters shipments that have passed their scheduled appointment time without being marked as 'Delivered'.
- **WhatsApp Integration**: Allows sharing of today's, tomorrow's, and missed appointment summaries directly with operations staff.

---

## 4. ERP & Financial Integration

### 4.1 Zoho Books Auto-Invoicing
- Triggered for marketplace-handled channels.
- Links IRN and GST details fetched from portal uploads (Flipkart/Blinkit) to the financial record.

### 4.2 EasyEcom Synchronization
- **Global Sync**: Daily automated fetch of all shipment data.
- **Targeted Sync**: On-demand refresh for specific orders using the refresh icon in the Sales Order table.
