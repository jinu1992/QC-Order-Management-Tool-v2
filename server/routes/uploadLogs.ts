import { Router, type Request, type Response } from 'express';
import { supabase } from '../db/supabaseClient.js';

// Mirrors services/api.ts: fetchUploadMetadata (getUploadMetadata), logFileUpload.
//
// NOTE: the old GAS logFileUpload() also dispatched to file-parsing functions
// (UpdatePackingListData, ProcessFlipkartMinutesPO, ProcessAmazonB2BShipment) based on
// functionId. That parsing logic is Tier 3 business logic (Phase D), not Tier 1 CRUD --
// this endpoint only records the audit log entry for now. Phase D will extend it to
// actually dispatch to the ported parsers before returning 'Success' vs 'Pending'.
const router = Router();

const FUNCTION_NAME_MAP: Record<string, string> = {
  'b2b-packing-list': 'B2B Packing List Data',
  'flipkart-minutes-po': 'FlipkartMinutes PO Upload',
  'amazon-b2b-shipment': 'Amazon B2B Shipment Plan',
};

router.get('/api/upload-logs', async (_req: Request, res: Response) => {
  const { data, error } = await supabase
    .from('upload_logs')
    .select('id, function_name, uploaded_by, uploaded_at, status')
    .order('uploaded_at', { ascending: false })
    .limit(200);

  if (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }

  const mapped = (data || []).map((row) => ({
    id: row.id,
    functionName: row.function_name,
    lastUploadedBy: row.uploaded_by || '',
    lastUploadedAt: row.uploaded_at,
    status: row.status,
  }));

  res.json({ status: 'success', data: mapped });
});

router.post('/api/upload-logs', async (req: Request, res: Response) => {
  const { functionId, userName, fileName } = req.body;

  if (!functionId || !userName) {
    return res.status(400).json({ status: 'error', message: 'functionId and userName are required.' });
  }

  // Parsing/processing dispatch not yet wired -- logged as Pending until Phase D lands
  // the corresponding parser for this functionId.
  const status = 'Pending';
  const displayName = FUNCTION_NAME_MAP[functionId] || functionId;

  const { error } = await supabase.from('upload_logs').insert({
    function_name: displayName,
    uploaded_by: userName,
    status,
    file_url: null,
  });

  if (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }

  res.json({
    status: 'success',
    message: 'File upload logged. Processing for this file type will be enabled in a later phase.',
  });
});

export default router;
