import { readFileSync, writeFileSync } from 'node:fs';
const path = `${import.meta.dirname}/production-cards.json`;
const values = JSON.parse(readFileSync(path, 'utf8'));
for (const c of Object.values(values) as any[]) {
  const response = await fetch('https://exuberant-finch-263.eu-west-1.convex.cloud/api/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: 'assets:page', args: { type: c.type, slug: c.slug }, format: 'json' }),
  });
  const result = await response.json();
  if (result.status !== 'success') {
    throw Error(JSON.stringify(result));
  }
  c.publication = result.value.assetPublishing;
  writeFileSync(
    `${import.meta.dirname}/${Object.entries(values).find(([, v]) => v === c)![0]}.json`,
    JSON.stringify(result.value.asset.data, null, 2) + '\n'
  );
  if (!c.publication.publicationHref) {
    throw Error(`${c.name}: ${JSON.stringify(c.publication)}`);
  }
}
writeFileSync(path, JSON.stringify(values, null, 2) + '\n');
console.log('Refreshed 15 production card image references.');
