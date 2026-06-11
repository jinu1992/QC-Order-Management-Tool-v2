const { chromium } = require("playwright");
const path = require("path");

// Helper function to simulate human hesitation
const humanDelay = async (page, min = 1000, max = 3000) => {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  console.log(`[Sleeping for ${delay}ms...]`);
  await page.waitForTimeout(delay);
};

(async () => {
  const downloadPath = path.resolve(__dirname, "..", "downloads");
  const statePath = path.join(__dirname, "vendor_state.json");
  const fs = require("fs");

  if (!fs.existsSync(statePath)) {
    console.error("Error: Session state file not found!");
    console.error("Please use 'Login Capture' on the Shipment Tracking dashboard to log in and create the session state first.");
    process.exit(1);
  }

  // Launch the browser
  const browser = await chromium.launch({ headless: false });

  // Inject the saved authentication state relative to this folder
  const context = await browser.newContext({
    storageState: statePath,
  });

  const page = await context.newPage();

  console.log("Navigating to account selection...");
  await page.goto("https://vendorhub.flipkart.com/#/welcome/select-account");
  await humanDelay(page);

  await page
    .getByRole("radio", { name: "Brainlytic Solutions Private" })
    .check();
  await humanDelay(page, 1000, 3000);

  await page.getByRole("button", { name: "NEXT" }).click();
  await humanDelay(page);

  console.log("Navigating to PO List...");
  await page.goto(
    "https://vendorhub.flipkart.com/#/operations/po/list?status=completed",
  );

  // Wait for the data table to render completely
  await page.waitForTimeout(15000);

  // Locate the download buttons
  const downloadButtons = page.getByText("Download", { exact: true });
  const totalCount = await downloadButtons.count();

  console.log(`Found ${totalCount} reports total on the page.`);

  if (totalCount === 0) {
    console.log("No reports found. Exiting.");
    await browser.close();
    return;
  }

  // Set limit to 5 for testing
  const downloadLimit = Math.min(totalCount, 5);
  console.log(`Starting safe download of ${downloadLimit} reports...`);

  for (let i = 0; i < downloadLimit; i++) {
    console.log(`Preparing to download report ${i + 1} of ${downloadLimit}...`);

    await humanDelay(page, 800, 2000);

    const downloadPromise = page.waitForEvent("download");
    await downloadButtons.nth(i).click();
    const download = await downloadPromise;

    const fileName = download.suggestedFilename();
    const targetPath = path.join(downloadPath, fileName);
    await download.saveAs(targetPath);
    console.log(`Successfully saved: ${targetPath}`);

    await humanDelay(page, 2000, 4000);
  }

  console.log("Test batch completed successfully and safely!");

  // Close the browser when finished
  await browser.close();
})();
