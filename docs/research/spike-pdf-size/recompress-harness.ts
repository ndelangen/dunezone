// Clean PDF recompression harness — the validated reference for the Train 2
// implementation (wayfinder #271), final policy per #257. Run with bun from the
// repo root (pdf-lib from repo deps; sharp from a local install — adjust path).
//
//   INPUT=<pdf> GRAY=skip RGB=lossless:0.35 OUT=out.pdf bun run recompress-harness.ts
//
// Policy grammar: skip | jpeg:<q>[:<a>:<b> chroma] | lossless:<scale>
// Final decided policy (#257): GRAY=skip RGB=lossless:0.35 — JPEG is banned
// (streaks this art style's grain at any quality; see report.md).
// Only images >=300px in BOTH dims and without /SMask entries are ever touched.
import { deflateSync, inflateSync } from 'node:zlib';
import path from 'node:path';

import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';

const SHARP_DIR = process.env.SHARP_DIR ?? '';
const sharp = (await import(path.join(SHARP_DIR, 'node_modules/sharp/dist/index.cjs'))).default;

const GRAY = process.env.GRAY ?? 'skip';
const RGB = process.env.RGB ?? 'lossless:0.35';
const OUT = process.env.OUT ?? 'rewritten.pdf';
const INPUT = process.env.INPUT!;

type Policy =
  | { kind: 'skip' }
  | { kind: 'jpeg'; q: number; chroma: string }
  | { kind: 'lossless'; scale: number };

function parsePolicy(spec: string): Policy {
  if (spec === 'skip') return { kind: 'skip' };
  const [kind, a, b, c] = spec.split(':');
  if (kind === 'jpeg') return { kind: 'jpeg', q: Number(a), chroma: b && c ? `${b}:${c}` : '4:2:0' };
  if (kind === 'lossless') return { kind: 'lossless', scale: Number(a) };
  throw new Error(`bad policy ${spec}`);
}
const grayPolicy = parsePolicy(GRAY);
const rgbPolicy = parsePolicy(RGB);

const bytes = new Uint8Array(await Bun.file(INPUT).arrayBuffer());
const doc = await PDFDocument.load(bytes);

let swapped = 0;
for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
  if (!(obj instanceof PDFRawStream)) continue;
  const dict = obj.dict;
  if (dict.get(PDFName.of('Subtype')) !== PDFName.of('Image')) continue;
  if (dict.get(PDFName.of('Filter'))?.toString() !== '/FlateDecode') continue;
  if (dict.has(PDFName.of('SMask'))) continue;
  const w = Number(dict.get(PDFName.of('Width'))?.toString());
  const h = Number(dict.get(PDFName.of('Height'))?.toString());
  if (w < 300 || h < 300) continue;

  const raw = inflateSync(Buffer.from(obj.contents));
  const channels = raw.length === w * h * 3 ? 3 : raw.length === w * h ? 1 : 0;
  if (!channels) continue;
  const policy = channels === 3 ? rgbPolicy : grayPolicy;
  if (policy.kind === 'skip') continue;

  let outW = w;
  let outH = h;
  let encoded: Buffer;
  if (policy.kind === 'lossless') {
    outW = Math.round(w * policy.scale);
    outH = Math.round(h * policy.scale);
    const resized = await sharp(raw, { raw: { width: w, height: h, channels } })
      .resize(outW, outH)
      .raw()
      .toBuffer();
    encoded = deflateSync(resized, { level: 9 });
  } else {
    encoded = await sharp(raw, { raw: { width: w, height: h, channels } })
      .jpeg({ quality: policy.q, mozjpeg: true, chromaSubsampling: policy.chroma })
      .toBuffer();
  }
  if (encoded.length >= obj.contents.length) continue;
  console.log(
    `swap ${w}x${h} ch=${channels} ${policy.kind} ${Math.round(obj.contents.length / 1024)}KB -> ${Math.round(encoded.length / 1024)}KB (out ${outW}x${outH})`
  );
  dict.set(
    PDFName.of('Filter'),
    PDFName.of(policy.kind === 'lossless' ? 'FlateDecode' : 'DCTDecode')
  );
  dict.set(PDFName.of('Width'), doc.context.obj(outW));
  dict.set(PDFName.of('Height'), doc.context.obj(outH));
  dict.delete(PDFName.of('DecodeParms'));
  dict.delete(PDFName.of('Length'));
  doc.context.assign(ref, PDFRawStream.of(dict, new Uint8Array(encoded)));
  swapped += 1;
}

const saved = await doc.save({ useObjectStreams: false });
await Bun.write(OUT, saved);
console.log(JSON.stringify({ out: OUT, swapped, kb: Math.round(saved.length / 1024) }));
