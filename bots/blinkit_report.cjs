const { chromium } = require('playwright');
const path = require('path');

(async () => {
  // Define the relative path to downloads folder inside the project
  const downloadPath = path.resolve(__dirname, "..", "downloads");
  const statePath = path.join(__dirname, 'partnersbiz_state.json');
  const fs = require("fs");

  if (!fs.existsSync(statePath)) {
    console.error("Error: Session state file not found!");
    console.error("Please use 'Login Capture' on the Shipment Tracking dashboard to log in and create the session state first.");
    process.exit(1);
  }

  // Launch the browser
  const browser = await chromium.launch({ headless: false });
  
  // Create a context using your saved state relative to this folder
  const context = await browser.newContext({ 
      storageState: statePath,
      acceptDownloads: true
  });
  
  const page = await context.newPage();

  // Listener: Automatically saves manual downloads to your specific folder
  page.on('download', async (download) => {
    const targetPath = path.join(downloadPath, download.suggestedFilename());
    await download.saveAs(targetPath);
    console.log(`File saved automatically to: ${targetPath}`);
  });

  console.log("Opening PartnersBiz portal...");
  await page.goto('https://www.partnersbiz.com/');

  console.log("---------------------------------------------------------");
  console.log("Browser is open and authenticated.");
  console.log(`Manual downloads will land in: ${downloadPath}`);
  console.log("---------------------------------------------------------");
})();
