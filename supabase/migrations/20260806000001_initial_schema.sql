-- Initial schema for Cubelelo QC Order Management
-- Migrated from Google Sheets (PO_Database + 12 other tabs) to normalized Postgres tables.
-- See Migration_Plan_Sheets_to_Supabase.docx for full rationale.

-- ============================================================================
-- Extensions
-- ============================================================================
create extension if not exists "pgcrypto";

-- ============================================================================
-- Enums
-- ============================================================================
create type po_status as enum (
  'New',
  'Waiting for Confirmation',
  'Confirmed',
  'Below Threshold',
  'POC Verification',
  'Appointment to be taken',
  'In-Transit',
  'Delivered',
  'GRN Pending',
  'GRN Updated',
  'RTO',
  'Closed',
  'Pushed',
  'Partially Processed',
  'Dispatched',
  'Cancelled'
);

create type user_role as enum (
  'Admin',
  'Key Account Manager',
  'Finance Manager',
  'Supply Chain Manager',
  'Limited Access'
);

create type payment_status as enum (
  'Pending',
  'Partial',
  'Received',
  'Overdue'
);

create type po_source as enum ('Manual', 'Email', 'API');

create type channel_status as enum ('Active', 'Inactive');

create type upload_status as enum ('Success', 'Error', 'Pending');

-- ============================================================================
-- users
-- ============================================================================
create table users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  contact_number text,
  role user_role not null default 'Limited Access',
  avatar_initials text,
  is_initialized boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- channel_configs
-- ============================================================================
create table channel_configs (
  id uuid primary key default gen_random_uuid(),
  channel_name text not null unique,
  status channel_status not null default 'Active',
  source_email text,
  search_keyword text,
  min_order_threshold numeric not null default 0,
  poc_name text,
  poc_email text,
  poc_phone text,
  appointment_to text,
  appointment_cc text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- inventory (Master_SKU_Mapping)
-- ============================================================================
create table inventory (
  id uuid primary key default gen_random_uuid(),
  channel text not null,
  article_code text not null,
  sku text,
  ean text,
  item_name text,
  mrp numeric not null default 0,
  basic_price numeric not null default 0,
  sp_inc_tax numeric not null default 0,
  stock numeric not null default 0,
  size text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (channel, article_code)
);

-- ============================================================================
-- customers (Zoho contact cache)
-- ============================================================================
create table customers (
  id uuid primary key default gen_random_uuid(),
  customer_code text,
  contact_id text unique,
  contact_name text,
  company_name text,
  email text,
  phone text,
  gst_no text,
  shipping_address_id text,
  shipping_attention text,
  shipping_address text,
  shipping_street2 text,
  shipping_city text,
  shipping_state_code text,
  shipping_state text,
  shipping_zip text,
  shipping_phone text,
  state_code text,
  stn_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- store_poc_mappings
-- ============================================================================
create table store_poc_mappings (
  id uuid primary key default gen_random_uuid(),
  channel text not null,
  store_code text not null,
  poc_name text,
  poc_email text,
  poc_phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (channel, store_code)
);

-- ============================================================================
-- po_repository (raw incoming PO files pre-extraction)
-- ============================================================================
create table po_repository (
  id uuid primary key default gen_random_uuid(),
  file_id text unique,
  channel text,
  source_email text,
  received_at timestamptz,
  extraction_status text,
  raw_file_url text,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- purchase_orders (PO-level fields only; qty/amount are derived from po_items)
-- ============================================================================
create table purchase_orders (
  id uuid primary key default gen_random_uuid(),
  po_number text not null unique,
  status po_status not null default 'New',
  channel text not null,
  store_code text,
  location_key text,
  location text,
  po_date date,
  po_edd date,
  po_expiry_date date,
  po_pdf_url text,
  source po_source not null default 'Manual',
  poc_phone_number text,
  poc_email text,
  contact_verified boolean not null default false,
  ee_customer_id text,
  zoho_contact_id text,
  order_notes text,

  -- GRN / POD (1:1 with PO in practice; kept as columns, split out later if needed)
  grn_number text,
  grn_date date,
  pod_image_url text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_purchase_orders_channel on purchase_orders (channel);
create index idx_purchase_orders_status on purchase_orders (status);
create index idx_purchase_orders_ee_customer_id on purchase_orders (ee_customer_id);

-- ============================================================================
-- po_items (one row per line item)
-- ============================================================================
create table po_items (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references purchase_orders (id) on delete cascade,
  article_code text not null,
  master_sku text,
  item_name text,
  qty numeric not null default 0,
  fulfillable_qty numeric,
  unit_cost numeric,
  mrp numeric,
  price_check_status text,
  item_status text,
  cancelled_quantity numeric not null default 0,
  shipped_quantity numeric not null default 0,
  returned_quantity numeric not null default 0,
  zoho_item_id text,
  ewb text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_po_items_purchase_order_id on po_items (purchase_order_id);
create index idx_po_items_article_code on po_items (article_code);

-- ============================================================================
-- ee_orders (EasyEcom order-level data)
-- ============================================================================
create table ee_orders (
  id uuid primary key default gen_random_uuid(),
  ee_reference_code text not null unique,
  purchase_order_id uuid references purchase_orders (id) on delete set null,
  ee_order_ref_id text,
  ee_order_date timestamptz,
  ee_order_status text,
  ee_batch_created_at timestamptz,
  ee_invoice_date timestamptz,
  ee_manifest_date timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_ee_orders_purchase_order_id on ee_orders (purchase_order_id);

-- ============================================================================
-- shipments (one row per shipment/AWB)
-- ============================================================================
create table shipments (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid references purchase_orders (id) on delete cascade,
  ee_reference_code text references ee_orders (ee_reference_code) on delete set null,
  carrier text,
  awb text,
  booked_date date,
  tracking_url text,
  tracking_status text,
  edd date,
  latest_status text,
  latest_status_date timestamptz,
  current_location text,
  delivered_date date,
  rto_status text,
  rto_awb text,
  freight_charged numeric,
  pickup_date date,
  label_url text,
  box_count numeric,
  consignment_qty numeric,
  consignment_products numeric,
  consignment_value text,
  shipping_charge numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_shipments_purchase_order_id on shipments (purchase_order_id);
create index idx_shipments_ee_reference_code on shipments (ee_reference_code);
create index idx_shipments_awb on shipments (awb);

-- ============================================================================
-- invoices (Zoho Books)
-- ============================================================================
create table invoices (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid references purchase_orders (id) on delete cascade,
  ee_reference_code text references ee_orders (ee_reference_code) on delete set null,
  invoice_id text,
  invoice_status text,
  invoice_number text,
  invoice_date date,
  invoice_total numeric,
  invoice_url text,
  invoice_pdf_url text,
  irn text,
  gst text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_invoices_purchase_order_id on invoices (purchase_order_id);
create index idx_invoices_ee_reference_code on invoices (ee_reference_code);

-- ============================================================================
-- appointments
-- ============================================================================
create table appointments (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references purchase_orders (id) on delete cascade,
  appointment_request_id text,
  appointment_request_date date,
  appointment_request_timestamp timestamptz,
  appointment_date date,
  appointment_time text,
  appointment_id text,
  qr_code_url text,
  appointment_remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_appointments_purchase_order_id on appointments (purchase_order_id);

-- ============================================================================
-- fba_shipments (Amazon SP-API specific)
-- ============================================================================
create table fba_shipments (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid references purchase_orders (id) on delete cascade,
  fba_shipment_ids text,
  inbound_plan_id text,
  placement_id text,
  shipment_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_fba_shipments_purchase_order_id on fba_shipments (purchase_order_id);

-- ============================================================================
-- quotations + quotation_items
-- ============================================================================
create table quotations (
  id uuid primary key default gen_random_uuid(),
  estimate_id text not null unique,
  customer_id text,
  customer_name text,
  quotation_date date,
  quotation_number text,
  reference_number text,
  status text not null default 'Pending',
  expiry_date date,
  shipping_charges numeric not null default 0,
  tax_amount numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table quotation_items (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references quotations (id) on delete cascade,
  zoho_item_id text,
  sku text,
  item_name text,
  rate numeric not null default 0,
  quantity numeric not null default 0,
  created_at timestamptz not null default now()
);

create index idx_quotation_items_quotation_id on quotation_items (quotation_id);

-- ============================================================================
-- upload_logs
-- ============================================================================
create table upload_logs (
  id uuid primary key default gen_random_uuid(),
  function_name text not null,
  uploaded_by text,
  uploaded_at timestamptz not null default now(),
  status upload_status not null default 'Pending',
  file_url text
);

-- ============================================================================
-- activity_logs / system_logs (audit trail)
-- ============================================================================
create table activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_name text,
  action text not null,
  details text,
  created_at timestamptz not null default now()
);

create index idx_activity_logs_created_at on activity_logs (created_at desc);

-- ============================================================================
-- system_config (key/value; secrets stay in env vars, never here)
-- ============================================================================
create table system_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- updated_at trigger helper
-- ============================================================================
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'users', 'channel_configs', 'inventory', 'customers', 'store_poc_mappings',
    'purchase_orders', 'po_items', 'ee_orders', 'shipments', 'invoices',
    'appointments', 'fba_shipments', 'quotations', 'system_config'
  ]
  loop
    execute format(
      'create trigger trg_set_updated_at before update on %I for each row execute function set_updated_at();',
      t
    );
  end loop;
end;
$$;
