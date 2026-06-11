import express, { Request, Response } from "express";
import { google } from "googleapis";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
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

app.post("/api/trigger-easyecom-fetch", async (req: Request, res: Response) => {
  const { eeReferenceCode } = req.body;
  
  if (!eeReferenceCode) {
    return res.status(400).json({ status: 'error', message: 'No reference code provided.' });
  }

  const scriptPath = path.resolve(__dirname, '../scripts/fetchEasyEcomReport.spec.ts');
  console.log(`Triggering EasyEcom fetch for: ${eeReferenceCode}`);

  const child = spawn(/^win/.test(process.platform) ? 'npx.cmd' : 'npx', [
    'playwright', 'test', scriptPath
  ], {
    env: { ...process.env, TARGET_REF_CODE: eeReferenceCode },
    cwd: path.resolve(__dirname, '..')
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

// --- Local File and Bot Session Routes (Local environment only) ---
const handleLocalOnlyRoute = (req: Request, res: Response, next: () => void) => {
  if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
    return res.status(400).json({
      status: 'error',
      message: 'Browser automation and local file access are not supported in the cloud/Vercel environment. Please run the application locally using "npm run dev".'
    });
  }
  next();
};

app.get("/api/local-downloads", handleLocalOnlyRoute, (req: Request, res: Response) => {
  try {
    const downloadsDir = path.resolve(__dirname, "../downloads");
    // Helper to recursively scan downloads directory for files
    const getAllFiles = (dirPath: string, arrayOfFiles: { name: string, path: string, folder: string }[] = []) => {
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
    };

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

app.post("/api/read-local-file", handleLocalOnlyRoute, async (req: Request, res: Response) => {
  const { filePath } = req.body;
  if (!filePath) {
    return res.status(400).json({ status: 'error', message: 'File path is required' });
  }

  const downloadsDir = path.resolve(__dirname, "../downloads");
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

// Since the bot sessions and Playwright require libraries not installed on Vercel, 
// we stub these out when running in production/Vercel or return empty statuses.
app.get("/api/bot-sessions", async (req: Request, res: Response) => {
  if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
    return res.json({
      status: 'success',
      results: [
        { portalId: 'blinkit', name: 'Blinkit PartnersBiz', status: 'expired', detail: 'Not supported in cloud environment' },
        { portalId: 'instamart', name: 'Instamart Partner', status: 'expired', detail: 'Not supported in cloud environment' },
        { portalId: 'zepto', name: 'Zepto Brands', status: 'expired', detail: 'Not supported in cloud environment' },
        { portalId: 'flipkart', name: 'Flipkart Vendor Hub', status: 'expired', detail: 'Not supported in cloud environment' }
      ],
      checkedAt: new Date().toISOString()
    });
  }

  res.json({
    status: 'success',
    results: [],
    checkedAt: new Date().toISOString()
  });
});

app.post("/api/bot-sessions/refresh", handleLocalOnlyRoute, (req: Request, res: Response) => {
  res.status(400).json({ status: 'error', message: 'Session refresh is only supported on a local desktop environment.' });
});

app.get("/api/bot-sessions/refresh/:portalId", handleLocalOnlyRoute, (req: Request, res: Response) => {
  res.json({ status: 'success', job: { status: 'idle', message: 'No refresh running' } });
});

app.post("/api/run-bot", handleLocalOnlyRoute, (req: Request, res: Response) => {
  res.status(400).json({ status: 'error', message: 'Running bots is only supported on a local desktop environment.' });
});

export default app;
