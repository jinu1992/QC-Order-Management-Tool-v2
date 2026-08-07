-- fba_shipments needs a unique constraint on purchase_order_id so upsert-by-PO
-- (used by updateFBAShipmentId in server/routes/poActions.ts) can target onConflict.
-- Amazon FBA is modeled 1:1 with a PO in the current business flow (one inbound plan
-- per PO); revisit if that assumption breaks (e.g. multi-shipment splits per PO).

alter table fba_shipments
  add constraint fba_shipments_purchase_order_id_key unique (purchase_order_id);
