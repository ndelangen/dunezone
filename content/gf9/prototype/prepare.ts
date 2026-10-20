/** Read-only acquisition of archived GF9 reference outputs for the throwaway prototype. */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolveAsset } from '../../../src/shared/media/resolveAsset';
import pkg from '../package.json';

const root = fileURLToPath(new URL('./', import.meta.url));
const archive = '/Users/me/Projects/Dune/gf9-delivery';
const files = [
  'gf9-atreides-faction-token',
  'gf9-atreides-leader-lady-jessica', 'gf9-atreides-leader-thufir-hawat', 'gf9-atreides-leader-gurney-halleck', 'gf9-atreides-leader-duncan-idaho', 'gf9-atreides-leader-doctor-yueh', 'gf9-atreides-troop-normal-troop',
  'gf9-emperor-leader-caid', 'gf9-spacing-guild-leader-staban-tuek',
  'gf9-crysknife-front-cardback', 'gf9-shield-front-cardback', 'gf9-chaumas-front-cardback', 'gf9-snooper-front-cardback',
  'gf9-discovery-spice-sihaya-ridge-front-cardback', 'gf9-discovery-cistern-front-cardback', 'gf9-discovery-cistern-authored-back',
];
const manifest: Record<string, unknown> = {};
mkdirSync(path.join(root, 'public/components'), { recursive: true });
for (const name of files) {
  const input = path.join(archive, 'production-images/images', name + '.jpg');
  copyFileSync(input, path.join(root, 'public/components', name + '.jpg'));
  manifest[name] = { source: input, sha256: createHash('sha256').update(readFileSync(input)).digest('hex') };
}
const factions = pkg.items.filter(item => item.kind === 'faction' && ['gf9-atreides', 'gf9-emperor', 'gf9-spacing-guild'].includes(item.key));
for (const key of [...new Set(['/image/texture/004.jpg', ...factions.flatMap(faction => [faction.data.background.image, ...(faction.key === 'gf9-atreides' ? [faction.data.factionLeader.image] : [])])])]) {
  const url = resolveAsset(key, 'print');
  const response = await fetch('https://dune.zone' + url);
  if (!response.ok) throw new Error(`Source media ${key}: ${response.status}`);
  const output = path.join(root, 'public', url);
  mkdirSync(path.dirname(output), { recursive: true });
  const bytes = new Uint8Array(await response.arrayBuffer());
  writeFileSync(output, bytes);
  manifest[key] = { source: 'https://dune.zone' + url, local: url, sha256: createHash('sha256').update(bytes).digest('hex') };
}
const current = [
  ['core-cover', 'gf9-dune-core-rules', 1], ['ixian-cover', 'gf9-ixians-tleilaxu', 1], ['choam-cover', 'gf9-choam-richese', 1], ['ecaz-cover', 'gf9-ecaz-moritani', 1],
  ['core-setup', 'gf9-dune-core-rules', 6], ['core-shipment', 'gf9-dune-core-rules', 17], ['core-battle', 'gf9-dune-core-rules', 21], ['core-atreides', 'gf9-dune-core-rules', 31], ['ixian-tech', 'gf9-ixians-tleilaxu', 8], ['ecaz-discovery', 'gf9-ecaz-moritani', 14],
] as const;
mkdirSync(path.join(root, 'public/current'), { recursive: true });
for (const [key, book, page] of current) {
  const result = spawnSync('pdftoppm', ['-f', String(page), '-l', String(page), '-singlefile', '-scale-to', '1700', '-png', path.join(archive, 'production-pdfs', book + '.pdf'), path.join(root, 'public/current', key)], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`Current reference render failed: ${key}`);
  manifest['current:' + key] = { source: book + '.pdf', sourceSha256: createHash('sha256').update(readFileSync(path.join(archive, 'production-pdfs', book + '.pdf'))).digest('hex'), page, physicalMm: [210, 297], note: 'Archived first delivery, not a fresh production capture' };
}
writeFileSync(path.join(root, 'baseline-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Prepared ${Object.keys(manifest).length} read-only reference inputs.`);
