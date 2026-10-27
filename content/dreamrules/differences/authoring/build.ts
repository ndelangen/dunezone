import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { rawRulebookSchema, readRawAuthoringJson } from '../../../../src/shared/authoring/raw';
import { normalizeFormattedText } from '../../../../src/shared/formattedText';
import { rulebookLocalIdAlphabet } from '../../../../src/shared/rulebooks/contents';
import { projectRulebookDraftRenderDocument } from '../../../../src/shared/rulebooks/projectRenderDocument';
import { assertRulebookReferences } from '../../../../src/shared/rulebooks/references';

const here = fileURLToPath(new URL('.', import.meta.url));
const manuscript = JSON.parse(readFileSync(`${here}manuscript.json`, 'utf8'));
const index = JSON.parse(readFileSync(`${here}../change-index.json`, 'utf8'));
const used = new Set<string>();
function id(key: string): string {
  for (let attempt = 0; ; attempt++) {
    const bytes = createHash('sha256').update(`gf9-dream-diff:${key}:${attempt}`).digest();
    const value = [...bytes.subarray(0, 4)].map((b) => rulebookLocalIdAlphabet[b & 31]).join('');
    if (!used.has(value)) {
      used.add(value);
      return value;
    }
  }
}
function formatted(value: string): string {
  const result = normalizeFormattedText(value.replace(/[\\*_-]/g, '\\$&'));
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  return result.value;
}
const contents: any = { schemaVersion: 1, pageOrder: [], pagesById: {} };
const locations: Record<string, any> = {};
for (const [pageIndex, authored] of manuscript.pages.entries()) {
  const pageId = id(`page:${authored.key}`);
  const page: any = {
    id: pageId,
    anchor: authored.key,
    title: authored.title,
    layoutId: authored.layoutId,
    controlValues: {},
    blockOrderByRegion: {},
    blocksById: {},
    showHeading: authored.layoutId !== 'cover',
  };
  if (authored.layoutId === 'cover') {
    page.controlValues.cover = {
      backgroundSource: { kind: 'preset', presetId: 'dreamrules-rainbow' },
      showDuneLogo: true,
      showSubtitle: true,
      subtitle: 'GF9 2019 ADVANCED TO DREAMRULES',
      supportingText: 'WHAT CHANGES',
    };
  } else {
    for (const [column, values] of authored.columns.entries()) {
      const region = authored.layoutId === 'single-column' ? 'content' : `column${column + 1}`;
      page.blockOrderByRegion[region] = [];
      for (const value of values) {
        const { key, columns, rows, ...rest } = value;
        const blockId = id(`block:${key}`);
        const block: any = { ...rest, id: blockId };
        for (const field of ['text', 'note', 'question', 'answer']) {
          if (typeof block[field] === 'string') block[field] = formatted(block[field]);
        }
        if (value.kind === 'reference-table') {
          block.columnOrder = columns.map((_: string, i: number) => `c${i}`);
          block.columnsById = Object.fromEntries(
            columns.map((label: string, i: number) => [`c${i}`, { id: `c${i}`, label }])
          );
          block.rowOrder = rows.map((_: string[], i: number) => `r${i}`);
          block.rowsById = Object.fromEntries(
            rows.map((cells: string[], i: number) => [
              `r${i}`,
              {
                id: `r${i}`,
                cellsByColumnId: Object.fromEntries(cells.map((cell, j) => [`c${j}`, formatted(cell)])),
              },
            ])
          );
        }
        page.blocksById[blockId] = block;
        page.blockOrderByRegion[region].push(blockId);
        locations[key] = { pageId, blockId, pageNumber: pageIndex + 1, anchor: authored.key };
      }
    }
    if (authored.source) {
      const blockId = id(`sources:${authored.key}`);
      page.blocksById[blockId] = { id: blockId, kind: 'text', text: formatted(`Sources: ${authored.source}`) };
      page.blockOrderByRegion[authored.layoutId === 'single-column' ? 'content' : 'column2'].push(blockId);
    }
  }
  contents.pageOrder.push(pageId);
  contents.pagesById[pageId] = page;
}
const raw = rawRulebookSchema.parse({ settings: { size: 'a4', design: 'restrained' }, contents });
assertRulebookReferences(raw.contents, {}, {});
const json = JSON.stringify(raw, null, 2) + '\n';
rawRulebookSchema.parse(readRawAuthoringJson(json));
const { document, diagnostics } = projectRulebookDraftRenderDocument(raw.contents, {}, raw.settings, {});
if (diagnostics?.length) throw new Error(JSON.stringify(diagnostics));
const unmapped = index.records.filter((record: any) => !locations[record.id]).map((record: any) => record.id);
if (unmapped.length) throw new Error(`Unmapped topics: ${unmapped.join(', ')}`);
writeFileSync(`${here}rulebook.json`, json);
writeFileSync(`${here}render-document.json`, JSON.stringify(document, null, 2) + '\n');
writeFileSync(
  `${here}coverage.json`,
  JSON.stringify(
    {
      manuscriptSha256: createHash('sha256').update(JSON.stringify(manuscript)).digest('hex'),
      records: index.records.map((record: any) => ({ ...record, location: locations[record.id] })),
      unmapped,
    },
    null,
    2
  ) + '\n'
);
writeFileSync(
  `${here}pages.json`,
  JSON.stringify(
    manuscript.pages.map((p: any, i: number) => ({
      number: i + 1,
      key: p.key,
      title: p.title,
      id: contents.pageOrder[i],
    })),
    null,
    2
  ) + '\n'
);
console.log(JSON.stringify({ pages: contents.pageOrder.length, topics: index.records.length, unmapped }, null, 2));
