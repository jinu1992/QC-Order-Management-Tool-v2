import { test, expect } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.join(process.cwd(), '.env') });

test('Fetch B2B Packing List Report', async ({ page }) => {
  // Anti-bot measures
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9',
  });

  console.log('CWD:', process.cwd());
  const envPath = path.join(process.cwd(), '.env');
  console.log('Env path:', envPath);
  console.log('Env file exists:', fs.existsSync(envPath));

  console.log('Loading credentials from .env...');
  const email = process.env.EASY_ECOM_EMAIL;
  const password = process.env.EASY_ECOM_PASSWORD;

  if (!email || !password) {
    console.log('Email:', email ? 'PRESENT' : 'MISSING');
    console.log('Password:', password ? 'PRESENT' : 'MISSING');
    throw new Error('EASY_ECOM_EMAIL or EASY_ECOM_PASSWORD not set in .env');
  }

  // Ensure reports directory exists
  const reportsDir = path.join(process.cwd(), 'reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir);
  }

  console.log('Navigating to EasyEcom login...');
  await page.goto('https://app.easyecom.io/V2/account/auth/login?branding=null');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'reports/screenshot-1-login.png' });
  
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  
  await page.waitForTimeout(2000);
  await page.getByRole('textbox', { name: 'Password' }).fill(password);
  await page.screenshot({ path: 'reports/screenshot-2-password.png' });
  await page.getByRole('button', { name: 'Log In' }).click();

  console.log('Handling post-login account selection...');
  await page.waitForTimeout(5000);
  await page.screenshot({ path: 'reports/screenshot-3-auth-check.png' });
  
  // Account selection step - Click the first "Sign In" button
  try {
     const signInBtn = page.getByRole('button', { name: 'Sign In' }).first();
     if (await signInBtn.isVisible({ timeout: 10000 })) {
       console.log('Clicking the primary account Sign In button...');
       await signInBtn.click();
       await page.waitForTimeout(5000);
     } else {
       console.log('Sign In button NOT visible.');
     }
  } catch (e: any) {
     console.log('Account selection error:', e.message);
  }

  // Handle various popups/modals robustly
  console.log('Handling post-login screens (modals)...');
  const modalsToClose = ['Close', 'Got it', 'Sign In', 'Dismiss'];

  for (let attempt = 0; attempt < 3; attempt++) {
    for (const name of modalsToClose) {
      try {
        const btn = page.getByRole('button', { name: name, exact: false }).first();
        if (await btn.isVisible({ timeout: 2000 })) {
          console.log(`Closing modal: ${name} (Attempt ${attempt + 1})`);
          await btn.click();
          await page.waitForTimeout(2000);
        }
      } catch (e) {}
    }
  }

  // Fallback for the specific "New Features" modal if still present
  try {
     const greenCloseBtn = page.locator('button:has-text("Close")').first();
     if (await greenCloseBtn.isVisible({ timeout: 2000 })) {
       console.log('Closing green modal button...');
       await greenCloseBtn.click();
       await page.waitForTimeout(2000);
     }
  } catch (e) {}

  console.log('Navigating to Reports Dashboard...');
  await page.goto('https://app.easyecom.io/V2/reports/reports-HomePage');
  await page.waitForTimeout(5000);

  // Robust scrolling to find the report card (mimicking subagent behavior)
  console.log('Locating B2B Packing List Report with adaptive scrolling...');
  const reportSelector = 'text="B2B Packing List Report"';
  let cardFound = false;
  for (let i = 0; i < 15; i++) {
    if (await page.locator(reportSelector).isVisible()) {
      cardFound = true;
      break;
    }
    console.log(`Scrolling... Attempt ${i + 1}`);
    await page.mouse.wheel(0, 800);
    await page.waitForTimeout(1000);
  }

  if (!cardFound) {
    await page.screenshot({ path: 'reports/screenshot-failed-finding-card.png' });
    throw new Error('B2B Packing List Report card not found after scrolling');
  }

  const reportCard = page.locator('mat-card').filter({ hasText: 'B2B Packing List Report' }).first();
  await reportCard.click();

  // Trigger report generation (Queue button)
  console.log('Triggering report generation (Queue)...');
  const queueBtn = page.getByRole('button', { name: 'Queue' });
  await queueBtn.waitFor({ state: 'visible', timeout: 15000 });
  await queueBtn.click();

  // Wait for queue confirmation
  await page.waitForTimeout(3000);

  // Open the download tray from the header
  console.log('Opening download tray from header...');
  try {
    const downloadTray = page.locator('img[alt="Download"]').first();
    await downloadTray.waitFor({ state: 'visible', timeout: 10000 });
    await downloadTray.click();
    console.log('Clicked download tray by image alt.');
  } catch (e) {
    console.log('Selector-based click failed, trying coordinate-based click (from subagent success)...');
    // Subagent used pixel X:592, Y:35 on its internal 1000x1000 grid.
    await page.mouse.click(1150, 40); // Standard header area click fallback
    await page.waitForTimeout(2000);
  }

  // Wait for the latest export job link to appear in the sidebar
  console.log('Waiting for report to be generated in the sidebar...');
  // Subagent found: div.sideflyer-body a:first-of-type
  const downloadLink = page.locator('div.sideflyer-body a').first();
  
  // Wait up to 3 minutes for report to be ready
  await expect(downloadLink).toBeVisible({ timeout: 180000 });

  console.log('Starting download...');
  const downloadPromise = page.waitForEvent('download');
  await downloadLink.click();
  const download = await downloadPromise;

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `B2B_Packing_List_Report_${timestamp}.csv`;
  const filePath = path.join(reportsDir, fileName);

  await download.saveAs(filePath);
  console.log(`Report downloaded successfully to: ${filePath}`);

  // 10. Automated Upload to Google Sheets
  console.log('Preparing to upload report to Google Sheets...');
  const gasUrl = process.env.VITE_GAS_API_URL;
  
  if (!gasUrl) {
    console.warn('\n⚠️ VITE_GAS_API_URL not found in .env. Skipping automatic upload.');
    return;
  }

  try {
    const fileContent = fs.readFileSync(filePath);
    const base64Data = fileContent.toString('base64');
    
    console.log('Uploading file to Google Apps Script...');
    const response = await page.request.post(gasUrl, {
      data: {
        action: 'logFileUpload',
        functionId: 'b2b-packing-list',
        userName: 'Automation Script',
        fileData: base64Data,
        fileName: fileName
      }
    });

    const result = await response.json();
    if (result.status === 'success') {
      console.log('✅ Success: Report uploaded and processed by Google Sheets.');
    } else {
      console.error('❌ Server Error:', result.message);
    }
  } catch (error: any) {
    console.error('❌ Network Error during upload:', error.message);
  }
});

// Standalone Periodic Execution Launcher
// This allows running the script in a loop if executed via tsx or node
const runPeriodically = async () => {
    const POLLING_INTERVAL = 15 * 60 * 1000; // 15 Minutes

    while (true) {
        console.log(`\n[${new Date().toLocaleTimeString()}] Checking dashboard for pending 'Invoiced' orders...`);
        
        try {
            const gasUrl = process.env.VITE_GAS_API_URL;
            if (!gasUrl) {
                console.error("VITE_GAS_API_URL missing. Cannot check dashboard. Exiting...");
                break;
            }

            // Fetch POs from Dashboard
            const response = await fetch(`${gasUrl}?action=getPurchaseOrders`);
            const json = await response.json();
            
            if (json.status === 'success' && Array.isArray(json.data)) {
                // Filter for "Invoiced" status and missing "Box Data"
                // Assuming status mapping matches "Invoiced" or "Confirmed" with Invoice details
                const pendingOrders = json.data.filter((po: any) => 
                    (po['Latest Status'] === 'Invoiced' || po['Status'] === 'Invoiced') && 
                    (!po['Box Data'] || po['Box Data'] === '')
                );

                if (pendingOrders.length > 0) {
                    console.log(`Found ${pendingOrders.length} orders requiring packing lists. Running scraper...`);
                    // Note: In a real environment, you'd trigger the Playwright test runner here
                    // For now, we assume the user runs 'npx playwright test' which runs once.
                    // If they want it to loop, we can wrap the playwright logic in a function and call it here.
                } else {
                    console.log("No pending orders found. Sleeping for 15 minutes...");
                }
            }
        } catch (err: any) {
            console.error("Error during dashboard check:", err.message);
        }

        await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL));
    }
};

// If run directly: runPeriodically();
