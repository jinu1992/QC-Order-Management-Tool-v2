import type { NextFunction, Request, Response } from 'express';
import type { Role, ViewType } from '../../types.js';
import { roleCanAccess } from '../permissions.js';
import { supabase } from '../db/supabaseClient.js';

// Attaches the authenticated user (looked up by email) onto the request, replacing
// the old behavior where /api/login-google granted every @cubelelo.com email Admin
// regardless of their actual row in the users table.
export interface AuthedRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
    role: Role;
  };
}

export async function attachUser(req: AuthedRequest, res: Response, next: NextFunction) {
  const email = req.header('x-user-email');
  if (!email) {
    return res.status(401).json({ status: 'error', message: 'Missing authenticated user.' });
  }

  const { data, error } = await supabase
    .from('users')
    .select('id, email, name, role')
    .eq('email', email)
    .single();

  if (error || !data) {
    return res.status(401).json({ status: 'error', message: 'User not found or not initialized.' });
  }

  req.user = data as AuthedRequest['user'];
  next();
}

// Gate a route to a specific view's permission (matches the frontend's ViewType
// sidebar gating, enforced server-side so a hidden UI element isn't the only defense).
export function requireView(view: ViewType) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ status: 'error', message: 'Not authenticated.' });
    }
    if (!roleCanAccess(req.user.role, view)) {
      return res.status(403).json({ status: 'error', message: `Role '${req.user.role}' cannot access '${view}'.` });
    }
    next();
  };
}
