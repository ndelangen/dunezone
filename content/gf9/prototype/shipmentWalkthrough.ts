/** C-only teaching samples. These are render documents, never production import payloads. */
import pkg from '../package.json';
import { CanonicalFactionStoredObject, TroopArtwork } from '../../../src/shared/factions/schema';
import { RULEBOOK_BOARD_DEFINITIONS } from '../../../src/shared/rulebooks/boardDefinitions';
import { rulebookRenderPageV1Schema } from '../../../src/shared/rulebooks/renderDocument';
import type { RulebookRenderBlockV1, RulebookRenderPageV1 } from '../../../src/shared/rulebooks/renderDocument';

type Block = RulebookRenderBlockV1;
type Scene = Extract<Block, { kind: 'board-scene' }>;
const none = { status: 'unselected' } as const;
const board = RULEBOOK_BOARD_DEFINITIONS[0]!;
const locations: Record<string, { x: number; y: number }> = {
  arrakeen: { x: .654214, y: .150302 },
  carthag: { x: .488634, y: .179856 },
  tueks: { x: .861302, y: .701376 },
  'pasty-mesa': { x: .830449, y: .475583 },
  'shield-wall': { x: .700733, y: .315276 },
  'imperial-basin': { x: .582159, y: .244746 },
  arsunt: { x: .476559, y: .340774 },
  polar: { x: .486728, y: .510859 },
  'false-wall-east': { x: .602207, y: .485376 },
  'hagga-basin': { x: .372403, y: .310476 },
};
function faction(key = 'gf9-emperor') {
  const entry = pkg.items.find(item => item.key === key)!;
  const data = CanonicalFactionStoredObject.pick({ name: true, logo: true, background: true, themeColor: true, troops: true }).strip().parse(entry.data);
  return {
    data,
    value: { status: 'ready' as const, factionId: key, name: data.name.replace(/^GF9 /, ''), color: data.themeColor, token: { logo: data.logo, background: data.background } },
    artwork: TroopArtwork.strip().parse(data.troops[0]),
  };
}
function forces(id: string, territory: string, count: number, key = 'gf9-emperor', position = locations[territory]): Scene['troops'][number] {
  const selected = faction(key);
  const columns = Math.min(count, 2);
  const rows = Math.ceil(count / columns);
  const size = .021;
  const gap = .002;
  return { id, faction: selected.value, artwork: selected.artwork, troopId: selected.artwork.troopId, face: 'front', count, x: position.x - (columns * size + (columns - 1) * gap) / 2, y: position.y - (rows * size + (rows - 1) * gap) / 2, columns, size, gap };
}
function route(id: string, label: string, territories: string[], color = '#215f89'): NonNullable<Scene['routes']>[number] {
  return { id, label, direction: 'forward', color, waypoints: territories.map(territory => ({ territory, position: locations[territory] })) };
}
function scene(id: string, caption: string, troops: Scene['troops'], options: Partial<Scene> = {}): Scene {
  return {
    id, kind: 'board-scene', boardId: board.id,
    board: { status: 'ready', reference: { kind: 'board', boardId: board.id }, name: 'Arrakis teaching diagram', imageUrl: board.imageUrl, geometry: board.geometry },
    caption, size: 'fit-width', players: [], troops, highlights: [], annotations: [],
    viewport: { x: .43, y: .03, width: .57, height: .77 },
    ...options,
  };
}
const heading = (id: string, title: string): Block => ({ id, kind: 'section-heading', title, faction: none });
const text = (id: string, value: string): Block => ({ id, kind: 'text', text: value });
const note = (id: string, title: string, value: string): Block => ({ id, kind: 'callout', variant: 'example', title, text: value });
function table(id: string, labels: string[], rows: string[][]): Block {
  return { id, kind: 'reference-table', columns: labels.map((label, index) => ({ id: `c${index}`, label })), rows: rows.map((row, index) => ({ id: `r${index}`, cells: row.map((value, column) => ({ columnId: `c${column}`, text: value })) })), note: '' };
}
function page(id: string, title: string, column1: Block[], column2: Block[]): RulebookRenderPageV1 {
  return rulebookRenderPageV1Schema.parse({ id, anchor: id, title, showHeading: true, layoutId: 'two-columns', controlValues: {}, regions: [{ key: 'column1', blocks: column1 }, { key: 'column2', blocks: column2 }] });
}
function transfer(id: string, from: string, to: string, count: number, price: string): Block {
  const selected = faction();
  const pieces = (pieceId: string, label: string) => [{ id: pieceId, kind: 'troops' as const, faction: selected.value, artwork: selected.artwork, troopId: selected.artwork.troopId, face: 'front' as const, count, label }];
  return { id, kind: 'piece-transfer', direction: 'right', left: { label: from, pieces: pieces(`${id}-from`, `${count} ${count === 1 ? 'force' : 'forces'}`) }, right: { label: to, pieces: pieces(`${id}-to`, price) } };
}

export function shipmentWalkthrough(): RulebookRenderPageV1[] {
  const direct = transfer('ship-direct-transfer', 'Reserves', 'Imperial Basin', 3, 'Shipment: 6 spice');
  const viaCity = transfer('ship-city-transfer', 'Reserves', 'Arrakeen', 1, 'Shipment: 1 spice');
  const distantMove = transfer('ship-distant-transfer', 'Tuek\'s Sietch', 'Imperial Basin', 3, 'Movement: 0 spice');
  const mainRoute = route('three-territory-route', '0 Tuek\'s Sietch → 1 Pasty Mesa → 2 Shield Wall → 3 Imperial Basin', ['tueks', 'pasty-mesa', 'shield-wall', 'imperial-basin']);
  const rangeMap = scene('range-map', 'Before movement: 1 force in Arrakeen grants the distant group its three-territory range. Move the 3 forces together along the numbered route.', [forces('range-city', 'arrakeen', 1), forces('range-origin', 'tueks', 3)], { routes: [mainRoute], highlights: [{ territory: 'arrakeen', color: '#487b37', opacity: .24 }, { territory: 'imperial-basin', color: '#215f89', opacity: .18 }] });
  const directStorm = route('blocked-storm', 'Blocked: Carthag → Imperial Basin → False Wall East', ['carthag', 'imperial-basin', 'false-wall-east'], '#a33328');
  directStorm.waypoints[1] = { territory: 'imperial-basin', position: { x: .52, y: .28 } };
  directStorm.blockedAfter = 1;
  const stormCrop = { x: .39, y: .04, width: .31, height: .59 };
  const stormStart = [forces('storm-origin', 'carthag', 3)];
  const blockedMap = scene('storm-blocked-map', 'The red shaded sector is the storm. Clear endpoints do not make the crossing legal.', stormStart, { viewport: stormCrop, storm: { angle: 70 }, routes: [directStorm] });
  const detourMap = scene('storm-detour-map', 'The blue path avoids the storm: Arsunt, Polar Sink, then False Wall East. Legal with ornithopters.', stormStart, { viewport: stormCrop, storm: { angle: 70 }, routes: [route('clear-detour', '0 Carthag → 1 Arsunt → 2 Polar Sink → 3 False Wall East', ['carthag', 'arsunt', 'polar', 'false-wall-east'])] });
  const cityCrop = { x: .405, y: .105, width: .17, height: .17 };
  const oneOpponent = scene('one-occupant-map', 'Guild alone: Emperor may enter Carthag.', [forces('single-occupant', 'carthag', 1, 'gf9-spacing-guild', { x: .47, y: .17 })], { viewport: cityCrop, highlights: [{ territory: 'carthag', color: '#487b37', opacity: .18 }] });
  const twoOpponents = scene('two-occupants-map', 'Guild + Atreides: Emperor may not enter or pass through.', [forces('first-occupant', 'carthag', 1, 'gf9-spacing-guild', { x: .47, y: .17 }), forces('second-occupant', 'carthag', 1, 'gf9-atreides', { x: .50, y: .19 })], { viewport: cityCrop, highlights: [{ territory: 'carthag', color: '#a33328', opacity: .18 }] });
  const collectionCrop = { x: .25, y: .075, width: .49, height: .40 };
  const spice: NonNullable<Scene['tokens']> = Array.from({ length: 6 }, (_, index) => ({ layerId: `spice-${index}`, asset_id: 'gf9-spice-token-1', x: (.35 + (index % 3) * .025) * 487.06, y: (.345 + Math.floor(index / 3) * .025) * 487.06, size: 8, rotation: 0, name: '1 spice', type: 'token-disc', imageUrl: '/vector/icon/spice.svg' }));
  const noCity = scene('collection-no-city-map', '2 forces and 6 spice in one Hagga Basin sector. Each black spice symbol is 1 spice. No city is occupied.', [forces('collectors', 'hagga-basin', 2, 'gf9-emperor', { x: .345, y: .29 })], { viewport: collectionCrop, tokens: spice, highlights: [{ territory: 'hagga-basin', color: '#d79a28', opacity: .25 }] });
  const withCity = scene('collection-city-map', 'The same 2 forces and 6 spice, plus a surviving Emperor force in Arrakeen. City access helps this distant group.', [forces('city-collectors', 'hagga-basin', 2, 'gf9-emperor', { x: .345, y: .29 }), forces('collection-city', 'arrakeen', 1)], { viewport: collectionCrop, tokens: spice, highlights: [{ territory: 'hagga-basin', color: '#d79a28', opacity: .25 }, { territory: 'arrakeen', color: '#487b37', opacity: .22 }] });
  return [
    page('core-shipment', 'Ship first, move second', [
      heading('ship-turn-heading', 'Finish both actions'),
      text('ship-turn', 'These examples use the Basic Game. In storm order, each faction may make one shipment, then one on-planet movement. Finish both before the next faction acts. Either action is optional. Newly shipped forces may move immediately.'),
      heading('ship-cost-heading', 'What does shipment buy?'),
      table('ship-costs', ['Destination', 'Cost per force'], [['Stronghold', '1 spice'], ['Other territory', '2 spice']]),
      text('ship-payee', 'Send reserves to one territory and choose their sector. Pay the Guild if it is playing, otherwise the Bank. The Guild pays the Bank. Ordinary shipment cannot retrieve forces or move them between board territories.'),
      heading('ship-direct-heading', 'A. Reinforce directly'),
      text('ship-example-start', 'Example: Emperor has 6 spice, 3 forces already in Tuek\'s Sietch and enough reserves. All shown sectors are clear and destinations empty.'),
      text('ship-direct-text', 'Ship 3 reserves to Imperial Basin for 6 spice. Keep the older group in Tuek\'s Sietch and decline movement.'),
      direct,
    ], [
      heading('ship-city-heading', 'B. Buy access, move a group'),
      text('ship-city-text', 'Instead, ship 1 reserve to Arrakeen for 1 spice. When movement begins, that force provides ornithopters. Move the older 3 from Tuek\'s Sietch through Pasty Mesa and Shield Wall to Imperial Basin.'),
      viaCity,
      distantMove,
      text('ship-city-result', 'The new force stays in Arrakeen. Tuek\'s Sietch is now empty. The route on the next page explains this separate three-territory movement.'),
      note('ship-choice', 'Same destination, different commitments', 'A uses 3 reserves and all 6 spice while retaining the Tuek\'s Sietch position. B uses 1 reserve and 1 spice, but abandons Tuek\'s Sietch and uses its one movement. Neither is always better.'),
      text('ship-exceptions', 'These are ordinary Emperor actions. Guild shipment types and prices, Fremen reserve placement and other faction exceptions use their own rules.'),
    ]),
    page('core-shipment-range', 'Choose one moving group', [
      heading('range-heading', 'Check range when movement begins'),
      table('range-table', ['Access', 'Range'], [['Ordinary movement', '1 adjacent territory'], ['Fremen', 'Up to 2 territories'], ['Occupy Arrakeen or Carthag', 'Up to 3 territories']]),
      text('range-timing', 'A force just shipped into either city can unlock ornithopters immediately. The moving group may be elsewhere on Arrakis. Use one range; do not add the allowances together.'),
      heading('one-group-heading', 'One origin, one destination'),
      text('one-group-text', 'Choose some or all forces from one territory. Move them together to one destination, leaving any others behind. You cannot gather groups from several origins or split a moving group among destinations.'),
      note('city-empty-note', 'The city may be left empty', 'If the group in Arrakeen or Carthag is the group you move, it can use the three-territory allowance even when all of it leaves. What matters is occupation when movement begins.'),
      text('range-sector-text', 'Count territories entered, not sector lines. Moving to another sector within the same territory still uses your normal movement. The storm can separate forces that would otherwise form one group.'),
    ], [
      heading('route-heading', 'A three-territory move'),
      rangeMap,
      table('route-count-table', ['Point', 'Territory entered'], [['0', 'Tuek\'s Sietch: origin'], ['1', 'Pasty Mesa'], ['2', 'Shield Wall'], ['3', 'Imperial Basin: destination']]),
      text('route-end', 'This move leaves Tuek\'s Sietch empty. The separate force in Arrakeen stays there. Enemy forces in an ordinary territory do not stop passage; storm and stronghold restrictions still apply.'),
    ]),
    page('core-shipment-route', 'Check the whole route', [
      heading('storm-heading', 'Ornithopters do not cross storm'),
      text('storm-rule', 'Ordinary forces cannot ship into, enter, leave or cross a sector under the storm. Clear sectors elsewhere in that territory remain usable. Imperial Basin\'s protection from storm losses does not permit movement through a stormed sector.'),
      blockedMap,
      detourMap,
      text('detour-rule', 'Carthag supplies ornithopters. The detour uses three territories and goes through the Polar Sink, which is never in storm. You cannot combine groups separated by the storm.'),
    ], [
      heading('occupancy-heading', 'Count the other factions'),
      text('occupancy-rule', 'A stronghold with two other factions is closed to you: no shipment into it, movement into it or passage through it. One opposing faction does not block entry.'),
      oneOpponent,
      twoOpponents,
      text('occupancy-exception', 'In Advanced play, Bene Gesserit advisors do not count toward this limit. These diagrams show ordinary fighting forces. Entry into an enemy-held stronghold normally leads to a later battle, not a battle during movement.'),
      note('allies-note', 'Check allies too', 'You may ship into an ally\'s territory only if you immediately move out during that same shipment-and-movement action. You cannot finish together unless an explicit exception permits it. The Polar Sink permits all factions and has no battles.'),
    ]),
    page('core-shipment-position', 'Plan where forces remain', [
      heading('collect-heading', 'Two collectors, six spice'),
      text('collect-rule', 'At Spice Collection, forces take spice only from their own territory and sector. They normally collect 2 spice each, or 3 each if their faction currently occupies Arrakeen or Carthag.'),
      noCity,
      note('collect-four', 'Without a city: take 4', 'The 2 forces collect 4 of the 6 spice. Leave 2 on the board. The forces stay in Hagga Basin.'),
      withCity,
      note('collect-six', 'With a city: take 6', 'If the Arrakeen force is still there at collection, the same 2 forces collect all 6 spice. Take no more than is present. Basic play gives no separate city-income payment.'),
    ], [
      heading('position-heading', 'A move changes more than range'),
      text('position-text', 'Moving every force out of a city can use its ornithopters now, but leaves that city empty. It will no longer improve your collection rate unless you still occupy the other city. An opponent may also enter before the phase ends.'),
      heading('battle-later-heading', 'Entry is followed by battle'),
      text('battle-later', 'Outside the Polar Sink, opposing forces must battle after Shipment and Movement unless the storm prevents them from fighting. Moving into the territory does not resolve weapons, losses or spice rewards immediately. Keep the Battle Plan example nearby.'),
      heading('victory-later-heading', 'Hold the position until the check'),
      text('victory-later', 'Victory is checked in the Mentat Pause, after battles and Spice Collection. An unallied faction normally needs 3 strongholds; an alliance normally needs 4 distinct strongholds between its members. Entering your third stronghold does not end the game immediately.'),
      note('planning-check', 'Before you commit', 'Check your shipment cost, the sector, one legal moving group and its full route. Then ask what remains to collect spice, hold city access and survive the battles before victory is checked.'),
    ]),
  ];
}
