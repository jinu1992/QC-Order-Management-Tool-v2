import { Router, type Request, type Response } from 'express';
import { supabase } from '../db/supabaseClient.js';

// Tier 1 PO-related write actions from services/api.ts: saveOrderNote (addOrderNote),
// updatePOStatus, updateRTOStatus, updatePOPickupDate, updateShipmentDocuments,
// updateFBAShipmentId, cancelPOLineItem (cancelLineItem).
//
// All of these resolve po_number -> purchase_orders.id first since the normalized
// schema uses UUID foreign keys rather than the flat sheet's po_number-as-key convention.
const router = Router();

async function getPoIdByNumber(poNumber: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('purchase_orders')
    .select('id')
    .eq('po_number', poNumber)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

router.post('/api/po/order-note', async (req: Request, res: Response) => {
  const { poNumber, note, userName } = req.body;
  if (!poNumber || !note) {
    return res.status(400).json({ status: 'error', message: 'poNumber and note are required.' });
  }

  try {
    const poId = await getPoIdByNumber(poNumber);
    if (!poId) return res.status(404).json({ status: 'error', message: `PO ${poNumber} not found.` });

    const { error } = await supabase.from('purchase_orders').update({ order_notes: note }).eq('id', poId);
    if (error) throw error;

    await supabase.from('activity_logs').insert({
      user_name: userName || 'System',
      action: 'Order Note Added',
      details: `PO ${poNumber}: ${note}`,
    });

    res.json({ status: 'success', message: 'Order note saved.' });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

router.patch('/api/po/:poNumber/status', async (req: Request, res: Response) => {
  const { poNumber } = req.params;
  const { status } = req.body;
  if (!status) {
    return res.status(400).json({ status: 'error', message: 'status is required.' });
  }

  const { data, error } = await supabase
    .from('purchase_orders')
    .update({ status })
    .eq('po_number', poNumber)
    .select('id')
    .maybeSingle();

  if (error) return res.status(500).json({ status: 'error', message: error.message });
  if (!data) return res.status(404).json({ status: 'error', message: `PO ${poNumber} not found.` });

  res.json({ status: 'success', message: 'PO status updated.' });
});

router.patch('/api/po/:poNumber/cancel-item', async (req: Request, res: Response) => {
  const poNumber = String(req.params.poNumber);
  const { articleCode } = req.body;
  if (!articleCode) {
    return res.status(400).json({ status: 'error', message: 'articleCode is required.' });
  }

  try {
    const poId = await getPoIdByNumber(poNumber);
    if (!poId) return res.status(404).json({ status: 'error', message: `PO ${poNumber} not found.` });

    const { error } = await supabase
      .from('po_items')
      .update({ item_status: 'Cancelled' })
      .eq('purchase_order_id', poId)
      .eq('article_code', articleCode);

    if (error) throw error;
    res.json({ status: 'success', message: 'Line item cancelled.' });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

router.patch('/api/shipments/:eeReferenceCode/rto-status', async (req: Request, res: Response) => {
  const { eeReferenceCode } = req.params;
  const { rtoStatus } = req.body;
  if (!rtoStatus) {
    return res.status(400).json({ status: 'error', message: 'rtoStatus is required.' });
  }

  const { data, error } = await supabase
    .from('shipments')
    .update({ rto_status: rtoStatus })
    .eq('ee_reference_code', eeReferenceCode)
    .select('id')
    .maybeSingle();

  if (error) return res.status(500).json({ status: 'error', message: error.message });
  if (!data) return res.status(404).json({ status: 'error', message: `Shipment ${eeReferenceCode} not found.` });

  res.json({ status: 'success', message: 'RTO status updated.' });
});

router.patch('/api/shipments/:eeReferenceCode/pickup-date', async (req: Request, res: Response) => {
  const { eeReferenceCode } = req.params;
  const { pickupDate } = req.body;
  if (!pickupDate) {
    return res.status(400).json({ status: 'error', message: 'pickupDate is required.' });
  }

  const { data, error } = await supabase
    .from('shipments')
    .update({ pickup_date: pickupDate })
    .eq('ee_reference_code', eeReferenceCode)
    .select('id')
    .maybeSingle();

  if (error) return res.status(500).json({ status: 'error', message: error.message });
  if (!data) return res.status(404).json({ status: 'error', message: `Shipment ${eeReferenceCode} not found.` });

  res.json({ status: 'success', message: 'Pickup date updated.' });
});

router.patch('/api/po/:poNumber/shipment-documents', async (req: Request, res: Response) => {
  const { poNumber } = req.params;
  const { poPdfUrl, podImageUrl, grnNumber, grnDate } = req.body;

  const updates: Record<string, any> = {};
  if (poPdfUrl !== undefined) updates.po_pdf_url = poPdfUrl;
  if (podImageUrl !== undefined) updates.pod_image_url = podImageUrl;
  if (grnNumber !== undefined) updates.grn_number = grnNumber;
  if (grnDate !== undefined) updates.grn_date = grnDate;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ status: 'error', message: 'No document fields provided.' });
  }

  const { data, error } = await supabase
    .from('purchase_orders')
    .update(updates)
    .eq('po_number', poNumber)
    .select('id')
    .maybeSingle();

  if (error) return res.status(500).json({ status: 'error', message: error.message });
  if (!data) return res.status(404).json({ status: 'error', message: `PO ${poNumber} not found.` });

  res.json({ status: 'success', message: 'Shipment documents updated.' });
});

router.patch('/api/po/:poNumber/fba-shipment-id', async (req: Request, res: Response) => {
  const poNumber = String(req.params.poNumber);
  const { fbaShipmentId } = req.body;
  if (!fbaShipmentId) {
    return res.status(400).json({ status: 'error', message: 'fbaShipmentId is required.' });
  }

  try {
    const poId = await getPoIdByNumber(poNumber);
    if (!poId) return res.status(404).json({ status: 'error', message: `PO ${poNumber} not found.` });

    const { error } = await supabase
      .from('fba_shipments')
      .upsert({ purchase_order_id: poId, fba_shipment_ids: fbaShipmentId }, { onConflict: 'purchase_order_id' });

    if (error) throw error;
    res.json({ status: 'success', message: 'FBA shipment ID updated.' });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

export default router;
