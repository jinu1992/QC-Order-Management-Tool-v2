# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: fetchEasyEcomReport.spec.ts >> Fetch B2B Packing List Report
- Location: scripts\fetchEasyEcomReport.spec.ts:8:1

# Error details

```
Error: EASY_ECOM_EMAIL or EASY_ECOM_PASSWORD not set in .env
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | import * as dotenv from 'dotenv';
  3   | import * as path from 'path';
  4   | import * as fs from 'fs';
  5   | 
  6   | dotenv.config({ path: path.join(process.cwd(), '.env') });
  7   | 
  8   | test('Fetch B2B Packing List Report', async ({ page }) => {
  9   |   // Anti-bot measures
  10  |   await page.setExtraHTTPHeaders({
  11  |     'Accept-Language': 'en-US,en;q=0.9',
  12  |   });
  13  | 
  14  |   console.log('CWD:', process.cwd());
  15  |   const envPath = path.join(process.cwd(), '.env');
  16  |   console.log('Env path:', envPath);
  17  |   console.log('Env file exists:', fs.existsSync(envPath));
  18  | 
  19  |   console.log('Loading credentials from .env...');
  20  |   const email = process.env.EASY_ECOM_EMAIL;
  21  |   const password = process.env.EASY_ECOM_PASSWORD;
  22  | 
  23  |   if (!email || !password) {
  24  |     console.log('Email:', email ? 'PRESENT' : 'MISSING');
  25  |     console.log('Password:', password ? 'PRESENT' : 'MISSING');
> 26  |     throw new Error('EASY_ECOM_EMAIL or EASY_ECOM_PASSWORD not set in .env');
      |           ^ Error: EASY_ECOM_EMAIL or EASY_ECOM_PASSWORD not set in .env
  27  |   }
  28  | 
  29  |   // Ensure reports directory exists
  30  |   const reportsDir = path.join(process.cwd(), 'reports');
  31  |   if (!fs.existsSync(reportsDir)) {
  32  |     fs.mkdirSync(reportsDir);
  33  |   }
  34  | 
  35  |   console.log('Navigating to EasyEcom login...');
  36  |   await page.goto('https://app.easyecom.io/V2/account/auth/login?branding=null');
  37  |   await page.waitForTimeout(2000);
  38  |   await page.screenshot({ path: 'reports/screenshot-1-login.png' });
  39  |   
  40  |   await page.getByRole('textbox', { name: 'Email' }).fill(email);
  41  |   await page.getByRole('button', { name: 'Continue', exact: true }).click();
  42  |   
  43  |   await page.waitForTimeout(2000);
  44  |   await page.getByRole('textbox', { name: 'Password' }).fill(password);
  45  |   await page.screenshot({ path: 'reports/screenshot-2-password.png' });
  46  |   await page.getByRole('button', { name: 'Log In' }).click();
  47  | 
  48  |   console.log('Handling post-login account selection...');
  49  |   await page.waitForTimeout(5000);
  50  |   await page.screenshot({ path: 'reports/screenshot-3-auth-check.png' });
  51  |   
  52  |   // Account selection step - Click the first "Sign In" button
  53  |   try {
  54  |      const signInBtn = page.getByRole('button', { name: 'Sign In' }).first();
  55  |      if (await signInBtn.isVisible({ timeout: 10000 })) {
  56  |        console.log('Clicking the primary account Sign In button...');
  57  |        await signInBtn.click();
  58  |        await page.waitForTimeout(5000);
  59  |      } else {
  60  |        console.log('Sign In button NOT visible.');
  61  |      }
  62  |   } catch (e: any) {
  63  |      console.log('Account selection error:', e.message);
  64  |   }
  65  | 
  66  |   // Handle various popups/modals robustly
  67  |   console.log('Handling post-login screens (modals)...');
  68  |   const modalsToClose = ['Close', 'Got it', 'Sign In', 'Dismiss'];
  69  | 
  70  |   for (let attempt = 0; attempt < 3; attempt++) {
  71  |     for (const name of modalsToClose) {
  72  |       try {
  73  |         const btn = page.getByRole('button', { name: name, exact: false }).first();
  74  |         if (await btn.isVisible({ timeout: 2000 })) {
  75  |           console.log(`Closing modal: ${name} (Attempt ${attempt + 1})`);
  76  |           await btn.click();
  77  |           await page.waitForTimeout(2000);
  78  |         }
  79  |       } catch (e) {}
  80  |     }
  81  |   }
  82  | 
  83  |   // Fallback for the specific "New Features" modal if still present
  84  |   try {
  85  |      const greenCloseBtn = page.locator('button:has-text("Close")').first();
  86  |      if (await greenCloseBtn.isVisible({ timeout: 2000 })) {
  87  |        console.log('Closing green modal button...');
  88  |        await greenCloseBtn.click();
  89  |        await page.waitForTimeout(2000);
  90  |      }
  91  |   } catch (e) {}
  92  | 
  93  |   console.log('Navigating to Reports Dashboard...');
  94  |   await page.goto('https://app.easyecom.io/V2/reports/reports-HomePage');
  95  |   await page.waitForTimeout(5000);
  96  | 
  97  |   // Robust scrolling to find the report card (mimicking subagent behavior)
  98  |   console.log('Locating B2B Packing List Report with adaptive scrolling...');
  99  |   const reportSelector = 'text="B2B Packing List Report"';
  100 |   let cardFound = false;
  101 |   for (let i = 0; i < 15; i++) {
  102 |     if (await page.locator(reportSelector).isVisible()) {
  103 |       cardFound = true;
  104 |       break;
  105 |     }
  106 |     console.log(`Scrolling... Attempt ${i + 1}`);
  107 |     await page.mouse.wheel(0, 800);
  108 |     await page.waitForTimeout(1000);
  109 |   }
  110 | 
  111 |   if (!cardFound) {
  112 |     await page.screenshot({ path: 'reports/screenshot-failed-finding-card.png' });
  113 |     throw new Error('B2B Packing List Report card not found after scrolling');
  114 |   }
  115 | 
  116 |   const reportCard = page.locator('mat-card').filter({ hasText: 'B2B Packing List Report' }).first();
  117 |   await reportCard.click();
  118 | 
  119 |   // Trigger report generation (Queue button)
  120 |   console.log('Triggering report generation (Queue)...');
  121 |   const queueBtn = page.getByRole('button', { name: 'Queue' });
  122 |   await queueBtn.waitFor({ state: 'visible', timeout: 15000 });
  123 |   await queueBtn.click();
  124 | 
  125 |   // Wait for queue confirmation
  126 |   await page.waitForTimeout(3000);
```