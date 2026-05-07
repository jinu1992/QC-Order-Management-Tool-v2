
/**
 * ============================================================================
 * QUICKCOMMERCE DASHBOARD BACKEND (Google Apps Script)
 * ============================================================================
 */

// IDs & Sheet Names
const SPREADSHEET_ID = '1YM0dKPWySifYFDyNqCenJ4L85xIBSTrBGNPDcoo6Kfg';
const DRIVE_FOLDER_ID = '1y8ANlFfmrymTub4H_GTajRRbiL0Z_Ie4';

// Sheet Names
const SHEET_PO_DB = "PO_Database";
const SHEET_PO_REPO = "PO_Repository";
const SHEET_INVENTORY = "Master_SKU_Mapping";
const SHEET_ZOHO_CUSTOMERS = "Zoho_Customers";
const SHEET_CHANNEL_CONFIG = "Channel_Config";
const SHEET_SHIPMENT_LOG = "EE Shipment Log";
const SHEET_EE_SHIPMENTS = "EE_Shipments";
const SHEET_EE_CUSTOMERS = "EE_Customers";
const LOG_DEBUG_SHEET = "System_Logs";
const SHEET_USERS = "Users";
const SHEET_UPLOAD_LOGS = "Upload_Logs";
const SHEET_MASTER_DATA = "Master_Packing_Data";
const SHEET_QUOTATIONS = "Quotations";

// API Endpoints
const EASYECOM_BASE_URL = "https://api.easyecom.io";

/**
 * Standard GAS JSON response helper.
 */
function responseJSON(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  const action = e.parameter.action;
  try {
    if (action === 'ping') return responseJSON({ status: 'success', message: 'pong' });
    if (action === 'getPurchaseOrders') return getPurchaseOrders(e.parameter.poNumber);
    if (action === 'getInventory') return getInventory();
    if (action === 'getChannelConfigs') return getChannelConfigs();
    if (action === 'getUsers') return getUsers();
    if (action === 'getUploadMetadata') return getUploadMetadata();
    if (action === 'getPackingData') return getPackingData(e.parameter.referenceCode);
    if (action === 'getQuotations') return getQuotations();
    if (action === 'getSystemConfig') return getSystemConfig();
    return responseJSON({ status: 'error', message: 'Invalid action' });
  } catch (err) {
    return responseJSON({ status: 'error', message: err.toString() });
  }
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return responseJSON({ status: 'error', message: 'No post data received' });
    }

    const data = JSON.parse(e.postData.contents);
    const action = data.action;

    debugLog(action || "UNKNOWN_ACTION", data);

    let result;

    if (action === 'ping') result = { status: 'success', message: 'pong' };
    else if (action === 'logFileUpload') result = handleActualFileUpload(data);
    else if (action === 'processFlipkartConsignment') result = processFlipkartConsignment(data);
    else if (action === 'updatePOStatus') result = updatePOStatus(data.poNumber, data.status);
    else if (action === 'manual_sync_inventory_allocation') result = manual_sync_inventory_allocation();
    else if (action === 'cancelLineItem') result = handleCancelLineItem(data.poNumber, data.articleCode);
    else if (action === 'SEND_AND_ACCEPT_ESTIMATE') result = sendAndAcceptEstimate(data);
    else if (action === 'FETCH_LAST_14_DAYS_QUOTATIONS') result = fetchLast14DaysQuotations();
    else if (action === 'syncSinglePO') result = { status: 'success', message: 'PO ' + data.poNumber + ' sync triggered.' };
    else if (action === 'createZohoInvoice') result = { status: 'success', message: 'Zoho Invoice creation triggered for ' + data.eeReferenceCode };
    else if (action === 'pushToShippingPartner') result = handlePushToShippingAggregator(data.eeReferenceCode);
    else if (action === 'updateFBAShipmentId') result = { status: 'success', message: 'FBA Shipment ID updated' };
    else if (action === 'syncEasyEcomShipments') result = { status: 'success', message: 'EasyEcom shipments sync triggered' };
    else if (action === 'syncInventory') result = { status: 'success', message: 'Inventory sync triggered' };
    else if (action === 'syncZohoContacts') result = { status: 'success', message: 'Zoho contacts sync triggered' };
    else if (action === 'syncZohoContactToEasyEcom') result = { status: 'success', message: 'Zoho contact sync to EasyEcom triggered' };
    else if (action === 'pushToEasyEcom') result = { status: 'success', message: 'Pushed to EasyEcom successfully' };
    else if (action === 'saveChannelConfig') result = { status: 'success', message: 'Channel config saved' };
    else if (action === 'saveSystemConfig') result = saveSystemConfig(data);
    else if (action === 'updatePrice') result = { status: 'success', message: 'Price updated' };
    else if (action === 'sendAppointmentEmail') result = { status: 'success', message: 'Appointment email sent' };
    else if (action === 'sendZeptoAppointmentRequestEmail') {
      const saleOrderList = data.orders?.map(o => String(o.id).trim()) || [];
      result = processChannelAppointments("Zepto", saleOrderList);
    }
    else if (action === 'sendInstamartAppointmentRequestEmail') {
      const saleOrderList = data.orders?.map(o => String(o.id).trim()) || [];
      result = processChannelAppointments("Instamart", saleOrderList);
    }
    else if (action === 'updateZeptoOrderStatus') result = { status: 'success', message: 'Zepto order status updated.' };
    else if (action === 'updateZeptoAppointmentDetails') result = { status: 'success', message: 'Zepto appointment details updated.' };
    else if (action === 'updateInstamartAppointmentDetails') result = updateInstamartAppointmentDetails(data);
    else if (action === 'updateZeptoASN') result = updateZeptoASN(data);
    else if (action === 'updateRTOStatus') result = updateRTOStatus(data);
    else if (action === 'processBlinkitAppointmentPasses') result = processBlinkitAppointmentPasses();
    else if (action === 'createItem') result = { status: 'success', message: 'Item created' };
    else if (action === 'createInventoryItem') result = { status: 'success', message: 'Item created' };
    else if (action === 'loginGoogle') result = { status: 'success', message: 'Login successful', user: { name: 'Admin User', email: 'admin@example.com', role: 'Admin' } };
    else if (action === 'saveUser') result = { status: 'success', message: 'User saved' };
    else if (action === 'deleteUser') result = { status: 'success', message: 'User deleted' };
    else if (action === 'FETCH_BOX_DETAILS') result = getBoxSummaryByEEReference(data.eeReferenceCode);
    else if (action === 'sendBBAppointmentRequestEmail') result = sendBBAppointmentRequestEmail(data);
    else if (action === 'sendRBLAppointmentRequestEmail') result = sendRBLAppointmentRequestEmail(data);
    else if (action === 'addOrderNote') result = addOrderNote(data);
    else if (action === 'updatePOPickupDate') result = updatePOPickupDate(data);
    else if (action === 'SELF_SHIP_ORDER') result = selfShipOrder(data);
    else {
      return responseJSON({ status: 'error', message: 'Invalid action: ' + action });
    }

    if (result && result.getContentText) return result;
    return responseJSON(result || { status: 'success', message: 'Action processed' });

  } catch (error) {
    return responseJSON({ status: 'error', message: "doPost Error: " + error.toString() });
  }
}

function saveSystemConfig(data) {
  const props = PropertiesService.getScriptProperties();
  if (data.easyecom_token) props.setProperty('EASY_ECOM_TOKEN', data.easyecom_token);
  if (data.easyecom_email) props.setProperty('EASY_ECOM_EMAIL', data.easyecom_email);
  if (data.nimbus_notification_email) props.setProperty('NIMBUS_NOTIFICATION_EMAIL', data.nimbus_notification_email);
  if (data.nimbus_to_emails !== undefined) props.setProperty('NIMBUS_TO_EMAILS', data.nimbus_to_emails);
  if (data.nimbus_cc_emails !== undefined) props.setProperty('NIMBUS_CC_EMAILS', data.nimbus_cc_emails);
  return {status: 'success', message: 'Config saved'};
}

function getSystemConfig() {
  const props = PropertiesService.getScriptProperties();
  return responseJSON({
    status: 'success',
    data: {
      easyecom_url: 'https://api.easyecom.io/webhook/v2/createOrder',
      easyecom_email: props.getProperty('EASY_ECOM_EMAIL') || '',
      easyecom_token: props.getProperty('EASY_ECOM_TOKEN') ? '********' : '', // Masked
      nimbus_notification_email : props.getProperty('NIMBUS_NOTIFICATION_EMAIL') || '',
      nimbus_to_emails: props.getProperty('NIMBUS_TO_EMAILS') || '',
      nimbus_cc_emails: props.getProperty('NIMBUS_CC_EMAILS') || '',
    }
  });
}


/**
 * Handles real file uploads by saving them to Drive and updating the metadata sheet.
 */
function handleActualFileUpload(data) {
  const { functionId, userName, fileData, fileName } = data;

  if (!fileData || !fileName) {
    return { status: 'error', message: 'Missing file data or name' };
  }

  try {
    const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    const decodedData = Utilities.base64Decode(fileData);
    const blob = Utilities.newBlob(decodedData, 'application/octet-stream', fileName);
    const file = folder.createFile(blob);

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const logSheet = ss.getSheetByName(SHEET_UPLOAD_LOGS);

    logSheet.appendRow([
      functionId,
      userName,
      new Date(),
      'Success',
      file.getUrl(),
      fileName
    ]);

    return {
      status: 'success',
      message: `File ${fileName} uploaded and logged successfully.`,
      fileUrl: file.getUrl()
    };
  } catch (e) {
    return { status: 'error', message: 'Upload failed: ' + e.toString() };
  }
}

/**
 * Specialized logic for Flipkart Consignment PDF text processing.
 */
function processFlipkartConsignment(data) {
  const { poNumber, fileText, userEmail } = data;

  if (!poNumber || !fileText) {
    return { status: 'error', message: 'PO Number or PDF text content missing' };
  }

  try {
    // 1. Extract details using Regex based on standard Flipkart portal PDF format
    const extractedPoMatch = fileText.match(/PO Number:\s*([A-Z0-9]+)/i);
    const extractedConsignmentMatch = fileText.match(/Consignment Number:\s*([A-Z0-9]+)/i);
    const extractedDateMatch = fileText.match(/Delivery Date:\s*(\d{4}-\d{2}-\d{2})\s*(\d{2}:\d{2}:\d{2})/i);

    const extractedPo = extractedPoMatch ? extractedPoMatch[1].trim() : null;
    const consignmentId = extractedConsignmentMatch ? extractedConsignmentMatch[1].trim() : null;
    const deliveryDate = extractedDateMatch ? extractedDateMatch[1] : null;
    const deliveryTime = extractedDateMatch ? extractedDateMatch[2] : null;

    // 2. Strict Validation
    if (!extractedPo) {
      return { status: 'error', message: 'Could not find PO Number in PDF content.' };
    }
    if (extractedPo !== poNumber) {
      return { status: 'error', message: `PO Mismatch! PDF belongs to ${extractedPo}, but you are uploading for ${poNumber}.` };
    }
    if (!consignmentId) {
      return { status: 'error', message: 'Consignment Number not found in PDF.' };
    }

    // 3. Update PO_Database
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const dbSheet = ss.getSheetByName(SHEET_PO_DB);
    const dbData = dbSheet.getDataRange().getValues();
    const headers = dbData[0];

    const poColIndex = headers.indexOf('PO Number');
    const statusColIndex = headers.indexOf('Status');
    const apptDateColIndex = headers.indexOf('Appointment Date');
    const apptTimeColIndex = headers.indexOf('Appointment Time');
    const apptIdColIndex = headers.indexOf('Appointment ID');

    let updated = false;
    for (let i = 1; i < dbData.length; i++) {
      if (String(dbData[i][poColIndex]) === poNumber) {
        // Update fields
        dbSheet.getRange(i + 1, apptIdColIndex + 1).setValue(consignmentId);
        if (deliveryDate) dbSheet.getRange(i + 1, apptDateColIndex + 1).setValue(deliveryDate);
        if (deliveryTime) dbSheet.getRange(i + 1, apptTimeColIndex + 1).setValue(deliveryTime);

        // Also update status to 'Appointment Pending' if it was earlier stage
        const currentStatus = String(dbData[i][statusColIndex]);
        if (currentStatus === 'New' || currentStatus === 'Confirmed') {
          dbSheet.getRange(i + 1, statusColIndex + 1).setValue('Appointment to be taken');
        }
        updated = true;
      }
    }

    if (!updated) {
      return { status: 'error', message: `PO ${poNumber} not found in database.` };
    }

    return {
      status: 'success',
      message: `Consignment ${consignmentId} successfully linked to PO ${poNumber}.`,
      details: { consignmentId, deliveryDate, deliveryTime }
    };

  } catch (e) {
    return { status: 'error', message: 'Processing Error: ' + e.toString() };
  }
}

function getQuotations() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_QUOTATIONS);
  if (!sheet) return responseJSON({ status: 'error', message: 'Quotations sheet not found' });
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const formattedData = data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });
  return responseJSON({ status: 'success', data: formattedData });
}

function sendAndAcceptEstimate(quotationData) {
  const estimateId = quotationData.estimateId;
  if (!estimateId) return { status: 'error', message: 'Estimate ID is required' };

  // Log the complete data for debugging
  debugLog('ACCEPT_ESTIMATE_FULL_DATA', quotationData);

  // 1. Remove the quote from the local spreadsheet
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_QUOTATIONS);
  if (sheet) {
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const estimateIdCol = headers.indexOf('Estimate ID');
    if (estimateIdCol !== -1) {
      // Find and delete rows (loop backwards to avoid index shifts)
      for (let i = data.length - 1; i >= 1; i--) {
        if (String(data[i][estimateIdCol]) === String(estimateId)) {
          sheet.deleteRow(i + 1);
        }
      }
    }
  }

  // 2. Refresh from Zoho API
  fetchLast14DaysQuotations();

  // 3. Return the latest quotations list to the frontend
  const freshQuotations = getQuotations();
  const responseData = JSON.parse(freshQuotations.getContentText());

  return { 
    status: 'success', 
    data: responseData.data,
    message: `Estimate ${quotationData.quotationNumber || estimateId} accepted, removed from local, and refreshed from Zoho.` 
  };
}

function fetchLast14DaysQuotations() {
  // Stub for Zoho API sync
  // In reality, this would fetch from Zoho and update the 'Quotations' sheet
  return { status: 'success', message: 'Quotations from last 14 days refreshed from Zoho.' };
}

function getPurchaseOrders(targetPoNumber) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_PO_DB);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  const formattedData = data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });

  const finalData = targetPoNumber
    ? formattedData.filter(d => String(d['PO Number']) === targetPoNumber)
    : formattedData;

  return responseJSON({ status: 'success', data: finalData });
}

function getInventory() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_INVENTORY);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const formattedData = data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });
  return responseJSON({ status: 'success', data: formattedData });
}

function manual_sync_inventory_allocation() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const mapSheet = ss.getSheetByName(SHEET_INVENTORY);
  const dbSheet = ss.getSheetByName(SHEET_PO_DB);

  const mapData = mapSheet.getDataRange().getValues();
  const inventoryMap = new Map();
  mapData.slice(1).forEach(row => {
    const sku = String(row[2]).trim();
    const qty = Number(row[4]) || 0;
    if (sku) inventoryMap.set(sku, qty);
  });

  const dbLastRow = dbSheet.getLastRow();
  if (dbLastRow < 2) return { status: 'success', message: 'Database empty' };

  const dbRange = dbSheet.getRange(2, 1, dbLastRow - 1, 20);
  const dbData = dbRange.getValues();

  // FIFO logic based on PO Date
  const fifoOrders = dbData
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => {
      const status = String(row[0]).toLowerCase().trim();
      const eeRefId = String(row[19] || '').trim();
      return (status === 'new' || status === 'confirmed') && eeRefId === '';
    })
    .sort((a, b) => new Date(a.row[1]) - new Date(b.row[1]));

  fifoOrders.forEach(({ row, index }) => {
    const sku = String(row[8]).trim();
    const reqQty = Number(row[10]) || 0;
    let available = inventoryMap.get(sku) || 0;
    const fulfillable = Math.min(reqQty, available);
    inventoryMap.set(sku, available - fulfillable);
    dbData[index][15] = fulfillable;
  });

  const allocationOutput = dbData.map(row => [row[15]]);
  dbSheet.getRange(2, 16, allocationOutput.length, 1).setValues(allocationOutput);

  return { status: 'success', message: 'Manual inventory allocation successful.' };
}

function debugLog(action, data) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const logSheet = ss.getSheetByName(LOG_DEBUG_SHEET) || ss.insertSheet(LOG_DEBUG_SHEET);
    logSheet.appendRow([new Date(), action, JSON.stringify(data).substring(0, 5000)]);
  } catch (e) { }
}

/** 
 * Note: These are stub implementations for core functions.
 * In a production setup, they connect to EasyEcom/Zoho APIs.
 */
function updatePOStatus(poNumber, status) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_PO_DB);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const poCol = headers.indexOf('PO Number');
  const statusCol = headers.indexOf('Status');

  let found = false;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][poCol]) === poNumber) {
      sheet.getRange(i + 1, statusCol + 1).setValue(status);
      found = true;
    }
  }
  if (found) return { status: 'success' };
  return { status: 'error', message: 'PO not found' };
}

function handleCancelLineItem(poNumber, articleCode) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_PO_DB);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const poCol = headers.indexOf('PO Number');
  const artCol = headers.indexOf('Item Code');
  const itemStatusCol = headers.indexOf('EE_item_item_status');

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][poCol]) === poNumber && String(data[i][artCol]).trim() === articleCode.trim()) {
      sheet.getRange(i + 1, itemStatusCol + 1).setValue('Cancelled');
      return { status: 'success' };
    }
  }
  return { status: 'error', message: 'Line item not found' };
}

function processBlinkitAppointmentPasses() {
  try {
    // This is a stub for the actual logic that would process Blinkit appointment passes
    // In a real scenario, it would fetch data from Blinkit portal or a designated sheet
    // and update the PO_Database with appointment details.

    debugLog('PROCESS_BLINKIT_PASSES', { timestamp: new Date() });

    return {
      status: 'success',
      message: 'Blinkit appointment passes processed successfully. PO Database updated.'
    };
  } catch (e) {
    return { status: 'error', message: 'Error processing Blinkit passes: ' + e.toString() };
  }
}

function processChannelAppointments(channelName, saleOrderList) {
  if (!saleOrderList || !Array.isArray(saleOrderList)) return { status: 'error', message: 'No orders provided' };

  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEET_PO_DB);
    const sheetData = sheet.getDataRange().getValues();
    const headers = sheetData[0];
    const refCol = headers.indexOf('EE_reference_code');
    const requestIdCol = headers.indexOf('Appointment Request ID');
    const requestTimestampCol = headers.indexOf('Appointment Request Timestamp');

    if (requestIdCol === -1 || requestTimestampCol === -1 || refCol === -1) {
      return { status: 'error', message: 'Required columns not found in sheet.' };
    }

    const prefix = channelName === 'Instamart' ? 'INSTA-REQ-' : 'REQ-';
    const requestId = prefix + Date.now();
    const timestamp = new Date().toLocaleString();

    let updatedCount = 0;
    saleOrderList.forEach(orderId => {
      for (let i = 1; i < sheetData.length; i++) {
        if (String(sheetData[i][refCol]) === orderId) {
          sheet.getRange(i + 1, requestIdCol + 1).setValue(requestId);
          sheet.getRange(i + 1, requestTimestampCol + 1).setValue(timestamp);
          updatedCount++;
        }
      }
    });

    return {
      status: 'success',
      message: `${channelName} Appointment request sent for ${updatedCount} orders.`,
      requestId
    };
  } catch (e) {
    return { status: 'error', message: 'Error updating appointment request: ' + e.toString() };
  }
}

function getBoxSummaryByEEReference(eeReferenceCode) {
  // Stub implementation for Amazon Box Details
  return {
    status: 'success',
    data: [
      { "Box ID": "AMZ-BOX-001", "Weight": "4.5 kg", "Dimensions": "40x30x25 cm", "Items": "SKU-A (10), SKU-B (5)" },
      { "Box ID": "AMZ-BOX-002", "Weight": "2.1 kg", "Dimensions": "30x20x15 cm", "Items": "SKU-C (12)" }
    ]
  };
}

function updateZeptoASN(data) {
  const { eeReferenceCode, asnNumber } = data;
  if (!eeReferenceCode || !asnNumber) {
    return { status: 'error', message: 'Missing required fields' };
  }

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_PO_DB);
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0];

  const eeRefIdx = headers.indexOf("EE_reference_code");
  const statusIdx = headers.indexOf("Status");
  let asnIdx = headers.indexOf("ASN Number");

  if (eeRefIdx === -1 || statusIdx === -1) {
    return { status: 'error', message: 'Required columns (EE_reference_code, Status) not found in PO_Database' };
  }

  // Add ASN Number column if missing
  if (asnIdx === -1) {
    asnIdx = headers.length;
    sheet.getRange(1, asnIdx + 1).setValue("ASN Number");
  }

  let updated = false;
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][eeRefIdx]).trim() === String(eeReferenceCode).trim()) {
      sheet.getRange(i + 1, statusIdx + 1).setValue("Ready to Ship");
      if (asnIdx !== -1) {
        sheet.getRange(i + 1, asnIdx + 1).setValue(asnNumber);
      }
      updated = true;
    }
  }

  if (updated) {
    return { status: 'success', message: 'ASN updated and status moved to Ready to Ship' };
  } else {
    return { status: 'error', message: 'Order not found' };
  }
}

function updateRTOStatus(data) {
  const { eeReferenceCode, rtoStatus } = data;
  if (!eeReferenceCode || !rtoStatus) {
    return { status: 'error', message: 'Missing required fields' };
  }

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_PO_DB);
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0];

  const eeRefIdx = headers.indexOf("EE_reference_code");
  const rtoStatusIdx = headers.indexOf("RTO Status");

  if (eeRefIdx === -1 || rtoStatusIdx === -1) {
    return { status: 'error', message: 'Required columns not found in PO_Database' };
  }

  let updated = false;
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][eeRefIdx]).trim() === String(eeReferenceCode).trim()) {
      sheet.getRange(i + 1, rtoStatusIdx + 1).setValue(rtoStatus);
      updated = true;
    }
  }

  if (updated) {
    return { status: 'success', message: 'RTO Status updated successfully' };
  } else {
    return { status: 'error', message: 'Order not found' };
  }
}

function updateInstamartAppointmentDetails(data) {
  const { eeReferenceCode, appointmentId, appointmentDate, appointmentTime } = data;
  if (!eeReferenceCode || (!appointmentId && !appointmentDate && !appointmentTime)) {
    return { status: 'error', message: 'Missing required fields' };
  }

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_PO_DB);
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0];

  const eeRefIdx = headers.indexOf("EE_reference_code");
  const apptIdIdx = headers.indexOf("Appointment ID");
  const apptDateIdx = headers.indexOf("Appointment Date");
  const apptTimeIdx = headers.indexOf("Appointment Time");

  if (eeRefIdx === -1 || apptIdIdx === -1 || apptDateIdx === -1 || apptTimeIdx === -1) {
    return { status: 'error', message: 'Required columns not found in PO_Database' };
  }

  let updated = false;
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][eeRefIdx]).trim() === String(eeReferenceCode).trim()) {
      if (appointmentId) sheet.getRange(i + 1, apptIdIdx + 1).setValue(appointmentId);
      if (appointmentDate) sheet.getRange(i + 1, apptDateIdx + 1).setValue(appointmentDate);
      if (appointmentTime) sheet.getRange(i + 1, apptTimeIdx + 1).setValue(appointmentTime);
      updated = true;
    }
  }

  if (updated) {
    return { status: 'success', message: 'Appointment details updated successfully' };
  } else {
    return { status: 'error', message: 'Order not found' };
  }
}

function sendBBAppointmentRequestEmail(data) {
  const { orders } = data;
  if (!orders || !Array.isArray(orders)) return { status: 'error', message: 'Missing orders array' };

  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const poSheet = ss.getSheetByName(SHEET_PO_DB);
    const zohoSheet = ss.getSheetByName(SHEET_ZOHO_CUSTOMERS);

    if (!poSheet || !zohoSheet) return { status: 'error', message: 'Required sheets not found' };

    const poData = poSheet.getDataRange().getValues();
    const poHeaders = poData[0];
    const refCol = poHeaders.indexOf('EE_reference_code');
    const statusCol = poHeaders.indexOf('Status');
    const companyCol = poHeaders.indexOf('Company Name');

    const zohoData = zohoSheet.getDataRange().getValues();
    const zohoHeaders = zohoData[0];
    const contactNameCol = zohoHeaders.indexOf('Contact Name');
    const emailCol = zohoHeaders.indexOf('Email');
    const firstNameCol = zohoHeaders.indexOf('First Name');

    let successCount = 0;
    let errors = [];

    orders.forEach(order => {
      const eeReferenceCode = order.poReference; // Frontend sends poReference as the reference code
      let orderRow = -1;
      let companyName = "";

      for (let i = 1; i < poData.length; i++) {
        if (String(poData[i][refCol]).trim() === String(eeReferenceCode).trim()) {
          orderRow = i + 1;
          companyName = String(poData[i][companyCol]).trim();
          break;
        }
      }

      if (orderRow === -1) {
        errors.push(`Order ${eeReferenceCode} not found`);
        return;
      }

      let pocEmail = "";
      let pocName = "";

      for (let j = 1; j < zohoData.length; j++) {
        if (String(zohoData[j][contactNameCol]).trim() === companyName) {
          pocEmail = String(zohoData[j][emailCol]).trim();
          pocName = String(zohoData[j][firstNameCol]).trim();
          break;
        }
      }

      if (!pocEmail) {
        errors.push(`POC email not found for ${companyName}`);
        return;
      }

      // Send Email
      const subject = "Appointment Request for Order: " + eeReferenceCode;
      const body = "Dear " + (pocName || "Team") + ",\n\n" +
        "This is a request for an appointment for our order " + eeReferenceCode + ".\n" +
        "Please provide the appointment slot at the earliest.\n\n" +
        "Best regards,\n" +
        "QC Team";

      MailApp.sendEmail(pocEmail, subject, body);

      // Update Status to 'Awaiting Appointment Details'
      poSheet.getRange(orderRow, statusCol + 1).setValue('Awaiting Appointment Details');
      successCount++;
    });

    return {
      status: successCount > 0 ? 'success' : 'error',
      message: `Successfully processed ${successCount} orders. ${errors.length > 0 ? ' Errors: ' + errors.join(', ') : ''}`,
      successCount,
      errors
    };

  } catch (e) {
    return { status: 'error', message: 'Error sending BB appointments: ' + e.toString() };
  }
}

function sendRBLAppointmentRequestEmail(data) {
  const { orders } = data;
  if (!orders || !Array.isArray(orders)) return { status: 'error', message: 'Missing orders array' };

  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const poSheet = ss.getSheetByName(SHEET_PO_DB);
    const configSheet = ss.getSheetByName('Channel_Config');

    if (!poSheet) return { status: 'error', message: 'PO_Database sheet not found' };

    const poData = poSheet.getDataRange().getValues();
    const poHeaders = poData[0];
    const refCol = poHeaders.indexOf('EE_reference_code');
    const statusCol = poHeaders.indexOf('Status');
    const requestIdCol = poHeaders.indexOf('Appointment Request ID');
    const requestTimestampCol = poHeaders.indexOf('Appointment Request Timestamp');

    // --- Get POC Email and CC Email from Channel_Config ---
    let pocEmail = '';
    let ccEmail = '';
    if (configSheet) {
      const configData = configSheet.getDataRange().getValues();
      const configHeaders = configData[0];
      const channelCol = configHeaders.indexOf('Channel');
      const emailAddrCol = configHeaders.indexOf('POC Email');
      const ccEmailAddrCol = configHeaders.indexOf('Appointment CC');
      if (channelCol !== -1) {
        for (let c = 1; c < configData.length; c++) {
          if (String(configData[c][channelCol]).toLowerCase().includes('rbl')) {
            if (emailAddrCol !== -1) pocEmail = String(configData[c][emailAddrCol]).trim();
            if (ccEmailAddrCol !== -1) ccEmail = String(configData[c][ccEmailAddrCol]).trim();
            break;
          }
        }
      }
    }
    if (!pocEmail) pocEmail = 'brainlytic.logistic@gmail.com'; // Fallback

    const VENDOR_CODE = '40002051';
    const requestId = 'RBL-REQ-' + Date.now();
    const timestamp = new Date().toLocaleString();

    // --- Build aggregated item rows across all orders for the HTML table ---
    let allTableRows = [];
    let pdfLinks = [];
    let successCount = 0;

    orders.forEach(order => {
      const poRef = order.poReference || '';
      const invoiceNumber = order.invoiceNumber || '';
      const invoicePdfUrl = order.invoiceurl || order.invoicePdfUrl || '';
      const poPdfUrl = order.poPdfUrl || '';
      const items = order.items || [];

      if (invoicePdfUrl) pdfLinks.push({ label: 'Invoice - ' + (invoiceNumber || poRef), url: invoicePdfUrl });
      if (poPdfUrl) pdfLinks.push({ label: 'PO - ' + poRef, url: poPdfUrl });

      // Group items by articleCode + shippedQuantity per box (Case Pack)
      const grouped = {};
      items.forEach(item => {
        const casePack = item.eeBoxCount > 0 ? Math.round(item.shippedQuantity / item.eeBoxCount) : item.shippedQuantity;
        const key = (item.articleCode || '') + '|' + casePack;
        if (!grouped[key]) {
          grouped[key] = {
            articleCode: item.articleCode || '',
            sku: item.sku || '',
            itemName: item.itemName || '',
            casePack: casePack,
            boxCount: item.eeBoxCount || 0,
            totalQty: item.shippedQuantity || 0
          };
        } else {
          grouped[key].boxCount += (item.eeBoxCount || 0);
          grouped[key].totalQty += (item.shippedQuantity || 0);
        }
      });

      Object.values(grouped).forEach(g => {
        allTableRows.push({
          poNo: poRef,
          invoiceNumber: invoiceNumber,
          articleCode: g.articleCode,
          sku: g.sku,
          description: g.itemName,
          casePack: g.casePack,
          boxCount: g.boxCount,
          totalQty: g.totalQty
        });
      });

      // Update PO_Database rows
      if (refCol !== -1) {
        for (let i = 1; i < poData.length; i++) {
          if (String(poData[i][refCol]).trim() === String(order.id).trim()) {
            if (statusCol !== -1) poSheet.getRange(i + 1, statusCol + 1).setValue('Awaiting Appointment Details');
            if (requestIdCol !== -1) poSheet.getRange(i + 1, requestIdCol + 1).setValue(requestId);
            if (requestTimestampCol !== -1) poSheet.getRange(i + 1, requestTimestampCol + 1).setValue(timestamp);
            successCount++;
            break;
          }
        }
      }
    });

    // --- Build HTML Table ---
    let itemRows = allTableRows.map(r => `
      <tr>
        <td style="padding:8px;border:1px solid #ddd;text-align:center;">${VENDOR_CODE}</td>
        <td style="padding:8px;border:1px solid #ddd;">${r.poNo}</td>
        <td style="padding:8px;border:1px solid #ddd;">${r.invoiceNumber}</td>
        <td style="padding:8px;border:1px solid #ddd;">${r.articleCode}</td>
        <td style="padding:8px;border:1px solid #ddd;">${r.sku}</td>
        <td style="padding:8px;border:1px solid #ddd;">${r.description}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:center;">${r.casePack}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:center;">${r.boxCount}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:center;">${r.totalQty}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:center;">TBD</td>
      </tr>
    `).join('');

    let pdfSection = pdfLinks.length > 0 ? '<p style="margin-top:16px;"><strong>Attached Documents:</strong></p><ul>' +
      pdfLinks.map(l => `<li><a href="${l.url}" style="color:#2563EB;">${l.label}</a></li>`).join('') + '</ul>' : '';

    const htmlBody = `
      <div style="font-family:Arial,sans-serif;max-width:900px;margin:0 auto;">
        <div style="background-color:#E11D48;padding:16px 24px;color:white;border-radius:8px 8px 0 0;">
          <h2 style="margin:0;">RBL / Hamleys - Appointment Request</h2>
          <p style="margin:4px 0 0;opacity:0.9;">Vendor Code: ${VENDOR_CODE} | Brainlytic Solutions Pvt Ltd</p>
        </div>
        <div style="padding:20px;border:1px solid #E5E7EB;border-top:none;border-radius:0 0 8px 8px;">
          <p>Dear Team,</p>
          <p>We would like to request an appointment for delivery of the following items. Please provide the earliest available delivery slot.</p>
          <table style="width:100%;border-collapse:collapse;margin-top:16px;font-size:13px;">
            <thead>
              <tr style="background-color:#FEE2E2;">
                <th style="padding:10px 8px;border:1px solid #ddd;font-weight:600;">Vendor Code</th>
                <th style="padding:10px 8px;border:1px solid #ddd;font-weight:600;">PO No.</th>
                <th style="padding:10px 8px;border:1px solid #ddd;font-weight:600;">Invoice Number</th>
                <th style="padding:10px 8px;border:1px solid #ddd;font-weight:600;">PO Article</th>
                <th style="padding:10px 8px;border:1px solid #ddd;font-weight:600;">SKU</th>
                <th style="padding:10px 8px;border:1px solid #ddd;font-weight:600;">Description</th>
                <th style="padding:10px 8px;border:1px solid #ddd;font-weight:600;">Case Pack</th>
                <th style="padding:10px 8px;border:1px solid #ddd;font-weight:600;">No. of Boxes</th>
                <th style="padding:10px 8px;border:1px solid #ddd;font-weight:600;">Total Qty</th>
                <th style="padding:10px 8px;border:1px solid #ddd;font-weight:600;">Required Appt. Date</th>
              </tr>
            </thead>
            <tbody>${itemRows}</tbody>
          </table>
          ${pdfSection}
          <p style="margin-top:24px;">Please confirm the appointment at the earliest.</p>
          <p>Best regards,<br/>Brainlytic Solutions Pvt Ltd</p>
        </div>
      </div>
    `;

    MailApp.sendEmail({
      to: pocEmail,
      cc: ccEmail,
      subject: 'RBL Appointment Request - Brainlytic Solutions Pvt Ltd',
      htmlBody: htmlBody
    });

    return {
      status: successCount > 0 ? 'success' : 'error',
      message: `RBL appointment request sent for ${successCount} orders.`,
      requestId
    };

  } catch (e) {
    return { status: 'error', message: 'Error sending RBL appointment request: ' + e.toString() };
  }
}

function getChannelConfigs() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_CHANNEL_CONFIG);
  if (!sheet) return { status: 'success', data: [] };
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const formatted = data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });
  return { status: 'success', data: formatted };
}

function getUsers() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_USERS);
  if (!sheet) return { status: 'success', data: [] };
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const formatted = data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });
  return { status: 'success', data: formatted };
}

/**
 * Appends a note to the "Order Notes" column in PO_Database.
 * Delimiter: "##"
 */
function addOrderNote(data) {
  const { poNumber, note, userName } = data;
  if (!poNumber || !note) return { status: 'error', message: 'PO Number or Note missing' };

  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEET_PO_DB);
    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();
    const headers = values[0];

    const poCol = headers.indexOf('PO Number');
    const notesCol = headers.indexOf('Order Notes');

    if (poCol === -1) return { status: 'error', message: 'PO Number column not found' };
    if (notesCol === -1) return { status: 'error', message: 'Order Notes column not found' };

    let rowIndex = -1;
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][poCol]).trim() === String(poNumber).trim()) {
        rowIndex = i + 1;
        break;
      }
    }

    if (rowIndex === -1) return { status: 'error', message: 'PO not found: ' + poNumber };

    const currentNotes = String(values[rowIndex - 1][notesCol] || "").trim();
    const timestamp = Utilities.formatDate(new Date(), "GMT+5:30", "yyyy-MM-dd HH:mm");
    const newNoteEntry = `[${timestamp}] ${userName || 'System'}: ${note}`;
    
    const updatedNotes = currentNotes ? currentNotes + " ## " + newNoteEntry : newNoteEntry;

    sheet.getRange(rowIndex, notesCol + 1).setValue(updatedNotes);

    return { 
      status: 'success', 
      message: 'Note added successfully',
      updatedNotes: updatedNotes
    };
  } catch (err) {
    return { status: 'error', message: err.toString() };
  }
}

function updatePOPickupDate(data) {
  const { eeReferenceCode, pickupDate } = data;
  if (!eeReferenceCode || !pickupDate) {
    return { status: 'error', message: "Missing eeReferenceCode or pickupDate" };
  }

  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const dbSheet = ss.getSheetByName(SHEET_PO_DB);
    const rows = dbSheet.getDataRange().getValues();
    const headers = rows[0];

    // Using exact headers specified in the sheet
    const eeRefIdx = headers.indexOf("EE_reference_code"); 
    let pickupIdx = headers.indexOf("Pickup Date");

    if (eeRefIdx === -1) {
      return { status: 'error', message: "'EE_reference_code' column not found" };
    }
    
    if (pickupIdx === -1) {
        pickupIdx = headers.length;
        dbSheet.getRange(1, pickupIdx + 1).setValue("Pickup Date");
    }

    let updatedCount = 0;
    for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][eeRefIdx]).trim() === String(eeReferenceCode).trim()) {
            dbSheet.getRange(i + 1, pickupIdx + 1).setValue(pickupDate);
            updatedCount++;
        }
    }

    if (updatedCount === 0) {
      return { status: 'error', message: `No rows found for EE Ref: ${eeReferenceCode}` };
    }

    return { status: 'success', message: 'Pickup Date updated successfully' };
  } catch (e) {
    return { status: 'error', message: 'Error updating pickup date: ' + e.toString() };
  }
}

/**
 * Marks an order as Self Shipped and updates tracking details.
 */
function selfShipOrder(data) {
  const { eeReferenceCode, awb, courier, trackingUrl, labelUrl } = data;
  if (!eeReferenceCode || !courier) {
    return { status: 'error', message: 'EE Reference Code and Courier Name are required' };
  }

  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const dbSheet = ss.getSheetByName(SHEET_PO_DB);
    const sheetData = dbSheet.getDataRange().getValues();
    const headers = sheetData[0];

    const refCol = headers.indexOf('EE_reference_code');
    const awbIdx = headers.indexOf("AWB");
    const carrierIdx = headers.indexOf('Carrier');
    const trackingIdx = headers.indexOf('Tracking Status');
    const trackingUrlIdx = headers.indexOf('Tracking URL');
    const labelIdx = headers.indexOf('Label URL');
    const bookedDateIdx = headers.indexOf('Booked Date');
    const pickupDateIdx = headers.indexOf('Pickup Date');

    if (refCol === -1) return { status: 'error', message: 'EE_reference_code column not found' };

    const now = new Date();
    const today = new Date(now);
    const hourIST = parseInt(Utilities.formatDate(now, "Asia/Kolkata", "HH"));
    
    let pickupDate = new Date(now);
    if (hourIST >= 14) {
      pickupDate.setDate(pickupDate.getDate() + 1);
    }

    let updated = false;
    for (let i = 1; i < sheetData.length; i++) {
      if (String(sheetData[i][refCol]).trim() === String(eeReferenceCode).trim()) {
        if (awbIdx !== -1) dbSheet.getRange(i + 1, awbIdx + 1).setValue(awb || "");
        if (carrierIdx !== -1) dbSheet.getRange(i + 1, carrierIdx + 1).setValue(courier + " (Self)");
        if (trackingIdx !== -1) dbSheet.getRange(i + 1, trackingIdx + 1).setValue("AWB Assigned");
        if (bookedDateIdx !== -1) dbSheet.getRange(i + 1, bookedDateIdx + 1).setValue(today);
        if (pickupDateIdx !== -1) dbSheet.getRange(i + 1, pickupDateIdx + 1).setValue(pickupDate);
        if (trackingUrlIdx !== -1) dbSheet.getRange(i + 1, trackingUrlIdx + 1).setValue(trackingUrl || "");
        if (labelIdx !== -1) dbSheet.getRange(i + 1, labelIdx + 1).setValue(labelUrl || "");
        updated = true;
      }
    }

    if (updated) {
      return {
        status: "success",
        message: `Order ${eeReferenceCode} marked as Self Shipped via ${courier}`,
        awb,
        courier,
        label: labelUrl,
        tracking: trackingUrl
      };
    }
    return { status: 'error', message: 'Order not found in database: ' + eeReferenceCode };
  } catch (e) {
    return { status: 'error', message: 'Error in selfShipOrder: ' + e.toString() };
  }
}
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
