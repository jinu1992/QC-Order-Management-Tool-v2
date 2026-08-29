import { Router, type Request, type Response } from 'express';
import { supabase } from '../db/supabaseClient.js';

// Mirrors services/api.ts: fetchStorePocMappings (getStorePocMappings).
const router = Router();

router.get('/api/store-poc-mappings', async (_req: Request, res: Response) => {
  const { data, error } = await supabase
    .from('store_poc_mappings')
    .select('channel, store_code, poc_name, poc_email, poc_phone')
    .order('channel', { ascending: true });

  if (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }

  const mapped = (data || []).map((row) => ({
    channel: row.channel,
    storeCode: row.store_code,
    pocName: row.poc_name || '',
    pocEmail: row.poc_email || '',
    pocPhone: row.poc_phone || '',
  }));

  res.json({ status: 'success', data: mapped });
});

export default router;
