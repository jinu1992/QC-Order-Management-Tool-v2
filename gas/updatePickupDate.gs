/**
 * Updates the "Pickup Date" column in the PO Database sheet
 * for ALL rows that match the given EE Reference Code.
 *
 * Called from the dashboard via postToScript with action = "updatePOPickupDate".
 *
 * @param {string} eeReferenceCode - The EasyEcom Reference Code (e.g. EEC-123456)
 * @param {string} pickupDate      - Pickup date/time string (e.g. "07-04-2026 10:00 AM")
 */
function updatePOPickupDate(eeReferenceCode, pickupDate) {
  if (!eeReferenceCode || !pickupDate) {
    Logger.log("updatePOPickupDate: Missing arguments");
    return { success: false, message: "Missing eeReferenceCode or pickupDate" };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dbSheet = ss.getSheetByName(SHEET_PO_DB); // Use your constant or replace with the sheet name string

  if (!dbSheet) {
    Logger.log("updatePOPickupDate: PO DB sheet not found");
    return { success: false, message: "PO DB sheet not found" };
  }

  const data = dbSheet.getDataRange().getValues();
  const headers = data[0];

  // ─── Column index helpers ────────────────────────────────────────────────
  const col = (name) => headers.indexOf(name);

  const IDX = {
    EE_REF:  col("EE Reference Code"),  // ✅ Change to the actual column header name if different
    PICKUP:  col("Pickup Date"),         // ✅ Change to the actual column header name if different
  };

  if (IDX.EE_REF === -1) {
    Logger.log("updatePOPickupDate: 'EE Reference Code' column not found in headers");
    return { success: false, message: "'EE Reference Code' column not found" };
  }

  if (IDX.PICKUP === -1) {
    Logger.log("updatePOPickupDate: 'Pickup Date' column not found in headers");
    return { success: false, message: "'Pickup Date' column not found" };
  }

  let updatedCount = 0;

  for (let i = 1; i < data.length; i++) {
    const rowRef = String(data[i][IDX.EE_REF]).trim();

    if (rowRef === String(eeReferenceCode).trim()) {
      const currentValue = data[i][IDX.PICKUP];

      if (currentValue !== pickupDate) {
        dbSheet.getRange(i + 1, IDX.PICKUP + 1).setValue(pickupDate);
        Logger.log(`Row ${i + 1}: Pickup Updated → ${eeReferenceCode} → ${pickupDate}`);
      }

      updatedCount++;
      // Continue looping — update ALL rows with this reference code
    }
  }

  if (updatedCount === 0) {
    Logger.log(`updatePOPickupDate: No rows found for EE Ref: ${eeReferenceCode}`);
    return { success: false, message: `No rows found for EE Ref: ${eeReferenceCode}` };
  }

  Logger.log(`updatePOPickupDate: Updated ${updatedCount} row(s) for ${eeReferenceCode}`);
  return { success: true, updatedRows: updatedCount };
}


/**
 * Entry point: handles the "updatePOPickupDate" action from postToScript.
 * Add this case to your existing doPost / handleRequest switch statement.
 *
 * Example integration in your main GAS handler:
 *
 *   case "updatePOPickupDate":
 *     return updatePOPickupDate(params.poNumber, params.pickupDate);
 */
