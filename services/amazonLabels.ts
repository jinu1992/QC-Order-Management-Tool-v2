import type { PDFDocument, PDFPage } from 'pdf-lib';

// Amazon's A4 box label sheet (getLabels PackageLabel_A4_2, Seller Central's "99.1 X 139 mm (A4)"):
// one page per box, the FBA box label on the top half and the ATS carrier label on the bottom half,
// both printed sideways. Each part becomes its own 4x6 label. Parts are fractions of the page, from
// FBA15MX1749L (Nov 2026, A4 595x842pt): FBA label within x 27-217, y 434-790; carrier label image
// x 30-563, y 54-409. The FBA part keeps full size (it fits 4x6 as is); the wider carrier part is
// turned upright and scaled to fit.
export const AMAZON_LABEL_PARTS = [
    { name: 'FBA box label', left: 0, right: 288 / 595.28, bottom: 0.5, top: 1 },
    { name: 'Carrier label', left: 18 / 595.28, right: 577 / 595.28, bottom: 36 / 841.89, top: 0.5 },
];

export const LABEL_4X6: [number, number] = [288, 432]; // points

export const isAmazonFbaChannel = (channel: string) => /amazon[_ ]fba/i.test(channel || '');

/**
 * Adds one page of Amazon's A4 box label sheet to `target` as two 4x6 pages (FBA label, carrier
 * label). Returns false, adding nothing, for a page that isn't a plain portrait sheet bigger than
 * a label; the caller then prints it like any other label page.
 * `rotate` is pdf-lib's degrees() (passed in so pdf-lib stays a dynamic import).
 */
export const addAmazonLabelParts = async (
    target: PDFDocument,
    srcPage: PDFPage,
    rotate: (deg: number) => any,
    labelSize: [number, number] = LABEL_4X6,
): Promise<boolean> => {
    const { width, height } = srcPage.getSize();
    const [PW, PH] = labelSize;
    const labelSized = Math.min(width, height) <= 4.3 * 72 && Math.max(width, height) <= 6.3 * 72;
    if (labelSized || width >= height || srcPage.getRotation().angle % 360 !== 0) return false;
    const box = srcPage.getMediaBox();
    for (const part of AMAZON_LABEL_PARTS) {
        const bb = {
            left: box.x + part.left * box.width, right: box.x + part.right * box.width,
            bottom: box.y + part.bottom * box.height, top: box.y + part.top * box.height,
        };
        const embedded = await target.embedPage(srcPage, bb);
        const w = bb.right - bb.left, h = bb.top - bb.bottom;
        const page = target.addPage([PW, PH]);
        if (w <= h) {
            const s = Math.min(1, PW / w, PH / h);
            page.drawPage(embedded, { x: (PW - w * s) / 2, y: (PH - h * s) / 2, xScale: s, yScale: s });
        } else {
            // Turned a quarter clockwise so its sideways text reads upright on the label.
            // Drawn at (x, y) and rotated about that point, it covers x..x+h*s, y-w*s..y.
            const s = Math.min(1, PW / h, PH / w);
            page.drawPage(embedded, { x: (PW - h * s) / 2, y: (PH - w * s) / 2 + w * s, xScale: s, yScale: s, rotate: rotate(-90) });
        }
    }
    return true;
};
