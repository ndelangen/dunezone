import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { rawRulebookSchema, readRawAuthoringJson } from '../../../../src/shared/authoring/raw';
import { normalizeFormattedText } from '../../../../src/shared/formattedText';
import { rulebookLocalIdAlphabet } from '../../../../src/shared/rulebooks/contents';
import { projectRulebookDraftRenderDocument } from '../../../../src/shared/rulebooks/projectRenderDocument';
import { assertRulebookReferences } from '../../../../src/shared/rulebooks/references';

const here = fileURLToPath(new URL('.', import.meta.url));
const read = (name: string) => JSON.parse(readFileSync(`${here}${name}`, 'utf8'));
const manuscript = read('manuscript.json');
const bindings = read('../../authoring/resolved-production-references.json');
const cards = read('../../components/production-cards.json');
const baseline = read('../../authoring/rulebook.json');
const cover = read('cover.json');
const used = new Set<string>();
function id(key: string): string {
  for (let attempt = 0; ; attempt++) {
    const bytes = createHash('sha256').update(`gf9-diff:${key}:${attempt}`).digest();
    const value = [...bytes.subarray(0, 4)].map((b) => rulebookLocalIdAlphabet[b & 31]).join('');
    if (!used.has(value)) {
      used.add(value);
      return value;
    }
  }
}
function formatted(value: string): string {
  const normalized = normalizeFormattedText(value.replace(/[\\*_-]/g, '\\$&'));
  if (!normalized.ok) throw new Error(JSON.stringify(normalized.diagnostics));
  return normalized.value;
}
const assets = Object.fromEntries(
  Object.values(cards).map((card: any) => [
    card.assetId,
    {
      assetId: card.assetId,
      name: card.name,
      type: card.type,
      imageUrl: `https://dune.zone${card.publication.publicationHref}`,
      width: 900,
      height: 1263,
    },
  ])
);
assets[bindings.spiceToken.assetId] = bindings.spiceToken;
const coverage: Record<string, any[]> = {};
const contents: any = { schemaVersion: 1, pageOrder: [], pagesById: {} };
function block(value: any, key: string, pageId: string): any {
  const blockId = id(value.authoringKey ?? key);
  for (const evidence of value.evidence ?? []) (coverage[evidence] ??= []).push({ pageId, blockId });
  const { evidence, authoringKey, cardKey, columns, rows, faction, era, memberId, caption, ...rest } = value;
  let result: any = { ...rest, id: blockId };
  if (cardKey) result.source = { kind: 'asset', assetId: cards[cardKey].assetId };
  if (value.kind === 'reference-table') {
    result.columnOrder = columns.map((_: any, i: number) => `c${i}`);
    result.columnsById = Object.fromEntries(
      columns.map((label: string, i: number) => [`c${i}`, { id: `c${i}`, label }])
    );
    result.rowOrder = rows.map((_: any, i: number) => `r${i}`);
    result.rowsById = Object.fromEntries(
      rows.map((cells: string[], i: number) => [
        `r${i}`,
        {
          id: `r${i}`,
          cellsByColumnId: Object.fromEntries(cells.map((cell, j) => [`c${j}`, formatted(cell)])),
        },
      ])
    );
  }
  if (value.kind === 'leader-entry') {
    const target = era === 'old' ? bindings.factions[faction] : bindings.overviewFactions[faction];
    result = {
      id: blockId,
      kind: 'card-entry',
      name: value.name,
      text: value.text,
      size: 'large',
      imageSide: 'left',
      textFlow: 'beside',
      source: { kind: 'faction-member', factionId: target.id, memberId, presentation: 'leader' },
    };
  }
  if (value.kind === 'wheel-comparison') {
    const side = (role: string, adjustment: number, result: string) => ({
      factionId: bindings.overviewFactions.atreides.id,
      role,
      revealed: true,
      dial: value.dial,
      spice: value.spice,
      adjustment,
      cards: [],
      troops: [],
      result,
    });
    result = {
      id: blockId,
      kind: 'battle-plans',
      showSideLabels: true,
      left: side('GF9 Advanced', 0, '4 strength before leader.'),
      right: side('GF9 2.0', value.bonus, '6 strength before leader.'),
    };
  }
  if (value.kind === 'map-example') {
    result = {
      id: blockId,
      kind: 'board-scene',
      boardId: 'arrakis',
      size: 'fit-width',
      caption,
      routes: [],
      players: [],
      troops: [],
      annotations: [],
      highlights: ['greater-flat', 'cielago-depression', 'cielago-east'].map((territory, i) => ({
        territory,
        color: ['#bd8036', '#a63b2b', '#6d713c'][i],
        opacity: 0.55,
      })),
    };
  }
  if (value.kind === 'income-map') {
    const source = Object.values(baseline.contents.pagesById)
      .flatMap((p: any) => Object.values(p.blocksById))
      .find((b: any) => b.kind === 'board-scene' && b.highlights?.some((h: any) => h.territory === 'tueks')) as any;
    if (!source) throw new Error('Income board illustration not found');
    result = { ...structuredClone(source), id: blockId, caption };
  }
  if (value.kind === 'referenced-illustration') result.caption = caption;
  for (const name of ['text', 'question', 'answer', 'introduction', 'note'])
    if (typeof result[name] === 'string') result[name] = formatted(result[name]);
  return result;
}
for (const authored of manuscript.pages) {
  const pageId = id(`page:${authored.key}`);
  const page: any = {
    id: pageId,
    anchor: authored.key,
    title: authored.title,
    layoutId: authored.layoutId,
    showHeading: authored.layoutId !== 'cover',
    controlValues: {},
    blockOrderByRegion: {},
    blocksById: {},
  };
  if (authored.icon) {
    const icon = authored.icon === 'spacing-guild' ? 'guild' : authored.icon;
    page.headingIcon = `/vector/logo/${icon}.svg`;
  }
  if (authored.layoutId === 'cover') {
    page.controlValues = structuredClone(baseline.contents.pagesById[baseline.contents.pageOrder[0]].controlValues);
    page.controlValues.cover.subtitle = 'GF9 2019 TO GF9 2.0';
    page.controlValues.cover.supportingText = 'WHAT CHANGES\nFOR EXPERIENCED PLAYERS';
    const image = cover.productionImage ?? {
      url: `http://127.0.0.1:4320${cover.deliveryPath}`,
      width: cover.width,
      height: cover.height,
      sourceUrl: `https://localhost${cover.deliveryPath}`,
    };
    page.controlValues.cover.backgroundSource = { kind: 'url' };
    page.controlValues.cover.backgroundImageUrl = image.sourceUrl;
    page.controlValues.cover.backgroundImage = image;
  } else {
    authored.columns.forEach((values: any[], column: number) => {
      const region = authored.layoutId === 'single-column' ? 'content' : `column${column + 1}`;
      page.blockOrderByRegion[region] = values.map((value, n) => {
        const rendered = block(value, `${authored.key}:${region}:${n}`, pageId);
        page.blocksById[rendered.id] = rendered;
        return rendered.id;
      });
    });
    if (authored.source) {
      const rendered = block({ kind: 'text', text: `Sources: ${authored.source}` }, `${authored.key}:sources`, pageId);
      page.blocksById[rendered.id] = rendered;
      const region = authored.layoutId === 'single-column' ? 'content' : 'column2';
      page.blockOrderByRegion[region].push(rendered.id);
    }
  }
  contents.pageOrder.push(pageId);
  contents.pagesById[pageId] = page;
}
const raw = rawRulebookSchema.parse({ settings: { size: 'a4', design: 'restrained' }, contents });
assertRulebookReferences(raw.contents, assets, bindings.resolvedFactions);
const json = JSON.stringify(raw, null, 2) + '\n';
rawRulebookSchema.parse(readRawAuthoringJson(json));
const { document } = projectRulebookDraftRenderDocument(raw.contents, assets, raw.settings, bindings.resolvedFactions);
const findings = read('../index.json').records;
const excluded = new Map(manuscript.excludedFindings.map((finding: any) => [finding.id, finding.reason]));
const absent = findings.filter(
  (finding: any) =>
    !coverage[finding.id] && !excluded.has(finding.id) && !(finding.same_change_as && coverage[finding.same_change_as])
);
if (absent.length) throw new Error(`Unaccounted research findings: ${absent.map((f: any) => f.id).join(', ')}`);
writeFileSync(`${here}rulebook.json`, json);
writeFileSync(`${here}render-document.json`, JSON.stringify(document, null, 2) + '\n');
writeFileSync(
  `${here}coverage.json`,
  JSON.stringify(
    {
      manuscriptSha256: createHash('sha256').update(JSON.stringify(manuscript)).digest('hex'),
      records: findings.map((finding: any) => ({
        id: finding.id,
        classification: finding.classification,
        locations: (coverage[finding.id] ?? coverage[finding.same_change_as] ?? []).map((location: any) => ({
          ...location,
          pageNumber: contents.pageOrder.indexOf(location.pageId) + 1,
          title: contents.pagesById[location.pageId].title,
        })),
        ...(excluded.has(finding.id) ? { excludedAsUnchanged: excluded.get(finding.id) } : {}),
        ...(finding.same_change_as ? { sameChangeAs: finding.same_change_as } : {}),
      })),
      unmapped: absent.map((finding: any) => finding.id),
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
console.log(
  JSON.stringify(
    {
      pages: contents.pageOrder.length,
      blocks: Object.values(contents.pagesById).reduce((n: number, p: any) => n + Object.keys(p.blocksById).length, 0),
      unmapped: absent.map((f: any) => f.id),
    },
    null,
    2
  )
);
