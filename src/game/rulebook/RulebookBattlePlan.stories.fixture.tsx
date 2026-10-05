import type { RulebookResolvedSource } from '@shared/rulebooks/sources';

import type { RulebookBattlePlanProps } from './RulebookBattlePlan';

/* These five captured components supply teaching specimens, not a card catalogue. */
const pieces = {
  caid: {
    height: 600,
    imageUrl:
      'https://dune.zone/published/leaders/k17dhptwywynwmpvx18965b97h8a0abp.3fbddb6f-f500-40aa-91c6-fb7a1d154c34/leader.jpg?v=95f050fe-f145-4f72-9054-d5d17b8c71eb',
    name: 'Caid',
    publicationRevision: '95f050fe-f145-4f72-9054-d5d17b8c71eb',
    reference: {
      factionId: 'k17dhptwywynwmpvx18965b97h8a0abp',
      kind: 'faction-member',
      memberId: '3fbddb6f-f500-40aa-91c6-fb7a1d154c34',
    },
    status: 'ready',
    width: 600,
  },
  gurney: {
    height: 600,
    imageUrl:
      'https://dune.zone/published/leaders/k17ag3gr1h60n7mmh88kj56avs8a1j7x.01f1cf94-2df1-4b96-9fbf-dd757afef27b/leader.jpg?v=fca62d74-7a13-4d83-9725-3f248085ea22',
    name: 'Gurney Halleck',
    publicationRevision: 'fca62d74-7a13-4d83-9725-3f248085ea22',
    reference: {
      factionId: 'k17ag3gr1h60n7mmh88kj56avs8a1j7x',
      kind: 'faction-member',
      memberId: '01f1cf94-2df1-4b96-9fbf-dd757afef27b',
    },
    status: 'ready',
    width: 600,
  },
  feyd: {
    height: 600,
    imageUrl:
      'https://dune.zone/published/leaders/k174k8mvjqapvgccxtbp9qwh5h8a01b4.773ba210-69e1-4bcb-9ea8-2b5419ecd35e/leader.jpg?v=4e0674f3-0705-40c6-8e3f-5ff8abb57f74',
    name: 'Feyd Rautha',
    publicationRevision: '4e0674f3-0705-40c6-8e3f-5ff8abb57f74',
    reference: {
      factionId: 'k174k8mvjqapvgccxtbp9qwh5h8a01b4',
      kind: 'faction-member',
      memberId: '773ba210-69e1-4bcb-9ea8-2b5419ecd35e',
    },
    status: 'ready',
    width: 600,
  },
  pistol: {
    status: 'ready',
    reference: {
      kind: 'asset',
      assetId: 'ns785225ways2hbtape9wcb16d8fnp11',
    },
    name: 'Maula Pistol',
    imageUrl:
      'https://dune.zone/published/cards/ns785225ways2hbtape9wcb16d8fnp11/card.jpg?v=749ce499-1c78-4a46-a4fd-e00605997131',
    assetType: 'card-treachery',
  },
  snooper: {
    status: 'ready',
    reference: {
      kind: 'asset',
      assetId: 'ns7ahq18ww5e3b7hsdb3ztjggn8cwn08',
    },
    name: 'Snooper',
    imageUrl:
      'https://dune.zone/published/cards/ns7ahq18ww5e3b7hsdb3ztjggn8cwn08/card.jpg?v=a1b8c3c1-2d15-4b26-b575-8e3bc0484ff1',
    assetType: 'card-treachery',
  },
  poison: {
    status: 'ready',
    reference: {
      kind: 'asset',
      assetId: 'ns77am58gm55e9nw0y6mj45nbh8fmya3',
    },
    name: 'Gom Jabbar',
    imageUrl:
      'https://dune.zone/published/cards/ns77am58gm55e9nw0y6mj45nbh8fmya3/card.jpg?v=ae686d13-1fab-47a5-873a-d8a8d88bfb7b',
    assetType: 'card-treachery',
  },
} satisfies Record<string, RulebookResolvedSource>;

export const atreidesPlan = {
  title: 'Atreides',
  color: '#72812e',
  troopIcon: '/vector/troop/atreides.svg',
  troops: [
    { label: 'Supported', count: 2, strengthEach: 1, spiceEach: 1 },
    { label: 'Unsupported', count: 2, strengthEach: 0.5, spiceEach: 0 },
  ],
  uncommitted: 2,
  leader: { source: pieces.gurney, strength: 4, killed: false },
  weapon: pieces.pistol,
  defense: pieces.snooper,
} satisfies RulebookBattlePlanProps;
export const harkonnenPlan = {
  title: 'Harkonnen',
  color: '#333333',
  troopIcon: '/vector/troop/harkonnen.svg',
  troops: [{ label: 'Supported', count: 4, strengthEach: 1, spiceEach: 1 }],
  uncommitted: 1,
  leader: { source: pieces.feyd, strength: 6, killed: true },
  weapon: pieces.poison,
  defense: pieces.snooper,
} satisfies RulebookBattlePlanProps;

export const emperorLeader = { source: pieces.caid, strength: 3, killed: false };
