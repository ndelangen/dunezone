// Spike part 3: actually rewrite baseline.pdf — swap Flate image XObjects for
// JPEG (DCTDecode) streams in place, exactly what the #259 Worker step would do.
// Produces real PDFs for visual judgment.
import { inflateSync } from 'node:zlib';
import path from 'node:path';

import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';

const spikeDir =
  '/private/tmp/claude-501/-Users-me-Projects-Dune-dunezone--claude-worktrees-image-optimization-web-pdf-298fff/3b954549-5ba3-4782-b17f-7f59ef03554c/scratchpad/spike';
const sharp = (await import(path.join(spikeDir, 'node_modules/sharp/dist/index.cjs'))).default;

const QUALITY = Number(process.env.Q ?? 75);
const SCALE = Number(process.env.SCALE ?? 1);
const OUT = process.env.OUT ?? 'rewritten.pdf';

const bytes = new Uint8Array(await Bun.file(path.join(spikeDir, 'out/baseline.pdf')).arrayBuffer());
const doc = await PDFDocument.load(bytes);

// Safe policy: never touch mask pairs — collect every ref used as an /SMask.
const smaskRefs = new Set<string>();
for (const [, obj] of doc.context.enumerateIndirectObjects()) {
  if (obj instanceof PDFRawStream && obj.dict.get(PDFName.of('Subtype')) === PDFName.of('Image')) {
    const sm = obj.dict.get(PDFName.of('SMask'));
    if (sm) smaskRefs.add(sm.toString());
  }
}

let swapped = 0;
for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
  if (!(obj instanceof PDFRawStream)) continue;
  const dict = obj.dict;
  if (dict.get(PDFName.of('Subtype')) !== PDFName.of('Image')) continue;
  if (dict.get(PDFName.of('Filter'))?.toString() !== '/FlateDecode') continue;
  if (dict.has(PDFName.of('SMask'))) continue;
  const width = Number(dict.get(PDFName.of('Width'))?.toString());
  const height = Number(dict.get(PDFName.of('Height'))?.toString());
  // Only square-ish art rasters (portraits, texture tiles). Text/name masks are
  // wide-and-short; anything under 300px in either dimension stays lossless.
  if (width < 300 || height < 300) continue;
  const w = Number(dict.get(PDFName.of('Width'))?.toString());
  const h = Number(dict.get(PDFName.of('Height'))?.toString());
  const raw = inflateSync(Buffer.from(obj.contents));
  const channels = raw.length === w * h * 3 ? 3 : raw.length === w * h ? 1 : 0;
  if (!channels) continue;

  let outW = w;
  let outH = h;
  let pipeline = sharp(raw, { raw: { width: w, height: h, channels } });
  if (SCALE < 1 && Math.max(w, h) > 250) {
    outW = Math.round(w * SCALE);
    outH = Math.round(h * SCALE);
    pipeline = pipeline.resize(outW, outH);
  }
  const q = channels === 3 ? Number(process.env.Q_RGB ?? QUALITY) : QUALITY;
  const encoded = await pipeline
    .jpeg({ quality: q, progressive: false, mozjpeg: true })
    .toBuffer();
  if (encoded.length >= obj.contents.length) continue;
  if (process.env.DEBUG) console.log(`swap ${w}x${h} ch=${channels} smaskRef=${dict.has(PDFName.of('SMask'))} isMask=${dict.has(PDFName.of('Matte')) || ''} ${Math.round(obj.contents.length/1024)}KB -> ${Math.round(encoded.length/1024)}KB`);

  dict.set(PDFName.of('Filter'), PDFName.of('DCTDecode'));
  dict.set(PDFName.of('Width'), doc.context.obj(outW));
  dict.set(PDFName.of('Height'), doc.context.obj(outH));
  dict.delete(PDFName.of('DecodeParms'));
  dict.delete(PDFName.of('Length'));
  const rewritten = PDFRawStream.of(dict, new Uint8Array(encoded));
  doc.context.assign(ref, rewritten);
  swapped += 1;
}

const saved = await doc.save({ useObjectStreams: false });
await Bun.write(path.join(spikeDir, 'out', OUT), saved);
console.log(JSON.stringify({ out: OUT, swapped, kb: Math.round(saved.length / 1024) }));
