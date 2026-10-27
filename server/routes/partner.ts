import { Router, type NextFunction, type Request, type Response } from 'express';
import { google } from 'googleapis';
import crypto from 'crypto';
import { parseDelhiveryLabel, parseScorpionDocs } from '../partner/labelParser.js';

// Self-ship partner portal (/partner) for Urvi Ent, who books each request with Delhivery,
// Scorpion or Bluedart. Partners sign in with Google; the email must be on the "Portal Access" tab
// of the self-ship tracker sheet (or be @cubelelo.com).
// The browser only ever talks to these routes. They hold PARTNER_PORTAL_SECRET and call
// the Apps Script backend, which re-checks the email on every call, so removing a row
// from "Portal Access" cuts access without waiting for the session to expire.
//
// Env: PARTNER_SESSION_SECRET (signs portal sessions), PARTNER_PORTAL_SECRET (same value
// as the Apps Script property), GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET, and
// GAS_API_URL or VITE_GAS_API_URL.

const SESSION_HOURS = 12;
const MAX_LABEL_BYTES = 3 * 1024 * 1024; // Vercel caps request bodies at 4.5 MB; base64 adds a third

// File type from the first bytes, so a renamed file can't pass as a PDF / photo
function sniffMimeType(file: Buffer): string {
  if (file.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (file[0] === 0xff && file[1] === 0xd8 && file[2] === 0xff) return 'image/jpeg';
  if (file.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  return '';
}

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
      try {
        return JSON.parse(text);
      } catch {
        // Keep what Google actually sent, so the error says which page it was
        const title = text.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim() || '';
        const bodyText = (text.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] || text)
          .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
          .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
        throw new Error(`HTTP ${res.status} from ${new URL(res.url).host}: ${title} ${bodyText}`.trim());
      }
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

  // Whether this server can reach the Apps Script backend with the shared secret.
  // Uses a placeholder email that is never on the access list, so it reveals nothing.
  router.get('/api/partner/health', async (_req: Request, res: Response) => {
    try {
      const result = await callAppsScript('partnerCheckAccess', 'healthcheck@invalid');
      const ok = result.status === 'success';
      res.status(ok ? 200 : 502).json({ status: ok ? 'success' : 'error', message: ok ? 'Backend reachable' : result.message });
    } catch (error: any) {
      res.status(502).json({ status: 'error', message: error.message });
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
    const { invoiceNumber, lrn, labelBase64, docketBase64 } = req.body || {};
    // Requests from before the courier choice existed are Delhivery
    const courier = String(req.body?.courier || 'delhivery').toLowerCase();
    if (courier !== 'delhivery' && courier !== 'scorpion' && courier !== 'bluedart') {
      return res.status(400).json({ status: 'error', message: `${courier} shipments can't be submitted yet.` });
    }
    const needsDocket = courier === 'scorpion';
    // A Bluedart waybill is handwritten: a photo (or PDF scan) that Apps Script reads with OCR
    const isBluedart = courier === 'bluedart';
    if (!invoiceNumber || !lrn || !labelBase64 || (needsDocket && !docketBase64)) {
      return res.status(400).json({
        status: 'error',
        message: needsDocket ? 'Request, docket number, box label and docket PDF are all required.'
          : isBluedart ? 'Request, AWB and waybill photo are all required.'
          : 'Request, LRN and label PDF are all required.',
      });
    }

    const files = [labelBase64, ...(needsDocket ? [docketBase64] : [])].map(b => Buffer.from(String(b), 'base64'));
    if (files.reduce((n, file) => n + file.length, 0) > MAX_LABEL_BYTES) {
      return res.status(413).json({ status: 'error', message: 'The files are too large (max 3 MB in total).' });
    }
    const labelMimeType = sniffMimeType(files[0]);
    if (isBluedart ? !labelMimeType : files.some(file => sniffMimeType(file) !== 'application/pdf')) {
      return res.status(400).json({ status: 'error', message: isBluedart ? 'Upload the waybill as a JPG, PNG or PDF.' : 'Upload the documents as PDF files.' });
    }

    try {
      const label = isBluedart ? {}
        : needsDocket ? await parseScorpionDocs(files.map(file => new Uint8Array(file)))
        : await parseDelhiveryLabel(new Uint8Array(files[0]));
      const result = await callAppsScript('partnerSubmitShipment', req.partner!.email, {
        invoiceNumber: String(invoiceNumber),
        courier,
        lrn: String(lrn),
        label,
        labelBase64: files[0].toString('base64'),
        labelMimeType,
        ...(needsDocket ? { docketBase64: files[1].toString('base64') } : {}),
      });
      res.status(result.code === 'forbidden' ? 403 : 200).json({ ...result, label });
    } catch (error: any) {
      console.error('Partner submit error:', error);
      res.status(502).json({ status: 'error', message: `Could not process the documents: ${error.message}` });
    }
  });

  return router;
}
