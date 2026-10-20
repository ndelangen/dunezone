/** Throwaway render-document fixtures. These are not production import payloads. */
import pkg from '../package.json';
import { prototypePages, battleExample } from './pageContent';
import type { PrototypeBlock, PrototypePage, PrototypeSection } from './pageContent';
import { shipmentIllustration } from './shipmentIllustration';
import { shipmentWalkthrough } from './shipmentWalkthrough';
import { rulebookRenderPageV1Schema } from '../../../src/shared/rulebooks/renderDocument';
import type { RulebookRenderPageV1, RulebookRenderBlockV1 } from '../../../src/shared/rulebooks/renderDocument';
import { rulebookLayoutCatalogue } from '../../../src/shared/rulebooks/contents';
import { TroopArtwork } from '../../../src/shared/factions/schema';

export const variants = [
  { key: 'A', name: 'Original book structure', description: 'Two rule columns and component illustrations beside the explanation.' },
  { key: 'B', name: 'Teach through the example', description: 'A diagram leads each core page; the reading sequence follows beneath it.' },
  { key: 'C', name: 'Reference and reminders', description: 'Compact rules and reminders, with component images beside the explanations that use them.' },
] as const;
export type Variant = 'A' | 'B' | 'C';
export const covers = [
  { id: 'core-cover', title: 'Core rulebook', format: 'core-square', image: 'core-cover.png' },
  { id: 'ixian-cover', title: 'Ixians & Tleilaxu', format: 'expansion-narrow', image: 'ixian-cover.png' },
  { id: 'choam-cover', title: 'CHOAM & Richese', format: 'expansion-narrow', image: 'choam-cover.png' },
  { id: 'ecaz-cover', title: 'Ecaz & Moritani', format: 'expansion-narrow', image: 'ecaz-cover.png' },
] as const;
export const allCases = [...covers, ...prototypePages];
const image = (key: string) => `/components/${key}.jpg`;
const unselected = { status: 'unselected' } as const;

function source(key: string, name: string, assetType = 'card-treachery') {
  return { status: 'ready' as const, reference: { kind: 'asset' as const, assetId: key }, name, assetType, imageUrl: image(key) };
}
function faction(key: string) {
  const data = pkg.items.find(item => item.key === key)!.data as any;
  const stem = key === 'gf9-spacing-guild' ? 'gf9-spacing-guild' : key;
  const member = (m: any, file: string) => ({ status: 'ready', reference: { kind: 'faction-member', factionId: key, memberId: m.memberId }, name: m.name, imageUrl: image(file), width: 600, height: 600 });
  return {
    status: 'ready' as const, factionId: key, name: data.name.replace(/^GF9 /, ''), color: data.themeColor,
    tokenImageUrl: image(`${stem}-faction-token`), token: { logo: data.logo, background: data.background },
    ruler: key === 'gf9-atreides' ? { ...member(data.factionLeader, 'unused'), imageUrl: data.factionLeader.image } : undefined,
    leaders: key === 'gf9-atreides' ? data.leaders.map((m: any) => member(m, `gf9-atreides-leader-${m.name.toLowerCase().replaceAll(' ', '-')}`)) : undefined,
  };
}
function battleSide(key: string, values: typeof battleExample.aggressor | typeof battleExample.defender, role: string) {
  return {
    faction: faction(key), role, revealed: true, dial: values.dial, spice: 0, adjustment: 0,
    leader: { status: 'ready', reference: { kind: 'faction-member', factionId: key, memberId: values.leaderMemberId }, name: values.leader, imageUrl: image(`${key}-leader-${values.leader.toLowerCase().replaceAll(' ', '-')}`), width: 600, height: 600 },
    cards: [source(values.weaponKey + '-front-cardback', values.weaponKey.replace('gf9-', '')), source(values.defenseKey + '-front-cardback', values.defenseKey.replace('gf9-', ''))],
    // Basic play has no support subdivision. Availability and losses stay in the worked example.
    troops: [],
  };
}

export function illustration(pageId: string): RulebookRenderBlockV1 {
  let block: unknown;
  if (pageId === 'core-setup') block = {
    id: 'ART', kind: 'illustrated-inventory', introduction: '', items: [
      { id: 'forces', source: source('gf9-atreides-troop-normal-troop', 'Atreides forces', 'token-disc'), text: 'Forces occupy territories and fight battles.', quantity: 20 },
      { id: 'leader', source: source('gf9-atreides-leader-lady-jessica', 'Lady Jessica', 'token-disc'), text: 'One of five leader discs. Lady Jessica is strength 5.' },
    ],
  };
  else if (pageId === 'core-shipment') block = shipmentIllustration();
  else if (pageId === 'core-battle') block = { id: 'ART', kind: 'battle-plans', left: battleSide('gf9-emperor', battleExample.aggressor, 'Aggressor'), right: battleSide('gf9-spacing-guild', battleExample.defender, 'Defender'), showSideLabels: true };
  else if (pageId === 'core-atreides') block = { id: 'ART', kind: 'faction-introduction', faction: faction('gf9-atreides'), text: 'In the Basic Game, knowledge is your advantage. Inspect cards and ask about an opposing battle plan before committing your own.' };
  else if (pageId === 'ixian-tech') block = { id: 'ART', kind: 'illustrated-inventory', introduction: '', items: [
    ['axlotl-tanks', 'Axlotl Tanks'], ['heighliners', 'Heighliners'], ['spice-production', 'Spice Production'],
  ].map(([key, name]) => ({ id: key, source: { status: 'ready', reference: { kind: 'asset', assetId: `gf9-tech-${key}` }, name, assetType: 'token-disc', imageUrl: `/reference/tech-token-${key}.png`, width: 321, height: 321 }, text: '' })) };
  else block = { id: 'ART', kind: 'card-entry', source: source('gf9-discovery-spice-sihaya-ridge-front-cardback', 'Sihaya Ridge Discovery card', 'card-spice'), size: 'medium', text: 'Spice: Sihaya Ridge. Hiereg token: Cielago East, west sector.' };
  return block as RulebookRenderBlockV1;
}

function blocks(section: PrototypeSection, prefix: string): RulebookRenderBlockV1[] {
  const result: any[] = [{ id: prefix + '-h', kind: 'section-heading', title: section.title, faction: unselected }];
  section.blocks.forEach((block: PrototypeBlock, i) => {
    const id = prefix + '-' + i;
    if (block.kind === 'text') result.push({ id, ...block });
    if (block.kind === 'callout') result.push({ id, ...block, variant: 'note' });
    if (block.kind === 'list') result.push({ id, kind: 'list', style: section.id === 'setup' && prefix.includes('core-setup') ? 'numbered' : 'bulleted', items: block.items.map((text, j) => ({ id: id + '-' + j, text })) });
    if (block.kind === 'table') result.push({ id, kind: 'reference-table', columns: block.columns.map((label, j) => ({ id: 'c' + j, label })), rows: block.rows.map((row, j) => ({ id: id + '-r' + j, cells: row.map((text, k) => ({ columnId: 'c' + k, text })) })), note: '' });
  });
  return result;
}

function pageFixture(id: string, title: string, layoutId: string, regions: Record<string, RulebookRenderBlockV1[]>, controlValues: object = {}): RulebookRenderPageV1 {
  const definition = rulebookLayoutCatalogue.find(layout => layout.id === layoutId)!;
  return rulebookRenderPageV1Schema.parse({ id, anchor: id, title, showHeading: true, layoutId, controlValues, regions: definition.regions.filter(region => region.kind === 'block').map(region => ({ key: region.key, blocks: regions[region.key] ?? [] })) });
}
function refineCPage(input: RulebookRenderPageV1): RulebookRenderPageV1 {
  let page = input;
  if (page.id === 'core-shipment-position') {
    const byId = new Map(page.regions.flatMap(region => region.blocks).map(block => [block.id, block]));
    const pick = (id: string) => byId.get(id)!;
    const named = (id: string, title: string) => ({ ...pick(id), name: title });
    const comparison = (id: string) => {
      const block = pick(id);
      if (block.kind !== 'callout') throw new Error('Collection comparison needs its explanation');
      return { id: block.id, kind: 'text', name: block.title, text: block.text } as RulebookRenderBlockV1;
    };
    page = { ...page, layoutId: 'paired-rows', regions: [
      { key: 'opening', blocks: [named('collect-rule', 'Two collectors, six spice')] },
      { key: 'upperLeft', blocks: [pick('collection-no-city-map'), comparison('collect-four')] },
      { key: 'upperRight', blocks: [pick('collection-city-map'), comparison('collect-six')] },
      { key: 'lowerLeft', blocks: [named('position-text', 'What did you leave behind?'), pick('planning-check')] },
      { key: 'lowerRight', blocks: [named('battle-later', 'Entry is followed by battle'), named('victory-later', 'Hold until the victory check')] },
      { key: 'closing', blocks: [] },
    ] };
  }
  return rulebookRenderPageV1Schema.parse({ ...page, regions: page.regions.map(region => {
    const result: RulebookRenderBlockV1[] = [];
    for (let index = 0; index < region.blocks.length; index++) {
      const block = region.blocks[index];
      if (block.kind !== 'section-heading') { result.push(block); continue; }
      const next = region.blocks[index + 1];
      if (next?.kind === 'text' && !next.name) { result.push({ ...next, name: block.title }); index++; }
      else result.push({ id: block.id, kind: 'text', name: block.title, text: '' });
    }
    return { ...region, blocks: result };
  }) });
}
export function renderPage(caseId: string, variant: Variant): RulebookRenderPageV1 {
  const cover = covers.find(item => item.id === caseId);
  if (cover) return rulebookRenderPageV1Schema.parse({ id: caseId, anchor: caseId, title: cover.title, showHeading: false, layoutId: 'cover', regions: [], controlValues: { cover: { artwork: unselected, backgroundImageUrl: '/reference/' + cover.image, showDuneLogo: false, showSubtitle: false, subtitle: '', supportingText: '' } } });
  const page = prototypePages.find(item => item.id === caseId)!;
  const sections = page.sections.map((section, i) => blocks(section, page.id + '-' + i));
  const art = illustration(caseId);
  if (caseId === 'ixian-tech' && variant === 'C' && art.kind === 'illustrated-inventory') {
    const income = page.sections[1].blocks[0];
    if (income.kind !== 'list') throw new Error('Tech Token income needs one explanation per token');
    const startingHolders = ['Tleilaxu', 'Ixians', 'Fremen'];
    const paired = { ...art, id: 'tech-token-rules', items: art.items.map((item, index) => ({ ...item, text: `Starts with ${startingHolders[index]}. ` + income.items[index].replace(/^(Axlotl Tanks|Heighliners|Spice Production) triggers/, 'Triggers') })) };
    const setup = { id: 'tech-token-setup', kind: 'text', text: "Tech Tokens are an optional module. Keep tokens visible by shields. After the first storm movement, assign absent factions' tokens at random to the next factions in turn order without one." } as RulebookRenderBlockV1;
    return pageFixture(caseId, page.title, 'single-column', { content: [sections[0][0], setup, sections[1][0], paired, ...sections[1].slice(2), ...sections[2]] });
  }
  if (caseId === 'core-battle') {
    if (variant === 'C') return pageFixture(caseId, page.title, 'two-columns', { column1: sections.slice(0, 2).flat(), column2: [art, ...sections[2]] });
    return pageFixture(caseId, page.title, 'two-columns', { column1: [art, ...sections[0]], column2: sections.slice(1).flat() });
  }
  if (page.format === 'expansion-narrow') {
    if (variant === 'A') return pageFixture(caseId, page.title, 'single-column', { content: [art, ...sections.flat()] });
    if (variant === 'B') return pageFixture(caseId, page.title, 'single-column', { content: [...sections[0], art, ...sections.slice(1).flat()] });
    return pageFixture(caseId, page.title, 'content-strip', { content: sections.flat(), strip: [art] });
  }
  if (variant === 'A') {
    if (caseId === 'core-setup') return pageFixture(caseId, page.title, 'wide-narrow', { wide: sections.slice(1).flat(), narrow: [art, ...sections[0]] }, { widePosition: 'right' });
    if (caseId === 'core-shipment') return pageFixture(caseId, page.title, 'two-columns', { column1: [art, ...sections.slice(0, 2).flat()], column2: sections.slice(2).flat() });
    return pageFixture(caseId, page.title, 'band-columns', { band: [art], column1: sections.slice(0, Math.ceil(sections.length / 2)).flat(), column2: sections.slice(Math.ceil(sections.length / 2)).flat() }, { bandPosition: 'top' });
  }
  if (variant === 'B') {
    const split = Math.ceil(sections.length / 2);
    return pageFixture(caseId, page.title, 'band-columns', { band: [art], column1: sections.slice(0, split).flat(), column2: sections.slice(split).flat() }, { bandPosition: 'top' });
  }
  if (caseId === 'core-atreides') return pageFixture(caseId, page.title, 'band-columns', { band: [art], column1: [...sections[0], ...sections[3]], column2: [...sections[1], ...sections[2]] }, { bandPosition: 'bottom' });
  const split = Math.ceil(sections.length / 2);
  return pageFixture(caseId, page.title, 'band-columns', { band: [art], column1: sections.slice(0, split).flat(), column2: sections.slice(split).flat() }, { bandPosition: 'bottom' });
}

export function renderPages(caseId: string, variant: Variant): RulebookRenderPageV1[] {
  if (caseId === 'core-shipment' && variant === 'C') return shipmentWalkthrough().map(refineCPage);
  const page = prototypePages.find(item => item.id === caseId);
  if (caseId === 'ecaz-discovery' && page) {
    const sections = page.sections.map((section, i) => blocks(section, page.id + '-' + i));
    const token = { id: 'CIST', kind: 'illustrated-inventory', introduction: '', items: [
      { id: 'hidden', source: source('gf9-discovery-cistern-authored-back', 'Hidden Hiereg token', 'token-disc'), text: '' },
      { id: 'revealed', source: source('gf9-discovery-cistern-front-cardback', 'Cistern revealed', 'token-disc'), text: '' },
    ] } as RulebookRenderBlockV1;
    const pages = [
      pageFixture(caseId, page.title, 'single-column', { content: variant === 'C' ? [
        { ...illustration(caseId), id: 'discovery-illustrated-rule', name: page.sections[0].title, text: 'Discovery is an optional module. ' + page.sections[0].blocks.flatMap(block => block.kind === 'text' ? [block.text] : block.kind === 'callout' ? [`${block.title}. ${block.text}`] : []).join('\n\n') } as RulebookRenderBlockV1,
      ] : variant === 'A' ? [illustration(caseId), ...sections[0]] : [...sections[0], illustration(caseId)] }),
      pageFixture(caseId + '-continued', 'Enter the revealed location', 'single-column', { content: [...sections.slice(1).flat(), token] }),
    ];
    return variant === 'C' ? pages.map(refineCPage) : pages;
  }
  if (caseId === 'core-battle' && variant === 'B' && page) {
    const sections = page.sections.map((section, i) => blocks(section, page.id + '-' + i));
    return [
      pageFixture(caseId, 'Reveal the two plans', 'single-column', { content: [sections[0][0], sections[0][1], sections[0][2], illustration(caseId)] }),
      pageFixture(caseId + '-continued', 'Resolve weapons and losses', 'two-columns', { column1: [sections[0][3], ...sections[1]], column2: sections[2] }),
    ];
  }
  const renderedPage = renderPage(caseId, variant);
  return [variant === 'C' ? refineCPage(renderedPage) : renderedPage];
}

export function settingsFor(caseId: string) {
  const item = allCases.find(item => item.id === caseId)!;
  return { size: item.format === 'core-square' ? 'gf9-core-prototype' : 'gf9-expansion-prototype', design: 'restrained' } as const;
}
export const referenceImage = (caseId: string) => ({ 'core-setup': 'core-components', 'core-shipment': 'core-movement', 'core-battle': 'core-battle', 'core-atreides': 'core-faction', 'ixian-tech': 'ixian-tech', 'ecaz-discovery': 'ecaz-discovery' }[caseId] ?? caseId);
