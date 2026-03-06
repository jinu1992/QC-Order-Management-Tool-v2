import express, { Request, Response } from "express";
import { createServer as createViteServer } from "vite";
import { google } from "googleapis";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || (process.env.APP_URL ? `${process.env.APP_URL}/auth/google/callback` : `http://localhost:3000/auth/google/callback`)
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

      // Authorization check: Only allow @cubelelo.com emails
      if (!email.endsWith("@cubelelo.com") && email !== "jainendra@cubelelo.com") {
        return res.status(403).json({ 
          status: 'error', 
          message: 'Access Denied. This portal is restricted to @cubelelo.com accounts.' 
        });
      }

      // In a real app, you would fetch the user's role from a database or sheet here.
      // For now, we'll return a default Admin user for authorized emails.
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
      scope: ["https://www.googleapis.com/auth/spreadsheets"],
      prompt: "select_account",
    });
    res.json({ url });
  });

  app.get("/auth/google/callback", async (req: Request, res: Response) => {
    const { code } = req.query;
    try {
      const { tokens } = await oauth2Client.getToken(code as string);
      // In a real app, you'd store this in a session or database
      // For this demo, we'll send it back to the client to store in localStorage (not ideal for production but works for this environment)
      res.send(`
        <html>
          <body>
            <script>
              window.opener.postMessage({ type: 'GOOGLE_AUTH_SUCCESS', tokens: ${JSON.stringify(tokens)} }, '*');
              window.close();
            </script>
          </body>
        </html>
      `);
    } catch (error) {
      console.error("Error getting tokens:", error);
      res.status(500).send("Authentication failed");
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
      // Data is expected to be an array of arrays (rows)
      // We assume the first row is headers
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

startServer();
