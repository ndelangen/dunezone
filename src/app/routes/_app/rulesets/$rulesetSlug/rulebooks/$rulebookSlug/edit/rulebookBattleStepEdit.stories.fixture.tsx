import { Box } from '@mantine/core';
import { rulebookBattleSideSchema } from '@shared/rulebooks/battleStep';
import type { RulebookResolvedFactionsById } from '@shared/rulebooks/projectRenderDocument';
import { projectRulebookDraftRenderBlock } from '@shared/rulebooks/projectRenderDocument';
import { DocumentEditorLayout } from '@ui/layout/DocumentEditorLayout';
import { useState } from 'react';

import { factionTokenFixtures } from '@game/fixtures/factionTokens';
import { RulebookBlockCanvas } from '@game/rulebook/RulebookBlockRenderer';

import { BattleStepEdit, BattlePlansEdit } from './rulebookBattleStepEdit';
import type { RulebookBlockEditorValue } from './rulebookBlockEditors';

const troopId = 'bf38706d-eae7-462b-9808-9d54eeaf61b6';
const factions = {
  atreides: {
    factionId: 'atreides',
    name: 'Atreides',
    color: '#338b42',
    token: factionTokenFixtures.atreides,
    troops: [{ troopId, image: '/vector/troop/atreides.svg', name: 'Ordinary troops', description: '', count: 20 }],
  },
  harkonnen: { factionId: 'harkonnen', name: 'Harkonnen', color: '#9b2829', token: factionTokenFixtures.harkonnen },
} satisfies RulebookResolvedFactionsById;

const initial: RulebookBlockEditorValue<'battle-step'> = {
  step: '3',
  title: 'Build the battle plans',
  caption: 'Choose the forces committed to this battle.',
  left: {
    factionId: 'atreides',
    role: 'Aggressor',
    revealed: true,
    dial: 3,
    spice: 2,
    cards: [],
    troops: [{ id: 'ordinary', troopId, face: 'front', supported: 2, unsupported: 2, uncommitted: 2 }],
  },
  right: { factionId: 'harkonnen', role: 'Defender', revealed: false, dial: 4, spice: 4, cards: [], troops: [] },
};

export function BattleStepStory() {
  const [value, setValue] = useState(initial);
  return (
    <Box p="lg">
      <DocumentEditorLayout ratio={1} fit="width">
        <DocumentEditorLayout.Sidebar>
          <BattleStepEdit
            value={value}
            onChange={(next) => {
              rulebookBattleSideSchema.parse(next.left);
              rulebookBattleSideSchema.parse(next.right);
              setValue(next);
            }}
            references={{ factionsById: factions, assetsById: {} }}
          />
        </DocumentEditorLayout.Sidebar>
        <DocumentEditorLayout.Preview>
          <RulebookBlockCanvas
            block={projectRulebookDraftRenderBlock({ ...value, kind: 'battle-step', id: 'STEP' }, {}, factions)}
          />
        </DocumentEditorLayout.Preview>
      </DocumentEditorLayout>
    </Box>
  );
}

export function BattlePlansStory() {
  const [value, setValue] = useState<RulebookBlockEditorValue<'battle-plans'>>({
    left: initial.left,
    right: initial.right,
    showSideLabels: false,
  });
  return (
    <Box p="lg">
      <DocumentEditorLayout ratio={1} fit="width">
        <DocumentEditorLayout.Sidebar>
          <BattlePlansEdit value={value} onChange={setValue} references={{ factionsById: factions, assetsById: {} }} />
        </DocumentEditorLayout.Sidebar>
        <DocumentEditorLayout.Preview>
          <RulebookBlockCanvas
            block={projectRulebookDraftRenderBlock({ ...value, kind: 'battle-plans', id: 'PLAN' }, {}, factions)}
          />
        </DocumentEditorLayout.Preview>
      </DocumentEditorLayout>
    </Box>
  );
}
