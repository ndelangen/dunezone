// Historical delivery generator. Superseded for the GF9 correction; use authoring.ts and authoring/README.md.
import { createHash } from 'node:crypto';
import { readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { normalizeFormattedText } from '../../src/shared/formattedText';
import { rulebookContentsV1Schema, rulebookLocalIdAlphabet } from '../../src/shared/rulebooks/contents';

type ManuscriptBlock =
  | { kind: 'text'; text: string }
  | { kind: 'list'; title?: string; items: string[]; style?: 'bulleted' | 'numbered' }
  | { kind: 'callout'; title: string; text: string }
  | { kind: 'table'; title?: string; columns: string[]; rows: string[][] };
type Section = {
  id: string;
  title: string;
  applicability: string;
  blocks: ManuscriptBlock[];
  sources: { source: string; page: string | number }[];
};
type Manuscript = { title: string; introduction: string; sections: Section[] };
type Block = Record<string, unknown> & { id: string; kind: string };
const directory = import.meta.dirname;
const used = new Map<string, string>();

function localId(key: string) {
  for (let attempt = 0; ; attempt += 1) {
    const bytes = createHash('sha256').update(`${key}:${attempt}`).digest();
    const id = Array.from(bytes.subarray(0, 4), (byte) => rulebookLocalIdAlphabet[byte & 31]).join('');
    if (!used.has(id) || used.get(id) === key) {
      used.set(id, key);
      return id;
    }
  }
}

function formatted(text: string) {
  const result = normalizeFormattedText(text);
  if (!result.ok) {
    throw new Error(`Invalid formatted text: ${text.slice(0, 100)} ${JSON.stringify(result.diagnostics)}`);
  }
  return result.value;
}

function blocksFor(block: ManuscriptBlock, key: string): Block[] {
  const id = localId(key);
  if (block.kind === 'text') {
    return block.text
      .split(/\n\s*\n/)
      .filter(Boolean)
      .map((text, index) => ({ id: localId(`${key}:${index}`), kind: 'text', text: formatted(text) }));
  }
  if (block.kind === 'callout') {
    return [{ id, kind: 'callout', variant: 'note', title: block.title, text: formatted(block.text) }];
  }
  const heading: Block[] = block.title
    ? [{ id: localId(`${key}:heading`), kind: 'section-heading', title: block.title }]
    : [];
  if (block.kind === 'list') {
    return [
      ...heading,
      ...block.items.map((text, index) => {
        const itemId = `item-${index + 1}`;
        return {
          id: localId(`${key}:${index}`),
          kind: 'list',
          style: block.style ?? 'bulleted',
          ...(block.style === 'numbered' ? { start: index + 1 } : {}),
          itemOrder: [itemId],
          itemsById: { [itemId]: { id: itemId, text: formatted(text) } },
        };
      }),
    ];
  }
  return [
    ...heading,
    ...Array.from({ length: Math.ceil(block.rows.length / 4) }, (_, part) => {
      const rows = block.rows.slice(part * 4, part * 4 + 4);
      const columnOrder = block.columns.map((_, index) => `column-${index + 1}`);
      const rowOrder = rows.map((_, index) => `row-${part * 4 + index + 1}`);
      return {
        id: localId(`${key}:table:${part}`),
        kind: 'reference-table',
        columnOrder,
        columnsById: Object.fromEntries(
          block.columns.map((label, index) => [columnOrder[index], { id: columnOrder[index], label }])
        ),
        rowOrder,
        rowsById: Object.fromEntries(
          rows.map((row, index) => [
            rowOrder[index],
            {
              id: rowOrder[index],
              cellsByColumnId: Object.fromEntries(
                columnOrder.map((column, cell) => [column, formatted(row[cell] ?? '')])
              ),
            },
          ])
        ),
        note: '',
      };
    }),
  ];
}

function weight(block: { id: string; kind: string }) {
  const countText = (value: unknown): number => {
    if (typeof value === 'string') {
      return value.length;
    }
    if (Array.isArray(value)) {
      return value.reduce((sum, item) => sum + countText(item), 0);
    }
    if (value && typeof value === 'object') {
      return Object.values(value).reduce<number>((sum, item) => sum + countText(item), 0);
    }
    return 0;
  };
  const chars = countText(block);
  if (block.kind === 'reference-table') {
    return chars * 1.45 + 300;
  }
  if (block.kind === 'section-heading') {
    return 180;
  }
  return chars + (block.kind === 'callout' ? 230 : 100);
}

function compile(manuscript: Manuscript, key: string) {
  const pages: Record<string, unknown>[] = [];
  const coverId = localId(`${key}:cover`);
  const presetId = key.includes('ecaz')
    ? 'desert-citadel'
    : key.includes('choam')
      ? 'spice-harvester'
      : key.includes('ixian')
        ? 'shielded-city'
        : 'sandworm';
  pages.push({
    id: coverId,
    anchor: 'cover',
    title: manuscript.title,
    layoutId: 'cover',
    showHeading: true,
    controlValues: {
      cover: {
        backgroundSource: { kind: 'preset', presetId },
        subtitle: manuscript.introduction,
        supportingText: 'Gale Force Nine rules, with source references and recorded Dune Zone judgements.',
        showDuneLogo: true,
        showSubtitle: true,
      },
    },
    blockOrderByRegion: {},
    blocksById: {},
  });
  for (const section of manuscript.sections) {
    const sourceText = section.sources.map((source) => `${source.source}, p. ${source.page}`).join('; ');
    const blocks = section.blocks.flatMap((block, index) => blocksFor(block, `${key}:${section.id}:${index}`));
    if (sourceText) {
      blocks.push({
        id: localId(`${key}:${section.id}:sources`),
        kind: 'text',
        text: formatted(`Sources: ${sourceText}.`),
      });
    }
    const parts: Block[][] = [[]];
    let currentWeight = 0;
    for (const block of blocks) {
      const blockWeight = weight(block);
      if (currentWeight + blockWeight > 2900 && parts.at(-1)!.length > 0) {
        parts.push([]);
        currentWeight = 0;
      }
      parts.at(-1)!.push(block);
      currentWeight += blockWeight;
    }
    const lastPart = parts.at(-1)!;
    if (parts.length > 1 && lastPart.length === 1 && lastPart[0]!.id === localId(`${key}:${section.id}:sources`)) {
      parts[parts.length - 2]!.push(...lastPart);
      parts.pop();
    }
    parts.forEach((part, index) => {
      const id = localId(`${key}:${section.id}:page:${index}`);
      const applicability =
        section.applicability === 'advanced'
          ? 'Advanced game'
          : section.applicability === 'basic'
            ? 'Basic game'
            : section.applicability === 'optional'
              ? 'Optional module'
              : '';
      const title = `${section.title}${index ? ', continued' : ''}${applicability ? ` | ${applicability}` : ''}`;
      pages.push({
        id,
        anchor: `${section.id}${index ? `-${index + 1}` : ''}`,
        title,
        layoutId: 'single-column',
        showHeading: true,
        controlValues: {},
        blockOrderByRegion: { content: part.map((block) => block.id) },
        blocksById: Object.fromEntries(part.map((block) => [block.id, block])),
      });
    });
  }
  const contents = rulebookContentsV1Schema.parse({
    schemaVersion: 1,
    pageOrder: pages.map((page) => page.id),
    pagesById: Object.fromEntries(pages.map((page) => [page.id, page])),
  });
  const compactOrder: string[] = [];
  for (const pageId of contents.pageOrder) {
    const page = contents.pagesById[pageId]!;
    const previousId = compactOrder.at(-1);
    const previous = previousId ? contents.pagesById[previousId] : undefined;
    if (page.layoutId === 'single-column' && previous?.layoutId === 'single-column') {
      const pageWeight = page.blockOrderByRegion.content.reduce((sum, id) => sum + weight(page.blocksById[id]!), 0);
      const previousWeight = previous.blockOrderByRegion.content.reduce(
        (sum, id) => sum + weight(previous.blocksById[id]!),
        0
      );
      if (pageWeight + previousWeight + 180 <= 4000) {
        const headingId = localId(`${key}:${page.anchor}:compact-heading`);
        previous.blocksById[headingId] = {
          id: headingId,
          kind: 'section-heading',
          title: page.title,
          anchor: page.anchor,
        };
        Object.assign(previous.blocksById, page.blocksById);
        previous.blockOrderByRegion.content.push(headingId, ...page.blockOrderByRegion.content);
        delete contents.pagesById[pageId];
        continue;
      }
    }
    compactOrder.push(pageId);
  }
  contents.pageOrder = compactOrder;
  rulebookContentsV1Schema.parse(contents);
  return {
    key,
    kind: 'rulebook' as const,
    data: { name: manuscript.title, settings: { size: 'a4', design: 'restrained' }, contents },
  };
}

const books = [];
for (const filename of (await readdir(directory)).filter((name) => name.endsWith('-manuscript.json')).sort()) {
  const key = filename.replace('-manuscript.json', '-rules');
  const manuscript = (await Bun.file(path.join(directory, filename)).json()) as Manuscript;
  const book = compile(manuscript, key);
  await writeFile(path.join(directory, `${key}.json`), JSON.stringify(book, null, 2) + '\n');
  console.log(`${key}: ${book.data.contents.pageOrder.length} pages, ${manuscript.sections.length} sections`);
  books.push(book);
}
await writeFile(
  path.join(directory, 'rulebooks-package.json'),
  JSON.stringify({ format: 'dunezone-package', version: 1, packageKey: 'gf9-rulebooks', items: books }, null, 2) + '\n'
);
