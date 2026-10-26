import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const here = fileURLToPath(new URL('.', import.meta.url));
const source = sharp(`${here}cover.png`);
const metadata = await source.metadata();
const jpg = await source.jpeg({ quality: 95, progressive: true }).toBuffer();
await Bun.write(`${here}cover.jpg`, jpg);
const cover = await Bun.file(`${here}cover.json`).json();
cover.width = metadata.width;
cover.height = metadata.height;
cover.deliveryPath = `/user-images/${createHash('sha256').update(jpg).digest('hex')}.jpg`;
cover.fitting = 'The standard full-page cover renderer crops the original 4:3 image to A4.';
await Bun.write(`${here}cover.json`, JSON.stringify(cover, null, 2) + '\n');
