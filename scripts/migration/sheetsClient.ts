import { google, sheets_v4 } from 'googleapis';

const MAIN_SPREADSHEET_ID = '1YM0dKPWySifYFDyNqCenJ4L85xIBSTrBGNPDcoo6Kfg';

let cachedSheets: sheets_v4.Sheets | null = null;

function getSheetsClient(): sheets_v4.Sheets {
  if (cachedSheets) return cachedSheets;

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_SHEETS_MIGRATION_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_SHEETS_MIGRATION_REFRESH_TOKEN. ' +
      'Run `npm run migrate:auth` once to obtain a refresh token, then add it to .env.'
    );
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  cachedSheets = google.sheets({ version: 'v4', auth: oauth2Client });
  return cachedSheets;
}

// Reads a full sheet tab and returns rows as header-keyed objects, mirroring how the
// old GAS code read `sheet.getDataRange().getValues()` and zipped against headers.
// Blank trailing rows (all-empty cells) are skipped, matching the old
// `row.every(cell => cell === "")` guard seen throughout backend_code.txt.
export async function readSheetAsObjects(sheetName: string): Promise<Record<string, any>[]> {
  const sheets = getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: MAIN_SPREADSHEET_ID,
    range: sheetName,
    valueRenderOption: 'UNFORMATTED_VALUE',
    dateTimeRenderOption: 'FORMATTED_STRING',
  });

  const rows = response.data.values || [];
  if (rows.length <= 1) return [];

  const headers = rows[0].map((h) => String(h || '').trim());
  const records: Record<string, any>[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((cell) => cell === '' || cell === undefined || cell === null)) continue;

    const record: Record<string, any> = {};
    headers.forEach((header, idx) => {
      if (header) record[header] = row[idx];
    });
    records.push(record);
  }

  return records;
}

export { MAIN_SPREADSHEET_ID };
