import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { rawRulebookSchema, readRawAuthoringJson } from '../../../src/shared/authoring/raw';
import { normalizeFormattedText, parseFormattedText } from '../../../src/shared/formattedText';
import { rulebookLocalIdAlphabet } from '../../../src/shared/rulebooks/contents';
import { projectRulebookDraftRenderDocument } from '../../../src/shared/rulebooks/projectRenderDocument';
import { assertRulebookReferences, collectRulebookReferenceIds } from '../../../src/shared/rulebooks/references';
import { RULEBOOK_STOCK_ARTWORK } from '../../../src/shared/rulebooks/sources';
import { compose } from './compose';

// This is a document builder, not a database importer. Its only writes are local files.
const here = fileURLToPath(new URL('.', import.meta.url));
const originalSource = readFileSync(`${here}../transcript-reworked.md`, 'utf8');
const scanCorrections = JSON.parse(readFileSync(`${here}../clearer-scan-corrections.json`, 'utf8'));
let source = originalSource;
for (const correction of scanCorrections.readings) {
  const start = source.indexOf(`## PDF page ${String(correction.page).padStart(2, '0')}\n`);
  const next = source.indexOf('\n## PDF page ', start + 1);
  const end = next < 0 ? source.length : next;
  const page = source.slice(start, end);
  if (!page.includes(correction.before)) {
    throw new Error(`Scan correction no longer matches page ${correction.page}: ${correction.before}`);
  }
  source = source.slice(0, start) + page.replace(correction.before, correction.after) + source.slice(end);
}
const columnBreaks = JSON.parse(readFileSync(`${here}column-breaks.json`, 'utf8'));
const bindings = JSON.parse(readFileSync(`${here}resolved-production-references.json`, 'utf8'));
const outputHere = here;
const stock = new Set<string>(RULEBOOK_STOCK_ARTWORK);
const used = new Set<string>();
function id(key: string) {
  for (let attempt = 0; ; attempt++) {
    const bytes = createHash('sha256').update(`${key}:${attempt}`).digest();
    const value = [...bytes.subarray(0, 4)].map((b) => rulebookLocalIdAlphabet[b & 31]).join('');
    if (!used.has(value)) {
      used.add(value);
      return value;
    }
  }
}
function plain(text: string) {
  return text.replace(/\*\*([^*]+)\*\*/g, '$1');
}
function formatted(text: string) {
  // Escape the application's delimiters before translating the transcript's bold marks.
  const chunks = text.split(/(\*\*[^*]+\*\*)/g);
  const escaped = chunks
    .map((part) => {
      const bold = part.startsWith('**') && part.endsWith('**');
      const value = (bold ? part.slice(2, -2) : part).replace(/[\\*_-]/g, '\\$&');
      return bold ? `*${value}*` : value;
    })
    .join('');
  const result = normalizeFormattedText(escaped);
  if (!result.ok) {
    throw new Error(JSON.stringify({ text, diagnostics: result.diagnostics }));
  }
  const parsed = parseFormattedText(result.value);
  const flatten = (nodes: any[]): string =>
    nodes
      .map((node) => (node.kind === 'text' ? node.value : node.kind === 'line-break' ? '\n' : flatten(node.children)))
      .join('');
  const visible = parsed.blocks
    .map((block: any) =>
      block.kind === 'paragraph'
        ? flatten(block.children)
        : block.items.map((item: any) => flatten(item.children)).join('\n')
    )
    .join('\n');
  if (visible.replace(/\s+/g, ' ').trim() !== plain(text).replace(/^• /gm, '').replace(/\s+/g, ' ').trim()) {
    throw new Error(`Formatting changed visible wording: ${text}`);
  }
  return result.value;
}
const factions = Object.values(bindings.factions) as any[];
function factionFor(title: string) {
  const normalized = title.toLowerCase().replace(/^house /, '');
  return factions.find((faction) => faction.sourceHeading.toLowerCase() === normalized);
}
const cardArt: Record<string, string> = {
  'spice blows': '/vector/icon/spice-blow_standalone.svg',
  'shai-hulud': '/vector/decal/shai-hulud.svg',
  'little maker': '/vector/decal/little-maker-multicolor.svg',
  lasgun: '/vector/decal/lasgun.svg',
  shield: '/vector/decal/shield.svg',
  baliset: '/vector/decal/baliset.svg',
  snooper: '/vector/decal/snooper.svg',
  'maula pistol': '/vector/decal/maula-pistol.svg',
  crysknife: '/vector/decal/crysknife.svg',
  'tleilaxu ghola': '/vector/decal/tleilaxu-ghola.svg',
  kulon: '/vector/decal/kulon.svg',
  'family atomics': '/vector/decal/family-atomics.svg',
  karama: '/vector/decal/karama-2-0.svg',
  solaris: '/vector/decal/solaris-multicolor.svg',
};
const omissions: any[] = [];
const editorial: any[] = [];
const unitMap: any[] = [];
const sourcePages = [...source.matchAll(/^## PDF page (\d+)\n([\s\S]*?)(?=^## PDF page |$(?![\s\S]))/gm)];
if (sourcePages.length !== 36) {
  throw new Error(`Expected 36 source pages, found ${sourcePages.length}`);
}
const allPages: any[] = [];
const pageMap: any[] = [];
const contents: any = { schemaVersion: 1, pageOrder: [], pagesById: {} };
const scene = (caption = '', routes: any[] = [], highlights: any[] = []) => ({
  kind: 'board-scene',
  boardId: 'arrakis',
  caption,
  size: 'compact',
  routes,
  players: [],
  troops: [],
  highlights,
  annotations: [],
});
const side = (name: string, dial: number, spice: number, revealed = true, portrait?: string) => ({
  factionId: factionFor(name)!.id,
  role: name,
  revealed,
  dial,
  spice,
  ...(portrait ? { leader: { kind: 'stock', artworkId: portrait } } : {}),
  cards: [],
  troops: [],
});

for (const match of sourcePages) {
  const sourcePage = Number(match[1]);
  const rawUnits = match[2]
    .trim()
    .split(/\n\s*\n/)
    .filter((unit) => !unit.startsWith('[Source page '));
  if (sourcePage === 7) {
    omissions.push({
      sourcePage,
      reason: 'Approved omission of the complete physical box inventory.',
      units: rawUnits,
    });
    pageMap.push({ sourcePage, outputPages: [], reason: 'Physical box inventory omitted by approval.' });
    continue;
  }
  const units: any[] = [];
  let omitContents = false;
  for (const [index, raw] of rawUnits.entries()) {
    const key = `source-${sourcePage}-unit-${index}`;
    if (raw.startsWith('*Transcription note:')) {
      editorial.push({ sourcePage, key, text: raw });
      continue;
    }
    if (sourcePage === 2 && /^### CONTENTS$/.test(raw)) {
      omitContents = true;
    }
    if (omitContents) {
      omissions.push({
        sourcePage,
        key,
        reason: 'Printed contents omitted in favour of the web navigator.',
        text: raw,
      });
      continue;
    }
    units.push({ key, raw, sourcePage });
  }
  const groups =
    sourcePage === 28
      ? (() => {
          const split = units.findIndex(({ raw }) => raw === '### FREMEN');
          if (split < 0) {
            throw new Error('Fremen source-page split was lost.');
          }
          return [units.slice(0, split), units.slice(split)];
        })()
      : [units];
  for (const [part, group] of groups.entries()) {
    const pageId = id(`source-page-${sourcePage}-${part}`);
    const firstHeading = group[0]?.raw.match(/^### (.+)$/);
    const titles: Record<number, string> = {
      1: 'DUNE',
      5: 'FACTION OVERVIEW',
      6: 'GAME COMPONENTS',
      13: 'PHASE 5: REVIVAL',
      15: 'PHASE 6: SHIPMENT AND MOVEMENT',
      17: 'PHASE 7: BATTLE',
      18: 'PHASE 7: BATTLE',
      19: 'TRAITORS',
      24: 'TREACHERY CARDS',
      28: part === 0 ? 'BENE GESSERIT' : 'FREMEN',
      29: 'FREMEN',
      35: 'DUNE SYNOPSIS',
    };
    const title = titles[sourcePage] ?? firstHeading?.[1] ?? `DUNE`;
    const page: any = {
      id: pageId,
      anchor: `source-${String(sourcePage).padStart(2, '0')}${groups.length > 1 ? `-${part + 1}` : ''}`,
      title,
      layoutId: 'two-columns',
      controlValues: {},
      showHeading: true,
      blockOrderByRegion: { column1: [], column2: [] },
      blocksById: {},
    };
    const faction = factionFor(title);
    if (faction) {
      page.headingIcon = faction.emblem;
    }
    const blocks: any[] = [];
    const leadIns = new Set<string>();
    const add = (key: string, value: any, mapped: any[] = []) => {
      const block = { id: id(key), ...value };
      blocks.push(block);
      for (const unit of mapped) {
        unitMap.push({ key: unit.key, sourcePage, pageId, blockId: block.id, text: unit.raw });
      }
      return block;
    };
    for (let i = 0; i < group.length; i++) {
      const unit = group[i];
      const { raw, key } = unit;
      const heading = raw.match(/^### (.+)$/);
      const label = raw.match(/^\*\*(.+?)\*\*$/);
      if (heading) {
        if (i === 0 && heading[1] === title) {
          unitMap.push({ key, sourcePage, pageId, field: 'title', text: raw });
          continue;
        }
        const found = factionFor(heading[1]);
        add(key, { kind: 'section-heading', title: heading[1], ...(found ? { factionId: found.id } : {}) }, [unit]);
        continue;
      }
      if (label?.[1] === 'Margin quotation') {
        editorial.push({ sourcePage, key, text: raw, reason: 'Editorial placement label, not printed body.' });
        continue;
      }
      if (raw.startsWith('> ')) {
        const next = group[i + 1];
        const attribution = next?.raw.startsWith('—') ? next.raw : undefined;
        add(
          key,
          {
            kind: 'callout',
            variant: 'quotation',
            text: formatted(raw.replace(/^> /gm, '')),
            ...(attribution ? { attribution } : {}),
          },
          attribution ? [unit, next] : [unit]
        );
        if (attribution) {
          i++;
        }
        continue;
      }
      if (label && /card illustration$/i.test(label[1])) {
        const collected = [unit];
        while (i + 1 < group.length && !/^(### |\*\*[^*]+\*\*$|Map illustration labels:)/.test(group[i + 1].raw)) {
          collected.push(group[++i]);
        }
        const cardName = label[1].replace(/ card illustration$/i, '');
        const artworkId = cardArt[cardName.toLowerCase()];
        if (artworkId && !stock.has(artworkId)) {
          throw new Error(`Unknown artwork: ${artworkId}`);
        }
        editorial.push({
          sourcePage,
          key,
          text: raw,
          reason: 'Editorial illustration label. Card name and printed body follow.',
        });
        const body = collected
          .slice(2)
          .map(({ raw }) => raw.replace(/^- /gm, '• '))
          .join('\n\n');
        add(
          key,
          {
            kind: 'card-entry',
            ...(artworkId ? { source: { kind: 'stock', artworkId } } : {}),
            name: collected[1]?.raw ?? cardName,
            size: 'small',
            textFlow: 'wrap',
            text: formatted(body),
          },
          collected.slice(1)
        );
        continue;
      }
      if (label && sourcePage === 3 && !['Expansions:'].includes(label[1])) {
        const collected = [unit];
        while (i + 1 < group.length && !/^(### |\*\*[^*]+\*\*$)/.test(group[i + 1].raw)) {
          if (/^(Games Design|DUNE ©|MO SF|museumofsciencefiction|In association)/.test(group[i + 1].raw)) {
            break;
          }
          collected.push(group[++i]);
        }
        add(
          key,
          {
            kind: 'credits',
            groupOrder: ['credit'],
            groupsById: {
              credit: {
                id: 'credit',
                heading: label[1],
                contributorOrder: collected.slice(1).map((_, n) => `name-${n}`),
                contributorsById: Object.fromEntries(
                  collected.slice(1).map(({ raw }, n) => [`name-${n}`, { id: `name-${n}`, name: raw }])
                ),
              },
            },
          },
          collected
        );
        continue;
      }
      if (label && sourcePage === 26 && label[1].startsWith('KARAMA POWER')) {
        const collected = [unit];
        while (i + 1 < group.length && !/^(### |\*\*[^*]+\*\*$)/.test(group[i + 1].raw)) {
          if (/^(Example:|The Emperor has)/.test(group[i + 1].raw)) {
            break;
          }
          collected.push(group[++i]);
        }
        add(
          key,
          {
            kind: 'callout',
            variant: 'note',
            title: label[1],
            text: formatted(
              collected
                .slice(1)
                .map(({ raw }) => raw)
                .join('\n\n')
            ),
          },
          collected
        );
        continue;
      }
      if (label) {
        const block = add(key, { kind: 'section-heading', title: label[1] }, [unit]);
        leadIns.add(block.id);
        continue;
      }
      const inlineAnswer = raw.indexOf(' Answer: ');
      if (inlineAnswer >= 0 || (group[i + 1]?.raw ?? '').startsWith('Answer: ')) {
        const next = inlineAnswer < 0 ? group[++i] : undefined;
        add(
          key,
          {
            kind: 'question-answer',
            question: formatted(inlineAnswer < 0 ? raw : raw.slice(0, inlineAnswer)),
            answer: formatted(
              inlineAnswer < 0 ? next.raw.replace(/^Answer: /, '') : raw.slice(inlineAnswer + ' Answer: '.length)
            ),
          },
          next ? [unit, next] : [unit]
        );
        continue;
      }
      if (/^(?:- |\d+\. )/.test(raw)) {
        const numbered = /^\d+\. /.test(raw);
        const collected = [unit];
        while (i + 1 < group.length && (numbered ? /^\d+\. / : /^- /).test(group[i + 1].raw)) {
          collected.push(group[++i]);
        }
        add(
          key,
          {
            kind: 'list',
            style: numbered ? 'numbered' : 'bulleted',
            ...(numbered ? { start: Number(raw.match(/^\d+/)![0]) } : {}),
            itemOrder: collected.map((_, n) => `item-${n}`),
            itemsById: Object.fromEntries(
              collected.map(({ raw }, n) => [
                `item-${n}`,
                { id: `item-${n}`, text: formatted(raw.replace(/^(?:- |\d+\. )/, '')) },
              ])
            ),
          },
          collected
        );
        continue;
      }
      add(key, { kind: 'text', text: formatted(raw) }, [unit]);
    }
    // Keep prose paragraphs together and use the existing short text heading for lead-ins.
    for (let n = 0; n < blocks.length; n++) {
      const block = blocks[n];
      if (leadIns.has(block.id) && blocks[n + 1]?.kind === 'text') {
        block.kind = 'text';
        block.name = block.title;
        delete block.title;
        block.text = '';
      }
      if (block.kind !== 'text') {
        continue;
      }
      while (
        blocks[n + 1]?.kind === 'text' &&
        !blocks[n + 1].name &&
        block.text.length + blocks[n + 1].text.length < 1400
      ) {
        const absorbed = blocks.splice(n + 1, 1)[0];
        block.text = [block.text, absorbed.text].filter(Boolean).join('\n\n');
        for (const entry of unitMap) {
          if (entry.blockId === absorbed.id) {
            entry.blockId = block.id;
          }
        }
      }
    }
    if (sourcePage === 1) {
      page.showHeading = false;
    }
    if (sourcePage === 6) {
      const terrain = blocks.find((block) => block.kind === 'list');
      if (terrain) {
        const keys = ['sand', 'rock', 'strongholds', 'polar'];
        const original = terrain.itemsById;
        terrain.kind = 'asset-explainer';
        delete terrain.style;
        terrain.source = { kind: 'board', boardId: 'arrakis' };
        terrain.caption = '';
        terrain.numbering = 'automatic';
        terrain.colorMode = 'automatic';
        terrain.itemsById = Object.fromEntries(
          terrain.itemOrder.map((itemId: string, n: number) => [
            itemId,
            {
              id: itemId,
              label: String(n + 1),
              text: original[itemId].text,
              target: { kind: 'named', key: keys[n] },
            },
          ])
        );
      }
      add('page-6-wheel', {
        kind: 'battle-plans',
        left: side('Atreides', 0, 0, false),
        right: side('Harkonnen', 0, 0, false),
        showSideLabels: false,
      });
    }
    if (sourcePage === 15) {
      add(
        'page-15-harkonnen-map',
        scene('', [
          {
            id: 'harkonnen',
            label: 'Carthag → Arrakeen',
            direction: 'forward',
            showWaypoints: false,
            waypoints: [{ territory: 'carthag' }, { territory: 'arrakeen' }],
          },
        ])
      );
      add(
        'page-15-guild-map',
        scene('', [
          {
            id: 'guild',
            label: "Tuek's Seitch → Cielago South",
            direction: 'forward',
            showWaypoints: false,
            waypoints: [{ territory: 'tueks' }, { territory: 'cielago-south' }],
          },
        ])
      );
    }
    if (sourcePage === 18 || sourcePage === 19) {
      const left: any = side('Emperor', 6, 4, true, '/image/leader/official/hasimir.png');
      if (sourcePage === 19) {
        left.leaderKilled = true;
      }
      add(`page-${sourcePage}-wheel`, {
        kind: 'battle-plans',
        left,
        right: side('Atreides', 4, 0, sourcePage === 19, '/image/leader/official/jessica.png'),
        showSideLabels: true,
      });
    }
    if (sourcePage === 20) {
      add(
        'page-20-collection-map',
        scene(
          '',
          [],
          [
            { territory: 'arrakeen', color: '#ba913b', opacity: 0.3 },
            { territory: 'carthag', color: '#ba913b', opacity: 0.3 },
            { territory: 'tueks', color: '#ba913b', opacity: 0.3 },
          ]
        )
      );
    }
    if (sourcePage === 26) {
      const troop = (pieceId: string, count: number, label: string) => ({
        id: pieceId,
        kind: 'source',
        source: { kind: 'stock', artworkId: '/vector/troop/emperor.svg' },
        count,
        label,
      });
      add('page-26-loss-options', {
        kind: 'piece-transfer',
        direction: 'none',
        left: { label: '2 + ½ + ½', pieces: [troop('sardaukar', 1, 'Sardaukar: 2'), troop('standard', 2, '½')] },
        right: { label: '1 + ½ + ½ + ½ + ½', pieces: [troop('supported', 1, '1'), troop('unsupported', 4, '½')] },
      });
      add('page-26-half-wheels-1', {
        kind: 'battle-plans',
        left: side('Emperor', 2.5, 0),
        right: side('Emperor', 4.5, 0),
        showSideLabels: false,
      });
      add('page-26-half-wheels-2', {
        kind: 'battle-plans',
        left: side('Emperor', 8.5, 0),
        right: side('Emperor', 0, 0, false),
        showSideLabels: false,
      });
    }
    // Respect source reading order. The boundary may move, but blocks never interleave.
    const weight = (block: any) => {
      const chars = JSON.stringify(block).length;
      if (block.kind === 'section-heading') {
        return 200;
      }
      if (block.kind === 'card-entry') {
        return chars + 800;
      }
      if (block.kind === 'question-answer') {
        return chars + 180;
      }
      return chars + 80;
    };
    const total = blocks.reduce((sum, block) => sum + weight(block), 0);
    let count = 0;
    for (const [n, block] of blocks.entries()) {
      const region = count < total / 2 || n === 0 ? 'column1' : 'column2';
      page.blockOrderByRegion[region].push(block.id);
      page.blocksById[block.id] = block;
      count += weight(block);
    }
    // Never leave a heading as the last block of a column.
    const last = page.blockOrderByRegion.column1.at(-1);
    if (last && page.blocksById[last].kind === 'section-heading') {
      page.blockOrderByRegion.column1.pop();
      page.blockOrderByRegion.column2.unshift(last);
    }
    if (columnBreaks[page.id]) {
      const first = new Set(columnBreaks[page.id]);
      page.blockOrderByRegion.column1 = blocks.filter((block) => first.has(block.id)).map((block) => block.id);
      page.blockOrderByRegion.column2 = blocks.filter((block) => !first.has(block.id)).map((block) => block.id);
    }
    contents.pageOrder.push(page.id);
    contents.pagesById[page.id] = page;
    allPages.push({ page, sourcePage });
    pageMap.push({ sourcePage, part: part + 1, pageId, title, outputPage: contents.pageOrder.length });
  }
}

// Pagination is measured in the actual renderer. Continuations preserve source order.
const composition = compose({ allPages, contents, pageMap, unitMap, editorial, id, formatted, bindings });
// Split prose at paragraph/sentence boundaries so pagination moves words without shrinking them.
for (const { page } of allPages) {
  for (const [region, order] of Object.entries(page.blockOrderByRegion) as any) {
    const next: string[] = [];
    for (const blockId of order) {
      const block = page.blocksById[blockId];
      if (block.kind !== 'text' || !block.text) {
        next.push(blockId);
        continue;
      }
      const limit = region === 'rail' ? 430 : 1100;
      const chunks: string[] = [];
      for (const paragraph of block.text.split('\n\n')) {
        let rest = paragraph;
        while (rest.length > limit) {
          let cut = rest.lastIndexOf('. ', limit);
          if (cut < limit * 0.45) {
            cut = rest.lastIndexOf(' ', limit);
          } else {
            cut++;
          }
          if (cut < 1) {
            break;
          }
          chunks.push(rest.slice(0, cut));
          rest = rest.slice(cut).trimStart();
        }
        if (rest) {
          chunks.push(rest);
        }
      }
      if (chunks.length < 2) {
        next.push(blockId);
        continue;
      }
      const copies = chunks.map((text, index) => ({
        ...block,
        id: index === 0 ? blockId : id(`${blockId}-prose-${index}`),
        ...(index ? { name: undefined } : {}),
        text,
      }));
      for (const copy of copies) {
        if (copy.name === undefined) {
          delete copy.name;
        }
        page.blocksById[copy.id] = copy;
        next.push(copy.id);
      }
      for (const unit of unitMap.filter((u: any) => u.blockId === blockId)) {
        const text = formatted(unit.text);
        const match = copies.find((b: any) => b.text.includes(text) || text.includes(b.text));
        unit.blockId = match?.id ?? blockId;
      }
    }
    page.blockOrderByRegion[region] = next;
  }
}
writeFileSync(`${outputHere}composition.json`, JSON.stringify(composition, null, 2) + '\n');
const paginationPath = `${here}pagination-rebuilt.json`;
if (await Bun.file(paginationPath).exists()) {
  const pagination = JSON.parse(readFileSync(paginationPath, 'utf8'));
  const originalOrder = [...contents.pageOrder];
  const originalMap = [...pageMap];
  contents.pageOrder = [];
  contents.pagesById = {};
  pageMap.length = 0;
  for (const pageId of originalOrder) {
    const original = allPages.find(({ page }) => page.id === pageId)!;
    const mapping = originalMap.find((entry) => entry.pageId === pageId)!;
    const partitions = pagination[pageId] ?? [original.page.blockOrderByRegion];
    const partitionIds = partitions.flatMap((partition: any) => Object.values(partition).flat());
    const expectedIds = Object.values(original.page.blockOrderByRegion).flat();
    if (
      partitionIds.length !== expectedIds.length ||
      new Set(partitionIds).size !== expectedIds.length ||
      expectedIds.some((blockId) => !partitionIds.includes(blockId))
    ) {
      throw new Error(`Pagination must preserve every block exactly once: ${pageId}`);
    }
    for (const [part, partition] of partitions.entries()) {
      const ids = Object.values(partition).flat() as string[];
      const newId = part === 0 ? pageId : id(`${pageId}-continuation-${part}`);
      const page = {
        ...original.page,
        id: newId,
        anchor: part === 0 ? original.page.anchor : `${original.page.anchor}-continued-${part + 1}`,
        title: part === 0 ? original.page.title : original.page.title,
        blocksById: Object.fromEntries(ids.map((blockId: string) => [blockId, original.page.blocksById[blockId]])),
        blockOrderByRegion: partition,
        showHeading: part === 0 ? original.page.showHeading : false,
      };
      if (ids.some((blockId: string) => !page.blocksById[blockId])) {
        throw new Error(`Stale pagination for ${pageId}`);
      }
      contents.pageOrder.push(newId);
      contents.pagesById[newId] = page;
      pageMap.push({
        ...mapping,
        continuation: part,
        pageId: newId,
        title: page.title,
        outputPage: contents.pageOrder.length,
      });
      for (const entry of unitMap) {
        if (ids.includes(entry.blockId)) {
          entry.pageId = newId;
        }
      }
    }
  }
  pageMap.push(...originalMap.filter((entry) => !entry.pageId));
}
const cardBindings = JSON.parse(readFileSync(`${here}../components/production-cards.json`, 'utf8'));
const assetsById = Object.fromEntries(
  Object.values(cardBindings).map((c: any) => [
    c.assetId,
    {
      assetId: c.assetId,
      name: c.name,
      type: c.type,
      imageUrl: 'https://dune.zone' + c.publication.publicationHref,
      width: 900,
      height: 1263,
    },
  ])
);
assetsById[bindings.spiceToken.assetId] = bindings.spiceToken;
const settings = { size: 'square', design: 'restrained' };
const preserved = JSON.parse(readFileSync(`${here}correction/before-overview.json`, 'utf8')).items[0].data;
contents.pagesById[contents.pageOrder[0]].controlValues =
  preserved.contents.pagesById[preserved.contents.pageOrder[0]].controlValues;
contents.pagesById[contents.pageOrder[0]].controlValues.cover.supportingText =
  'THE SPICE MUST FLOW\nA GAME OF CONQUEST, DIPLOMACY & BETRAYAL';
const raw = rawRulebookSchema.parse({ settings, contents });
assertRulebookReferences(raw.contents, assetsById, bindings.resolvedFactions);
const document = projectRulebookDraftRenderDocument(
  raw.contents,
  assetsById,
  raw.settings,
  bindings.resolvedFactions
).document;
const json = `${JSON.stringify(raw, null, 2)}\n`;
rawRulebookSchema.parse(readRawAuthoringJson(json));
const mapped = new Set(unitMap.map(({ key }) => key));
for (const match of sourcePages) {
  if (Number(match[1]) === 7) {
    continue;
  }
  const units = match[2]
    .trim()
    .split(/\n\s*\n/)
    .filter((unit) => !unit.startsWith('[Source page '));
  for (const [index, text] of units.entries()) {
    const key = `source-${Number(match[1])}-unit-${index}`;
    if (
      !mapped.has(key) &&
      !editorial.some((item) => item.key === key) &&
      !omissions.some((item) => item.key === key)
    ) {
      throw new Error(`Unaccounted source unit ${key}: ${text}`);
    }
  }
}
writeFileSync(`${outputHere}rulebook.json`, json);
writeFileSync(
  `${outputHere}source-map.json`,
  `${JSON.stringify({ sourceTranscriptSha256: createHash('sha256').update(originalSource).digest('hex'), sourceReadingSha256: createHash('sha256').update(source).digest('hex'), clearerSourceSha256: scanCorrections.sha256, pages: pageMap, units: unitMap, omissions, editorial }, null, 2)}\n`
);
writeFileSync(`${here}render-document.json`, `${JSON.stringify(document, null, 2)}\n`);
const counts: Record<string, number> = {};
for (const page of Object.values(contents.pagesById) as any[]) {
  for (const block of Object.values(page.blocksById) as any[]) {
    counts[block.kind] = (counts[block.kind] ?? 0) + 1;
  }
}
const report = {
  pages: contents.pageOrder.length,
  blocks: counts,
  rawBytes: Buffer.byteLength(json),
  sourceUnitsMapped: unitMap.length,
  editorialUnits: editorial.length,
  approvedOmissions: omissions.length,
  references: collectRulebookReferenceIds(raw.contents),
  uncertaintyMarkers: (json.match(/\[uncertain:/g) ?? []).length,
  unreadableMarkers: (json.match(/\[unreadable\]/g) ?? []).length,
};
writeFileSync(`${outputHere}validation.json`, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
