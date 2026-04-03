# QuickCommerce Order Management Tool - Knowledge Base

This document provides a comprehensive overview of the end-to-end process for managing orders across multiple quick-commerce channels (Zepto, Blinkit, Swiggy Instamart, BigBasket, Flipkart, etc.).

---

## 1. Purchase Orders (PO) Lifecycle

### 1.1 Data Extraction (Automated)
- **Background**: A Google Apps Script (GAS) runs periodically to monitor specific Gmail labels and Drive folders.
- **Process**:
    - Identify PO PDFs based on sender and filename patterns.
    - Extract line items, quantities, pricing, and expiry dates using Regex.
    - Save extracted data to the **PO_Database** and **PO_Repository** Google Sheets.

### 1.2 PO Review (Frontend)
- **Dashboard**: Users can view all incoming POs in the "Purchase Orders" tab.
- **Actions**:
    - **Verify SKU Mapping**: Ensure channel items are correctly mapped to Master SKUs.
    - **Check Thresholds**: Orders below a certain value are flagged.

---

## 2. Sales Orders (SO) & Synchronization

### 2.1 Pushing to EasyEcom
- Once a PO is verified, it is pushed to **EasyEcom** as a Sales Order.
- **Action**: Click "Push to EasyEcom" in the PO detail view.
- **Result**: The order status in the tool updates to "Confirmed" or "Processing".

### 2.2 Syncing Back to Dashboard
- The tool periodically syncs with EasyEcom to fetch updated shipment statuses, invoices, and AWB numbers.
- **Manual Trigger**: Click "EasyEcom Sync" for a global refresh or the "Targeted Refresh" icon for a specific order.

---

## 3. Shipment Manager & Logistics

### 3.1 Channel-Wise Handling
- **Flipkart**: "Flipkart Handled". Users download packing slips and upload E-Invoices back to the Flipkart portal.
- **Zepto/Blinkit/Instamart**: "Ship with Partner". Logistics are pushed to a shipping aggregator (e.g., Nimbus).

### 3.2 Appointment Flow
- **Requesting**: For channels like Zepto or BB, users send appointment request emails directly from the tool.
- **Scheduling**: Once an appointment is received, users update the Appointment Date and ID in the tool.
- **Flipkart Consignment**: Users upload the Flipkart Consignment PDF; the tool extracts the Consignment Number and Appointment Date automatically.

---

## 4. Invoicing & Dispatch

### 4.1 Zoho Books Integration
- For non-VAT/GST marketplace handled channels, the tool triggers invoice creation in **Zoho Books** automatically.
- **Action**: Click "Create Zoho Invoice" once an order is marked as Ready to Ship.

### 4.2 Flipkart E-Invoice Workflow
- Download Flipkart Packing Slip -> Upload to Flipkart Portal -> Generate E-Invoice -> Upload E-Invoice PDF to the Dashboard.
- The tool extracts IRN and Invoice Number to link with the Zoho record.

---

## 5. Inventory & Mapping

### 5.1 SKU Mapping
- **Master SKU Mapping**: A critical sheet that maps Channel SKUs (FSN, EAN) to internal Master SKUs.
- **Inventory Sync**: Fetches real-time stock levels from EasyEcom to ensure accurate fulfillment capacity.

### 5.2 Stock Allocation
- The tool calculates "Fulfillable Quantity" based on current stock vs. open orders across all channels.

---

## 6. Quotations & Estimates
- Manage custom B2B or ad-hoc quotations.
- **Flow**: Create Quotation -> Send to Customer -> Accept Estimate (syncs to Zoho as a Sales Order).

---

## 7. RTO & Returns
- **Shipment Manager**: Tracks "In-Transit", "Delivered", and "RTO" (Return to Origin) orders.
- **Alerts**: Highlight missed deliveries or RTOs that need physical verification.
