/* Save review images from the local renderer, never from browser screenshots. */
import { readFile, writeFile } from 'node:fs/promises';
const dir = new URL('./', import.meta.url);
const { fixtures } = JSON.parse(await readFile(new URL('public/fixtures.json', dir), 'utf8'));
const results = [];
for (const variant of ['A', 'B', 'C']) {
  for (const f of fixtures) {
    const query = new URLSearchParams({
      variant,
      name: f.name,
      text: f.text,
      kind: f.kind,
      shape: f.shape,
      art: f.artwork ? f.artwork.split('/').pop().replace('.jpg', '') : '',
    });
    const r = await fetch('http://127.0.0.1:4325/og.png?' + query);
    if (!r.ok) throw new Error(`${variant}/${f.id}: ${r.status} ${await r.text()}`);
    const png = Buffer.from(await r.arrayBuffer());
    if (png.toString('hex', 0, 8) !== '89504e470d0a1a0a') throw new Error('Not PNG');
    const width = png.readUInt32BE(16),
      height = png.readUInt32BE(20);
    if (width !== 1200 || height !== 630) throw new Error('Wrong dimensions');
    await writeFile(new URL(`evidence/${variant}-${f.id}.png`, dir), png);
    results.push({
      variant,
      sample: f.id,
      width,
      height,
      bytes: png.length,
      localRenderMs: Number(r.headers.get('X-Prototype-Render-Ms')),
      databaseCalls: r.headers.get('X-Prototype-Database-Calls'),
    });
  }
}
await writeFile(new URL('evidence/render-results.json', dir), JSON.stringify(results, null, 2));
console.log(`Saved ${results.length} PNGs at 1200 by 630.`);
