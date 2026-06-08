import express, { Request, Response } from "express";
import { createServer as createViteServer } from "vite";
import { google } from "googleapis";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import fs from "fs";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to recursively scan downloads directory for files
function getAllFiles(dirPath: string, arrayOfFiles: { name: string, path: string, folder: string }[] = []) {
  if (!fs.existsSync(dirPath)) return arrayOfFiles;
  const files = fs.readdirSync(dirPath);

  files.forEach((file) => {
    const filePath = path.join(dirPath, file);
    if (fs.statSync(filePath).isDirectory()) {
      getAllFiles(filePath, arrayOfFiles);
    } else {
      arrayOfFiles.push({
        name: file,
        path: filePath,
        folder: path.basename(dirPath)
      });
    }
  });

  return arrayOfFiles;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  const getRedirectUri = () => {
    if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI;
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
      prompt: "consent",
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

  app.post("/api/trigger-easyecom-fetch", async (req: Request, res: Response) => {
    const { eeReferenceCode } = req.body;
    
    if (!eeReferenceCode) {
      return res.status(400).json({ status: 'error', message: 'No reference code provided.' });
    }

    const scriptPath = path.resolve(__dirname, 'scripts/fetchEasyEcomReport.spec.ts');
    console.log(`Triggering EasyEcom fetch for: ${eeReferenceCode}`);

    const child = spawn(/^win/.test(process.platform) ? 'npx.cmd' : 'npx', [
      'playwright', 'test', scriptPath
    ], {
      env: { ...process.env, TARGET_REF_CODE: eeReferenceCode },
      cwd: __dirname
    });

    child.stdout.on('data', Buffer.prototype.toString);
    child.stderr.on('data', Buffer.prototype.toString);

    child.on('close', (code) => {
      if (code === 0) {
        res.json({ status: 'success', message: 'EasyEcom data fetched and uploaded successfully.' });
      } else {
        res.status(500).json({ status: 'error', message: `Playwright script failed with code ${code}` });
      }
    });

    child.on('error', (err) => {
      console.error("Failed to spawn Playwright child process:", err);
      res.status(500).json({ status: 'error', message: 'Failed to start the fetch process.' });
    });
  });

  // scan local downloads folder
  app.get("/api/local-downloads", (req: Request, res: Response) => {
    try {
      const downloadsDir = path.resolve(__dirname, "..", "downloads");
      if (!fs.existsSync(downloadsDir)) {
        return res.json({ status: 'success', data: [] });
      }
      const filesList = getAllFiles(downloadsDir);
      res.json({ status: 'success', data: filesList });
    } catch (error: any) {
      console.error("Error scanning downloads folder:", error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // read local file and return base64
  app.post("/api/read-local-file", async (req: Request, res: Response) => {
    const { filePath } = req.body;
    if (!filePath) {
      return res.status(400).json({ status: 'error', message: 'File path is required' });
    }

    const downloadsDir = path.resolve(__dirname, "..", "downloads");
    const absoluteFilePath = path.resolve(filePath);
    if (!absoluteFilePath.startsWith(downloadsDir)) {
      return res.status(403).json({ status: 'error', message: 'Access denied: File must be inside the downloads folder.' });
    }

    try {
      if (!fs.existsSync(absoluteFilePath)) {
        return res.status(404).json({ status: 'error', message: 'File not found' });
      }

      const fileBuffer = await fs.promises.readFile(absoluteFilePath);
      const base64Data = fileBuffer.toString('base64');
      const filename = path.basename(absoluteFilePath);
      
      res.json({
        status: 'success',
        fileName: filename,
        fileData: base64Data
      });
    } catch (error: any) {
      console.error("Error reading local file:", error);
      res.status(500).json({ status: 'error', message: error.message });
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
