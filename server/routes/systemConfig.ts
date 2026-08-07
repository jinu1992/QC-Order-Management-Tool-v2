import { Router, type Request, type Response } from 'express';
import { supabase } from '../db/supabaseClient';

// Mirrors services/api.ts: fetchSystemConfig (getSystemConfig), saveSystemConfig.
// system_config is a flat key/value table (key text primary key, value jsonb) -- the
// frontend treats the whole set as a single object, so we fold rows into one object
// on read and upsert one row per top-level key on write.
const router = Router();

router.get('/api/system-config', async (_req: Request, res: Response) => {
  const { data, error } = await supabase.from('system_config').select('key, value');

  if (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }

  const config: Record<string, any> = {};
  for (const row of data || []) {
    config[row.key] = row.value;
  }
  res.json({ status: 'success', data: config });
});

router.post('/api/system-config', async (req: Request, res: Response) => {
  const config = req.body || {};
  const entries = Object.entries(config);

  if (entries.length === 0) {
    return res.status(400).json({ status: 'error', message: 'No config keys provided.' });
  }

  const rows = entries.map(([key, value]) => ({ key, value }));
  const { error } = await supabase.from('system_config').upsert(rows, { onConflict: 'key' });

  if (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }
  res.json({ status: 'success', message: 'System config saved.' });
});

export default router;
