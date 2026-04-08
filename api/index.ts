import express, { Request, Response } from "express";
import { google } from "googleapis";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json({ limit: '50mb' }));

const getRedirectUri = () => {
  if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI;
  if (process.env.NEXTAUTH_URL) return `${process.env.NEXTAUTH_URL}/auth/google/callback`;
  if (process.env.APP_URL) return `${process.env.APP_URL}/auth/google/callback`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}/auth/google/callback`;
  return `http://localhost:3000/auth/google/callback`;
};

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  getRedirectUri()
);

// --- Auth Routes ---
app.post("/api/login-google", async (req: Request, res: Response) => {
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

    const email = payload.email || "";
    const name = payload.name || "User";

    if (!email.endsWith("@cubelelo.com") && email !== "jainendra@cubelelo.com") {
      return res.status(403).json({ 
        status: 'error', 
        message: 'Access Denied. This portal is restricted to @cubelelo.com accounts.' 
      });
    }

    res.json({
      status: 'success',
      user: {
        id: payload.sub,
        name: name,
        email: email,
        role: 'Admin',
        avatarInitials: name.charAt(0).toUpperCase(),
        contactNumber: ""
      }
    });
  } catch (error: any) {
    console.error("Google Login Verification Error:", error);
    res.status(401).json({ status: 'error', message: 'Token verification failed: ' + error.message });
  }
});

app.get("/api/auth/google/url", (req: Request, res: Response) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile"
    ],
    prompt: "consent",
  });
  res.json({ url });
});

app.get("/auth/google/callback", async (req: Request, res: Response) => {
  const { code } = req.query;
  try {
    const { tokens } = await oauth2Client.getToken(code as string);
    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    
    const email = userInfo.data.email || "";
    const name = userInfo.data.name || "User";

    // Authorization check
    if (!email.endsWith("@cubelelo.com") && email !== "jainendra@cubelelo.com") {
      return res.send(`
        <html>
          <body>
            <script>
              window.opener.postMessage({ 
                type: 'GOOGLE_AUTH_ERROR', 
                message: 'Access Denied. This portal is restricted to @cubelelo.com accounts.' 
              }, '*');
              window.close();
            </script>
          </body>
        </html>
      `);
    }

    const user = {
      id: userInfo.data.id,
      name: name,
      email: email,
      role: 'Admin',
      avatarInitials: name.charAt(0).toUpperCase(),
      contactNumber: ""
    };

    res.send(`
      <html>
        <body>
          <script>
            window.opener.postMessage({ 
              type: 'GOOGLE_AUTH_SUCCESS', 
              tokens: ${JSON.stringify(tokens)},
              user: ${JSON.stringify(user)}
            }, '*');
            window.close();
          </script>
        </body>
      </html>
    `);
  } catch (error: any) {
    console.error("Error getting tokens:", error);
    res.send(`
      <html>
        <body>
          <script>
            window.opener.postMessage({ 
              type: 'GOOGLE_AUTH_ERROR', 
              message: 'Authentication failed: ${error.message}' 
            }, '*');
            window.close();
          </script>
        </body>
      </html>
    `);
  }
});

app.post("/api/update-google-sheet", async (req: Request, res: Response) => {
  const { tokens, spreadsheetId, data, sheetId } = req.body;

  if (!tokens || !spreadsheetId || !data) {
    return res.status(400).json({ error: "Missing required parameters" });
  }

  try {
    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    auth.setCredentials(tokens);

    const sheets = google.sheets({ version: "v4", auth });

    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
    const sheet = spreadsheet.data.sheets?.find(s => String(s.properties?.sheetId) === String(sheetId));
    const sheetName = sheet?.properties?.title || 'Sheet1';

    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: `${sheetName}!A:Z`,
    });

    const values = data.map((row: any[]) => {
      return row.map(cell => {
        if (typeof cell === 'string' && (cell.startsWith('http://') || cell.startsWith('https://'))) {
          return `=HYPERLINK("${cell}", "Link")`;
        }
        return cell;
      });
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values },
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error("Error updating sheet:", error);
    res.status(500).json({ error: error.message || "Failed to update sheet" });
  }
});

export default app;
