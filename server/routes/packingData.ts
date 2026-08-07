import { Router, type Request, type Response } from 'express';
import { supabase } from '../db/supabaseClient';

// Mirrors services/api.ts: fetchPackingData (getPackingData), fetchBoxDetails
// (FETCH_BOX_DETAILS). Rows are stored as jsonb (see packing_data table) since the
// source sheet had no fixed schema; each row's `data` blob is spread back out to
// resemble the old getPackingData() header-keyed object shape the frontend expects.
const router = Router();

router.get('/api/packing-data', async (req: Request, res: Response) => {
  const { referenceCode } = req.query;

  let query = supabase.from('packing_data').select('reference_code, box_id, data');
  if (referenceCode) {
    query = query.eq('reference_code', String(referenceCode));
  }

  const { data, error } = await query;
  if (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }

  const mapped = (data || []).map((row) => ({
    'Reference Code': row.reference_code,
    'Box ID': row.box_id,
    ...(row.data || {}),
  }));

  res.json({ status: 'success', data: mapped });
});

router.get('/api/packing-data/:eeReferenceCode/box-summary', async (req: Request, res: Response) => {
  const { eeReferenceCode } = req.params;

  const { data, error } = await supabase
    .from('packing_data')
    .select('box_id, data')
    .eq('reference_code', eeReferenceCode);

  if (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }

  res.json({
    status: 'success',
    data: {
      eeReferenceCode,
      boxCount: (data || []).length,
      boxes: (data || []).map((row) => ({ boxId: row.box_id, ...(row.data || {}) })),
    },
  });
});

export default router;
