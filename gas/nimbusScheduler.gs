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
    
    // Fetch Email and CC from Script Properties / System_Config
    const props = PropertiesService.getScriptProperties();
    let nimbusEmail = props.getProperty('NIMBUS_NOTIFICATION_EMAIL');
    let nimbusCcEmail = props.getProperty('NIMBUS_CC_EMAILS') || '';
    
    if (!nimbusEmail && ss) {
      nimbusEmail = getSystemConfigEmail(ss, 'nimbus_notification_email');
      nimbusCcEmail = getSystemConfigEmail(ss, 'nimbus_cc_emails') || '';
    }
    
    if (!nimbusEmail) {
      Logger.log("Nimbus notification email not configured. Exiting.");
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
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
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
        const apptDateObj = parseDateString(row[apptDateIndex]);
        const eddObj = parseDateString(row[eddIndex]);
        const compareDate = apptDateObj || eddObj;
        
        let isMissed = false;
        if (!isActuallyDelivered && displayStatus === 'Shipped' && compareDate) {
          const compare = new Date(compareDate.getFullYear(), compareDate.getMonth(), compareDate.getDate());
          if (compare < today) {
            isMissed = true;
          }
        }
        
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
          invoiceUrl: String(row[invoiceUrlIndex] || ""),
          isMissed: isMissed,
          compareTime: compareDate ? compareDate.getTime() : 0
        });
      }
    });

    // Sort by Appointment Date/EDD ascending: oldest first, N/A at the end
    nimbusShipments.sort((a, b) => {
      if (a.compareTime === 0 && b.compareTime === 0) return 0;
      if (a.compareTime === 0) return 1;
      if (b.compareTime === 0) return -1;
      return a.compareTime - b.compareTime;
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
      cc: nimbusCcEmail,
      subject: `Nimbus Shipments Summary & Overdue Report - ${formatDate(new Date())}`,
      htmlBody: htmlEmail
    });
    
    Logger.log(`Successfully sent Nimbus update to ${nimbusEmail} (CC: ${nimbusCcEmail}) for ${nimbusShipments.length} shipments.`);
    
  } catch (err) {
    Logger.log("Error in processNimbusAndSendEmail: " + err.toString());
  }
}

/**
 * Gets a specific key from System_Config sheet (as fallback)
 */
function getSystemConfigEmail(ss, configKey) {
  try {
    const configSheet = ss.getSheetByName(SHEET_SYSTEM_CONFIG);
    if (!configSheet) return null;
    
    const data = configSheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) { // Skip header
      if (String(data[i][0]).toLowerCase().trim() === configKey.toLowerCase().trim()) {
        return data[i][1];
      }
    }
  } catch (e) {
    Logger.log("Error reading system config sheet: " + e.toString());
  }
  return null;
}

/**
 * Robust date string parser supporting JS Date objects, ISO strings,
 * and "dd-MM-yyyy" or "yyyy-MM-dd" dash-separated/slash-separated formats.
 */
function parseDateString(dateVal) {
  if (!dateVal) return null;
  if (dateVal instanceof Date) {
    return isNaN(dateVal.getTime()) ? null : dateVal;
  }
  
  const dateStr = String(dateVal).trim();
  if (!dateStr) return null;
  
  let d = new Date(dateStr);
  if (!isNaN(d.getTime())) return d;
  
  // Try parsing dd-MM-yyyy or yyyy-MM-dd
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    if (parts[2].length === 4) { // dd-MM-yyyy
      return new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
    } else if (parts[0].length === 4) { // yyyy-MM-dd
      return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    }
  }
  
  // Also try slashes dd/MM/yyyy or yyyy/MM/dd
  const slashParts = dateStr.split('/');
  if (slashParts.length === 3) {
    if (slashParts[2].length === 4) { // dd/MM/yyyy
      return new Date(parseInt(slashParts[2], 10), parseInt(slashParts[1], 10) - 1, parseInt(slashParts[0], 10));
    } else if (slashParts[0].length === 4) { // yyyy/MM/dd
      return new Date(parseInt(slashParts[0], 10), parseInt(slashParts[1], 10) - 1, parseInt(slashParts[2], 10));
    }
  }
  
  return null;
}

/**
 * DD-MM-YYYY formatter
 */
function formatDate(date) {
  const d = parseDateString(date);
  if (!d) return "N/A";
  return Utilities.formatDate(d, Session.getScriptTimeZone(), "dd-MM-yyyy");
}

/**
 * DD-MM-YYYY HH:mm AM/PM formatter
 */
function formatApptDateTime(date, time) {
  const parsedDate = parseDateString(date);
  if (!parsedDate) return "N/A";
  const datePart = formatDate(parsedDate);
  if (!time) return datePart;
  
  const timeStr = String(time);
  if (timeStr.includes('1899')) return datePart;
  
  try {
    let timePart = "";
    if (time instanceof Date) {
      timePart = Utilities.formatDate(time, Session.getScriptTimeZone(), "hh:mm a");
    } else {
      timePart = timeStr;
    }
    return datePart + " " + timePart;
  } catch (e) {
    return datePart + " " + timeStr;
  }
}

/**
 * Generates an HTML table for the email body with distinct sections.
 */
function buildHtmlEmailTemplate(shipments) {
  const missedShipments = shipments.filter(s => s.isMissed);
  const activeShipments = shipments.filter(s => !s.isMissed);
  
  function renderTable(list, isOverdueTable) {
    if (list.length === 0) {
      return `<p style="color: #6B7280; font-style: italic; margin-left: 10px;">No shipments in this category.</p>`;
    }
    
    const rows = list.map(s => {
      const trackingLink = `https://ship.nimbuspost.com/shipping/tracking/${s.awb}`;
      const awbLink = `<a href="${trackingLink}" style="color: #10B981; text-decoration: none;"><b>AWB-${s.awb}</b></a>`;
      const poLink = s.poPdf && s.poPdf !== 'N/A' && s.poPdf.trim() !== '' ? `<a href="${s.poPdf}" style="color: #3B82F6; text-decoration: none;">PDF</a>` : 'N/A';
      const invLink = s.invoiceUrl && s.invoiceUrl !== 'N/A' && s.invoiceUrl.trim() !== '' ? `<a href="${s.invoiceUrl}" style="color: #3B82F6; text-decoration: none;">Invoice</a>` : 'N/A';
      
      const badgeStyle = isOverdueTable 
        ? "background-color: #FEE2E2; color: #EF4444;" 
        : "background-color: #FEF3C7; color: #D97706;";
        
      return `
        <tr>
          <td style="padding: 10px; border: 1px solid #E5E7EB; white-space: nowrap;">${s.bookedDate}</td>
          <td style="padding: 10px; border: 1px solid #E5E7EB; font-weight: bold; color: #374151;">${s.eeRef}</td>
          <td style="padding: 10px; border: 1px solid #E5E7EB;">${s.channel}</td>
          <td style="padding: 10px; border: 1px solid #E5E7EB;">${s.storeCode}</td>
          <td style="padding: 10px; border: 1px solid #E5E7EB;">${awbLink}</td>
          <td style="padding: 10px; border: 1px solid #E5E7EB;">
            <span style="${badgeStyle} padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold;">
              ${s.trackingStatus}
            </span>
          </td>
          <td style="padding: 10px; border: 1px solid #E5E7EB;">${s.latestStatus}</td>
          <td style="padding: 10px; border: 1px solid #E5E7EB;">${s.currentLocation}</td>
          <td style="padding: 10px; border: 1px solid #E5E7EB; white-space: nowrap;">${s.edd}</td>
          <td style="padding: 10px; border: 1px solid #E5E7EB; white-space: nowrap;">${s.apptDateTime}</td>
          <td style="padding: 10px; border: 1px solid #E5E7EB;">${s.apptId}</td>
          <td style="padding: 10px; border: 1px solid #E5E7EB; text-align: center;">${poLink}</td>
          <td style="padding: 10px; border: 1px solid #E5E7EB; text-align: center;">${invLink}</td>
        </tr>
      `;
    }).join("");
    
    return `
      <table style="width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; text-align: left; background-color: #FFFFFF;">
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
            <th style="padding: 12px 6px; border: 1px solid #E5E7EB; font-weight: 600; color: #374151; text-align: center;">PO PDF</th>
            <th style="padding: 12px 6px; border: 1px solid #E5E7EB; font-weight: 600; color: #374151; text-align: center;">Invoice URL</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    `;
  }

  const missedTable = renderTable(missedShipments, true);
  const activeTable = renderTable(activeShipments, false);

  return `
    <div style="font-family: Arial, sans-serif; max-width: 1400px; margin: 0 auto;">
      <div style="background-color: #10B981; padding: 20px; color: white; border-radius: 8px 8px 0 0;">
        <h2 style="margin: 0;">Automated Nimbus Dispatch Report</h2>
        <p style="margin: 5px 0 0 0; opacity: 0.9;">System Generated Trackers - ${new Date().toLocaleString()}</p>
      </div>
      
      <div style="padding: 20px; border: 1px solid #E5E7EB; border-top: none; border-radius: 0 0 8px 8px; overflow-x: auto; background-color: #FAFAFA;">
        <p>Hello,</p>
        <p>Please find the latest tracking statuses for pending shipments handled via the Nimbus Courier partner.</p>
        
        <!-- MISSED DELIVERIES SECTION -->
        <div style="margin-top: 25px; margin-bottom: 30px; border-left: 4px solid #EF4444; padding-left: 15px;">
          <h3 style="margin: 0 0 10px 0; color: #EF4444; font-size: 16px; font-weight: bold;">
            🔴 Overdue / Missed Deliveries (${missedShipments.length})
          </h3>
          <p style="margin: 0 0 10px 0; font-size: 13px; color: #4B5563;">Shipments that have passed their scheduled appointment date or EDD without being delivered.</p>
          ${missedTable}
        </div>
        
        <hr style="border: 0; border-top: 1px solid #E5E7EB; margin: 30px 0;" />
        
        <!-- ACTIVE SHIPMENTS SECTION -->
        <div style="margin-top: 25px; border-left: 4px solid #10B981; padding-left: 15px;">
          <h3 style="margin: 0 0 10px 0; color: #10B981; font-size: 16px; font-weight: bold;">
            🟢 Active / Upcoming Shipments (${activeShipments.length})
          </h3>
          <p style="margin: 0 0 10px 0; font-size: 13px; color: #4B5563;">Shipments scheduled for today, the future, or in transit without being overdue.</p>
          ${activeTable}
        </div>
        
        <p style="margin-top: 40px; font-size: 12px; color: #6B7280; text-align: center;">
          This is an automated 4-hourly summary generated by the Order Management Dashboard.
        </p>
      </div>
    </div>
  `;
}
