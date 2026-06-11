import express, { Request, Response } from "express";
import { createServer as createViteServer } from "vite";
import { google } from "googleapis";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import fs from "fs";
import { chromium } from "playwright";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface PortalConfig {
  id: string;
  name: string;
  stateFile: string;
  checkUrl: string;
  loginUrl: string;
  host: string;
  loggedOutUrlRegex: RegExp;
  requiredCookieNames?: string[];
  requiredCookiePattern?: RegExp;
}

interface RefreshJob {
  portalId: string;
  status: 'starting' | 'waiting-login' | 'completed' | 'failed' | 'idle';
  message: string;
  startedAt?: string;
  finishedAt?: string | null;
  updatedAt?: string;
}

const HARD_EXPIRY_HOURS = 24;
const HARD_EXPIRY_MS = HARD_EXPIRY_HOURS * 60 * 60 * 1000;
const PARENT_DIR = path.resolve(__dirname, "..");

const PORTALS: Record<string, PortalConfig> = {
  flipkart: {
    id: "flipkart",
    name: "Flipkart Vendor Hub",
    stateFile: path.join(__dirname, "bots", "vendor_state.json"),
    checkUrl: "https://vendorhub.flipkart.com/#/welcome/select-account",
    loginUrl: "https://vendorhub.flipkart.com/#/welcome/login",
    host: "vendorhub.flipkart.com",
    loggedOutUrlRegex: /welcome\/login|\/login/i,
    requiredCookieNames: ["access_token"],
  },
  instamart: {
    id: "instamart",
    name: "Instamart Partner",
    stateFile: path.join(__dirname, "bots", "instamart_state.json"),
    checkUrl: "https://partner.instamart.in/",
    loginUrl: "https://partner.instamart.in/login",
    host: "partner.instamart.in",
    loggedOutUrlRegex: /\/login|auth|otp|signin/i,
    requiredCookieNames: ["__IM_ADS_ACCESS_TOKEN__"],
  },
  blinkit: {
    id: "blinkit",
    name: "Blinkit PartnersBiz",
    stateFile: path.join(__dirname, "bots", "partnersbiz_state.json"),
    checkUrl: "https://www.partnersbiz.com/",
    loginUrl: "https://www.partnersbiz.com/",
    host: "www.partnersbiz.com",
    loggedOutUrlRegex: /\/login|auth|signin/i,
    requiredCookieNames: ["access_token", "refresh_token"],
  },
  zepto: {
    id: "zepto",
    name: "Zepto Brands",
    stateFile: path.join(__dirname, "bots", "zepto-brands-state.json"),
    checkUrl: "https://brands.zepto.co.in/vendor/po/grn",
    loginUrl: "https://brands.zepto.co.in/login",
    host: "brands.zepto.co.in",
    loggedOutUrlRegex: /\/login|auth|signin|otp/i,
    requiredCookiePattern: /_AUTH_TOKEN$/,
  },
};

const refreshJobs = new Map<string, RefreshJob>();

function formatDuration(ms: number) {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

function isLoggedOutUrl(portal: PortalConfig, url: string) {
  if (!url) return true;
  if (!url.includes(portal.host)) return true;
  return portal.loggedOutUrlRegex.test(url);
}

function hasRequiredAuthCookies(portal: PortalConfig, cookies: any[]) {
  if (!Array.isArray(cookies) || cookies.length === 0) {
    return false;
  }

  const hostCookies = cookies.filter((cookie) =>
    typeof cookie.domain === "string" && cookie.domain.includes(portal.host),
  );

  if (hostCookies.length === 0) {
    return false;
  }

  const names = hostCookies.map((cookie) => cookie.name);

  if (Array.isArray(portal.requiredCookieNames) && portal.requiredCookieNames.length > 0) {
    const hasAnyRequired = portal.requiredCookieNames.some((requiredName) => names.includes(requiredName));
    if (!hasAnyRequired) {
      return false;
    }
  }

  if (portal.requiredCookiePattern instanceof RegExp) {
    return names.some((name) => portal.requiredCookiePattern!.test(name));
  }

  return true;
}

async function checkPortalSession(portal: PortalConfig) {
  if (!fs.existsSync(portal.stateFile)) {
    return {
      portalId: portal.id,
      name: portal.name,
      status: "expired",
      detail: "State file not found",
      stateFile: path.basename(portal.stateFile),
      checkedAt: new Date().toISOString(),
    };
  }

  const stat = fs.statSync(portal.stateFile);
  const stateModifiedAt = stat.mtime;
  const stateAgeMs = Date.now() - stateModifiedAt.getTime();
  const expiredByAge = stateAgeMs > HARD_EXPIRY_MS;

  let browser: any;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      storageState: portal.stateFile,
      ignoreHTTPSErrors: true,
    });

    const page = await context.newPage();
    await page.goto(portal.checkUrl, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    await page.waitForTimeout(2500);

    const finalUrl = page.url();
    const cookies = await context.cookies(portal.checkUrl);
    const loggedOutByUrl = isLoggedOutUrl(portal, finalUrl);
    const hasAuthCookie = hasRequiredAuthCookies(portal, cookies);
    const expired = loggedOutByUrl || !hasAuthCookie || expiredByAge;

    let detail = "Session looks valid";
    if (loggedOutByUrl) {
      detail = "Redirected to login";
    } else if (!hasAuthCookie) {
      detail = "Auth token cookie missing";
    } else if (expiredByAge) {
      detail = `Session older than ${HARD_EXPIRY_HOURS}h (age: ${formatDuration(stateAgeMs)})`;
    }

    return {
      portalId: portal.id,
      name: portal.name,
      status: expired ? "expired" : "active",
      detail,
      finalUrl,
      stateFile: path.basename(portal.stateFile),
      stateModifiedAt: stateModifiedAt.toISOString(),
      stateAgeHours: Number((stateAgeMs / 3600000).toFixed(2)),
      checkedAt: new Date().toISOString(),
    };
  } catch (error: any) {
    return {
      portalId: portal.id,
      name: portal.name,
      status: "error",
      detail: error?.message || String(error),
      stateFile: path.basename(portal.stateFile),
      stateModifiedAt: stateModifiedAt ? stateModifiedAt.toISOString() : new Date().toISOString(),
      stateAgeHours: stateModifiedAt ? Number((stateAgeMs / 3600000).toFixed(2)) : null,
      checkedAt: new Date().toISOString(),
    };
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

async function waitForManualLogin(page: any, context: any, portal: PortalConfig, timeoutMs: number) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    if (page.isClosed()) {
      throw new Error("Browser window was closed before login completed");
    }

    const currentUrl = page.url();
    if (!isLoggedOutUrl(portal, currentUrl)) {
      const cookies = await context.cookies(portal.checkUrl);
      if (!hasRequiredAuthCookies(portal, cookies)) {
        await page.waitForTimeout(1500);
        continue;
      }

      await page.waitForTimeout(1500);
      return;
    }

    await page.waitForTimeout(2000);
  }

  throw new Error("Timed out while waiting for manual login");
}

function startRefreshJob(portal: PortalConfig) {
  const existing = refreshJobs.get(portal.id);
  if (existing && (existing.status === "starting" || existing.status === "waiting-login")) {
    return existing;
  }

  const job: RefreshJob = {
    portalId: portal.id,
    status: "starting",
    message: "Opening browser for manual login...",
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    finishedAt: null,
  };

  refreshJobs.set(portal.id, job);

  (async () => {
    let browser: any;
    try {
      browser = await chromium.launch({ headless: false });
      const context = await browser.newContext({ ignoreHTTPSErrors: true });
      const page = await context.newPage();

      job.status = "waiting-login";
      job.message = "Browser opened. Please login manually. Session will save automatically.";
      job.updatedAt = new Date().toISOString();

      await page.goto(portal.loginUrl, { waitUntil: "domcontentloaded", timeout: 45000 });

      await waitForManualLogin(page, context, portal, 30 * 60 * 1000);

      await context.storageState({ path: portal.stateFile });

      const verification = await checkPortalSession(portal);
      if (verification.status !== "active") {
        throw new Error(`Session saved but verification failed: ${verification.detail}`);
      }

      job.status = "completed";
      job.message = "Session refreshed and saved successfully.";
      job.finishedAt = new Date().toISOString();
      job.updatedAt = new Date().toISOString();

      await browser.close();
    } catch (error: any) {
      if (browser) {
        await browser.close().catch(() => {});
      }
      job.status = "failed";
      job.message = error?.message || String(error);
      job.finishedAt = new Date().toISOString();
      job.updatedAt = new Date().toISOString();
    }
  })();

  return job;
}

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
      const downloadsDir = path.resolve(__dirname, "downloads");
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

    const downloadsDir = path.resolve(__dirname, "downloads");
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

  // --- Bot Session Management & Run Routes ---
  app.get("/api/bot-sessions", async (req: Request, res: Response) => {
    try {
      const results = await Promise.all(Object.values(PORTALS).map((p) => checkPortalSession(p)));
      res.json({
        status: 'success',
        results,
        checkedAt: new Date().toISOString()
      });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  app.post("/api/bot-sessions/refresh", (req: Request, res: Response) => {
    const { portalId } = req.body;
    if (!portalId || !PORTALS[portalId]) {
      return res.status(400).json({ status: 'error', message: 'Invalid or missing portalId' });
    }
    const portal = PORTALS[portalId];
    const job = startRefreshJob(portal);
    res.json({
      status: 'success',
      portalId: portal.id,
      jobStatus: job.status,
      message: job.message
    });
  });

  app.get("/api/bot-sessions/refresh/:portalId", (req: Request, res: Response) => {
    const portalId = req.params.portalId as string;
    if (!portalId || !PORTALS[portalId]) {
      return res.status(404).json({ status: 'error', message: 'Unknown portal ID' });
    }
    const job = refreshJobs.get(portalId) || {
      portalId,
      status: "idle",
      message: "No refresh running"
    };
    res.json({
      status: 'success',
      job
    });
  });

  app.post("/api/run-bot", (req: Request, res: Response) => {
    const { portalId } = req.body;
    if (!portalId || !PORTALS[portalId]) {
      return res.status(400).json({ status: 'error', message: 'Invalid or missing portalId' });
    }

    const scriptName = portalId === 'flipkart' ? 'flipkart_report.cjs' : 
                       portalId === 'blinkit' ? 'blinkit_report.cjs' : 
                       portalId === 'instamart' ? 'instamart_report.cjs' : 'zepto_report.cjs';

    const scriptPath = path.resolve(__dirname, "bots", scriptName);

    if (!fs.existsSync(scriptPath)) {
      return res.status(404).json({ status: 'error', message: `Bot script not found at ${scriptPath}` });
    }

    console.log(`Spawning bot: node ${scriptPath}`);
    const botsDir = path.resolve(__dirname, "bots");
    
    const child = spawn('node', [scriptPath], {
      cwd: botsDir,
      env: { ...process.env },
      detached: true,
      stdio: 'pipe'
    });

    child.stdout?.on('data', (data) => console.log(`[BOT ${portalId}] ${data.toString().trim()}`));
    child.stderr?.on('data', (data) => console.error(`[BOT ${portalId} ERROR] ${data.toString().trim()}`));

    child.unref();

    res.json({
      status: 'success',
      message: `Bot execution triggered for ${portalId}.`
    });
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
