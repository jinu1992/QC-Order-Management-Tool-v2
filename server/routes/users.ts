import { Router, type Request, type Response } from 'express';
import { supabase } from '../db/supabaseClient.js';

// Mirrors services/api.ts: fetchUsers (GET ?action=getUsers), saveUserToSheet (saveUser),
// deleteUserFromSheet (deleteUser). Response shapes match the existing User type in types.ts
// exactly so the frontend service layer can be repointed without changing its own contract.

const router = Router();

function toUserResponse(row: any) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    contactNumber: row.contact_number || '',
    role: row.role,
    avatarInitials: row.avatar_initials || (row.name ? row.name.charAt(0).toUpperCase() : 'U'),
    isInitialized: !!row.is_initialized,
  };
}

router.get('/api/users', async (_req: Request, res: Response) => {
  const { data, error } = await supabase
    .from('users')
    .select('id, name, email, contact_number, role, avatar_initials, is_initialized')
    .order('name', { ascending: true });

  if (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }
  res.json({ status: 'success', data: (data || []).map(toUserResponse) });
});

router.post('/api/users', async (req: Request, res: Response) => {
  const { id, name, email, contactNumber, role, avatarInitials, isInitialized } = req.body;

  if (!email || !name) {
    return res.status(400).json({ status: 'error', message: 'name and email are required.' });
  }

  const payload = {
    name,
    email,
    contact_number: contactNumber || null,
    role: role || 'Limited Access',
    avatar_initials: avatarInitials || name.charAt(0).toUpperCase(),
    is_initialized: isInitialized ?? true,
  };

  const query = id
    ? supabase.from('users').update(payload).eq('id', id)
    : supabase.from('users').upsert({ ...payload }, { onConflict: 'email' });

  const { data, error } = await query
    .select('id, name, email, contact_number, role, avatar_initials, is_initialized')
    .single();

  if (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }
  res.json({ status: 'success', message: 'User saved.', user: toUserResponse(data) });
});

router.delete('/api/users/:userId', async (req: Request, res: Response) => {
  const { userId } = req.params;
  const { error } = await supabase.from('users').delete().eq('id', userId);

  if (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }
  res.json({ status: 'success', message: 'User deleted.' });
});

export default router;
