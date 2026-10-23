import { readFileSync } from 'node:fs';

import type { RulebookBattleSideValue } from '../../../src/shared/rulebooks/battleStep';

/** Source-specific compositions. This changes the local document, never application records. */
export function compose({ allPages, contents, pageMap, unitMap, editorial, id, formatted, bindings }: any) {
  const cards = JSON.parse(readFileSync(`${import.meta.dirname}/../components/production-cards.json`, 'utf8'));
  const cardSource = (key: string) => ({ kind: 'asset' as const, assetId: cards[key].assetId });
  const stock = (name: string) => ({ kind: 'existing-component', name });
  const faction = (name: string) =>
    Object.values(bindings.factions).find((f: any) => f.sourceHeading.toLowerCase() === name.toLowerCase()) as any;
  const rawUnits = (n: number) => unitMap.filter((u: any) => u.sourcePage === n);
  const pageBlocks = (page: any) =>
    Object.values(page.blockOrderByRegion)
      .flat()
      .map((key: any) => page.blocksById[key]);
  const sourceIndex = (u: any) => Number(u.key.split('-').at(-1));
  const newBlock = (key: string, value: any) => ({ id: id(`composition-${key}`), ...value });
  const illustration = (key: string, source: any, caption = '', size = 'large') => {
    if (source.kind === 'existing-component') {
      if (source.name.startsWith('wheel-')) {
        const value = Number(source.name.slice(6).replace('-', '.'));
        const f = faction(value === 6 ? 'Atreides' : 'Emperor');
        const side = (dial: number, spice: number, adjustment = 0) => ({
          factionId: f.id,
          role: '',
          revealed: true,
          dial,
          spice,
          adjustment,
          leader: { kind: 'stock', artworkId: f.emblem },
          cards: [],
          troops: [],
        });
        return newBlock(key, {
          kind: 'battle-plans',
          left: side(value, value === 6 ? 4 : 0, value === 6 ? 2 : 0),
          right: side(value === 2.5 ? 4.5 : value === 8.5 ? 8 : value, 0),
          showSideLabels: false,
        });
      }
      return newBlock(key, {
        kind: 'callout',
        variant: 'example',
        title: 'House Atreides faction sheet',
        text: source.name.endsWith('header')
          ? '*At start:* 10 forces in Arrakeen, 10 forces in reserves (off\\-planet).\n\n*Starting Treachery cards:* 1.\n\n*Starting spice:* 10.\n\n*Free force revivals:* 2.'
          : '*Free force revivals: 2*\n\nHouse Atreides can revive 2 forces for free each turn. They can revive an additional force for 2 spice, for a total of 3 forces for the round.',
      });
    }
    return newBlock(key, { kind: 'referenced-illustration', source, caption, size });
  };
  const text = (key: string, name: string, value: string) =>
    newBlock(key, { kind: 'text', ...(name ? { name } : {}), text: formatted(value) });
  const sentenceCase = (value: string) => {
    let result = value.charAt(0) + value.slice(1).toLowerCase();
    for (const name of [
      'Bene Gesserit',
      'Spacing Guild',
      'Atreides',
      'Harkonnen',
      'Fremen',
      'Emperor',
      'Dune',
      'CHOAM',
      'Karama',
      'Solaris',
      'Tleilaxu',
      'Kwisatz Haderach',
      'Golden Path',
      'War Machine',
      'Bless The Maker',
    ]) {
      result = result.replace(new RegExp(name, 'gi'), name);
    }
    return result;
  };
  const replacements: any[] = [];
  const output: any[] = [];
  const addPage = (
    original: any,
    blocks: any[],
    layout = 'two-columns',
    title = original.title,
    showHeading = original.showHeading,
    rail: any[] = []
  ) => {
    const index = output.filter((x) => x.sourcePage === original.sourcePage).length;
    const pageId = index === 0 ? original.page.id : id(`composition-page-${original.sourcePage}-${index}`);
    const p = {
      ...original.page,
      id: pageId,
      title,
      showHeading,
      layoutId: layout,
      controlValues: {},
      blocksById: Object.fromEntries([...blocks, ...rail].map((b) => [b.id, b])),
      blockOrderByRegion: {},
    } as any;
    const regions: any =
      layout === 'single-column'
        ? { content: blocks.map((b) => b.id) }
        : layout === 'outer-rail'
          ? { rail: rail.map((b) => b.id), column1: [], column2: [] }
          : { column1: [], column2: [] };
    if (layout !== 'single-column') {
      const weight = (b: any) =>
        JSON.stringify(b).length +
        (b.kind === 'referenced-illustration' ? 1800 : b.kind === 'faction-introduction' ? 2300 : 100);
      const total = blocks.reduce((s, b) => s + weight(b), 0);
      let sum = 0;
      for (const b of blocks) {
        regions[sum < total / 2 ? 'column1' : 'column2'].push(b.id);
        sum += weight(b);
      }
      const last = regions.column1.at(-1);
      if (last && p.blocksById[last].kind === 'text' && !p.blocksById[last].text) {
        regions.column1.pop();
        regions.column2.unshift(last);
      }
    }
    p.blockOrderByRegion = regions;
    if (index) {
      p.anchor = `${original.page.anchor}-part-${index + 1}`;
    }
    output.push({ page: p, sourcePage: original.sourcePage });
    for (const u of unitMap) {
      if (blocks.some((b) => b.id === u.blockId) || rail.some((b) => b.id === u.blockId)) {
        u.pageId = pageId;
      }
    }
    return p;
  };
  const mapReplacement = (n: number, from: number, to: number, block: any, reason: string) => {
    const units = rawUnits(n).filter((u: any) => sourceIndex(u) >= from && sourceIndex(u) <= to);
    for (const u of units) {
      u.blockId = block.id;
      u.presentation = 'illustration';
    }
    replacements.push({ sourcePage: n, from, to, blockId: block.id, reason });
  };
  const removeRange = (blocks: any[], n: number, from: number, to: number, replacement?: any) => {
    const affected = rawUnits(n).filter((u: any) => sourceIndex(u) >= from && sourceIndex(u) <= to);
    const targets = new Set(affected.map((u: any) => u.blockId));
    // Merged prose blocks can cross a boundary. Rebuild their surviving paragraphs explicitly.
    const result = [];
    for (const b of blocks) {
      if (!targets.has(b.id)) {
        result.push(b);
        continue;
      }
      const survivors = rawUnits(n).filter(
        (u: any) => u.blockId === b.id && !u.presentation && (sourceIndex(u) < from || sourceIndex(u) > to)
      );
      if (survivors.length) {
        const heading = survivors.find((u: any) => /^(### |\*\*[^*]+\*\*$)/.test(u.text));
        const copy = {
          id: b.id,
          kind: 'text',
          ...(heading
            ? {
                name: heading.text
                  .replace(/^### /, '')
                  .replaceAll('**', '')
                  .toLowerCase()
                  .replace(/^./, (x: string) => x.toUpperCase()),
              }
            : {}),
          text: formatted(
            survivors
              .filter((u: any) => u !== heading)
              .map((u: any) => u.text)
              .join('\n\n')
          ),
        };
        result.push(copy);
      }
    }
    if (replacement) {
      mapReplacement(
        n,
        from,
        to,
        replacement,
        'Printed component lettering is represented by the complete illustration.'
      );
    } else {
      for (const u of affected) {
        editorial.push({
          sourcePage: n,
          key: u.key,
          text: u.text,
          reason: 'Editorial description of the adjacent illustration.',
        });
        u.presentation = 'editorial';
      }
    }
    return result;
  };
  const troop = (name: string, count: number, x: number, y: number, special = false, face = 'front') => {
    const f = faction(name);
    const ts = bindings.resolvedFactions[f.id]?.troops ?? [];
    const t = ts.find((t: any) => Boolean(t.star) === special) ?? ts[0];
    return {
      id: id(`troop-${name}-${x}-${y}-${count}-${special}`),
      factionId: f.id,
      troopId: t?.troopId,
      face,
      count,
      x,
      y,
      columns: Math.min(count, 5),
      size: 0.045,
      gap: 0.006,
    };
  };
  const map = (key: string, caption: string, options: any = {}) =>
    newBlock(key, {
      kind: 'board-scene',
      boardId: 'arrakis',
      caption,
      size: 'fit-width',
      players: [],
      troops: [],
      highlights: [],
      routes: [],
      annotations: [],
      ...options,
    });
  const route = (key: string, label: string, territories: string[]) => ({
    id: key,
    label,
    direction: 'forward',
    showWaypoints: false,
    waypoints: territories.map((territory) => ({ territory })),
  });
  const mark = (key: string, title: string, x: number, y: number, targetX = x, targetY = y) => ({
    id: key,
    title,
    text: '',
    x,
    y,
    targetX,
    targetY,
  });
  const portrait = (name: string, who: string) => {
    const f = faction(name);
    const resolved = bindings.resolvedFactions[f.id];
    return [resolved?.ruler, ...(resolved?.leaders ?? [])].find((m: any) => m?.name?.includes(who))?.reference;
  };
  const battleSide = (
    name: string,
    dial: number,
    spice: number,
    who: string,
    keys: string[],
    count: number
  ): RulebookBattleSideValue => ({
    factionId: faction(name).id,
    role: name,
    revealed: true,
    dial,
    spice,
    ...(portrait(name, who) ? { leader: portrait(name, who) } : {}),
    cards: keys.map(cardSource),
    troops: [
      {
        id: 'forces',
        troopId: bindings.resolvedFactions[faction(name).id]?.troops?.[0]?.troopId,
        face: 'front',
        supported: count,
        unsupported: 0,
        uncommitted: 0,
      },
    ],
  });

  for (const original of allPages) {
    const n = original.sourcePage;
    const page = original.page;
    original.title = page.title;
    original.showHeading = ![15, 17, 18, 24, 29, 35].includes(n) && page.showHeading;
    let blocks = pageBlocks(page);
    // Small subheadings use the existing text heading, whose case is authored.
    blocks = blocks.map((b: any) => {
      if (b.kind === 'section-heading') {
        return { ...text(`heading-${b.id}`, sentenceCase(b.title), '') };
      }
      if (b.kind === 'text' && b.name) {
        b.name = sentenceCase(b.name);
      }
      if (b.kind === 'credits') {
        return text(
          `credit-${b.id}`,
          b.groupsById.credit.heading
            .replace(/:$/, '')
            .toLowerCase()
            .replace(/^./, (s: string) => s.toUpperCase()),
          b.groupsById.credit.contributorOrder
            .map((k: string) => b.groupsById.credit.contributorsById[k].name)
            .join('\n\n')
        );
      }
      return b;
    });
    // Maintain the old identity for every transformed block so source links remain exact.
    const before = pageBlocks(page);
    for (let j = 0; j < blocks.length; j++) {
      if (blocks[j].id !== before[j].id) {
        const newId = blocks[j].id;
        blocks[j].id = before[j].id;
        for (const u of unitMap) {
          if (u.blockId === newId) {
            u.blockId = blocks[j].id;
          }
        }
      }
    }
    for (const b of blocks) {
      if (b.kind === 'callout' && b.title) {
        b.title = sentenceCase(b.title);
      }
    }
    // Complete cards replace isolated decals plus their duplicate miniature lettering.
    for (const b of blocks) {
      if (b.kind === 'card-entry') {
        const name = (b.name ?? '').toLowerCase().replaceAll(' ', '-');
        const key =
          name === 'the-great-flat'
            ? 'great-flat-cielago-south'
            : name === 'spice-blows'
              ? 'great-flat-cielago-south'
              : name;
        if (!cards[key]) {
          throw Error(`Missing full card: ${name}`);
        }
        Object.assign(b, { kind: 'referenced-illustration', source: cardSource(key), caption: '', size: 'medium' });
        delete b.name;
        delete b.text;
        delete b.textFlow;
      }
    }
    if (n === 1) {
      const p = addPage(original, [], 'single-column', 'RULEBOOK', true);
      p.layoutId = 'cover';
      p.blockOrderByRegion = {};
      p.controlValues = {
        cover: {
          backgroundSource: { kind: 'url' },
          backgroundImage: JSON.parse(
            readFileSync(`${import.meta.dirname}/../components/production-cover.json`, 'utf8')
          ),
          backgroundImageUrl:
            'https://dune.zone/__media/src/2dd57d692933e19797bcaaaed6c84257c9f0d7e1ca0e0aef5821c12c5f3996d9',
          showDuneLogo: true,
          showSubtitle: true,
          subtitle: 'SECOND EDITION',
          supportingText: 'THE SPICE MUST FLOW\nA GAME OF CONQUEST, DIPLOMACY & BETRAYAL\nGF9 · LEGENDARY',
        },
      };
      for (const u of rawUnits(n)) {
        u.pageId = p.id;
        u.field = 'cover';
        delete u.blockId;
      }
      continue;
    }
    if (n === 3) {
      const credits = blocks.findIndex((b: any) => b.name === 'Credits');
      addPage(original, blocks.slice(0, credits));
      const p = addPage(original, blocks.slice(credits + 1), 'two-columns', 'Credits', true);
      const u = rawUnits(n).find((u: any) => sourceIndex(u) === 13);
      u.field = 'title';
      u.pageId = p.id;
      delete u.blockId;
      continue;
    }
    if (n === 4 || n === 5) {
      const names = n === 4 ? ['Atreides', 'Bene Gesserit', 'Emperor', 'Fremen'] : ['Spacing Guild', 'Harkonnen'];
      const profiles = names.map((name, index) => {
        const key = name.toLowerCase().replaceAll(' ', '-');
        const selected = bindings.overviewFactions[key];
        const starts = n === 4 ? [2, 11, 20, 29] : [0, 9];
        const from = starts[index];
        const to = (starts[index + 1] ?? (n === 4 ? 38 : 18)) - 1;
        const description = rawUnits(n).find((u: any) => sourceIndex(u) === from + 1);
        const block = newBlock(`overview-row-${key}`, {
          kind: 'faction-introduction',
          factionId: selected.id,
          text: formatted(description.text),
        });
        mapReplacement(
          n,
          from,
          to,
          block,
          'Native Faction introduction row; second-edition roster and labelled portrait placeholders.'
        );
        return block;
      });
      const p = addPage(original, profiles, n === 4 ? 'sequence' : 'paired-rows', 'Faction overview', n === 4);
      p.id = id(`overview-page-${n}`);
      p.blocksById = Object.fromEntries(profiles.map((b: any) => [b.id, b]));
      delete p.headingIcon;
      if (n === 4) {
        const u = rawUnits(n).find((u: any) => sourceIndex(u) === 1);
        const intro = text('overview-introduction', '', u.text);
        p.blocksById[intro.id] = intro;
        p.blockOrderByRegion = { content: [intro.id, ...profiles.map((b: any) => b.id)] };
        u.blockId = intro.id;
      } else {
        const heading = newBlock('objective-heading', { kind: 'section-heading', title: 'Object of the game' });
        p.blocksById[heading.id] = heading;
        const objective = rawUnits(n)
          .filter((u: any) => sourceIndex(u) >= 19)
          .map((u: any) => {
            const block = text(`objective-${u.key}`, '', u.text);
            p.blocksById[block.id] = block;
            u.blockId = block.id;
            return block;
          });
        p.blockOrderByRegion = {
          opening: [...profiles.map((b: any) => b.id), heading.id],
          upperLeft: objective.slice(0, 4).map((b: any) => b.id),
          upperRight: objective.slice(4).map((b: any) => b.id),
          lowerLeft: [],
          lowerRight: [],
          closing: [],
        };
        const u = rawUnits(n).find((u: any) => sourceIndex(u) === 18);
        u.field = 'heading';
        u.blockId = heading.id;
      }
      for (const u of rawUnits(n)) {
        u.pageId = p.id;
      }
      continue;
    }
    if (n === 6) {
      const terrain = blocks.find((b: any) => b.kind === 'asset-explainer');
      if (terrain) {
        terrain.kind = 'list';
        terrain.style = 'bulleted';
        delete terrain.source;
        delete terrain.caption;
        delete terrain.numbering;
        delete terrain.colorMode;
        for (const item of Object.values(terrain.itemsById) as any[]) {
          delete item.label;
          delete item.target;
        }
      }
      blocks = blocks.filter((b: any) => b.kind !== 'battle-plans');
      blocks = removeRange(blocks, n, 13, 30);
      const source = { kind: 'board', boardId: 'arrakis' };
      const targets = [
        ['Sand', 'hagga-basin'],
        ['Strongholds', 'arrakeen'],
        ['Rock', 'shield-wall'],
        ['Polar Sink', 'polar'],
      ];
      const explainer = newBlock('board-parts', {
        kind: 'asset-explainer',
        source,
        caption: '',
        numbering: 'automatic',
        colorMode: 'automatic',
        itemOrder: targets.map((_, i) => `part-${i}`),
        itemsById: Object.fromEntries(
          targets.map(([name, key], i) => [
            `part-${i}`,
            { id: `part-${i}`, label: String(i + 1), text: name, target: { kind: 'named', source, key } },
          ])
        ),
      });
      const labels = text(
        'board-reference-labels',
        '',
        'Round track · Spice Blow · Territory · Tleilaxu Tanks · Longitude lines · Sector · Spice Bank · Player circles'
      );
      const boundary = blocks.findIndex((b: any) => b.name === 'Battle wheels');
      const left = blocks.slice(0, boundary);
      const right = [explainer, labels, ...blocks.slice(boundary), illustration('wheel-assembly', stock('wheel-0'))];
      const p = addPage(original, [...left, ...right]);
      p.blockOrderByRegion = { column1: left.map((b: any) => b.id), column2: right.map((b: any) => b.id) };
      continue;
    }
    if (n === 8) {
      const sheet = illustration('setup-header', stock('atreides-header'));
      blocks = removeRange(blocks, n, 34, 38, sheet);
      blocks.push(sheet);
    }
    if (n === 9) {
      const units = rawUnits(n);
      const intro = units
        .filter((u: any) => sourceIndex(u) > 0 && sourceIndex(u) < 4)
        .map((u: any) => {
          const b = text(`sequence-intro-${u.key}`, '', u.text);
          u.blockId = b.id;
          return b;
        });
      const icons = [
        'storm_disc',
        'spice-blow_disc',
        'spice',
        'bidding_disc',
        'revival',
        'shipment_disc',
        'combat_disc',
        'collection_disc',
        'mentat',
      ];
      const starts = units.filter((u: any) => /^### \d+\./.test(u.text));
      const lists = starts.map((heading: any, j: number) => {
        const begin = sourceIndex(heading);
        const end = starts[j + 1] ? sourceIndex(starts[j + 1]) : 999;
        const body = units.filter((u: any) => sourceIndex(u) > begin && sourceIndex(u) < end);
        const key = 'phase-' + j;
        const b = newBlock(key, {
          kind: 'list',
          style: 'numbered',
          start: j + 1,
          itemOrder: [key],
          itemsById: {
            [key]: {
              id: key,
              icon: `/vector/icon/${icons[j]}.svg`,
              name: heading.text
                .replace(/^### \d+\. /, '')
                .toLowerCase()
                .replace(/^./, (x: string) => x.toUpperCase()),
              text: formatted(body.map((u: any) => u.text).join('\n\n')),
            },
          },
        });
        mapReplacement(n, begin, end - 1, b, 'Existing phase icon and the complete phase description.');
        return b;
      });
      addPage(original, [...intro, ...lists]);
      continue;
    }
    if (n === 10) {
      blocks = removeRange(blocks, n, 18, 18);
      blocks = removeRange(blocks, n, 20, 20);
      const examples = blocks.findIndex((b: any) => b.name === 'Storm movement examples');
      const obstruction = blocks.findIndex((b: any) => b.name === 'Obstruction');
      const tail = blocks.slice(obstruction, examples);
      addPage(original, blocks.slice(0, obstruction));
      const first = map('storm-pasty', '', {
        viewport: { x: 0.56, y: 0.28, width: 0.5, height: 0.4 },
        storm: { angle: 0 },
        troops: [troop('Atreides', 1, 0.82, 0.59)],
        routes: [
          {
            id: 'free-move',
            label: 'Movement outside the storm',
            direction: 'forward',
            showWaypoints: false,
            waypoints: [{ position: { x: 0.82, y: 0.59 } }, { position: { x: 0.65, y: 0.58 } }],
          },
          {
            id: 'blocked-move',
            label: 'Cannot cross the storm',
            direction: 'forward',
            showWaypoints: false,
            blockedAfter: 0,
            waypoints: [{ position: { x: 0.65, y: 0.58 } }, { position: { x: 0.67, y: 0.4 } }],
          },
        ],
        annotations: [mark('spice', '3 + 5 spice', 0.61, 0.34, 0.67, 0.4)],
        highlights: [{ territory: 'pasty-mesa', color: '#668c42', opacity: 0.25 }],
      });
      const second = map('storm-plastic', '', {
        viewport: { x: 0.05, y: 0.05, width: 0.57, height: 0.5 },
        storm: { angle: 130 },
        troops: [troop('Fremen', 1, 0.25, 0.35), troop('Harkonnen', 1, 0.35, 0.19)],
        annotations: [mark('storm', 'Storm', 0.29, 0.15)],
      });
      first.caption = rawUnits(n).find((u: any) => sourceIndex(u) === 17).text;
      second.caption = rawUnits(n).find((u: any) => sourceIndex(u) === 19).text;
      mapReplacement(n, 17, 17, first, 'Caption beside the first map.');
      mapReplacement(n, 19, 19, second, 'Caption beside the second map.');
      const p = addPage(original, [...tail, first, second], 'two-columns', 'Storm movement examples', true);
      const u = rawUnits(n).find((u: any) => sourceIndex(u) === 16);
      u.field = 'title';
      u.pageId = p.id;
      delete u.blockId;
      continue;
    }
    if (n === 11) {
      const card = illustration('hagga-example', cardSource('hagga-basin-cielago-depression'), '', 'medium');
      blocks = removeRange(blocks, n, 8, 13, card);
      const at = blocks.findIndex((b: any) => (b.text ?? '').includes('Example: If this card'));
      blocks.splice(at, 0, card);
      const rail = blocks.filter((b: any) => b.kind === 'referenced-illustration' && b.id !== card.id);
      for (const b of rail) {
        b.size = 'small';
      }
      addPage(
        original,
        blocks.filter((b: any) => !rail.includes(b)),
        'outer-rail',
        page.title,
        true,
        rail
      );
      continue;
    }
    if (n === 13) {
      const sheet = illustration('revival-sheet', stock('atreides-sheet'));
      blocks = removeRange(blocks, n, 13, 17, sheet);
      blocks = removeRange(blocks, n, 29, 30);
      blocks.splice(0, 0, sheet);
    }
    if (n === 14) {
      blocks = removeRange(blocks, n, 17, 17);
      const at = blocks.findIndex((b: any) => b.name === 'Ornithopters');
      blocks.splice(
        at + 2,
        0,
        map('ornithopters', 'Ornithopter icons', {
          viewport: { x: 0.35, y: 0, width: 0.42, height: 0.35 },
          annotations: [
            mark('arr', 'Arrakeen', 0.68, 0.08, 0.655, 0.147),
            mark('car', 'Carthag', 0.43, 0.28, 0.486, 0.184),
          ],
        })
      );
    }
    if (n === 15) {
      blocks = blocks.filter((b: any) => b.kind !== 'board-scene');
      blocks = removeRange(blocks, n, 9, 9);
      blocks = removeRange(blocks, n, 14, 16);
      addPage(
        original,
        blocks.slice(
          0,
          blocks.findIndex((b: any) => b.name === 'House harkonnen shipment and movement example')
        )
      );
      const hk = blocks.findIndex((b: any) => b.name === 'House harkonnen shipment and movement example');
      const guild = blocks.findIndex((b: any) => b.name === 'Spacing guild movement example');
      addPage(
        original,
        [
          ...blocks.slice(hk, guild),
          map('harkonnen-before', 'Force Shipment: 4 + 5 = 9 forces in Carthag.', {
            viewport: { x: 0.35, y: 0, width: 0.42, height: 0.35 },
            troops: [
              { ...troop('Harkonnen', 9, 0.485, 0.215), size: 0.02, gap: 0.002 },
              { ...troop('Fremen', 4, 0.47, 0.155), size: 0.02, gap: 0.002, columns: 2 },
              { ...troop('Atreides', 3, 0.655, 0.12), size: 0.02, gap: 0.002 },
            ],
          }),
          map('harkonnen-after', 'Force Movement: 3 move to Arrakeen; 6 remain in Carthag.', {
            viewport: { x: 0.35, y: 0, width: 0.42, height: 0.35 },
            troops: [
              { ...troop('Harkonnen', 6, 0.485, 0.215), size: 0.02, gap: 0.002, columns: 3 },
              { ...troop('Harkonnen', 3, 0.655, 0.17), size: 0.02, gap: 0.002 },
              { ...troop('Fremen', 4, 0.47, 0.155), size: 0.02, gap: 0.002, columns: 2 },
              { ...troop('Atreides', 3, 0.655, 0.12), size: 0.02, gap: 0.002 },
            ],
            routes: [route('move', '3 forces', ['carthag', 'arrakeen'])],
          }),
        ],
        'two-columns',
        'Shipment and movement examples',
        true
      );
      addPage(
        original,
        [
          ...blocks.slice(guild),
          map('guild-movement', '', {
            storm: { angle: 90 },
            troops: [
              troop('Spacing Guild', 1, 0.65, 0.17),
              { ...troop('Atreides', 5, 0.64, 0.12), size: 0.025, gap: 0.002 },
              troop('Bene Gesserit', 1, 0.486, 0.184),
              { ...troop('Spacing Guild', 6, 0.716, 0.76), size: 0.025, gap: 0.002, columns: 3 },
              troop('Spacing Guild', 1, 0.864, 0.707),
            ],
            routes: [
              route('guild', 'Ornithopter movement', ['tueks', 'false-wall-south', 'cielago-east', 'cielago-south']),
            ],
            annotations: [
              mark('spice', '2 + 10 spice', 0.6, 0.93, 0.545, 0.915),
              mark('storm', 'Storm prevents shipment to Carthag', 0.43, 0.05, 0.486, 0.184),
            ],
          }),
        ],
        'single-column',
        'Spacing Guild movement example',
        true
      );
      continue;
    }
    if (n === 17) {
      blocks = removeRange(blocks, n, 0, -1); // No-op; all rule prose remains.
      const wheel = illustration(
        'spice-bonus-wheel',
        stock('wheel-6'),
        '6 force strength + 2 spice strength (4 spice).'
      );
      blocks = removeRange(blocks, n, 28, 30, wheel);
      addPage(original, [...blocks, wheel]);
      continue;
    }
    if (n === 18 || n === 19) {
      blocks = blocks.filter((b: any) => b.kind !== 'battle-plans');
      blocks = removeRange(blocks, n, n === 18 ? 30 : 36, n === 18 ? 32 : 38);
      const emperor = battleSide('Emperor', 6, 4, 'Hasimir', ['baliset', 'snooper'], 0);
      emperor.adjustment = 2;
      emperor.troops = [];
      const atreides = battleSide('Atreides', 4, 0, 'Jessica', ['maula-pistol'], 0);
      atreides.troops = [];
      if (n === 18) {
        atreides.revealed = false;
        atreides.cards = [];
        delete atreides.leader;
      } else {
        emperor.leaderKilled = true;
      }
      emperor.role = '';
      atreides.role = '';
      const start = n === 18 ? 12 : 21,
        end = n === 18 ? 18 : 29;
      const example = rawUnits(n).filter((u: any) => sourceIndex(u) >= start && sourceIndex(u) <= end);
      const b = newBlock(`battle-${n}`, {
        kind: 'battle-step',
        step: '',
        title: n === 18 ? 'Emperor Battle Plan' : 'House Atreides Battle Plan',
        caption: example
          .filter((u: any) => sourceIndex(u) >= (n === 18 ? 14 : 22) && sourceIndex(u) <= (n === 18 ? 18 : 25))
          .map((u: any) => u.text)
          .join('\n\n'),
        left: emperor,
        right: atreides,
        showSideLabels: true,
      });
      blocks = removeRange(blocks, n, start, end, b);
      const leftCard = illustration(
        `battle-card-left-${n}`,
        cardSource(n === 18 ? 'baliset' : 'maula-pistol'),
        '',
        'medium'
      );
      const rightCard = n === 18 ? illustration('battle-snooper', cardSource('snooper'), '', 'medium') : undefined;
      blocks = removeRange(blocks, n, n === 18 ? 19 : 30, n === 18 ? 23 : 35, leftCard);
      if (rightCard) {
        blocks = removeRange(blocks, n, 24, 29, rightCard);
      }
      blocks = blocks.filter((block: any) => block.kind !== 'referenced-illustration');
      addPage(original, blocks);
      const resolution =
        n === 19
          ? text(
              'battle-resolution',
              'Battle resolution',
              example
                .filter((u: any) => sourceIndex(u) >= 27)
                .map((u: any) => u.text)
                .join('\n\n')
            )
          : undefined;
      if (resolution) {
        mapReplacement(n, 26, 29, resolution, 'Regular-weight result beside the plan and card.');
      }
      const p = addPage(
        original,
        [b, leftCard, ...(rightCard ? [rightCard] : []), ...(resolution ? [resolution] : [])],
        'single-column',
        n === 18 ? 'Example of a battle' : 'Battle result',
        true
      );
      p.layoutId = 'paired-rows';
      p.blockOrderByRegion = {
        opening: [b.id],
        upperLeft: [leftCard.id],
        upperRight: rightCard ? [rightCard.id] : resolution ? [resolution.id] : [],
        lowerLeft: [],
        lowerRight: [],
        closing: [],
      };
      continue;
    }

    if (n === 20) {
      blocks = removeRange(blocks, n, 6, 7);
      blocks = blocks.filter((b: any) => b.kind !== 'board-scene');
      const at = blocks.findIndex((b: any) => /mentat/i.test(b.name ?? ''));
      const scene = map('collection', '', {
        viewport: { x: 0.3, y: 0, width: 0.7, height: 1 },
        highlights: ['arrakeen', 'carthag', 'tueks'].map((territory) => ({
          territory,
          color: '#ba913b',
          opacity: 0.3,
        })),
        annotations: [
          mark('carry', 'Carryalls', 0.7, 0.05, 0.655, 0.147),
          mark('income', 'Stronghold income', 0.94, 0.82, 0.864, 0.707),
          mark('carthag', 'Carryalls and stronghold income', 0.34, 0.3, 0.486, 0.184),
        ],
      });
      blocks.splice(at < 0 ? blocks.length : at, 0, scene);
      for (const u of rawUnits(n).filter((u: any) => /^(Map (?:labels|annotation)|Illustration)/.test(u.text))) {
        blocks = removeRange(blocks, n, sourceIndex(u), sourceIndex(u), scene);
      }
    }
    if (n === 23 || n === 24 || n === 25) {
      const unit = (index: number) => rawUnits(n).find((u: any) => sourceIndex(u) === index)!;
      const prose = (key: string, indices: number[], name = '') => {
        const b = text(key, name, indices.map((i) => unit(i).text).join('\n\n'));
        for (const i of indices) {
          unit(i).blockId = b.id;
        }
        return b;
      };
      const guide = (key: string, card: string, name: string, indices: number[]) => {
        const b = newBlock(key, {
          kind: 'card-entry',
          name,
          source: cardSource(card),
          size: 'medium',
          textFlow: 'wrap',
          text: formatted(indices.map((i) => unit(i).text).join('\n\n')),
        });
        for (const i of indices) {
          unit(i).blockId = b.id;
        }
        return b;
      };
      if (n === 23) {
        const weapons = prose('weapons-defense', [3, 4], 'Weapons and defenses');
        mapReplacement(n, 2, 2, weapons, 'Section heading.');
        const pair = newBlock('weapons-pair', {
          kind: 'card-group',
          title: '',
          text: '',
          variant: 'gallery',
          itemOrder: ['crysknife', 'snooper'],
          itemsById: {
            crysknife: { id: 'crysknife', source: cardSource('crysknife'), text: '' },
            snooper: { id: 'snooper', source: cardSource('snooper'), text: '' },
          },
        });
        mapReplacement(n, 5, 16, pair, 'Full weapon and defense cards.');
        const action = guide('action-ghola', 'tleilaxu-ghola', 'Actions', [18]);
        mapReplacement(n, 17, 23, action, 'Action explanation beside the full card.');
        const worthless = guide('worthless-kulon', 'kulon', 'Worthless', [25]);
        mapReplacement(n, 24, 30, worthless, 'Worthless explanation beside the full card.');
        addPage(original, [prose('treachery-intro', [1]), weapons, pair, action, worthless]);
        continue;
      }
      if (n === 24) {
        const shield = prose('shield-wall', [1], 'Shield Wall');
        mapReplacement(n, 0, 0, shield, 'Section heading.');
        const family = illustration('family-card', cardSource('family-atomics'), '', 'medium');
        mapReplacement(n, 2, 7, family, 'Full Family Atomics card.');
        const destroyed = map('destroyed-wall', 'Destroyed Shield Wall', {
          viewport: { x: 0.35, y: 0, width: 0.6, height: 0.5 },
          highlights: [{ territory: 'shield-wall', color: '#a43322', opacity: 0.6 }],
          annotations: [mark('destroyed', 'Destroyed Shield Wall', 0.82, 0.38, 0.71, 0.315)],
        });
        mapReplacement(n, 8, 8, destroyed, 'Maintained board crop with the destroyed-wall marker.');
        const karama = guide('karama-guide', 'karama', 'Karama', [13, 14]);
        mapReplacement(n, 12, 14, karama, 'Explanation beside the full Karama card.');
        mapReplacement(n, 22, 26, karama, 'Full Karama card.');
        const list = newBlock('karama-cancellations', {
          kind: 'list',
          style: 'bulleted',
          itemOrder: [15, 16, 17, 18, 19, 20].map(String),
          itemsById: Object.fromEntries(
            [15, 16, 17, 18, 19, 20].map((i) => [
              String(i),
              { id: String(i), text: formatted(unit(i).text.replace(/^- /, '')) },
            ])
          ),
        });
        mapReplacement(n, 15, 20, list, 'The six printed Karama cancellations.');
        addPage(original, [
          shield,
          family,
          destroyed,
          prose('shield-effects', [9, 10, 11]),
          karama,
          list,
          prose('expansion-karama', [21]),
        ]);
        continue;
      }
      const paragraphs = [];
      let solaris: any;
      for (let i = 1; i <= 14; i++) {
        if (i === 10) {
          solaris = guide('solaris-guide', 'solaris', '', [10]);
          solaris.text = formatted(unit(10).text.replace(/^Solaris: /, ''));
          paragraphs.push(solaris);
        } else {
          paragraphs.push(prose(`insight-${i}`, [i]));
        }
      }
      mapReplacement(n, 15, 21, solaris, 'Full Solaris card beside its printed explanation.');
      addPage(original, paragraphs);
      continue;
    }

    if (n === 26) {
      blocks = blocks.filter((b: any) => !['battle-plans', 'piece-transfer'].includes(b.kind));
      blocks = removeRange(blocks, n, 9, 11);
      blocks = removeRange(blocks, n, 13, 15);
      blocks = removeRange(blocks, n, 17, 18);
      const tp = (name: string, count: number, label: string, special = false) => {
        const f = faction('Emperor');
        const troops = bindings.resolvedFactions[f.id]?.troops ?? [];
        const t = troops.find((t: any) => Boolean(t.star) === special) ?? troops[0];
        return { id: name, kind: 'troops', factionId: f.id, troopId: t?.troopId, face: 'front', count, label };
      };
      const coin = {
        id: 'spice',
        kind: 'source',
        source: { kind: 'stock', artworkId: '/vector/generic/solaris.svg' },
        count: 1,
        label: '1 spice',
      };
      const pieces = newBlock('classic-losses', {
        kind: 'piece-transfer',
        direction: 'none',
        left: {
          label: '2 + ½ + ½',
          pieces: [coin, tp('sardaukar', 1, 'Sardaukar: 2', true), tp('normal', 2, '½ each')],
        },
        right: {
          label: '1 + ½ + ½ + ½ + ½',
          pieces: [{ ...coin, id: 'spice-right' }, tp('supported', 1, '1'), tp('unsupported', 4, '½ each')],
        },
      });
      const split = blocks.findIndex((b: any) => b.name === 'Fremen battle edge:');
      const left = [...blocks.slice(0, split), pieces];
      const right = [
        illustration('half-2', stock('wheel-2-5'), '2½ and 4½'),
        illustration('half-8', stock('wheel-8-5'), '8½ compared with 8'),
      ];
      const p = addPage(original, [...left, ...right]);
      p.blockOrderByRegion = { column1: left.map((b) => b.id), column2: right.map((b) => b.id) };
      addPage(original, blocks.slice(split), 'two-columns', 'Spirit World Karama', true);
      continue;
    }
    let rail: any[] = [];
    if (n >= 27 && n <= 33) {
      const at = blocks.findIndex((b: any) => b.name?.endsWith('strategy:'));
      if (at >= 0) {
        rail = blocks.splice(at);
      }
      const name = n === 27 ? 'Bene Gesserit' : page.title.replace(/^HOUSE /, '');
      const f = faction(name);
      if (f) {
        page.headingIcon = f.emblem;
        rail.unshift(
          illustration(`emblem-${page.id}`, { kind: 'faction', factionId: f.id, presentation: 'emblem' }, '', 'small')
        );
      }
      const tokenUnits = rawUnits(n).filter(
        (u: any) =>
          /^(Token caption:|Emperor Force$|Sardaukar Force$|Fremen Force)/.test(u.text) &&
          blocks.some((b: any) => b.id === u.blockId)
      );
      const pictures: any[] = [];
      const firstTokenBlock = tokenUnits[0]?.blockId;
      const tokenPosition = blocks.findIndex((b: any) => b.id === firstTokenBlock);
      for (const [i, u] of tokenUnits.entries()) {
        const fs = bindings.resolvedFactions[f?.id];
        const t = fs?.troops?.[i] ?? fs?.troops?.[0];
        if (!f || !t) {
          continue;
        }
        const pic = illustration(
          `troop-${n}-${i}`,
          {
            kind: 'faction-troop',
            factionId: f.id,
            troopId: t.troopId,
            face: /advisor/i.test(u.text) ? 'back' : 'front',
          },
          n === 29 ? 'Fremen Force' : u.text.replace(/^Token caption: /, ''),
          'small'
        );
        blocks = removeRange(blocks, n, sourceIndex(u), sourceIndex(u), pic);
        pictures.push(pic);
        if (n === 29 && fs.troops[1]) {
          pictures.push(
            illustration(
              'fedaykin-face',
              { kind: 'faction-troop', factionId: f.id, troopId: fs.troops[1].troopId, face: 'front' },
              'Fedaykin Force',
              'small'
            )
          );
        }
      }
      if (pictures.length) {
        const survivor = blocks.findIndex((b: any) => b.id === firstTokenBlock);
        blocks.splice(survivor >= 0 ? survivor + 1 : Math.max(0, tokenPosition), 0, ...pictures);
      }
    }
    if (n === 36) {
      rail = [];
      blocks = [];
      for (const u of rawUnits(n)) {
        const index = sourceIndex(u);
        if (index === 0) {
          continue;
        }
        const b = text(`term-${index}`, '', u.text);
        b.text = b.text.replace(/^([^:\n]+): /, '*$1:* ');
        u.blockId = b.id;
        if (index === 1) {
          rail.push(b);
        } else {
          blocks.push(b);
        }
      }
    }

    addPage(
      original,
      blocks,
      rail.length ? 'outer-rail' : 'two-columns',
      page.title,
      n === 28 ? page.title === 'FREMEN' : ![17, 19, 24, 29, 35].includes(n) && page.showHeading,
      rail
    );
  }
  contents.pageOrder = output.map((x) => x.page.id);
  contents.pagesById = Object.fromEntries(output.map((x) => [x.page.id, x.page]));
  allPages.splice(0, allPages.length, ...output);
  pageMap.splice(
    0,
    pageMap.length,
    ...output.map((x, i) => ({ sourcePage: x.sourcePage, pageId: x.page.id, title: x.page.title, outputPage: i + 1 }))
  );
  return { replacements };
}
