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
    const props = PropertiesService.getScriptProperties();
    const nimbusEmail = props.getProperty('NIMBUS_NOTIFICATION_EMAIL');
    if (!nimbusEmail) {
      Logger.log("Nimbus notification email not configured in Properties. Exiting.");
      return;
    }

    // 1. Fetch relevant Nimbus shipments
    const dbData = dbSheet.getDataRange().getValues();
    const headers = dbData.shift();
    
    const awbIndex = headers.indexOf("AWB");
    const trackingStatusIndex = headers.indexOf("Tracking Status");
    const latestStatusIndex = headers.indexOf("Latest Status");
    const currentLocationIndex = headers.indexOf("Current Location");
    const channelIndex = headers.indexOf("Channel Name");
    const storeCodeIndex = headers.indexOf("Store Code");
    const eeRefIndex = headers.indexOf("PO Number");
    const eddIndex = headers.indexOf("EDD");
    const apptDateIndex = headers.indexOf("Appointment Date");
    const apptTimeIndex = headers.indexOf("Appointment Time");
    const apptIdIndex = headers.indexOf("Appointment ID");
    const poPdfIndex = headers.indexOf("PO PDF");
    const invoiceUrlIndex = headers.indexOf("Invoice Url");
    const batchDateIndex = headers.indexOf("EE_batch_created_at");
    const manifestDateIndex = headers.indexOf("EE_manifest_date");
    const eeStatusIndex = headers.indexOf("EE_order_status");
    const rtoStatusIndex = headers.indexOf("RTO Status");
    const deliveredDateIndex = headers.indexOf("Delivered Date");
    
    if (awbIndex === -1 || eeRefIndex === -1) {
      Logger.log("Required columns are missing from PO_Database");
      return;
    }
    
    // Filter active Nimbus shipments
    const nimbusShipments = [];
    const allowedChannels = ['instamart', 'zepto', 'bb', 'rbl', 'flipkart', 'blinkit'];
    
    dbData.forEach(row => {
      const channelLabel = String(row[channelIndex] || "");
      const channel = channelLabel.toLowerCase();
      const isAllowedChannel = allowedChannels.some(c => channel.includes(c));
      
      if (!isAllowedChannel) return;

      const isAmazon = channel.includes('amazon');
      const trackingStatus = String(row[trackingStatusIndex] || "").toLowerCase();
      const deliveredDate = row[deliveredDateIndex];
      const isActuallyDelivered = (trackingStatus === 'delivered' || trackingStatus === 'successfully delivered' || !!deliveredDate);
      
      const eeStatus = String(row[eeStatusIndex] || "").toLowerCase();
      const rtoStatus = String(row[rtoStatusIndex] || "");
      const awbText = String(row[awbIndex] || "").trim();
      
      let displayStatus = 'Processing';
      const isOutOfDelivery = trackingStatus === 'out for delivery';
      const isDeliveredStatus = isActuallyDelivered && !isOutOfDelivery;
      const isRTOInitiated = eeStatus === 'shipped' && rtoStatus !== '';

      if (eeStatus === 'returned' || eeStatus === 'rto') displayStatus = 'Returned';
      else if (isRTOInitiated) displayStatus = 'RTO Initiated';
      else if (rtoStatus) displayStatus = 'Returned';
      else if (eeStatus === 'closed') displayStatus = 'Closed';
      else if (isDeliveredStatus) displayStatus = 'Delivered';
      else if (eeStatus === 'shipped' || row[manifestDateIndex] || trackingStatus === 'in transit' || isOutOfDelivery) {
          displayStatus = isAmazon ? 'Delivered' : 'Shipped';
      }
      
      let shouldInclude = false;
      if (displayStatus === 'Shipped' || displayStatus === 'RTO Initiated' || displayStatus === 'Returned') shouldInclude = true;
      if (isAmazon && displayStatus === 'Delivered' && !isActuallyDelivered) shouldInclude = true;

      const latestStatusRaw = String(row[latestStatusIndex] || "").toLowerCase();
      if (trackingStatus.includes('return') || latestStatusRaw.includes('return') ||
          trackingStatus.includes('cancelled') || latestStatusRaw.includes('cancelled')) {
        shouldInclude = false;
      }

      if (shouldInclude && awbText !== "") {
        nimbusShipments.push({
          bookedDate: formatDate(row[manifestDateIndex] || row[batchDateIndex]),
          eeRef: row[eeRefIndex],
          channel: channelLabel,
          storeCode: String(row[storeCodeIndex] || ""),
          awb: awbText,
          trackingStatus: row[trackingStatusIndex] || "Pending",
          latestStatus: row[latestStatusIndex] || "N/A",
          currentLocation: row[currentLocationIndex] || "N/A",
          edd: formatDate(row[eddIndex]),
          apptDateTime: formatApptDateTime(row[apptDateIndex], row[apptTimeIndex]),
          apptId: String(row[apptIdIndex] || ""),
          poPdf: String(row[poPdfIndex] || ""),
          invoiceUrl: String(row[invoiceUrlIndex] || "")
        });
      }
    });

    // Sort by Appointment Date ascending
    nimbusShipments.sort((a, b) => {
      const dateA = a.apptDateTime === "N/A" ? 0 : 1;
      const dateB = b.apptDateTime === "N/A" ? 0 : 1;
      return dateB - dateA;
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
      subject: `Nimbus Shipments Summary - ${formatDate(new Date())}`,
      htmlBody: htmlEmail
    });
    
    Logger.log(`Successfully sent Nimbus update to ${nimbusEmail} for ${nimbusShipments.length} shipments.`);
    
  } catch (err) {
    Logger.log("Error in processNimbusAndSendEmail: " + err.toString());
  }
}

/**
 * DD-MM-YYYY formatter
 */
function formatDate(date) {
  if (!date || isNaN(new Date(date).getTime())) return "N/A";
  const d = new Date(date);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), "dd-MM-yyyy");
}

/**
 * DD-MM-YYYY HH:mm AM/PM formatter
 */
function formatApptDateTime(date, time) {
  if (!date || isNaN(new Date(date).getTime())) return "N/A";
  const datePart = formatDate(date);
  if (!time) return datePart;
  
  try {
    let timePart = "";
    if (time instanceof Date) {
      timePart = Utilities.formatDate(time, Session.getScriptTimeZone(), "hh:mm a");
    } else {
      timePart = String(time);
    }
    return datePart + " " + timePart;
  } catch (e) {
    return datePart + " " + String(time);
  }
}


/**
 * Generates an HTML table for the email body.
 */
function buildHtmlEmailTemplate(shipments) {
  let tableRows = shipments.map(s => {
    // Correctly formatted AWB-prefixed anchor text
    const trackingLink = `https://ship.nimbuspost.com/shipping/tracking/${s.awb}`;
    const awbLink = `<a href="${trackingLink}" style="color: #10B981; text-decoration: none;"><b>AWB-${s.awb}</b></a>`;
    const poLink = s.poPdf ? `<a href="${s.poPdf}" style="color: #3B82F6; text-decoration: none;">PDF</a>` : 'N/A';
    const invLink = s.invoiceUrl ? `<a href="${s.invoiceUrl}" style="color: #3B82F6; text-decoration: none;">Invoice</a>` : 'N/A';
    
    return `
      <tr>
        <td style="padding: 10px; border: 1px solid #E5E7EB; white-space: nowrap;">${s.bookedDate}</td>
        <td style="padding: 10px; border: 1px solid #E5E7EB;">${s.eeRef}</td>
        <td style="padding: 10px; border: 1px solid #E5E7EB;">${s.channel}</td>
        <td style="padding: 10px; border: 1px solid #E5E7EB;">${s.storeCode}</td>
        <td style="padding: 10px; border: 1px solid #E5E7EB;">${awbLink}</td>
        <td style="padding: 10px; border: 1px solid #E5E7EB;">
          <span style="background-color: #FEF3C7; color: #D97706; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold;">
            ${s.trackingStatus}
          </span>
        </td>
        <td style="padding: 10px; border: 1px solid #E5E7EB;">${s.latestStatus}</td>
        <td style="padding: 10px; border: 1px solid #E5E7EB;">${s.currentLocation}</td>
        <td style="padding: 10px; border: 1px solid #E5E7EB; white-space: nowrap;">${s.edd}</td>
        <td style="padding: 10px; border: 1px solid #E5E7EB; white-space: nowrap;">${s.apptDateTime}</td>
        <td style="padding: 10px; border: 1px solid #E5E7EB;">${s.apptId}</td>
        <td style="padding: 10px; border: 1px solid #E5E7EB;">${poLink}</td>
        <td style="padding: 10px; border: 1px solid #E5E7EB;">${invLink}</td>
      </tr>
    `;
  }).join("");

  return `
    <div style="font-family: Arial, sans-serif; max-width: 1400px; margin: 0 auto;">
      <div style="background-color: #10B981; padding: 20px; color: white; border-radius: 8px 8px 0 0;">
        <h2 style="margin: 0;">Automated Nimbus Dispatch Report</h2>
        <p style="margin: 5px 0 0 0; opacity: 0.9;">System Generated Trackers - ${new Date().toLocaleString()}</p>
      </div>
      
      <div style="padding: 20px; border: 1px solid #E5E7EB; border-top: none; border-radius: 0 0 8px 8px; overflow-x: auto;">
        <p>Hello,</p>
        <p>Please find the latest tracking statuses for pending shipments handled via the Nimbus Courier partner.</p>
        
        <table style="width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; text-align: left;">
          <thead>
            <tr style="background-color: #F3F4F6;">
              <th style="padding: 12px 6px; border: 1px solid #E5E7EB; font-weight: 600; color: #374151;">Booked Date</th>
              <th style="padding: 12px 6px; border: 1px solid #E5E7EB; font-weight: 600; color: #374151;">PO Number</th>
              <th style="padding: 12px 6px; border: 1px solid #E5E7EB; font-weight: 600; color: #374151;">Channel</th>
              <th style="padding: 12px 6px; border: 1px solid #E5E7EB; font-weight: 600; color: #374151;">Store Code</th>
              <th style="padding: 12px 6px; border: 1px solid #E5E7EB; font-weight: 600; color: #374151;">AWB</th>
              <th style="padding: 12px 6px; border: 1px solid #E5E7EB; font-weight: 600; color: #374151;">Tracking Status</th>
              <th style="padding: 12px 6px; border: 1px solid #E5E7EB; font-weight: 600; color: #374151;">Latest Status</th>
              <th style="padding: 12px 6px; border: 1px solid #E5E7EB; font-weight: 600; color: #374151;">Current Location</th>
              <th style="padding: 12px 6px; border: 1px solid #E5E7EB; font-weight: 600; color: #374151;">EDD</th>
              <th style="padding: 12px 6px; border: 1px solid #E5E7EB; font-weight: 600; color: #374151;">Appt Date/Time</th>
              <th style="padding: 12px 6px; border: 1px solid #E5E7EB; font-weight: 600; color: #374151;">Appt ID</th>
              <th style="padding: 12px 6px; border: 1px solid #E5E7EB; font-weight: 600; color: #374151;">PO PDF</th>
              <th style="padding: 12px 6px; border: 1px solid #E5E7EB; font-weight: 600; color: #374151;">Invoice URL</th>
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
