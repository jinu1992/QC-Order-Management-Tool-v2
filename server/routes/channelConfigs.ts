import { Router, type Request, type Response } from 'express';
import { supabase } from '../db/supabaseClient';

// Mirrors services/api.ts: fetchChannelConfigs (getChannelConfigs), saveChannelConfig.
const router = Router();

function toChannelConfigResponse(row: any) {
  return {
    id: row.channel_name,
    channelName: row.channel_name,
    status: row.status,
    sourceEmail: row.source_email || '',
    searchKeyword: row.search_keyword || '',
    minOrderThreshold: Number(row.min_order_threshold || 0),
    pocName: row.poc_name || '',
    pocEmail: row.poc_email || '',
    pocPhone: row.poc_phone || '',
    appointmentTo: row.appointment_to || '',
    appointmentCc: row.appointment_cc || '',
  };
}

router.get('/api/channel-configs', async (_req: Request, res: Response) => {
  const { data, error } = await supabase
    .from('channel_configs')
    .select('*')
    .order('channel_name', { ascending: true });

  if (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }
  res.json({ status: 'success', data: (data || []).map(toChannelConfigResponse) });
});

router.post('/api/channel-configs', async (req: Request, res: Response) => {
  const {
    channelName, status, sourceEmail, searchKeyword, minOrderThreshold,
    pocName, pocEmail, pocPhone, appointmentTo, appointmentCc,
  } = req.body;

  if (!channelName) {
    return res.status(400).json({ status: 'error', message: 'channelName is required.' });
  }

  const { data, error } = await supabase
    .from('channel_configs')
    .upsert({
      channel_name: channelName,
      status: status || 'Active',
      source_email: sourceEmail || null,
      search_keyword: searchKeyword || null,
      min_order_threshold: minOrderThreshold ?? 0,
      poc_name: pocName || null,
      poc_email: pocEmail || null,
      poc_phone: pocPhone || null,
      appointment_to: appointmentTo || null,
      appointment_cc: appointmentCc || null,
    }, { onConflict: 'channel_name' })
    .select('*')
    .single();

  if (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }
  res.json({ status: 'success', message: 'Channel config saved.', data: toChannelConfigResponse(data) });
});

export default router;
