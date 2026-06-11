const { chromium } = require('playwright');
const path = require('path');

(async () => {
  // Define the relative path to downloads folder inside the project
  const downloadPath = path.resolve(__dirname, "..", "downloads");
  const statePath = path.join(__dirname, 'zepto-brands-state.json');
  const fs = require("fs");

  if (!fs.existsSync(statePath)) {
    console.error("Error: Session state file not found!");
    console.error("Please use 'Login Capture' on the Shipment Tracking dashboard to log in and create the session state first.");
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: false });
  
  const context = await browser.newContext({ 
      storageState: statePath,
      acceptDownloads: true
  });
  
  const page = await context.newPage();

  // Handle manual downloads to force them into your desired folder
  page.on('download', async (download) => {
    const targetPath = path.join(downloadPath, download.suggestedFilename());
    await download.saveAs(targetPath);
    console.log(`File saved automatically to: ${targetPath}`);
  });

  console.log("Opening Zepto GRN page...");
  await page.goto('https://brands.zepto.co.in/vendor/po/grn');

  console.log("Browser is open.");
  console.log(`Manual downloads will be saved to: ${downloadPath}`);
})();
