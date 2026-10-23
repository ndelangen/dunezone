import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
let measurements = JSON.parse(readFileSync(process.argv[2] ?? '/tmp/gf9-book-measurements.json', 'utf8'));
const raw = JSON.parse(readFileSync(`${here}rulebook.json`, 'utf8'));
const allBlocks: Record<string, any> = Object.assign(
  {},
  ...Object.values(raw.contents.pagesById).map((page: any) => page.blocksById)
);
if (await Bun.file(`${here}pagination.json`).exists()) {
  const previous = JSON.parse(readFileSync(`${here}pagination.json`, 'utf8'));
  const measured = new Map(
    measurements.flatMap((page: any) =>
      page.regions.flatMap((region: any) => region.blocks.map((block: any) => [block.id, block]))
    )
  );
  const sample = {
    ...measurements[0].regions[0],
    available: Math.min(...measurements.flatMap((page: any) => page.regions.map((region: any) => region.available))),
  };
  measurements = Object.entries(previous).map(([id, partitions]: any) => ({
    id,
    anchor: id,
    regions: [
      {
        ...sample,
        blocks: partitions
          .flatMap((partition: any) => [...partition.column1, ...partition.column2])
          .map((blockId: string) => {
            const block = measured.get(blockId);
            if (!block) {
              throw new Error(`Missing measured block ${blockId}`);
            }
            return block;
          }),
      },
    ],
  }));
}
const pagination: Record<string, any[]> = {};
for (const page of measurements) {
  const original = raw.contents.pagesById[page.id];
  if (!original) {
    throw new Error(`Measurements do not match the current document: ${page.id}`);
  }
  const blocks = page.regions.flatMap((region: any) => region.blocks);
  const gap = page.regions[0].gap;
  const capacity = Math.min(...page.regions.map((region: any) => region.available)) - 30;
  const groups: any[][] = [];
  for (let index = 0; index < blocks.length; index++) {
    const group = [blocks[index]];
    while (allBlocks[group.at(-1).id].kind === 'section-heading' && index + 1 < blocks.length) {
      group.push(blocks[++index]);
    }
    groups.push(group);
  }
  const height = (items: any[]) =>
    items.reduce((sum, block) => sum + block.height, 0) + Math.max(0, items.length - 1) * gap;
  const columns: any[][] = [[]];
  for (const group of groups) {
    if (height(group) > capacity) {
      throw new Error(
        `Split the oversized block group on ${page.anchor}: ${group.map((block) => block.id).join(', ')}`
      );
    }
    if (height([...columns.at(-1)!, ...group]) > capacity) {
      columns.push([]);
    }
    columns.at(-1)!.push(...group);
  }
  const pages: any[] = [];
  for (let index = 0; index < columns.length; index += 2) {
    const combined = [...columns[index], ...(columns[index + 1] ?? [])];
    let split = columns[index].length;
    let best = Math.max(height(columns[index]), height(columns[index + 1] ?? []));
    for (let n = 1; n < combined.length; n++) {
      if (allBlocks[combined[n - 1].id].kind === 'section-heading') {
        continue;
      }
      const maximum = Math.max(height(combined.slice(0, n)), height(combined.slice(n)));
      if (maximum < best) {
        best = maximum;
        split = n;
      }
    }
    pages.push({
      column1: combined.slice(0, split).map((block) => block.id),
      column2: combined.slice(split).map((block) => block.id),
    });
  }
  pagination[page.id] = pages;
}
writeFileSync(`${here}pagination.json`, `${JSON.stringify(pagination, null, 2)}\n`);
console.log(
  `Measured pagination: ${Object.values(pagination).reduce((sum, pages) => sum + pages.length, 0)} square pages.`
);
