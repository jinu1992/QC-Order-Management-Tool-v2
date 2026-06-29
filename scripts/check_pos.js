

const API_URL = 'https://script.google.com/macros/s/AKfycbwBDSNnN_xKlZc4cTwwKthd7-Nq8IE83csNdNHODP55EnVEz-gfWzcvzYdxGeNbJSPzZQ/exec';

const formatSheetDate = (dateVal) => {
    if (!dateVal) return '';
    if (typeof dateVal === 'string' && dateVal.length < 15 && !dateVal.includes('T')) return dateVal;
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return String(dateVal);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

const POStatus = {
    NewPO: 'New',
    BelowThreshold: 'Below Threshold',
    Pushed: 'Pushed',
    PartiallyProcessed: 'Partially Pushed',
    Cancelled: 'Cancelled',
    ConfirmedToSend: 'Confirmed to Send',
    WaitingForConfirmation: 'Waiting for Confirmation',
    Closed: 'Closed',
    Dispatched: 'Dispatched'
};

const transformSheetDataToPOs = (rows) => {
    const poMap = new Map();
    rows.forEach((row) => {
        const poNumber = row['PO Number'];
        if (!poNumber) return;

        const rawStatus = row['Status'] || 'New';
        let status = POStatus.NewPO;
        if (rawStatus === 'Below Threshold') status = POStatus.BelowThreshold;
        else if (Object.values(POStatus).includes(rawStatus)) status = rawStatus;

        const qty = Number(row['Qty'] || 0);
        const unitCost = Number(row['Unit Cost (Tax Exclusive)'] || 0);
        const itemAmount = qty * unitCost;
        const articleCode = String(row['Item Code'] || '').trim();

        const item = {
            articleCode,
            masterSku: String(row['Master SKU'] || ''),
            itemName: row['Item Name'] || '',
            qty,
            fulfillableQty: Number(row['Fulfillable qty'] || 0),
            unitCost,
            mrp: Number(row['MRP'] || 0),
            priceCheckStatus: String(row['Price Check'] || '').trim(),
            itemStatus: String(row['EE_item_item_status'] || rawStatus),
            eeOrderRefId: row['EE Order Ref ID'] ? String(row['EE Order Ref ID']) : undefined,
            eeReferenceCode: row['EE_reference_code'] ? String(row['EE_reference_code']) : undefined,
            eeOrderDate: formatSheetDate(row['EE_order_date']),
            eeOrderStatus: row['EE_order_status'] ? String(row['EE_order_status']) : undefined,
        };

        if (poMap.has(poNumber)) {
            const po = poMap.get(poNumber);
            po.items.push(item);
            po.qty += qty;
            po.amount += itemAmount;
            if (!po.eeReferenceCode && row['EE_reference_code']) po.eeReferenceCode = String(row['EE_reference_code']);
            if (rawStatus === 'RTD') po.poDbStatus = 'RTD';
        } else {
            poMap.set(poNumber, {
                id: poNumber, poNumber, status,
                poDbStatus: rawStatus,
                channel: row['Channel Name'] || 'Unknown',
                storeCode: row['Store Code'] || '',
                qty, amount: itemAmount,
                orderDate: formatSheetDate(row['PO Date']),
                eeReferenceCode: row['EE_reference_code'] ? String(row['EE_reference_code']) : undefined,
                items: [item],
            });
        }
    });
    return Array.from(poMap.values());
};

const getCalculatedStatus = (po) => {
    const items = po.items || [];
    const activeItems = items.filter(i => (i.itemStatus || '').toLowerCase() !== 'cancelled');
    const pushedItems = activeItems.filter(i => !!i.eeOrderRefId);
    const rawStatus = String(po.status || '').trim().toLowerCase();
    if (rawStatus === 'cancelled' || (items.length > 0 && activeItems.length === 0)) return POStatus.Cancelled;
    if (rawStatus === 'below threshold') return POStatus.BelowThreshold;
    if (activeItems.length > 0 && pushedItems.length === activeItems.length) return POStatus.Pushed;
    if (pushedItems.length > 0) return POStatus.PartiallyProcessed;
    if (rawStatus === 'confirmed' || rawStatus === 'confirmed to send') return POStatus.ConfirmedToSend;
    if (rawStatus === 'waiting for confirmation') return POStatus.WaitingForConfirmation;
    return POStatus.NewPO;
};

async function checkPOs() {
    try {
        const response = await fetch(`${API_URL}?action=getPurchaseOrders`);
        let text;
        try {
            text = await response.text();
            const json = JSON.parse(text);
            if (json.status !== 'success') {
                console.error('Failed response from API:', json);
                return;
            }

            const rawRows = json.data;
            const purchaseOrders = transformSheetDataToPOs(rawRows);

            console.log(`Total unique POs fetched: ${purchaseOrders.length}`);
            
            const counts = { 'All POs': purchaseOrders.length, 'New POs': 0, 'Below Threshold POs': 0, 'Pushed POs': 0, 'Partially Pushed POs': 0, 'Cancelled POs': 0 };
            const details = [];

            purchaseOrders.forEach(po => {
                const calculatedStatus = getCalculatedStatus(po);
                const isNew = calculatedStatus === POStatus.NewPO || calculatedStatus === POStatus.ConfirmedToSend || calculatedStatus === POStatus.WaitingForConfirmation;
                
                if (isNew) counts['New POs']++;
                else if (calculatedStatus === POStatus.BelowThreshold) counts['Below Threshold POs']++;
                else if (calculatedStatus === POStatus.Pushed) counts['Pushed POs']++;
                else if (calculatedStatus === POStatus.PartiallyProcessed) counts['Partially Pushed POs']++;
                else if (calculatedStatus === POStatus.Cancelled) counts['Cancelled POs']++;

                details.push({
                    poNumber: po.poNumber,
                    channel: po.channel,
                    sheetStatus: po.status,
                    calculatedStatus,
                    itemCount: po.items.length,
                    pushedCount: po.items.filter(i => !!i.eeOrderRefId).length,
                    isNew
                });
            });

            console.log('\nCalculated PO Counts:');
            console.log(JSON.stringify(counts, null, 2));

            console.log('\nPO Details:');
            console.table(details);
        } catch (parseError) {
            console.error('JSON parsing failed. Status:', response.status);
            console.error('Response headers:', [...response.headers.entries()]);
            console.error('Response body preview:', text ? text.substring(0, 1000) : 'No body text read');
            throw parseError;
        }

    } catch (e) {
        console.error('Error occurred:', e);
    }
}

checkPOs();
