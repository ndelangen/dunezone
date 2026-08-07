// Spike part 2: (a) probe whether this Chromium emits DCT passthrough at all;
// (b) estimate post-capture recompression by inflating baseline.pdf's Flate
// image XObjects and re-encoding RGB ones as JPEG (the #259 approach, locally).
import { inflateSync } from 'node:zlib';
import path from 'node:path';

import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import { chromium } from 'playwright';

const spikeDir =
  '/private/tmp/claude-501/-Users-me-Projects-Dune-dunezone--claude-worktrees-image-optimization-web-pdf-298fff/3b954549-5ba3-4782-b17f-7f59ef03554c/scratchpad/spike';
const repoRoot = import.meta.dirname;

// --- (a) passthrough probe: bare <img> JPEG on an A4 page, no SVG anywhere ---
const jpeg = await Bun.file(path.join(repoRoot, 'public/image/texture/021.jpg')).arrayBuffer();
const probeHtml = `<!doctype html><html><head><style>
  @page { size: 210mm 297mm; margin: 0; }
  body { margin: 0; }
  img { width: 100mm; height: 100mm; }
</style></head><body><img src="data:image/jpeg;base64,${Buffer.from(jpeg).toString('base64')}"></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 2100, height: 2970 } });
await page.setContent(probeHtml, { waitUntil: 'load' });
await page.emulateMedia({ media: 'print' });
const probeBytes = await page.pdf({
  margin: { top: 0, right: 0, bottom: 0, left: 0 },
  preferCSSPageSize: true,
  printBackground: true,
});
await browser.close();

const probeDoc = await PDFDocument.load(new Uint8Array(probeBytes));
const probeFilters: string[] = [];
for (const [, obj] of probeDoc.context.enumerateIndirectObjects()) {
  if (obj instanceof PDFRawStream && obj.dict.get(PDFName.of('Subtype')) === PDFName.of('Image')) {
    probeFilters.push(
      `${obj.dict.get(PDFName.of('Width'))}x${obj.dict.get(PDFName.of('Height'))} ${obj.dict.get(PDFName.of('Filter'))} ${Math.round(obj.contents.length / 1024)}KB`
    );
  }
}
console.log('PROBE bare <img> jpeg:', JSON.stringify({ pdfKb: Math.round(probeBytes.length / 1024), images: probeFilters }));

// --- (b) recompression estimate on baseline.pdf ---
const sharp = (await import(path.join(spikeDir, 'node_modules/sharp/dist/index.cjs'))).default;
const bytes = new Uint8Array(await Bun.file(path.join(spikeDir, 'out/baseline.pdf')).arrayBuffer());
const doc = await PDFDocument.load(bytes);

const QUALITY = Number(process.env.Q ?? 80);
let before = 0;
let after = 0;
let rgbCount = 0;
let grayCount = 0;
let skipped: string[] = [];
for (const [, obj] of doc.context.enumerateIndirectObjects()) {
  if (!(obj instanceof PDFRawStream)) continue;
  const dict = obj.dict;
  if (dict.get(PDFName.of('Subtype')) !== PDFName.of('Image')) continue;
  const filter = dict.get(PDFName.of('Filter'))?.toString();
  const w = Number(dict.get(PDFName.of('Width'))?.toString());
  const h = Number(dict.get(PDFName.of('Height'))?.toString());
  const cs = dict.get(PDFName.of('ColorSpace'))?.toString();
  const bpc = Number(dict.get(PDFName.of('BitsPerComponent'))?.toString());
  const decodeParms = dict.get(PDFName.of('DecodeParms'))?.toString() ?? 'none';
  before += obj.contents.length;
  if (filter !== '/FlateDecode' || bpc !== 8) {
    skipped.push(`${w}x${h} ${filter} bpc=${bpc}`);
    after += obj.contents.length;
    continue;
  }
  const raw = inflateSync(Buffer.from(obj.contents));
  const channels = raw.length === w * h * 3 ? 3 : raw.length === w * h ? 1 : 0;
  if (!channels) {
    skipped.push(`${w}x${h} cs=${cs} parms=${decodeParms} raw=${raw.length}`);
    after += obj.contents.length;
    continue;
  }
  const SCALE = Number(process.env.SCALE ?? 1);
  let pipeline = sharp(raw, { raw: { width: w, height: h, channels } });
  if (SCALE < 1 && Math.max(w, h) > 250) {
    pipeline = pipeline.resize(Math.round(w * SCALE), Math.round(h * SCALE));
  }
  const encoded = await pipeline
    .jpeg({ quality: QUALITY, progressive: false, mozjpeg: true })
    .toBuffer();
  after += Math.min(encoded.length, obj.contents.length);
  if (channels === 3) rgbCount += 1;
  else grayCount += 1;
}

const pdfOverheadKb = Math.round((bytes.length - before) / 1024);
console.log(
  'RECOMPRESS estimate:',
  JSON.stringify({
    imagesBeforeKb: Math.round(before / 1024),
    imagesAfterKb: Math.round(after / 1024),
    projectedPdfKb: Math.round((bytes.length - before + after) / 1024),
    pdfOverheadKb,
    rgbCount,
    grayCount,
    skipped,
  })
);
