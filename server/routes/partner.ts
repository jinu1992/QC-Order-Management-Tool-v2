import { Router, type NextFunction, type Request, type Response } from 'express';
import { google } from 'googleapis';
import crypto from 'crypto';
import { parseDelhiveryLabel } from '../partner/labelParser.js';

// Delhivery partner portal (/partner). Partners sign in with Google; the email must be
// on the "Portal Access" tab of the Delhivery tracker sheet (or be @cubelelo.com).
// The browser only ever talks to these routes. They hold PARTNER_PORTAL_SECRET and call
// the Apps Script backend, which re-checks the email on every call, so removing a row
// from "Portal Access" cuts access without waiting for the session to expire.
//
// Env: PARTNER_SESSION_SECRET (signs portal sessions), PARTNER_PORTAL_SECRET (same value
// as the Apps Script property), GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET, and
// GAS_API_URL or VITE_GAS_API_URL.

const SESSION_HOURS = 12;
const MAX_LABEL_BYTES = 3 * 1024 * 1024; // Vercel caps request bodies at 4.5 MB; base64 adds a third

interface PartnerSession {
  email: string;
  name: string;
  internal: boolean;
  exp: number;
}

interface PartnerRequest extends Request {
  partner?: PartnerSession;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

function sign(body: string): string {
  return crypto.createHmac('sha256', requiredEnv('PARTNER_SESSION_SECRET')).update(body).digest('base64url');
}

function issueSession(session: Omit<PartnerSession, 'exp'>): string {
  const body = Buffer.from(JSON.stringify({ ...session, exp: Date.now() + SESSION_HOURS * 3600_000 })).toString('base64url');
  return `${body}.${sign(body)}`;
}

function readSession(token: string): PartnerSession | null {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(sig);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const session = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as PartnerSession;
    return session.exp > Date.now() ? session : null;
  } catch {
    return null;
  }
}

function requirePartner(req: PartnerRequest, res: Response, next: NextFunction) {
  const token = (req.header('authorization') || '').replace(/^Bearer\s+/i, '');
  const session = token ? readSession(token) : null;
  if (!session) return res.status(401).json({ status: 'error', message: 'Your session has expired. Please sign in again.' });
  req.partner = session;
  next();
}

// Apps Script sometimes answers with its HTML error page instead of JSON (mostly right
// after a deploy). Every partner action is safe to repeat, so retry those.
async function callAppsScript(action: string, actorEmail: string, payload: Record<string, unknown> = {}) {
  const url = process.env.GAS_API_URL || requiredEnv('VITE_GAS_API_URL');
  const body = JSON.stringify({ ...payload, action, actorEmail, secret: requiredEnv('PARTNER_PORTAL_SECRET') });
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise(r => setTimeout(r, 1500 * attempt));
    try {
      const res = await fetch(url, { method: 'POST', body, redirect: 'follow' });
      const text = await res.text();
      return JSON.parse(text);
    } catch (e) {
      lastError = e;
    }
  }
  throw new Error(`Backend did not respond: ${(lastError as Error)?.message || 'unknown error'}`);
}

// Popup callback page: hands the result to the portal window that opened it. The
// target origin is pinned so the session token can't be posted to another site.
function popupResponse(res: Response, origin: string, message: Record<string, unknown>) {
  const json = JSON.stringify(message).replace(/</g, '\\u003c');
  res.send(`<!doctype html><html><body><script>
    if (window.opener) window.opener.postMessage(${json}, ${JSON.stringify(origin)});
    window.close();
  </script></body></html>`);
}

export function createPartnerRouter(redirectUri: string): Router {
  const router = Router();
  const appOrigin = new URL(redirectUri).origin;
  const oauthClient = () => new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, redirectUri);

  router.get('/api/partner/auth/url', (_req: Request, res: Response) => {
    const url = oauthClient().generateAuthUrl({
      scope: ['openid', 'email', 'profile'],
      state: 'partner',
      prompt: 'select_account',
    });
    res.json({ url });
  });

  // Shares the app's registered OAuth redirect URI; internal logins (no partner state)
  // fall through to the existing handler
  router.get('/auth/google/callback', async (req: Request, res: Response, next: NextFunction) => {
    if (req.query.state !== 'partner') return next();
    try {
      const client = oauthClient();
      const { tokens } = await client.getToken(String(req.query.code || ''));
      if (!tokens.id_token) throw new Error('Google did not return an identity token.');
      const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: process.env.GOOGLE_CLIENT_ID });
      const payload = ticket.getPayload();
      const email = (payload?.email || '').toLowerCase();
      if (!email || !payload?.email_verified) throw new Error('Google account email is not verified.');

      const access = await callAppsScript('partnerCheckAccess', email);
      if (access.status !== 'success') throw new Error(access.message || 'Access check failed.');
      if (!access.allowed) {
        return popupResponse(res, appOrigin, {
          type: 'PARTNER_AUTH_ERROR',
          message: `${email} is not authorised for this portal. Ask Cubelelo to add it to the access list.`,
        });
      }

      const user = { email, name: access.name || payload.name || email, internal: !!access.internal };
      popupResponse(res, appOrigin, { type: 'PARTNER_AUTH_SUCCESS', token: issueSession(user), user });
    } catch (error: any) {
      console.error('Partner portal login error:', error);
      popupResponse(res, appOrigin, { type: 'PARTNER_AUTH_ERROR', message: `Sign-in failed: ${error.message}` });
    }
  });

  router.get('/api/partner/me', requirePartner, (req: PartnerRequest, res: Response) => {
    const { email, name, internal } = req.partner!;
    res.json({ status: 'success', user: { email, name, internal } });
  });

  router.get('/api/partner/requests', requirePartner, async (req: PartnerRequest, res: Response) => {
    try {
      const result = await callAppsScript('partnerListRequests', req.partner!.email);
      res.status(result.code === 'forbidden' ? 403 : 200).json(result);
    } catch (error: any) {
      res.status(502).json({ status: 'error', message: error.message });
    }
  });

  router.post('/api/partner/submit', requirePartner, async (req: PartnerRequest, res: Response) => {
    const { invoiceNumber, awb, labelBase64 } = req.body || {};
    if (!invoiceNumber || !awb || !labelBase64) {
      return res.status(400).json({ status: 'error', message: 'Request, AWB and label PDF are all required.' });
    }

    const pdf = Buffer.from(String(labelBase64), 'base64');
    if (pdf.length > MAX_LABEL_BYTES) {
      return res.status(413).json({ status: 'error', message: 'Label PDF is too large (max 3 MB).' });
    }
    if (pdf.subarray(0, 5).toString('latin1') !== '%PDF-') {
      return res.status(400).json({ status: 'error', message: 'The label must be a PDF file.' });
    }

    try {
      const label = await parseDelhiveryLabel(new Uint8Array(pdf));
      const result = await callAppsScript('partnerSubmitShipment', req.partner!.email, {
        invoiceNumber: String(invoiceNumber),
        awb: String(awb),
        label,
        labelBase64: pdf.toString('base64'),
      });
      res.status(result.code === 'forbidden' ? 403 : 200).json({ ...result, label });
    } catch (error: any) {
      console.error('Partner submit error:', error);
      res.status(502).json({ status: 'error', message: `Could not process the label: ${error.message}` });
    }
  });

  return router;
}
