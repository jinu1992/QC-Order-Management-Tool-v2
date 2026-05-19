import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env
dotenv.config({ path: path.join(process.cwd(), '.env') });

const EASY_ECOM_EMAIL = process.env.EASY_ECOM_EMAIL || '';
const EASY_ECOM_PASSWORD = process.env.EASY_ECOM_PASSWORD || '';
const GAS_URL = process.env.VITE_GAS_API_URL || '';

const POLLING_INTERVAL = 15 * 60 * 1000; // 15 Minutes

async function checkDashboard() {
    if (!GAS_URL) {
        console.error('❌ VITE_GAS_API_URL missing in .env');
        return [];
    }

    try {
        console.log(`[${new Date().toLocaleTimeString()}] Checking dashboard for pending 'Invoiced' orders...`);
        const response = await fetch(`${GAS_URL}?action=getPurchaseOrders`);
        const json = await response.json();

        if (json.status === 'success' && Array.isArray(json.data)) {
            // Filter: Invoiced status AND missing Box Data
            const pending = json.data.filter((po: any) => 
                (po['Latest Status'] === 'Invoiced' || po['Status'] === 'Invoiced') && 
                (!po['Box Data'] || po['Box Data'] === '')
            );
            return pending;
        }
    } catch (error: any) {
        console.error('❌ Error checking dashboard:', error.message);
    }
    return [];
}

async function runScraper() {
    console.log('🚀 Starting EasyEcom Scraper...');
    
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();

    try {
        // --- EasyEcom Login Flow ---
        await page.goto('https://app.easyecom.io/V2/account/auth/login?branding=null');
        await page.getByRole('textbox', { name: 'Email' }).fill(EASY_ECOM_EMAIL);
        await page.getByRole('button', { name: 'Continue' }).click();
        await page.getByRole('textbox', { name: 'Password' }).fill(EASY_ECOM_PASSWORD);
        await page.getByRole('button', { name: 'Log In' }).click();

        // Account / Modal dismissal
        try {
            await page.getByRole('button', { name: 'Sign In' }).first().click({ timeout: 5000 });
        } catch (e) {}
        
        // Modal dismissal loop
        const dismissals = ['Close', 'Got it', 'Dismiss', '✕'];
        for (const label of dismissals) {
            try { await page.getByRole('button', { name: label }).click({ timeout: 2000 }); } catch (e) {}
        }

        // Navigate to B2B Packing List Report
        await page.goto('https://app.easyecom.io/V2/reports/reports-dashboard-v2');
        
        // Adaptive Scrolling
        let found = false;
        for (let i = 0; i < 5; i++) {
            if (await page.locator('mat-card-title:has-text("B2B Packing List Report")').isVisible()) {
                found = true;
                break;
            }
            await page.mouse.wheel(0, 1000);
            await page.waitForTimeout(1000);
        }

        if (!found) throw new Error("Could not find 'B2B Packing List Report' card.");

        await page.locator('mat-card-title').filter({ hasText: 'B2B Packing List Report' }).click();
        await page.getByRole('button', { name: 'Queue' }).click();
        console.log('✅ Report queued successfully.');

        // Access Export Tray
        await page.waitForTimeout(3000);
        await page.locator('img[alt="Download"]').click();
        
        // Wait for and download the latest CSV
        const downloadPromise = page.waitForEvent('download');
        await page.locator('div.sideflyer-body a').first().click();
        const download = await downloadPromise;
        
        const fileName = `B2B_Packing_List_Report_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
        const reportsDir = path.join(process.cwd(), 'reports');
        if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir);
        const filePath = path.join(reportsDir, fileName);
        
        await download.saveAs(filePath);
        console.log(`✅ Downloaded: ${fileName}`);

        // --- Upload to Google Sheets ---
        console.log('📤 Uploading to Google Sheets...');
        const fileContent = fs.readFileSync(filePath);
        const base64Data = fileContent.toString('base64');
        
        const uploadResponse = await context.request.post(GAS_URL, {
            data: {
                action: 'logFileUpload',
                functionId: 'b2b-packing-list',
                userName: 'Automation Script',
                fileData: base64Data,
                fileName: fileName
            }
        });

        const uploadResult = await uploadResponse.json();
        if (uploadResult.status === 'success') {
            console.log('✅ Success: Google Sheet updated.');
        } else {
            console.error('❌ Upload Failed:', uploadResult.message);
        }

    } catch (error: any) {
        console.error('❌ Scraper Error:', error.message);
        const errorPath = path.join(process.cwd(), 'reports', `error_${Date.now()}.png`);
        await page.screenshot({ path: errorPath });
        console.log(`Screenshot saved to: ${errorPath}`);
    } finally {
        await browser.close();
    }
}

async function startAutomation() {
    console.log('================================================');
    console.log('   EasyEcom B2B Packing List Automation       ');
    console.log('   Status: RUNNING (Every 15 Minutes)         ');
    console.log('================================================');

    while (true) {
        const pendingOrders = await checkDashboard();
        
        if (pendingOrders.length > 0) {
            console.log(`📦 Found ${pendingOrders.length} pending Invoiced orders.`);
            await runScraper();
        } else {
            console.log('😴 No orders pending packing data. Waiting for next cycle.');
        }

        await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL));
    }
}

startAutomation();
