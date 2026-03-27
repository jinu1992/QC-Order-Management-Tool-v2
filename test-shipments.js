const fs = require('fs');
const mockDataFile = fs.readFileSync('data/mockData.ts', 'utf8');

// A quick and dirty way to evaluate the mock data without TS compiler errors when run in Node
// We will extract the shipment evaluation logic and run it on dummy data to see logic flaws.
console.log("Looking at Shipment tracker logic. Simulated dummy pass...");

const dummyPurchaseOrders = [
    {
        id: "PO123",
        poNumber: "PO123",
        channel: "Zepto",
        items: [
            {
                eeReferenceCode: "123",
                eeOrderStatus: "Shipped",
                awb: "AWB123",
                trackingStatus: "In Transit"
            }
        ]
    },
    {
        id: "PO124",
        poNumber: "PO124",
        channel: "BB",
        items: [
            {
                eeReferenceCode: "124",
                eeOrderStatus: "Confirmed",
                eeManifestDate: new Date().toISOString()
            }
        ]
    }
];

// Run the grouping logic
const groups = {};
dummyPurchaseOrders.forEach(po => {
    (po.items || []).forEach(item => {
        const rawRef = item.eeReferenceCode;
        const refCode = String(rawRef).trim();

        const isAmazon = po.channel.toLowerCase().includes('amazon');
        const isAmazonFbaYeio = false;
        const statusHasInvoice = false || isAmazonFbaYeio;

        const maniDate = item.eeManifestDate || po.eeManifestDate;
        const eeStatus = (item.eeOrderStatus || po.eeOrderStatus || 'Processing').trim();
        const eeStatusLower = eeStatus.toLowerCase();

        // This is where logic lies...
        let displayStatus = 'Processing';

        const trackingStatus = item.trackingStatus || po.trackingStatus;
        const trackingStatusLower = (trackingStatus || '').toLowerCase();
        const isOutOfDelivery = trackingStatusLower === 'out for delivery';
        const isActuallyDelivered = (trackingStatusLower === 'delivered');
        const isDeliveredStatus = isActuallyDelivered && !isOutOfDelivery;

        const rtoStatus = item.rtoStatus || po.rtoStatus;
        const isRTOInitiated = eeStatusLower === 'shipped' && rtoStatus;

        if (eeStatusLower === 'returned' || eeStatusLower === 'rto') displayStatus = 'Returned';
        else if (isRTOInitiated) displayStatus = 'RTO Initiated';
        else if (rtoStatus) displayStatus = 'Returned';
        else if (eeStatusLower === 'closed') displayStatus = 'Closed';
        else if (isDeliveredStatus) displayStatus = statusHasInvoice ? 'Delivered' : 'Batch Created';
        else if (eeStatusLower === 'shipped' || maniDate || trackingStatusLower === 'in transit' || isOutOfDelivery || (trackingStatusLower === 'booked' && eeStatusLower !== 'confirmed')) {
            displayStatus = statusHasInvoice ? (isAmazon ? 'Delivered' : 'Shipped') : 'Batch Created';
        }
        else if (item.awb) displayStatus = statusHasInvoice ? 'Label Generated' : 'Batch Created';

        console.log(`Evaluating ${po.channel} ${refCode}: eeStatus=${eeStatusLower}, maniDate=${maniDate}, statusHasInvoice=${statusHasInvoice} -> Computed Status=${displayStatus}`);
    });
});
