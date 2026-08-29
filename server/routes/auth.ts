import { Router, type Request, type Response } from 'express';
import { google } from 'googleapis';
import { supabase } from '../db/supabaseClient.js';

const CUBELELO_DOMAIN = '@cubelelo.com';
const EXTRA_ALLOWED_EMAILS = new Set(['jainendra@cubelelo.com']);

function isAllowedEmail(email: string): boolean {
  return email.endsWith(CUBELELO_DOMAIN) || EXTRA_ALLOWED_EMAILS.has(email);
}

// Looks up the user's real role from Supabase. Replaces the old behavior where every
// authorized email was handed a hardcoded 'Admin' role regardless of their actual
// permissions. If the email has never logged in before, a row is created with role
// 'Limited Access' (least-privilege default) and is_initialized=false, so an existing
// Admin has to explicitly promote them via the Admin panel before they get more access.
async function resolveOrCreateUser(email: string, name: string) {
  const { data: existing, error: lookupError } = await supabase
    .from('users')
    .select('id, name, email, contact_number, role, avatar_initials, is_initialized')
    .eq('email', email)
    .maybeSingle();

  if (lookupError) throw lookupError;

  if (existing) {
    return existing;
  }

  const { data: created, error: insertError } = await supabase
    .from('users')
    .insert({
      name,
      email,
      role: 'Limited Access',
      avatar_initials: name.charAt(0).toUpperCase(),
      is_initialized: false,
    })
    .select('id, name, email, contact_number, role, avatar_initials, is_initialized')
    .single();

  if (insertError) throw insertError;
  return created;
}

function toUserResponse(row: Awaited<ReturnType<typeof resolveOrCreateUser>>) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    contactNumber: row.contact_number || '',
    role: row.role,
    avatarInitials: row.avatar_initials || row.name.charAt(0).toUpperCase(),
    isInitialized: row.is_initialized,
  };
}

export function createAuthRouter(oauth2Client: InstanceType<typeof google.auth.OAuth2>): Router {
  const router = Router();

  router.post('/api/login-google', async (req: Request, res: Response) => {
    const { idToken } = req.body;
    if (!idToken) {
      return res.status(400).json({ status: 'error', message: 'ID Token is required' });
    }

    try {
      const ticket = await oauth2Client.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload();

      if (!payload) {
        return res.status(401).json({ status: 'error', message: 'Invalid ID Token' });
      }

      const email = payload.email || '';
      const name = payload.name || 'User';

      if (!isAllowedEmail(email)) {
        return res.status(403).json({
          status: 'error',
          message: 'Access Denied. This portal is restricted to @cubelelo.com accounts.',
        });
      }

      const userRow = await resolveOrCreateUser(email, name);
      res.json({ status: 'success', user: toUserResponse(userRow) });
    } catch (error: any) {
      console.error('Google Login Verification Error:', error);
      res.status(401).json({ status: 'error', message: 'Token verification failed: ' + error.message });
    }
  });

  return router;
}
