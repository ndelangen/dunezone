import { readFileSync, writeFileSync } from 'node:fs';
const here = import.meta.dirname;
const raw = JSON.parse(readFileSync(`${here}/rulebook.json`, 'utf8'));
const measures = JSON.parse(readFileSync(process.argv[2] ?? `${here}/measurements.json`, 'utf8'));
const pagination: Record<string, any[]> = {};
for (const m of measures) {
  const page = raw.contents.pagesById[m.id];
  if (page.layoutId === 'cover') {
    continue;
  }
  if (page.layoutId === 'paired-rows') {
    if (m.regions.some((r: any) => r.blocks.length && r.bottom > r.available + 1)) {
      throw Error(`Paired rows overflow on ${m.id}`);
    }
    pagination[m.id] = [page.blockOrderByRegion];
    continue;
  }
  const gap = m.regions[0].gap;
  const capacity = Math.min(...m.regions.map((r: any) => r.available)) - 20;
  const measured = new Map(m.regions.flatMap((r: any) => r.blocks.map((b: any) => [b.id, b.height])));
  const height = (ids: string[]) =>
    ids.reduce((sum, k) => sum + (measured.get(k) as number), 0) + Math.max(0, ids.length - 1) * gap;
  const pack = (ids: string[]) => {
    const columns: string[][] = [[]];
    for (let i = 0; i < ids.length; i++) {
      const group = [ids[i]];
      let block = page.blocksById[ids[i]];
      while (block.kind === 'text' && block.name && !block.text && i + 1 < ids.length) {
        group.push(ids[++i]);
        block = page.blocksById[ids[i]];
      }
      if (height(group) > capacity) {
        throw Error(`Oversized group ${m.id}: ${group.join(',')}`);
      }
      if (height([...columns.at(-1)!, ...group]) > capacity) {
        columns.push([]);
      }
      columns.at(-1)!.push(...group);
    }
    return columns;
  };
  if (m.regions.every((r: any) => height(r.blocks.map((b: any) => b.id)) <= capacity)) {
    pagination[m.id] = [page.blockOrderByRegion];
    continue;
  }
  if (page.layoutId === 'single-column') {
    pagination[m.id] = pack(page.blockOrderByRegion.content).map((content) => ({ content }));
    continue;
  }
  const columns = pack([...page.blockOrderByRegion.column1, ...page.blockOrderByRegion.column2]);
  const rails = page.layoutId === 'outer-rail' ? pack(page.blockOrderByRegion.rail) : [];
  const pages = [];
  for (let i = 0; i < Math.max(Math.ceil(columns.length / 2), rails.length); i++) {
    const combined = [...(columns[i * 2] ?? []), ...(columns[i * 2 + 1] ?? [])];
    let split = columns[i * 2]?.length ?? 0;
    let best = Math.max(height(combined.slice(0, split)), height(combined.slice(split)));
    for (let k = 1; k < combined.length; k++) {
      const b = page.blocksById[combined[k - 1]];
      if (b.kind === 'text' && b.name && !b.text) {
        continue;
      }
      const h = Math.max(height(combined.slice(0, k)), height(combined.slice(k)));
      if (h < best) {
        best = h;
        split = k;
      }
    }
    pages.push({
      column1: combined.slice(0, split),
      column2: combined.slice(split),
      ...(page.layoutId === 'outer-rail' ? { rail: rails[i] ?? [] } : {}),
    });
  }
  pagination[m.id] = pages;
}
writeFileSync(`${here}/pagination-rebuilt.json`, JSON.stringify(pagination, null, 2) + '\n');
console.log(`Measured ${Object.values(pagination).reduce((sum, p) => sum + p.length, 1)} pages.`);
