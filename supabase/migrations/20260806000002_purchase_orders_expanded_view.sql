-- purchase_orders_expanded: replicates the frontend's former transformSheetDataToPOs()
-- grouping + status-override logic (services/api.ts, old GAS-based version) as a single
-- queryable view, so that logic lives in one reviewable place instead of being
-- re-derived on every read.
--
-- Status-override rule ported from transformSheetDataToPOs:
--   Any po_items-adjacent signal (ee_orders.ee_order_status, shipments.tracking_status,
--   invoices.invoice_status) or the PO's own status, when it case-insensitively matches
--   one of: 'rtd', 'ready to dispatch', 'dispatched', 'delivered', 'shipped', 'closed',
--   'cancelled', 'below threshold' -- is surfaced as `po_db_status` (raw string) so the
--   frontend can apply the same override precedence it always has, without losing the
--   strict `status` enum value.
--
-- This view aggregates po_items into qty/amount, and pulls the most recent shipment,
-- invoice, and appointment per PO (aligning with how the old flat sheet only ever had
-- "the latest" shipment/invoice/appointment fields visible per PO row).

create or replace view purchase_orders_expanded as
with item_agg as (
  select
    purchase_order_id,
    sum(qty) as total_qty,
    sum(qty * coalesce(unit_cost, 0)) as total_amount,
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'articleCode', article_code,
        'masterSku', master_sku,
        'itemName', item_name,
        'qty', qty,
        'fulfillableQty', fulfillable_qty,
        'unitCost', unit_cost,
        'mrp', mrp,
        'priceCheckStatus', price_check_status,
        'itemStatus', item_status,
        'cancelledQuantity', cancelled_quantity,
        'shippedQuantity', shipped_quantity,
        'returnedQuantity', returned_quantity,
        'zohoItemId', zoho_item_id,
        'ewb', ewb
      ) order by created_at
    ) as items,
    -- any item row carrying an override-worthy item_status bubbles up, mirroring
    -- the old "if ANY row for this PO has a status override, keep/update it" rule
    max(case
      when lower(trim(item_status)) = any (array[
        'rtd', 'ready to dispatch', 'dispatched', 'delivered', 'shipped',
        'closed', 'cancelled', 'below threshold'
      ]) then item_status
      else null
    end) as item_status_override
  from po_items
  group by purchase_order_id
),
latest_shipment as (
  select distinct on (purchase_order_id) *
  from shipments
  order by purchase_order_id, updated_at desc
),
latest_invoice as (
  select distinct on (purchase_order_id) *
  from invoices
  where purchase_order_id is not null
  order by purchase_order_id, updated_at desc
),
latest_appointment as (
  select distinct on (purchase_order_id) *
  from appointments
  order by purchase_order_id, updated_at desc
),
latest_fba as (
  select distinct on (purchase_order_id) *
  from fba_shipments
  where purchase_order_id is not null
  order by purchase_order_id, updated_at desc
)
select
  po.id,
  po.po_number,
  po.status,
  po.channel,
  po.store_code,
  po.location_key,
  po.location,
  coalesce(ia.total_qty, 0) as qty,
  coalesce(ia.total_amount, 0) as amount,
  po.po_date,
  po.source,
  po.po_edd,
  po.po_expiry_date,
  po.po_pdf_url,
  po.pod_image_url,
  po.grn_number,
  po.grn_date,
  po.poc_phone_number,
  po.poc_email,
  po.contact_verified,
  po.ee_customer_id,
  po.zoho_contact_id,
  po.order_notes,

  eo.ee_reference_code,
  eo.ee_order_ref_id,
  eo.ee_order_date,
  eo.ee_order_status,
  eo.ee_batch_created_at,
  eo.ee_invoice_date,
  eo.ee_manifest_date,

  ls.carrier,
  ls.awb,
  ls.booked_date,
  ls.tracking_url,
  ls.tracking_status,
  ls.edd,
  ls.latest_status,
  ls.latest_status_date,
  ls.current_location,
  ls.delivered_date,
  ls.rto_status,
  ls.rto_awb,
  ls.freight_charged,
  ls.pickup_date,
  ls.label_url,
  ls.box_count as ee_reference_box_count,
  ls.consignment_qty,
  ls.consignment_products,
  ls.consignment_value,
  ls.shipping_charge,

  li.invoice_id,
  li.invoice_status,
  li.invoice_number,
  li.invoice_date,
  li.invoice_total,
  li.invoice_url,
  li.invoice_pdf_url,
  li.irn,
  li.gst,

  la.appointment_request_id,
  la.appointment_request_date,
  la.appointment_request_timestamp,
  la.appointment_date,
  la.appointment_time,
  la.appointment_id,
  la.qr_code_url,
  la.appointment_remarks,

  lf.fba_shipment_ids as fba_shipment_id,
  lf.inbound_plan_id,

  ia.items,

  -- raw status-override value; empty string means "no override, use `status`"
  coalesce(
    case
      when lower(trim(po.status::text)) = any (array[
        'rtd', 'ready to dispatch', 'dispatched', 'delivered', 'shipped',
        'closed', 'cancelled', 'below threshold'
      ]) then po.status::text
      else null
    end,
    ia.item_status_override,
    case
      when lower(trim(coalesce(ls.tracking_status, ''))) = any (array[
        'rtd', 'ready to dispatch', 'dispatched', 'delivered', 'shipped', 'closed'
      ]) then ls.tracking_status
      else null
    end,
    ''
  ) as po_db_status,

  po.created_at,
  po.updated_at
from purchase_orders po
left join item_agg ia on ia.purchase_order_id = po.id
left join ee_orders eo on eo.purchase_order_id = po.id
left join latest_shipment ls on ls.purchase_order_id = po.id
left join latest_invoice li on li.purchase_order_id = po.id
left join latest_appointment la on la.purchase_order_id = po.id
left join latest_fba lf on lf.purchase_order_id = po.id;
