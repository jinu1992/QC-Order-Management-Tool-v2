import dotenv from 'dotenv';
dotenv.config();

import { readSheetAsObjects } from './sheetsClient';
import { supabase } from '../../server/db/supabaseClient';

// One-time (repeatable/idempotent) migration of the source Google Sheet into the
// normalized Supabase schema from Phase A. Run with `npm run migrate:run`.
//
// Idempotency: every upsert below targets a real unique constraint (po_number,
// channel+article_code, email, channel_name, ee_reference_code, estimate_id) so
// re-running this script -- including the final run right before cutover -- updates
// existing rows in place rather than duplicating them. purchase_orders and po_items
// are the exception: po_items has no natural unique key across re-runs (the sheet has
// no stable item-row id), so each run deletes and re-inserts all po_items for a given
// PO rather than trying to diff them. This is safe because po_items in the new schema
// is a derived/computed breakdown, not something users edit directly outside of the
// specific Tier 1 endpoints (which operate on existing rows by article_code, not by
// item id) -- see server/routes/poActions.ts.
//
// Column names below match exactly what services/api.ts's transform functions
// (transformSheetDataToPOs, transformSheetDataToInventory, transformSheetDataToChannelConfigs,
// fetchQuotations, fetchUsers) already assume, since that file has been reading these
// same sheets in production and its column expectations are the closest thing this
// project has to a verified schema contract.

interface MigrationCounts {
  [table: string]: number;
}

function toNum(val: any): number {
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
}

function toDateOrNull(val: any): string | null {
  if (!val && val !== 0) return null;
  const s = String(val).trim();
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function toTimestampOrNull(val: any): string | null {
  if (!val && val !== 0) return null;
  const s = String(val).trim();
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

function strOrNull(val: any): string | null {
  if (val === undefined || val === null) return null;
  const s = String(val).trim();
  return s === '' ? null : s;
}

const OVERRIDE_STATUSES = new Set([
  'rtd', 'ready to dispatch', 'dispatched', 'delivered', 'shipped', 'closed', 'cancelled', 'below threshold',
]);

const VALID_PO_STATUSES = new Set([
  'New', 'Waiting for Confirmation', 'Confirmed', 'Below Threshold', 'POC Verification',
  'Appointment to be taken', 'In-Transit', 'Delivered', 'GRN Pending', 'GRN Updated',
  'RTO', 'Closed', 'Pushed', 'Partially Processed', 'Dispatched', 'Cancelled',
]);

function normalizePoStatus(raw: any): string {
  const s = strOrNull(raw);
  if (!s) return 'New';
  if (VALID_PO_STATUSES.has(s)) return s;
  // Override-only statuses like "RTD" aren't in the strict enum; the old frontend kept
  // them in a separate poDbStatus field (now: purchase_orders_expanded.po_db_status)
  // while the enum column itself falls back to a sane default.
  if (OVERRIDE_STATUSES.has(s.toLowerCase())) return 'New';
  return 'New';
}

async function migrateUsers(): Promise<number> {
  const rows = await readSheetAsObjects('Users');
  if (rows.length === 0) return 0;

  const payload = rows
    .filter((r) => strOrNull(r['Email']))
    .map((r) => ({
      name: strOrNull(r['Name']) || '',
      email: String(r['Email']).trim(),
      contact_number: strOrNull(r['Contact']),
      role: strOrNull(r['Role']) || 'Limited Access',
      avatar_initials: strOrNull(r['Avatar']) || (strOrNull(r['Name']) || 'U').charAt(0).toUpperCase(),
      is_initialized: !!r['IsInitialized'],
    }));

  if (payload.length === 0) return 0;
  const { error } = await supabase.from('users').upsert(payload, { onConflict: 'email' });
  if (error) throw new Error(`users: ${error.message}`);
  return payload.length;
}

async function migrateChannelConfigs(): Promise<number> {
  const rows = await readSheetAsObjects('Channel_Config');
  if (rows.length === 0) return 0;

  const payload = rows
    .filter((r) => strOrNull(r['Channel Name']))
    .map((r) => ({
      channel_name: String(r['Channel Name']).trim(),
      status: (strOrNull(r['Status']) as 'Active' | 'Inactive') || 'Active',
      source_email: strOrNull(r['Source Email']),
      search_keyword: strOrNull(r['Search Keyword']),
      min_order_threshold: toNum(r['Min Order Threshold']),
      poc_name: strOrNull(r['POC Name']),
      poc_email: strOrNull(r['POC Email']),
      poc_phone: strOrNull(r['POC Phone']),
      appointment_to: strOrNull(r['Appointment To']),
      appointment_cc: strOrNull(r['Appointment Cc']),
    }));

  if (payload.length === 0) return 0;
  const { error } = await supabase.from('channel_configs').upsert(payload, { onConflict: 'channel_name' });
  if (error) throw new Error(`channel_configs: ${error.message}`);
  return payload.length;
}

async function migrateInventory(): Promise<number> {
  const rows = await readSheetAsObjects('Master_SKU_Mapping');
  if (rows.length === 0) return 0;

  const payload = rows
    .filter((r) => strOrNull(r['Channel']) && strOrNull(r['Channel Item Code']))
    .map((r) => ({
      channel: String(r['Channel']).trim(),
      article_code: String(r['Channel Item Code']).trim(),
      sku: strOrNull(r['Master SKU']),
      ean: strOrNull(r['EAN']),
      item_name: strOrNull(r['Itemname']),
      mrp: toNum(r['MRP']),
      basic_price: toNum(r['Basic Price']),
      sp_inc_tax: toNum(r['Selling Price']),
      stock: toNum(r['Inventory']),
      size: strOrNull(r['Size']),
    }));

  if (payload.length === 0) return 0;
  const { error } = await supabase.from('inventory').upsert(payload, { onConflict: 'channel,article_code' });
  if (error) throw new Error(`inventory: ${error.message}`);
  return payload.length;
}

async function migrateCustomers(): Promise<number> {
  const rows = await readSheetAsObjects('Zoho_Customers');
  if (rows.length === 0) return 0;

  const payload = rows
    .filter((r) => strOrNull(r['Contact ID']))
    .map((r) => ({
      customer_code: strOrNull(r['Customer Code']),
      contact_id: String(r['Contact ID']).trim(),
      contact_name: strOrNull(r['Contact Name']),
      company_name: strOrNull(r['Company Name']),
      email: strOrNull(r['Email']),
      phone: strOrNull(r['Phone']),
      gst_no: strOrNull(r['GST No']),
      shipping_address_id: strOrNull(r['Shipping Address ID']),
      shipping_attention: strOrNull(r['Shipping Attention']),
      shipping_address: strOrNull(r['Shipping Address']),
      shipping_street2: strOrNull(r['Shipping Street2']),
      shipping_city: strOrNull(r['Shipping City']),
      shipping_state_code: strOrNull(r['Shipping State Code']),
      shipping_state: strOrNull(r['Shipping State']),
      shipping_zip: strOrNull(r['Shipping Zip']),
      shipping_phone: strOrNull(r['Shipping Phone']),
      state_code: strOrNull(r['State Code']),
      stn_code: strOrNull(r['STN Code']),
    }));

  if (payload.length === 0) return 0;
  const { error } = await supabase.from('customers').upsert(payload, { onConflict: 'contact_id' });
  if (error) throw new Error(`customers: ${error.message}`);
  return payload.length;
}

// PO_Database is one row per line item, denormalized with PO-level, EasyEcom-level,
// shipment-level, invoice-level, and appointment-level columns all repeated on every
// item row. This groups rows by PO Number the same way transformSheetDataToPOs() did,
// then fans each group out into purchase_orders (1 row) + po_items (N rows) + the
// latest-known ee_orders/shipments/invoices/appointments/fba_shipments rows.
async function migratePurchaseOrders(): Promise<MigrationCounts> {
  const rows = await readSheetAsObjects('PO_Database');
  const counts: MigrationCounts = {
    purchase_orders: 0, po_items: 0, ee_orders: 0, shipments: 0,
    invoices: 0, appointments: 0, fba_shipments: 0,
  };
  if (rows.length === 0) return counts;

  const groups = new Map<string, Record<string, any>[]>();
  for (const row of rows) {
    const poNumber = strOrNull(row['PO Number']);
    if (!poNumber) continue;
    if (!groups.has(poNumber)) groups.set(poNumber, []);
    groups.get(poNumber)!.push(row);
  }

  for (const [poNumber, itemRows] of groups) {
    const first = itemRows[0];

    const poPayload = {
      po_number: poNumber,
      status: normalizePoStatus(first['Status']),
      channel: strOrNull(first['Channel Name']) || 'Unknown',
      store_code: strOrNull(first['Store Code']),
      location_key: strOrNull(first['Location_Key']) || strOrNull(first['Location Key']),
      location: strOrNull(first['Location']),
      po_date: toDateOrNull(first['PO Date']),
      po_edd: toDateOrNull(first['PO EDD']),
      po_expiry_date: toDateOrNull(first['PO Expiry Date']),
      po_pdf_url: strOrNull(first['PO PDF']),
      source: 'Email' as const,
      poc_phone_number: strOrNull(first['POC Phone Number']),
      poc_email: strOrNull(first['POC Email']),
      contact_verified: !!first['Contact Verified'],
      ee_customer_id: strOrNull(first['EE Customer ID']),
      zoho_contact_id: strOrNull(first['Zoho Contact ID']),
      order_notes: strOrNull(first['Order Notes']),
      grn_number: strOrNull(first['GRN Number']),
      grn_date: toDateOrNull(first['GRN Date']),
      pod_image_url: strOrNull(first['POD Image']) || strOrNull(first['POD Image URL']),
    };

    const { data: poRow, error: poError } = await supabase
      .from('purchase_orders')
      .upsert(poPayload, { onConflict: 'po_number' })
      .select('id')
      .single();

    if (poError) throw new Error(`purchase_orders (${poNumber}): ${poError.message}`);
    counts.purchase_orders++;
    const poId = poRow.id;

    // po_items: no stable natural key across re-runs, so replace wholesale for this PO.
    await supabase.from('po_items').delete().eq('purchase_order_id', poId);
    const itemPayload = itemRows
      .filter((r) => strOrNull(r['Item Code']))
      .map((r) => ({
        purchase_order_id: poId,
        article_code: String(r['Item Code']).trim(),
        master_sku: strOrNull(r['Master SKU']),
        item_name: strOrNull(r['Item Name']),
        qty: toNum(r['Qty']),
        fulfillable_qty: toNum(r['Fulfillable qty']),
        unit_cost: toNum(r['Unit Cost (Tax Exclusive)']),
        mrp: toNum(r['MRP']),
        price_check_status: strOrNull(r['Price Check']),
        item_status: strOrNull(r['EE_item_item_status']) || strOrNull(r['Status']),
        cancelled_quantity: toNum(r['EE_item_cancelled_quantity']),
        shipped_quantity: toNum(r['EE_item_shipped_quantity']),
        returned_quantity: toNum(r['EE_item_returned_quantity']),
        zoho_item_id: strOrNull(r['Zoho Item ID']),
        ewb: strOrNull(r['EWB']),
      }));
    if (itemPayload.length > 0) {
      const { error: itemError } = await supabase.from('po_items').insert(itemPayload);
      if (itemError) throw new Error(`po_items (${poNumber}): ${itemError.message}`);
      counts.po_items += itemPayload.length;
    }

    // ee_orders: one per PO, keyed by ee_reference_code (may be blank pre-confirmation).
    const eeReferenceCode = strOrNull(first['EE_reference_code']);
    if (eeReferenceCode) {
      const { error: eeError } = await supabase.from('ee_orders').upsert({
        ee_reference_code: eeReferenceCode,
        purchase_order_id: poId,
        ee_order_ref_id: strOrNull(first['EE Order Ref ID']),
        ee_order_date: toTimestampOrNull(first['EE_order_date']),
        ee_order_status: strOrNull(first['EE_order_status']),
        ee_batch_created_at: toTimestampOrNull(first['EE_batch_created_at']),
        ee_invoice_date: toTimestampOrNull(first['EE_invoice_date']),
        ee_manifest_date: toTimestampOrNull(first['EE_manifest_date']),
      }, { onConflict: 'ee_reference_code' });
      if (eeError) throw new Error(`ee_orders (${poNumber}): ${eeError.message}`);
      counts.ee_orders++;
    }

    // shipments: one row representing the PO's current/latest known shipment state.
    // Re-migrated as a fresh row per run (no natural unique key on AWB across re-runs
    // when AWB is blank pre-booking), scoped by purchase_order_id.
    const hasShipmentData = strOrNull(first['Carrier']) || strOrNull(first['AWB']) || strOrNull(first['Tracking Status']);
    if (hasShipmentData) {
      await supabase.from('shipments').delete().eq('purchase_order_id', poId);
      const { error: shipError } = await supabase.from('shipments').insert({
        purchase_order_id: poId,
        ee_reference_code: eeReferenceCode,
        carrier: strOrNull(first['Carrier']),
        awb: strOrNull(first['AWB']),
        booked_date: toDateOrNull(first['Booked Date']),
        tracking_url: strOrNull(first['Tracking URL']),
        tracking_status: strOrNull(first['Tracking Status']),
        edd: toDateOrNull(first['EDD']),
        latest_status: strOrNull(first['Latest Status']),
        latest_status_date: toTimestampOrNull(first['Latest Status Date']),
        current_location: strOrNull(first['Current Location']),
        delivered_date: toDateOrNull(first['Delivered Date']),
        rto_status: strOrNull(first['RTO Status']),
        rto_awb: strOrNull(first['RTO AWB']),
        freight_charged: toNum(first['Freight Charged']) || null,
        pickup_date: toDateOrNull(first['Pickup Date']),
        label_url: strOrNull(first['Label URL']),
        box_count: toNum(first['Box Data']) || null,
        consignment_qty: toNum(first['Consignment Qty']) || null,
        consignment_products: toNum(first['Consignment Products']) || null,
        consignment_value: strOrNull(first['Consignment Value']),
        shipping_charge: toNum(first['Shipping Charge']) || null,
      });
      if (shipError) throw new Error(`shipments (${poNumber}): ${shipError.message}`);
      counts.shipments++;
    }

    // invoices
    const hasInvoiceData = strOrNull(first['Invoice Id']) || strOrNull(first['Invoice Number']);
    if (hasInvoiceData) {
      await supabase.from('invoices').delete().eq('purchase_order_id', poId);
      const { error: invError } = await supabase.from('invoices').insert({
        purchase_order_id: poId,
        ee_reference_code: eeReferenceCode,
        invoice_id: strOrNull(first['Invoice Id']),
        invoice_status: strOrNull(first['Invoice Status']),
        invoice_number: strOrNull(first['Invoice Number']),
        invoice_date: toDateOrNull(first['Invoice Date']),
        invoice_total: toNum(first['Invoice Total']) || null,
        invoice_url: strOrNull(first['Invoice Url']),
        invoice_pdf_url: strOrNull(first['Invoice PDF Url']),
        irn: strOrNull(first['IRN']),
        gst: strOrNull(first['GST']),
      });
      if (invError) throw new Error(`invoices (${poNumber}): ${invError.message}`);
      counts.invoices++;
    }

    // appointments
    const hasAppointmentData = strOrNull(first['Appointment ID']) || strOrNull(first['Appointment Date']);
    if (hasAppointmentData) {
      await supabase.from('appointments').delete().eq('purchase_order_id', poId);
      const { error: apptError } = await supabase.from('appointments').insert({
        purchase_order_id: poId,
        appointment_request_id: strOrNull(first['Appointment Request ID']),
        appointment_request_date: toDateOrNull(first['Appointment Request Date']),
        appointment_request_timestamp: toTimestampOrNull(first['Appointment Request Timestamp']),
        appointment_date: toDateOrNull(first['Appointment Date']),
        appointment_time: strOrNull(first['Appointment Time']),
        appointment_id: strOrNull(first['Appointment ID']),
        qr_code_url: strOrNull(first['QR Code URL']),
        appointment_remarks: strOrNull(first['Appointment Remarks']),
      });
      if (apptError) throw new Error(`appointments (${poNumber}): ${apptError.message}`);
      counts.appointments++;
    }

    // fba_shipments
    const hasFbaData = strOrNull(first['FBA Shipment IDs']) || strOrNull(first['Inbound Plan ID']);
    if (hasFbaData) {
      const { error: fbaError } = await supabase.from('fba_shipments').upsert({
        purchase_order_id: poId,
        fba_shipment_ids: strOrNull(first['FBA Shipment IDs']),
        inbound_plan_id: strOrNull(first['Inbound Plan ID']),
        placement_id: strOrNull(first['Placement ID']),
        shipment_id: strOrNull(first['Shipment ID']),
      }, { onConflict: 'purchase_order_id' });
      if (fbaError) throw new Error(`fba_shipments (${poNumber}): ${fbaError.message}`);
      counts.fba_shipments++;
    }
  }

  return counts;
}

async function migrateQuotations(): Promise<MigrationCounts> {
  const rows = await readSheetAsObjects('Quotations');
  const counts: MigrationCounts = { quotations: 0, quotation_items: 0 };
  if (rows.length === 0) return counts;

  const groups = new Map<string, Record<string, any>[]>();
  for (const row of rows) {
    const estimateId = strOrNull(row['Estimate ID']);
    if (!estimateId) continue;
    if (!groups.has(estimateId)) groups.set(estimateId, []);
    groups.get(estimateId)!.push(row);
  }

  for (const [estimateId, itemRows] of groups) {
    const first = itemRows[0];

    const { data: quoteRow, error: quoteError } = await supabase
      .from('quotations')
      .upsert({
        estimate_id: estimateId,
        customer_id: strOrNull(first['Customer ID']),
        customer_name: strOrNull(first['Customer Name']),
        quotation_date: toDateOrNull(first['Quotation Date'] || first['Date']),
        quotation_number: strOrNull(first['Quote Number']) || strOrNull(first['Quotation Number']),
        reference_number: strOrNull(first['Reference Number']),
        status: strOrNull(first['Status']) || 'Pending',
        expiry_date: toDateOrNull(first['Expiry Date']),
        shipping_charges: toNum(first['Shipping Charges']),
        tax_amount: toNum(first['Tax Amount']),
      }, { onConflict: 'estimate_id' })
      .select('id')
      .single();

    if (quoteError) throw new Error(`quotations (${estimateId}): ${quoteError.message}`);
    counts.quotations++;

    await supabase.from('quotation_items').delete().eq('quotation_id', quoteRow.id);
    const itemPayload = itemRows
      .filter((r) => strOrNull(r['SKU']) || strOrNull(r['Item Name']))
      .map((r) => ({
        quotation_id: quoteRow.id,
        zoho_item_id: strOrNull(r['Zoho Item ID']),
        sku: strOrNull(r['SKU']),
        item_name: strOrNull(r['Item Name']),
        rate: toNum(r['Rate']),
        quantity: toNum(r['Quantity']),
      }));
    if (itemPayload.length > 0) {
      const { error: itemError } = await supabase.from('quotation_items').insert(itemPayload);
      if (itemError) throw new Error(`quotation_items (${estimateId}): ${itemError.message}`);
      counts.quotation_items += itemPayload.length;
    }
  }

  return counts;
}

async function migrateStorePocMappings(): Promise<number> {
  // Derived from Channel_Config's per-channel POC fields plus any distinct
  // (Channel Name, Store Code) pairs seen in PO_Database, since there is no dedicated
  // "Store_POC_Mapping" sheet tab in the source spreadsheet -- fetchStorePocMappings()
  // in the old frontend read this from Channel_Config joined against PO rows implicitly.
  const channelRows = await readSheetAsObjects('Channel_Config');
  const poRows = await readSheetAsObjects('PO_Database');

  const storesByChannel = new Map<string, Set<string>>();
  for (const row of poRows) {
    const channel = strOrNull(row['Channel Name']);
    const storeCode = strOrNull(row['Store Code']);
    if (!channel || !storeCode) continue;
    if (!storesByChannel.has(channel)) storesByChannel.set(channel, new Set());
    storesByChannel.get(channel)!.add(storeCode);
  }

  const channelPocByName = new Map<string, Record<string, any>>();
  for (const row of channelRows) {
    const name = strOrNull(row['Channel Name']);
    if (name) channelPocByName.set(name, row);
  }

  const payload: any[] = [];
  for (const [channel, storeCodes] of storesByChannel) {
    const config = channelPocByName.get(channel);
    for (const storeCode of storeCodes) {
      payload.push({
        channel,
        store_code: storeCode,
        poc_name: config ? strOrNull(config['POC Name']) : null,
        poc_email: config ? strOrNull(config['POC Email']) : null,
        poc_phone: config ? strOrNull(config['POC Phone']) : null,
      });
    }
  }

  if (payload.length === 0) return 0;
  const { error } = await supabase.from('store_poc_mappings').upsert(payload, { onConflict: 'channel,store_code' });
  if (error) throw new Error(`store_poc_mappings: ${error.message}`);
  return payload.length;
}

async function migrateUploadLogs(): Promise<number> {
  const rows = await readSheetAsObjects('Upload_Logs');
  if (rows.length === 0) return 0;

  const payload = rows
    .filter((r) => strOrNull(r['Function']) || strOrNull(r['Function Name']))
    .map((r) => ({
      function_name: strOrNull(r['Function Name']) || strOrNull(r['Function']) || 'Unknown',
      uploaded_by: strOrNull(r['User']) || strOrNull(r['Last Uploaded By']),
      uploaded_at: toTimestampOrNull(r['Timestamp']) || toTimestampOrNull(r['Last Uploaded At']) || new Date().toISOString(),
      status: (strOrNull(r['Status']) as 'Success' | 'Error' | 'Pending') || 'Pending',
      file_url: strOrNull(r['URL']) || strOrNull(r['File URL']),
    }));

  if (payload.length === 0) return 0;
  // No natural unique key on this table -- append-only audit log, so re-running would
  // duplicate rows. Guard by clearing and re-inserting only on the very first run
  // (i.e. when the table is currently empty); subsequent re-runs skip this table and
  // rely on the live app writing new rows going forward.
  const { count, error: countError } = await supabase.from('upload_logs').select('*', { count: 'exact', head: true });
  if (countError) throw new Error(`upload_logs (count check): ${countError.message}`);
  if ((count || 0) > 0) {
    console.log('  upload_logs already has rows -- skipping re-import to avoid duplicating audit history.');
    return 0;
  }

  const { error } = await supabase.from('upload_logs').insert(payload);
  if (error) throw new Error(`upload_logs: ${error.message}`);
  return payload.length;
}

async function main() {
  console.log('Starting Sheets -> Supabase migration...\n');
  const summary: MigrationCounts = {};

  const steps: [string, () => Promise<number | MigrationCounts>][] = [
    ['Users', migrateUsers],
    ['Channel_Config', migrateChannelConfigs],
    ['Master_SKU_Mapping (inventory)', migrateInventory],
    ['Zoho_Customers', migrateCustomers],
    ['Store/POC mappings (derived)', migrateStorePocMappings],
    ['Upload_Logs', migrateUploadLogs],
    ['PO_Database (purchase_orders + related)', migratePurchaseOrders],
    ['Quotations', migrateQuotations],
  ];

  for (const [label, fn] of steps) {
    process.stdout.write(`Migrating ${label}... `);
    try {
      const result = await fn();
      if (typeof result === 'number') {
        console.log(`${result} rows.`);
        summary[label] = result;
      } else {
        console.log(JSON.stringify(result));
        Object.assign(summary, result);
      }
    } catch (err: any) {
      console.log('FAILED');
      console.error(`  Error in ${label}: ${err.message}`);
      throw err;
    }
  }

  console.log('\nMigration complete. Summary:');
  console.table(summary);
}

main().catch((err) => {
  console.error('\nMigration aborted:', err.message);
  process.exit(1);
});
