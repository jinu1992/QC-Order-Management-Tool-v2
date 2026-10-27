import { extractText, getDocumentProxy } from 'unpdf';

// Facts read off a Delhivery B2B label PDF. Each box gets its own page
// ("Box : 2/3", same MAWB on every page) plus one "Document" page whose OID is
// DOC_<LRN>. The partner enters the LRN, the shipment number Delhivery B2B tracks by.
// The Apps Script backend (partnerVerifyLabel_) compares these with the
// request row, so the browser never decides whether a label passes.
export interface ParsedLabel {
  textFound: boolean;
  pageCount: number;
  mawbs: string[];
  boxPages: number[];
  boxTotals: number[];
  oids: string[];
  lrns: string[];
  lrn: string;
  pincode: string;
  consignee: string;
}

const unique = <T,>(values: T[]) => Array.from(new Set(values));

export function parseLabelPages(pages: string[]): ParsedLabel {
  const mawbs: string[] = [];
  const boxPages: number[] = [];
  const boxTotals: number[] = [];
  const oids: string[] = [];
  const lrns: string[] = [];
  let pincode = '';
  let consignee = '';

  for (const raw of pages) {
    const text = raw.replace(/\s+/g, ' ');

    const mawb = text.match(/MAWB\s*:?\s*(\d{8,20})/i);
    if (mawb) mawbs.push(mawb[1]);

    const box = text.match(/Box\s*:\s*(\d+)\s*\/\s*(\d+)/i);
    if (box) {
      boxPages.push(Number(box[1]));
      boxTotals.push(Number(box[2]));
    }

    // The document page's OID is DOC_<LRN>, not an order reference
    const oid = text.match(/OID\s*:\s*([A-Za-z0-9_\/-]+)/i);
    if (oid && !/^DOC_/i.test(oid[1])) oids.push(oid[1]);

    const lrn = text.match(/LRN\s*:\s*(\d+)/i);
    if (lrn) lrns.push(lrn[1]);

    pincode ||= text.match(/Pin\s*:\s*(\d{6})/i)?.[1] || '';
    consignee ||= text.match(/Consignee Address\s*:\s*([^,]+)/i)?.[1]?.trim() || '';
  }

  return {
    textFound: pages.some(p => p.trim().length > 0),
    pageCount: pages.length,
    mawbs: unique(mawbs),
    boxPages,
    boxTotals,
    oids: unique(oids),
    lrns: unique(lrns),
    lrn: lrns[0] || '',
    pincode,
    consignee,
  };
}

export async function parseDelhiveryLabel(pdf: Uint8Array): Promise<ParsedLabel> {
  const doc = await getDocumentProxy(pdf);
  const { text } = await extractText(doc, { mergePages: false });
  return parseLabelPages(text);
}

// Facts read off the two Scorpion documents: the box label (one page per box,
// "<docket> n/N" and "Invoice(s) : ...") and the docket / consignment note (Package
// Count, Order Id, Consignor PO No., consignee pincode). Pages are sorted by content,
// not by which upload they came from, so swapped uploads still read correctly.
export interface ParsedScorpion {
  textFound: boolean;
  labelPageCount: number;
  docketPageCount: number;
  labelDockets: string[];
  boxPages: number[];
  boxTotals: number[];
  labelInvoices: string[];
  docketNumbers: string[];
  packageCounts: number[];
  orderIds: string[];
  docketInvoices: string[];
  pincode: string;
  shipmentValue: number;
  pickupDate: string;
  edd: string;
}

export function parseScorpionPages(pages: string[]): ParsedScorpion {
  const labelDockets: string[] = [];
  const boxPages: number[] = [];
  const boxTotals: number[] = [];
  const labelInvoices: string[] = [];
  const docketNumbers: string[] = [];
  const packageCounts: number[] = [];
  const orderIds: string[] = [];
  const docketInvoices: string[] = [];
  let labelPageCount = 0;
  let docketPageCount = 0;
  let pincode = '';
  let shipmentValue = 0;
  let pickupDate = '';
  let edd = '';

  for (const raw of pages) {
    const lines = raw.split(/\n/).map(l => l.trim()).filter(Boolean);
    const text = raw.replace(/\s+/g, ' ');

    if (/Package\s+Count/i.test(text) || /Consignee\s*:/i.test(text)) {
      docketPageCount++;
      const count = text.match(/Package\s+Count\s*:?\s*(\d+)/i);
      if (count) packageCounts.push(Number(count[1]));
      // A blank field would otherwise read the next word ("1st") as the reference
      for (const m of text.matchAll(/(?:Order\s+Id|Consignor\s+PO\s+No\.?)\s*:?\s*([A-Za-z0-9_\/-]+)/gi)) {
        if (m[1].length >= 5 && /\d/.test(m[1])) orderIds.push(m[1]);
      }
      // "1st EWB No: ewb not present - BSPL/26-27/952": the invoice follows the dash
      const ewbLine = text.match(/EWB\s+No\s*:[^-]*-\s*([A-Za-z0-9\/-]+)/i);
      if (ewbLine) docketInvoices.push(ewbLine[1]);
      // The docket number is printed alone on its line, above its barcode
      lines.filter(l => /^\d{8,15}$/.test(l)).forEach(l => docketNumbers.push(l));
      pincode ||= text.match(/Consignee\s*:.*?Pincode\s*:\s*(\d{6})/i)?.[1] || '';
      shipmentValue ||= Number(text.match(/Shipment\s+Value\s*:?\s*([\d,]+(?:\.\d+)?)/i)?.[1]?.replace(/,/g, '') || 0);
      pickupDate ||= text.match(/Pickup\s*:\s*(\d{2}-\d{2}-\d{4})/i)?.[1] || '';
      edd ||= text.match(/EDD\s*:\s*(\d{2}-\d{2}-\d{4})/i)?.[1] || '';
      continue;
    }

    const box = lines.map(l => l.match(/^(\d{8,15})\s+(\d+)\s*\/\s*(\d+)$/)).find(Boolean)
      || text.match(/\b(\d{8,15})\s+(\d+)\s*\/\s*(\d+)\b/);
    if (box) {
      labelPageCount++;
      labelDockets.push(box[1]);
      boxPages.push(Number(box[2]));
      boxTotals.push(Number(box[3]));
      const inv = text.match(/Invoice\(s\)\s*:\s*(.+?)(?:\s+Origin\s+Hub|$)/i);
      if (inv) inv[1].split(/[,;]/).map(s => s.trim()).filter(Boolean).forEach(s => labelInvoices.push(s));
    }
  }

  return {
    textFound: pages.some(p => p.trim().length > 0),
    labelPageCount,
    docketPageCount,
    labelDockets: unique(labelDockets),
    boxPages,
    boxTotals,
    labelInvoices: unique(labelInvoices),
    docketNumbers: unique(docketNumbers.filter(n => !orderIds.includes(n))),
    packageCounts: unique(packageCounts),
    orderIds: unique(orderIds),
    docketInvoices: unique(docketInvoices),
    pincode,
    shipmentValue,
    pickupDate,
    edd,
  };
}

export async function parseScorpionDocs(pdfs: Uint8Array[]): Promise<ParsedScorpion> {
  const pages: string[] = [];
  for (const pdf of pdfs) {
    const doc = await getDocumentProxy(pdf);
    const { text } = await extractText(doc, { mergePages: false });
    pages.push(...text);
  }
  return parseScorpionPages(pages);
}
