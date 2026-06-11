const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log("Navigating to Flipkart Vendor Hub...");
  await page.goto('https://vendorhub.flipkart.com/#/welcome/login');

  console.log("Please log in manually in the browser window.");
  console.log("Waiting for successful login to complete...");

  // Wait until the URL no longer contains 'login'
  // Timeout is set to 0 (infinite) so you have time for OTPs/Captchas
  await page.waitForFunction(() => !window.location.href.includes('login'), { timeout: 0 });

  // Give the dashboard an extra few seconds to fully load its cookies/tokens
  await page.waitForTimeout(3000);

  // Save the state relative to this folder
  await context.storageState({ path: path.join(__dirname, 'vendor_state.json') });
  
  console.log("Success! Authentication state saved to 'vendor_state.json'.");

  await browser.close();
})();
