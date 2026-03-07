import express, { Request, Response } from "express";
import { createServer as createViteServer } from "vite";
import { google } from "googleapis";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(express.json({ limit: '50mb' }));

// Health check route - should always return JSON
app.get("/api/health", (req, res) => {
  res.json({ 
    status: 'ok', 
    env: process.env.NODE_ENV,
    hasClientId: !!process.env.GOOGLE_CLIENT_ID,
    hasClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
    vercelUrl: process.env.VERCEL_URL || 'not-set'
  });
});

const getRedirectUri = () => {
  const uri = process.env.GOOGLE_REDIRECT_URI || 
              (process.env.APP_URL ? `${process.env.APP_URL}/auth/google/callback` : null) ||
              (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}/auth/google/callback` : null) ||
              `http://localhost:3000/auth/google/callback`;
  return uri;
};

const getOauth2Client = () => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return null;
  }
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    getRedirectUri()
  );
};

const oauth2Client = getOauth2Client();

// --- Auth Routes ---
app.post("/api/login-google", async (req: Request, res: Response) => {
  const { idToken } = req.body;
  if (!idToken) {
    return res.status(400).json({ status: 'error', message: 'ID Token is required' });
  }

  if (!oauth2Client) {
    return res.status(500).json({ status: 'error', message: 'Server configuration error: OAuth2 client not initialized' });
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

    // Authorization check: Only allow @cubelelo.com emails
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
  try {
    if (!oauth2Client) {
      console.error("OAuth2 client not initialized");
      return res.status(500).json({ status: 'error', message: 'Server configuration error: Missing Google credentials' });
    }

    const url = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile"
      ],
      prompt: "select_account",
    });
    res.json({ url });
  } catch (error: any) {
    console.error("Error generating Auth URL:", error);
    res.status(500).json({ status: 'error', message: 'Failed to generate Auth URL: ' + error.message });
  }
});

app.get("/auth/google/callback", async (req: Request, res: Response) => {
  const { code } = req.query;
  try {
    if (!oauth2Client) {
      throw new Error("OAuth2 client not initialized");
    }
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
              if (window.opener) {
                window.opener.postMessage({ 
                  type: 'GOOGLE_AUTH_ERROR', 
                  message: 'Access Denied. This portal is restricted to @cubelelo.com accounts.' 
                }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
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
            if (window.opener) {
              window.opener.postMessage({ 
                type: 'GOOGLE_AUTH_SUCCESS', 
                tokens: ${JSON.stringify(tokens)},
                user: ${JSON.stringify(user)}
              }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
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
            if (window.opener) {
              window.opener.postMessage({ 
                type: 'GOOGLE_AUTH_ERROR', 
                message: 'Authentication failed: ${error.message}' 
              }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
        </body>
      </html>
    `);
  }
});

// --- Google Sheets Update Route ---
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

    // 1. Find the sheet name by gid (sheetId)
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
    const sheet = spreadsheet.data.sheets?.find(s => String(s.properties?.sheetId) === String(sheetId));
    const sheetName = sheet?.properties?.title || 'Sheet1';

    // 2. Clear the sheet
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: `${sheetName}!A:Z`,
    });

    // 3. Prepare data with hyperlinks
    const values = data.map((row: any[]) => {
      return row.map(cell => {
        if (typeof cell === 'string' && (cell.startsWith('http://') || cell.startsWith('https://'))) {
          return `=HYPERLINK("${cell}", "Link")`;
        }
        return cell;
      });
    });

    // 4. Update the sheet
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

async function startServer() {
  const PORT = 3000;

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req: Request, res: Response) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

if (process.env.NODE_ENV !== "production" || import.meta.url === `file://${process.argv[1]}`) {
  startServer().catch(err => {
    console.error("CRITICAL: Failed to start server:", err);
    process.exit(1);
  });
}
