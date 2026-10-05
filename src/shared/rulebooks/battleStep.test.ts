import { describe, expect, test } from 'vitest';

import { assetPublishingFaction } from '../factions/fixtures/assetPublishingFaction';
import { rulebookBattleSideSchema } from './battleStep';
import { rulebookContentsV1Schema, rulebookDraftEntitySchemas, rulebookEditionContentsV1Schema } from './contents';
import type { RulebookBlockDraft, RulebookContentsDraftV1 } from './contents';
import { projectRulebookDraftRenderBlock, projectRulebookRenderDocument } from './projectRenderDocument';
import { collectRulebookReferenceIds } from './references';
import type { RulebookResolvedFactionsById } from './references';
import { rulebookRenderDocumentV1Schema } from './renderDocument';
import type { RulebookResolvedAssetsById } from './sources';

const troopId = '10000000-1000-4000-8000-100000000001';
const memberId = '10000000-1000-4000-8000-100000000002';
const factions: RulebookResolvedFactionsById = {
  left: {
    factionId: 'left',
    name: 'Atreides',
    color: '#123456',
    token: { logo: assetPublishingFaction.logo, background: assetPublishingFaction.background },
    troops: [{ troopId, image: '/vector/troop/atreides.svg', name: 'Forces', description: '', count: 20 }],
    leaders: [
      {
        status: 'ready',
        reference: { kind: 'faction-member', factionId: 'left', memberId },
        name: 'Gurney Halleck',
        imageUrl: '/published/leader.jpg?v=one',
      },
    ],
  },
};
const assets: RulebookResolvedAssetsById = {
  weapon: { assetId: 'weapon', type: 'card-treachery', name: 'Maula Pistol', imageUrl: '/published/pistol.jpg?v=one' },
  defense: { assetId: 'defense', type: 'card-treachery', name: 'Snooper', imageUrl: '/published/snooper.jpg?v=one' },
};
function step(): Extract<RulebookBlockDraft, { kind: 'battle-step' }> {
  return {
    id: 'STEP',
    kind: 'battle-step',
    step: '3',
    title: 'Choose a plan',
    caption: 'Each player chooses privately.',
    left: {
      factionId: 'left',
      role: 'Aggressor',
      revealed: false,
      dial: 3,
      spice: 2,
      leader: { kind: 'faction-member', factionId: 'left', memberId },
      cards: [{ kind: 'asset', assetId: 'weapon' }],
      troops: [{ id: 'ordinary', troopId, face: 'front', supported: 2, unsupported: 2, uncommitted: 2 }],
    },
    right: {
      factionId: 'right',
      role: 'Defender',
      revealed: false,
      dial: 0,
      spice: 0,
      cards: [],
      troops: [],
      knownCard: { kind: 'asset', assetId: 'defense' },
    },
  };
}
function contents(): RulebookContentsDraftV1 {
  return {
    schemaVersion: 1,
    pageOrder: ['PAGE'],
    pagesById: {
      PAGE: {
        id: 'PAGE',
        anchor: 'battle',
        title: 'Battle',
        layoutId: 'sequence',
        showHeading: true,
        controlValues: {},
        blockOrderByRegion: { content: ['STEP'] },
        blocksById: { STEP: step() },
      },
    },
  };
}

describe('Rulebook battle steps', () => {
  test('reads a sequence page through draft, saved, edition and render contracts', () => {
    const value = contents();
    expect(rulebookDraftEntitySchemas.page.parse(value.pagesById.PAGE)).toEqual(value.pagesById.PAGE);
    expect(rulebookContentsV1Schema.parse(value)).toEqual(value);
    expect(rulebookEditionContentsV1Schema.parse(value)).toEqual(value);
    const rendered = projectRulebookRenderDocument(value, assets, { size: 'square', design: 'illustrated' }, factions);
    expect(rulebookRenderDocumentV1Schema.parse(rendered)).toEqual(rendered);
    expect(rendered.pagesById.PAGE?.regions[0]?.blocks[0]).toMatchObject({
      kind: 'battle-step',
      left: {
        faction: { status: 'ready', name: 'Atreides' },
        leader: { status: 'ready', name: 'Gurney Halleck' },
        cards: [{ status: 'ready', name: 'Maula Pistol' }],
        troops: [{ id: 'ordinary', supported: 2, unsupported: 2, uncommitted: 2, artwork: { troopId } }],
      },
      right: {
        faction: { status: 'unavailable', factionId: 'right' },
        knownCard: { status: 'ready', name: 'Snooper' },
      },
    });
    expect(collectRulebookReferenceIds(value)).toEqual({
      assetIds: ['defense', 'weapon'],
      factionIds: ['left', 'right'],
    });
  });

  test('preserves a missing troop identity instead of substituting another row or face', () => {
    const block = step();
    block.left.troops[0]!.face = 'back';
    const rendered = projectRulebookDraftRenderBlock(block, assets, factions);
    expect(rendered).toMatchObject({ left: { troops: [block.left.troops[0]] } });
    if (rendered.kind !== 'battle-step') {
      throw new Error('Expected a battle step');
    }
    expect(rendered.left.troops[0]?.artwork).toBeUndefined();
    const renamed = structuredClone(factions);
    renamed.left!.troops!.unshift({
      troopId: memberId,
      image: '/vector/troop/emperor.svg',
      name: 'Other',
      description: '',
      count: 1,
    });
    renamed.left!.troops![1]!.name = 'Renamed forces';
    block.left.troops[0]!.face = 'front';
    expect(projectRulebookDraftRenderBlock(block, assets, renamed)).toMatchObject({
      left: { troops: [{ artwork: { troopId, name: 'Renamed forces' } }] },
    });
  });

  test('refuses fractional troop counts, duplicate group IDs and non-half-step dials', () => {
    const side = step().left;
    expect(rulebookBattleSideSchema.safeParse({ ...side, dial: 2.5 }).success).toBe(true);
    expect(rulebookBattleSideSchema.safeParse({ ...side, dial: 2.25 }).success).toBe(false);
    expect(rulebookBattleSideSchema.safeParse({ ...side, spice: -1 }).success).toBe(false);
    expect(
      rulebookBattleSideSchema.safeParse({ ...side, troops: [{ ...side.troops[0], supported: 1.5 }] }).success
    ).toBe(false);
    expect(rulebookBattleSideSchema.safeParse({ ...side, troops: [side.troops[0], side.troops[0]] }).success).toBe(
      false
    );
  });

  test('retains invalid card identities as unavailable and keeps unselected leaders distinct', () => {
    const block = step();
    const changedAsset = { ...assets, weapon: { ...assets.weapon!, type: 'token-disc' } };
    expect(projectRulebookDraftRenderBlock(block, changedAsset, factions)).toMatchObject({
      left: { cards: [{ status: 'unavailable', reference: { kind: 'asset', assetId: 'weapon' } }] },
      right: { leader: { status: 'unselected' } },
    });
  });
});
