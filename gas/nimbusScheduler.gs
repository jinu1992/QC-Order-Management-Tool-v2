/**
 * Nimbus Post Email Scheduler & Tracker Update
 * This script is designed to be added to the Google Apps Script project.
 * It sets up a time-driven trigger to run every 4 hours.
 */

// Configuration
const SHEET_PO_DATABASE = "PO_Database";
const SHEET_SYSTEM_CONFIG = "System_Config";

/**
 * Setup Function: Run this once manually to install the triggers.
 */
function setupNimbusTriggers() {
  const functionName = "processNimbusAndSendEmail";
  
  // Clear existing triggers to avoid duplicates
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === functionName) {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  // Create a trigger to run every 4 hours
  ScriptApp.newTrigger(functionName)
    .timeBased()
    .everyHours(4)
    .create();
    
  Logger.log("Trigger setup completed for " + functionName);
}

/**
 * Main Scheduled Function
 * Extrapolates Nimbus-associated shipments and emails a summary.
 */
function processNimbusAndSendEmail() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(SPREADSHEET_ID);
    const dbSheet = ss.getSheetByName(SHEET_PO_DATABASE);
    
    // Fetch Email from System Config
    const nimbusEmail = getSystemConfigEmail(ss, 'nimbus_notification_email');
    if (!nimbusEmail) {
      Logger.log("Nimbus notification email not configured in System Config. Exiting.");
      return;
    }

    // 1. Fetch relevant Nimbus shipments
    const dbData = dbSheet.getDataRange().getValues();
    const headers = dbData.shift();
    
    const awbIndex = headers.indexOf("AWB");
    const statusIndex = headers.indexOf("Tracking Status");
    const carrierIndex = headers.indexOf("Carrier");
    const eeRefIndex = headers.indexOf("EE_reference_code");
    const lastUpdateIndex = headers.indexOf("Latest Status Date");
    const eddIndex = headers.indexOf("EDD");
    
    if (awbIndex === -1 || eeRefIndex === -1) {
      Logger.log("Required columns are missing from PO_Database");
      return;
    }
    
    // Filter active Nimbus shipments
    const nimbusShipments = [];
    
    dbData.forEach(row => {
      const awb = String(row[awbIndex] || "").trim();
      const carrier = String(row[carrierIndex] || "").toLowerCase();
      const trackingStatus = String(row[statusIndex] || "").toLowerCase();
      
      // Basic heuristic to capture Nimbus assigned shipments
      // Assuming carrier may say 'Nimbus' or AWB is present and not delivered via nimbus logic
      if (awb !== "" && trackingStatus !== "delivered" && trackingStatus !== "rto delivered") {
        nimbusShipments.push({
          eeRef: row[eeRefIndex],
          awb: awb,
          status: row[statusIndex] || "Pending",
          carrier: row[carrierIndex] || "Unknown",
          edd: row[eddIndex] ? new Date(row[eddIndex]).toLocaleDateString() : "N/A",
          lastUpdate: row[lastUpdateIndex] ? new Date(row[lastUpdateIndex]).toLocaleString() : "N/A"
        });
      }
    });
    
    if (nimbusShipments.length === 0) {
      Logger.log("No active Nimbus shipments to report.");
      return;
    }

    // 2. Build HTML Email
    const htmlEmail = buildHtmlEmailTemplate(nimbusShipments);
    
    // 3. Send Email
    MailApp.sendEmail({
      to: nimbusEmail,
      subject: `Nimbus Shipments Daily Update - ${new Date().toLocaleDateString()}`,
      htmlBody: htmlEmail
    });
    
    Logger.log(`Successfully sent Nimbus update to ${nimbusEmail} for ${nimbusShipments.length} shipments.`);
    
  } catch (err) {
    Logger.log("Error in processNimbusAndSendEmail: " + err.toString());
  }
}

/**
 * Gets a specific key from System_Config sheet
 */
function getSystemConfigEmail(ss, configKey) {
  const configSheet = ss.getSheetByName(SHEET_SYSTEM_CONFIG);
  if (!configSheet) return null;
  
  const data = configSheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) { // Skip header
    if (data[i][0] === configKey) {
      return data[i][1];
    }
  }
  return null;
}

/**
 * Generates an HTML table for the email body.
 */
function buildHtmlEmailTemplate(shipments) {
  let tableRows = shipments.map(s => {
    // Correctly formatted AWB-prefixed anchor text
    const trackingLink = `https://ship.nimbuspost.com/shipping/tracking/${s.awb}`;
    const awbLink = `<a href="${trackingLink}" style="color: #10B981; text-decoration: none;"><b>AWB-${s.awb}</b></a>`;
    
    return `
      <tr>
        <td style="padding: 10px; border: 1px solid #E5E7EB;">${s.eeRef}</td>
        <td style="padding: 10px; border: 1px solid #E5E7EB;">${awbLink}</td>
        <td style="padding: 10px; border: 1px solid #E5E7EB;">${s.carrier}</td>
        <td style="padding: 10px; border: 1px solid #E5E7EB;">
          <span style="background-color: #FEF3C7; color: #D97706; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold;">
            ${s.status}
          </span>
        </td>
        <td style="padding: 10px; border: 1px solid #E5E7EB;">${s.edd}</td>
        <td style="padding: 10px; border: 1px solid #E5E7EB;">${s.lastUpdate}</td>
      </tr>
    `;
  }).join("");

  return `
    <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
      <div style="background-color: #10B981; padding: 20px; color: white; border-radius: 8px 8px 0 0;">
        <h2 style="margin: 0;">Automated Nimbus Dispatch Report</h2>
        <p style="margin: 5px 0 0 0; opacity: 0.9;">System Generated Trackers - ${new Date().toLocaleString()}</p>
      </div>
      
      <div style="padding: 20px; border: 1px solid #E5E7EB; border-top: none; border-radius: 0 0 8px 8px;">
        <p>Hello,</p>
        <p>Please find the latest tracking statuses for pending shipments handled via the Nimbus Courier partner.</p>
        
        <table style="width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 14px;">
          <thead>
            <tr style="background-color: #F3F4F6; text-align: left;">
              <th style="padding: 12px 10px; border: 1px solid #E5E7EB; font-weight: 600; color: #374151;">Order Ref</th>
              <th style="padding: 12px 10px; border: 1px solid #E5E7EB; font-weight: 600; color: #374151;">Tracking Link</th>
              <th style="padding: 12px 10px; border: 1px solid #E5E7EB; font-weight: 600; color: #374151;">Carrier</th>
              <th style="padding: 12px 10px; border: 1px solid #E5E7EB; font-weight: 600; color: #374151;">Status</th>
              <th style="padding: 12px 10px; border: 1px solid #E5E7EB; font-weight: 600; color: #374151;">EDD</th>
              <th style="padding: 12px 10px; border: 1px solid #E5E7EB; font-weight: 600; color: #374151;">Last Update</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
        
        <p style="margin-top: 30px; font-size: 12px; color: #6B7280; text-align: center;">
          This is an automated 4-hourly summary generated by the Order Management Dashboard.
        </p>
      </div>
    </div>
  `;
}
