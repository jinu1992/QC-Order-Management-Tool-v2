import { Router, type Request, type Response } from 'express';
import { supabase } from '../db/supabaseClient';

// Mirrors services/api.ts: fetchInventoryFromSheet (getInventory), createInventoryItem
// (createItem), updateInventoryPrice (updatePrice).
const router = Router();

function toInventoryResponse(row: any) {
  return {
    id: row.id,
    channel: row.channel || 'Unknown',
    articleCode: row.article_code || '',
    sku: row.sku || '',
    ean: row.ean || '',
    itemName: row.item_name || '',
    mrp: Number(row.mrp || 0),
    basicPrice: Number(row.basic_price || 0),
    spIncTax: Number(row.sp_inc_tax || 0),
    stock: Number(row.stock || 0),
    size: row.size || '',
  };
}

router.get('/api/inventory', async (_req: Request, res: Response) => {
  const { data, error } = await supabase
    .from('inventory')
    .select('*')
    .order('channel', { ascending: true });

  if (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }
  res.json({ status: 'success', data: (data || []).map(toInventoryResponse) });
});

router.post('/api/inventory', async (req: Request, res: Response) => {
  const { channel, articleCode, sku, ean, itemName, mrp, basicPrice, spIncTax, stock, size } = req.body;

  if (!channel || !articleCode) {
    return res.status(400).json({ status: 'error', message: 'channel and articleCode are required.' });
  }

  const { data, error } = await supabase
    .from('inventory')
    .upsert({
      channel,
      article_code: articleCode,
      sku: sku || null,
      ean: ean || null,
      item_name: itemName || null,
      mrp: mrp ?? 0,
      basic_price: basicPrice ?? 0,
      sp_inc_tax: spIncTax ?? 0,
      stock: stock ?? 0,
      size: size || null,
    }, { onConflict: 'channel,article_code' })
    .select('*')
    .single();

  if (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }
  res.json({ status: 'success', message: 'Inventory item saved.', data: toInventoryResponse(data) });
});

router.patch('/api/inventory/price', async (req: Request, res: Response) => {
  const { channel, articleCode, newPrice } = req.body;

  if (!channel || !articleCode || newPrice === undefined) {
    return res.status(400).json({ status: 'error', message: 'channel, articleCode and newPrice are required.' });
  }

  const { data, error } = await supabase
    .from('inventory')
    .update({ sp_inc_tax: newPrice })
    .eq('channel', channel)
    .eq('article_code', articleCode)
    .select('*')
    .single();

  if (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }
  res.json({ status: 'success', message: 'Price updated.', data: toInventoryResponse(data) });
});

export default router;
