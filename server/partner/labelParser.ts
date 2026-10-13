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
