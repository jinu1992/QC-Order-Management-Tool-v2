import dotenv from 'dotenv';
dotenv.config();

import http from 'http';
import { google } from 'googleapis';

// One-time interactive script to obtain a refresh token for the migration script's
// read-only access to the source Google Sheet. Run once with `npm run migrate:auth`,
// approve the consent screen, and the resulting refresh token gets printed for you to
// add to .env as GOOGLE_SHEETS_MIGRATION_REFRESH_TOKEN. The migration script
// (migrateSheetsToSupabase.ts) reuses that token non-interactively for every
// subsequent run, including the final re-run right before cutover.
//
// Reuses the same GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET already registered for the
// app's OAuth login flow -- requests a different (read-only Sheets) scope, and a
// dedicated localhost redirect URI that must be added to the OAuth client's Authorized
// redirect URIs allowlist first (Google Cloud Console > APIs & Services > Credentials).
//
// This requires http://localhost:3000/oauth2callback to be registered on the client.
// Two other approaches were tried and abandoned: the manual copy/paste "OOB" flow
// (redirect_uri=urn:ietf:wg:oauth:2.0:oob) is blocked by Google on this client type,
// and reusing the app's own deployed production callback consistently returned
// invalid_grant (its own token exchange appears to race/consume the code first).

const REDIRECT_URI = 'http://localhost:3000/oauth2callback';
const PORT = 3000;

async function main() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in .env.');
    process.exit(1);
  }

  console.log(
    '\nBefore continuing: http://localhost:3000/oauth2callback must be added as an ' +
    'authorized redirect URI on this OAuth client in the Google Cloud Console ' +
    '(APIs & Services > Credentials > this client > Authorized redirect URIs), or the ' +
    'consent flow below will fail with redirect_uri_mismatch.\n'
  );

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });

  console.log('Open this URL in a browser and approve access with an @cubelelo.com account:\n');
  console.log(authUrl, '\n');
  console.log('Waiting for redirect on http://localhost:3000/oauth2callback ...\n');

  const code = await new Promise<string>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || '', REDIRECT_URI);
      if (url.pathname !== '/oauth2callback') {
        res.writeHead(404);
        res.end();
        return;
      }
      const authCode = url.searchParams.get('code');
      const error = url.searchParams.get('error');

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(error ? `<h1>Auth failed: ${error}</h1>` : '<h1>Success. You can close this tab.</h1>');
      server.close();

      if (error || !authCode) reject(new Error(error || 'No code returned'));
      else resolve(authCode);
    });
    server.listen(PORT);
  });

  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.refresh_token) {
    console.error(
      '\nNo refresh_token returned. This usually means the account already granted ' +
      'consent before -- revoke access at https://myaccount.google.com/permissions ' +
      'for this app and re-run this script.'
    );
    process.exit(1);
  }

  console.log('\nSuccess. Add this line to your .env file:\n');
  console.log(`GOOGLE_SHEETS_MIGRATION_REFRESH_TOKEN=${tokens.refresh_token}\n`);
}

main().catch((err) => {
  console.error('Failed to obtain refresh token:', err);
  process.exit(1);
});
