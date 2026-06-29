/**
 * Nimbus Post Email Scheduler & Tracker Update
 * This script is designed to be added to the Google Apps Script project.
 * It sets up a time-driven trigger to run every 4 hours.
 */

// Configuration
const SHEET_PO_DATABASE = "PO_Database";
const SHEET_SYSTEM_CONFIG = "System_Config";

function processNimbusAndSendEmail() {
  try {
    const DATABASE_SPREADSHEET_ID = '1YM0dKPWySifYFDyNqCenJ4L85xIBSTrBGNPDcoo6Kfg';
    const TRACKER_SPREADSHEET_ID = '1NxB2W6zEB8qGf4QyHXVbvLCa09eBTgZTk-GCTJy4Zfk';
    const TRACKER_SHEET_GID = '1014733683';

    // 1. Open the tracker spreadsheet and get the tracker sheet tab
    const trackerSS = SpreadsheetApp.openById(TRACKER_SPREADSHEET_ID);
    let trackerSheet = getSheetById(trackerSS, TRACKER_SHEET_GID);
    if (!trackerSheet) {
      trackerSheet = trackerSS.getSheetByName("NimbusPost B2B Tracker") || 
                     trackerSS.getSheetByName("Action Required") ||
                     trackerSS.getSheets()[0];
    }
    
    if (!trackerSheet) {
      Logger.log("Nimbus B2B Tracker sheet not found in tracker spreadsheet. Exiting.");
      return;
    }

    const props = PropertiesService.getScriptProperties();
    const nimbus_to_Email = props.getProperty('NIMBUS_NOTIFICATION_EMAIL');
    const nimbus_cc_Email = props.getProperty('NIMBUS_CC_EMAILS');
    if (!nimbus_to_Email) return;

    // Load active tracker data
    const dataRange = trackerSheet.getDataRange();
    const values = dataRange.getValues();
    const formulas = dataRange.getFormulas();
    
    if (values.length <= 1) {
      Logger.log("Nimbus B2B Tracker sheet is empty. Exiting.");
      return;
    }
    
    const headers = values[0];
    
    // Find column indexes in the tracker sheet
    const getColIndex = (name) => {
      let idx = headers.indexOf(name);
      if (idx !== -1) return idx;
      idx = headers.findIndex(h => String(h).toLowerCase().trim() === name.toLowerCase().trim());
      if (idx !== -1) return idx;
      idx = headers.findIndex(h => String(h).toLowerCase().includes(name.toLowerCase()));
      return idx;
    };
    
    const bookedDateIdx = getColIndex("Booked Date");
    const poNumIdx = getColIndex("PO Number");
    const channelIdx = getColIndex("Channel");
    const storeCodeIdx = getColIndex("Store Code");
    const awbIdx = getColIndex("AWB");
    const trackingStatusIdx = getColIndex("Tracking Status");
    const latestStatusIdx = getColIndex("Latest Status");
    const currentLocationIdx = getColIndex("Current Location");
    const eddIdx = getColIndex("EDD");
    const apptDateTimeIdx = getColIndex("Appointment Date & Time");
    const apptIdIdx = getColIndex("Appointment ID");
    const poPdfIdx = getColIndex("PO PDF");
    const invoiceUrlIdx = getColIndex("Invoice Url");
    
    if (poNumIdx === -1 || awbIdx === -1) {
      Logger.log("Required columns are missing from the Tracker sheet");
      return;
    }

    // Load PO Database from the database spreadsheet to check/update Email Flags
    const dbSS = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(DATABASE_SPREADSHEET_ID);
    const dbSheet = dbSS.getSheetByName(SHEET_PO_DATABASE);
    const poEmailFlagMap = {};
    const poRowsMap = {};
    let dbPoIdx = -1;
    let emailFlagIdx = -1;
    
    if (dbSheet) {
      const dbData = dbSheet.getDataRange().getValues();
      const dbHeaders = dbData.shift();
      dbPoIdx = dbHeaders.indexOf("PO Number");
      emailFlagIdx = dbHeaders.indexOf("Email Flag");
      
      if (dbPoIdx !== -1 && emailFlagIdx !== -1) {
        dbData.forEach((row, i) => {
          const poVal = String(row[dbPoIdx] || "").trim();
          const flagVal = String(row[emailFlagIdx] || "").trim().toUpperCase();
          const rowNum = i + 2; // +2 due to shifting and 1-indexing
          
          if (poVal) {
            if (!poRowsMap[poVal]) {
              poRowsMap[poVal] = [];
            }
            poRowsMap[poVal].push(rowNum);
            
            if (flagVal === "SENT") {
              poEmailFlagMap[poVal] = true;
            }
          }
        });
      }
    }

    const shipments = [];
    const rowsToUpdate = [];
    const processedMap = {}; // AWB -> index in shipments
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      const formulaRow = formulas[i];
      
      const awbText = String(row[awbIdx] || "").trim();
      if (!awbText || awbText === "N/A" || awbText === "") continue;

      const trackingStatus = String(row[trackingStatusIdx] || "").trim();
      const trackingStatusLower = trackingStatus.toLowerCase();
      
      // Skip if delivered or cancelled
      if (trackingStatusLower === "delivered" || trackingStatusLower === "successfully delivered" || 
          trackingStatusLower.includes("cancelled") || trackingStatusLower.includes("return")) {
        continue;
      }
      
      const poNo = String(row[poNumIdx] || "").trim();

      // Check if this shipment has new/unreported POs
      let isNew = false;
      const poList = poNo.split(",").map(p => p.trim());
      poList.forEach(p => {
        if (p && (!poEmailFlagMap[p])) {
          isNew = true;
          if (poRowsMap[p]) {
            rowsToUpdate.push(...poRowsMap[p]);
          }
        }
      });

      // If AWB already processed, append the PO Number instead of skipping
      if (processedMap[awbText] !== undefined) {
        const existingShipment = shipments[processedMap[awbText]];
        if (!existingShipment.eeRef.includes(poNo)) {
          existingShipment.eeRef += `, ${poNo}`;
        }
        if (isNew) {
          existingShipment.isNew = true;
        }
        continue;
      }

      const eddStr = eddIdx !== -1 ? String(row[eddIdx] || "").trim() : "N/A";
      const apptDateTimeStr = apptDateTimeIdx !== -1 ? String(row[apptDateTimeIdx] || "").trim() : "N/A";
      
      const poPdf = poPdfIdx !== -1 ? extractUrlFromCell(row[poPdfIdx], formulaRow[poPdfIdx]) : "";
      const invoiceUrl = invoiceUrlIdx !== -1 ? extractUrlFromCell(row[invoiceUrlIdx], formulaRow[invoiceUrlIdx]) : "";
      
      shipments.push({
        bookedDate: bookedDateIdx !== -1 ? formatDate(row[bookedDateIdx]) : "N/A",
        eeRef: poNo,
        channel: channelIdx !== -1 ? String(row[channelIdx] || "N/A") : "N/A",
        storeCode: storeCodeIdx !== -1 ? String(row[storeCodeIdx] || "N/A") : "N/A",
        awb: awbText,
        trackingStatus: trackingStatus || "Pending",
        latestStatus: latestStatusIdx !== -1 ? String(row[latestStatusIdx] || "N/A") : "N/A",
        currentLocation: currentLocationIdx !== -1 ? String(row[currentLocationIdx] || "N/A") : "N/A",
        edd: eddIdx !== -1 ? formatDate(row[eddIdx]) : "N/A",
        apptDateTime: apptDateTimeStr || "N/A",
        apptId: apptIdIdx !== -1 ? String(row[apptIdIdx] || "N/A") : "N/A",
        poPdf: poPdf,
        invoiceUrl: invoiceUrl,
        isNew: isNew
      });

      processedMap[awbText] = shipments.length - 1;
    }

    if (!shipments.length) return;

    // Sort by Appointment Date/EDD ascending: oldest first, N/A at the end
    shipments.sort((a, b) => {
      const d1 = parseApptDateTime(a.apptDateTime) || new Date(9999, 0, 1);
      const d2 = parseApptDateTime(b.apptDateTime) || new Date(9999, 0, 1);
      return d1 - d2;
    });

    // 2. Build HTML Email
    const htmlEmail = buildHtmlEmailTemplate(shipments);
    const todayStr = Utilities.formatDate(new Date(), "Asia/Kolkata", "dd-MMM-yyyy");

    // 3. Send Email
    GmailApp.sendEmail(nimbus_to_Email, "\uD83D\uDCE6 Delivery Alignment Confirmation Report | Upcoming Appointments | Date : " + todayStr, "", {
      cc: nimbus_cc_Email,
      htmlBody: htmlEmail
    });

    // Update Email Flag in PO Database for newly emailed rows
    if (dbSheet && emailFlagIdx !== -1 && rowsToUpdate.length) {
      const uniqueRows = [...new Set(rowsToUpdate)];
      uniqueRows.forEach(r => {
        dbSheet.getRange(r, emailFlagIdx + 1).setValue("SENT");
      });
    }

    Logger.log(`Successfully sent summary for ${shipments.length} shipments.`);
    
  } catch (err) {
    Logger.log("Error in processNimbusAndSendEmail: " + err.toString());
  }
}

function buildHtmlEmailTemplate(shipments) {
  const now = new Date();
  const today = Utilities.formatDate(now, "Asia/Kolkata", "dd-MMM-yyyy");

  // ---------------- SUMMARY COUNTS ----------------
  let newCount = 0;
  let missedCount = 0;
  let todayCount = 0;
  let upcomingCount = 0;

  shipments.forEach(s => {
    const apptDateObj = parseApptDateTime(s.apptDateTime);

    if (s.isNew) {
      newCount++;
      return;
    }

    if (!apptDateObj) return;

    const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const appt = new Date(
      apptDateObj.getFullYear(),
      apptDateObj.getMonth(),
      apptDateObj.getDate()
    );

    if (appt < todayDate) {
      missedCount++;
    } else if (appt.getTime() === todayDate.getTime()) {
      todayCount++;
    } else {
      upcomingCount++;
    }
  });

  // ---------------- TABLE ROWS ----------------
  const tableRows = shipments.map(s => {
    const trackingLink = `https://ship.nimbuspost.com/shipping/tracking/${s.awb}`;
    const awbLink = `<a href="${trackingLink}" style="color:#059669;text-decoration:none;"><b>${s.awb}</b></a>`;

    const poLink = s.poPdf
      ? `<a href="${s.poPdf}" style="color:#2563EB;text-decoration:none;"><b>${s.awb}_PO</b></a>`
      : "N/A";

    const invLink = s.invoiceUrl
      ? `<a href="${s.invoiceUrl}" style="color:#2563EB;text-decoration:none;"><b>${s.awb}_Invoice</b></a>`
      : "N/A";

    const apptDateObj = parseApptDateTime(s.apptDateTime);
    const tag = getApptTag(apptDateObj, s.isNew);

    // ---------------- ROW COLOR / BORDER ----------------
    let rowColor = "";
    let leftBorder = "#E5E7EB";

    if (s.isNew) {
      rowColor = "#E0F2FE";   // NEW
      leftBorder = "#0284C7";
    } else if (apptDateObj) {
      const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const appt = new Date(
        apptDateObj.getFullYear(),
        apptDateObj.getMonth(),
        apptDateObj.getDate()
      );

      if (appt < todayDate) {
        rowColor = "#FEF2F2"; // MISSED
        leftBorder = "#DC2626";
      } else if (appt.getTime() === todayDate.getTime()) {
        rowColor = "#ECFDF5"; // TODAY
        leftBorder = "#16A34A";
      } else {
        rowColor = "#EFF6FF"; // UPCOMING
        leftBorder = "#3B82F6";
      }
    }

    // ---------------- TRACKING STATUS BADGE ----------------
    const status = String(s.trackingStatus || "").toLowerCase();
    let statusBg = "#FEF3C7";
    let statusText = "#92400E";
    let statusDot = "#D97706";

    if (status.includes("delivered")) {
      statusBg = "#DCFCE7";
      statusText = "#166534";
      statusDot = "#16A34A";
    } else if (status.includes("transit")) {
      statusBg = "#DBEAFE";
      statusText = "#1D4ED8";
      statusDot = "#2563EB";
    } else if (status.includes("out for delivery")) {
      statusBg = "#E0F2FE";
      statusText = "#0369A1";
      statusDot = "#0284C7";
    } else if (status.includes("failed") || status.includes("cancel")) {
      statusBg = "#FEE2E2";
      statusText = "#B91C1C";
      statusDot = "#DC2626";
    }

    const trackingStatusBadge = `
      <span style="
        display:inline-flex;
        align-items:center;
        gap:6px;
        background:${statusBg};
        color:${statusText};
        padding:5px 9px;
        border-radius:999px;
        font-size:11px;
        font-weight:700;
        white-space:nowrap;
      ">
        <span style="
          display:inline-block;
          width:8px;
          height:8px;
          border-radius:50%;
          background:${statusDot};
        "></span>
        ${s.trackingStatus}
      </span>
    `;

    return `
      <tr style="
        background:${rowColor};
        border-left:4px solid ${leftBorder};
        font-weight:${s.isNew ? '600' : 'normal'};
      ">
        <td style="padding:10px;border:1px solid #E5E7EB;white-space:nowrap;">${s.bookedDate}</td>
        <td style="padding:10px;border:1px solid #E5E7EB;">${s.eeRef}</td>
        <td style="padding:10px;border:1px solid #E5E7EB;">${s.channel}</td>
        <td style="padding:10px;border:1px solid #E5E7EB;">${s.storeCode}</td>
        <td style="padding:10px;border:1px solid #E5E7EB;">${awbLink}</td>
        <td style="padding:10px;border:1px solid #E5E7EB;">${trackingStatusBadge}</td>
        <td style="padding:10px;border:1px solid #E5E7EB;">${s.latestStatus}</td>
        <td style="padding:10px;border:1px solid #E5E7EB;">${s.currentLocation}</td>
        <td style="padding:10px;border:1px solid #E5E7EB;white-space:nowrap;">${s.edd}</td>
        <td style="padding:10px;border:1px solid #E5E7EB;">
          <div style="font-weight:600;">${s.apptDateTime || "N/A"}</div>
          <div style="margin-top:5px;">${tag}</div>
        </td>
        <td style="padding:10px;border:1px solid #E5E7EB;">${s.apptId}</td>
        <td style="padding:10px;border:1px solid #E5E7EB;">${poLink}</td>
        <td style="padding:10px;border:1px solid #E5E7EB;">${invLink}</td>
      </tr>
    `;
  }).join("");

  return `
    <div style="font-family:Arial, sans-serif;max-width:1400px;margin:0 auto;">
      <div style="background:#059669;padding:20px;color:white;border-radius:8px 8px 0 0;">
        <h2 style="margin:0;">&#128230; Delivery Alignment Confirmation Report</h2>
        <p style="margin:5px 0 0 0;opacity:0.95;">
          Upcoming Appointments | Date : ${today}
        </p>
      </div>

      <div style="padding:20px;border:1px solid #E5E7EB;border-top:none;border-radius:0 0 8px 8px;overflow-x:auto;">
        <p style="margin-top:0;">Dear Logistics Team,</p>
        <p>Please find below the summary of shipments aligned for delivery as per their upcoming appointment dates.</p>
        <p>Kindly review and confirm that these deliveries are scheduled accordingly to avoid any misses.</p>
        <p>
          &#128196;
          <a href="https://docs.google.com/spreadsheets/d/1NxB2W6zEB8qGf4QyHXVbvLCa09eBTgZTk-GCTJy4Zfk/edit?gid=1014733683#gid=1014733683"
             style="color:#2563EB;font-weight:bold;text-decoration:none;">
            View Full Logistics Summary Sheet
          </a>
        </p>

        <!-- SUMMARY -->
        <div style="display:flex;gap:12px;flex-wrap:wrap;margin:18px 0 14px 0;">
          <div style="min-width:150px;background:#E0F2FE;border:1px solid #BAE6FD;border-radius:10px;padding:12px 14px;">
            <div style="font-size:12px;color:#075985;font-weight:700;display:flex;align-items:center;gap:6px;">
              <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#0284C7;"></span>
              NEW
            </div>
            <div style="font-size:24px;font-weight:800;color:#0C4A6E;margin-top:6px;">${newCount}</div>
          </div>

          <div style="min-width:150px;background:#FEF2F2;border:1px solid #FECACA;border-radius:10px;padding:12px 14px;">
            <div style="font-size:12px;color:#991B1B;font-weight:700;display:flex;align-items:center;gap:6px;">
              <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#DC2626;"></span>
              MISSED
            </div>
            <div style="font-size:24px;font-weight:800;color:#7F1D1D;margin-top:6px;">${missedCount}</div>
          </div>

          <div style="min-width:150px;background:#ECFDF5;border:1px solid #BBF7D0;border-radius:10px;padding:12px 14px;">
            <div style="font-size:12px;color:#166534;font-weight:700;display:flex;align-items:center;gap:6px;">
              <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#16A34A;"></span>
              TODAY
            </div>
            <div style="font-size:24px;font-weight:800;color:#14532D;margin-top:6px;">${todayCount}</div>
          </div>

          <div style="min-width:150px;background:#EFF6FF;border:1px solid #BFDBFE;border-radius:10px;padding:12px 14px;">
            <div style="font-size:12px;color:#1D4ED8;font-weight:700;display:flex;align-items:center;gap:6px;">
              <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#3B82F6;"></span>
              UPCOMING
            </div>
            <div style="font-size:24px;font-weight:800;color:#1E3A8A;margin-top:6px;">${upcomingCount}</div>
          </div>
        </div>

        <!-- LEGEND -->
        <div style="margin:10px 0 16px 0;font-size:12px;display:flex;gap:16px;flex-wrap:wrap;">
          <span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#DC2626;margin-right:6px;"></span><b>Missed</b></span>
          <span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#16A34A;margin-right:6px;"></span><b>Today</b></span>
          <span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#0284C7;margin-right:6px;"></span><b>New</b></span>
          <span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#3B82F6;margin-right:6px;"></span><b>Upcoming</b></span>
        </div>

        <table style="width:100%;border-collapse:collapse;margin-top:15px;font-size:12px;text-align:left;">
          <thead>
            <tr style="background:#F9FAFB;">
              <th style="padding:10px;border:1px solid #E5E7EB;">Booked Date</th>
              <th style="padding:10px;border:1px solid #E5E7EB;">PO Number</th>
              <th style="padding:10px;border:1px solid #E5E7EB;">Channel</th>
              <th style="padding:10px;border:1px solid #E5E7EB;">Store Code</th>
              <th style="padding:10px;border:1px solid #E5E7EB;">AWB</th>
              <th style="padding:10px;border:1px solid #E5E7EB;">Tracking Status</th>
              <th style="padding:10px;border:1px solid #E5E7EB;">Latest Status</th>
              <th style="padding:10px;border:1px solid #E5E7EB;">Current Location</th>
              <th style="padding:10px;border:1px solid #E5E7EB;">EDD</th>
              <th style="padding:10px;border:1px solid #E5E7EB;">Appt Date / Time</th>
              <th style="padding:10px;border:1px solid #E5E7EB;">Appt ID</th>
              <th style="padding:10px;border:1px solid #E5E7EB;">PO PDF</th>
              <th style="padding:10px;border:1px solid #E5E7EB;">Invoice URL</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>

        <p style="margin-top:20px;font-size:11px;color:#6B7280;text-align:center;">
          This is an automated summary generated by the Order Management Dashboard.
        </p>
      </div>
    </div>
  `;
}

function getApptTag(date, isNew) {
  const dot = (color) => `
    <span style="
      display:inline-block;
      width:8px;
      height:8px;
      border-radius:50%;
      background:${color};
      margin-right:6px;
    "></span>
  `;

  if (isNew) {
    return `<span style="font-size:11px;font-weight:700;color:#1D4ED8;">
      ${dot('#0284C7')} NEW
    </span>`;
  }

  if (!date) return "";

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const appt = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (appt < today) {
    return `<span style="font-size:11px;font-weight:700;color:#DC2626;">
      ${dot('#DC2626')} MISSED
    </span>`;
  }

  if (appt.getTime() === today.getTime()) {
    return `<span style="font-size:11px;font-weight:700;color:#16A34A;">
      ${dot('#16A34A')} TODAY
    </span>`;
  }

  return `<span style="font-size:11px;font-weight:700;color:#2563EB;">
    ${dot('#3B82F6')} UPCOMING
  </span>`;
}

function formatDate(val) {
  if (!val) return "N/A";
  const d = new Date(val);
  if (isNaN(d.getTime())) return "N/A";
  return Utilities.formatDate(d, "Asia/Kolkata", "dd/MM/yyyy");
}

function formatApptDateTime(dateVal, timeVal) {
  const d = new Date(dateVal);
  const t = new Date(timeVal);

  if (isNaN(d.getTime())) return "";

  const date = Utilities.formatDate(d, "Asia/Kolkata", "dd/MM/yyyy");
  const time = !isNaN(t.getTime())
    ? Utilities.formatDate(t, "Asia/Kolkata", "HH:mm")
    : "";

  return (date + " " + time).trim();
}

function parseApptDateTime(val) {
  if (!val) return null;
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : val;
  }
  const str = String(val).trim();
  if (!str || str === "N/A" || str === "") return null;
  
  // Try parsing directly (covers "9 Jun 2026 10:00", "15 June 2026 07:30", "23 June 2026 10:00")
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return d;
  }
  
  // Fallback for dd/MM/yyyy HH:mm format
  const parts = str.split(" ");
  const datePart = parts[0];
  if (datePart && datePart.includes("/")) {
    const [day, month, year] = datePart.split("/").map(Number);
    let h = 0, m = 0;
    if (parts[1]) {
      const [hour, min] = parts[1].split(":").map(Number);
      h = hour || 0;
      m = min || 0;
    }
    const fallbackDate = new Date(year, month - 1, day, h, m);
    if (!isNaN(fallbackDate.getTime())) {
      return fallbackDate;
    }
  }
  
  return null;
}

/**
 * Helper to find a sheet tab by its sheet ID (gid)
 */
function getSheetById(ss, gid) {
  const sheets = ss.getSheets();
  for (let i = 0; i < sheets.length; i++) {
    if (sheets[i].getSheetId().toString() === gid.toString()) {
      return sheets[i];
    }
  }
  return null;
}

/**
 * Extracts the URL from a hyperlink formula or returns the plain value.
 */
function extractUrlFromCell(value, formula) {
  if (!formula && !value) return 'N/A';
  const cellStr = String(formula || value).trim();
  if (!cellStr || cellStr === 'N/A') return 'N/A';
  
  const match = cellStr.match(/=HYPERLINK\(\s*["']([^"']+)["']\s*,\s*["']?[^"']*(?:["']?)\)/i);
  if (match && match[1]) {
    return match[1];
  }
  return String(value).trim() || 'N/A';
}
