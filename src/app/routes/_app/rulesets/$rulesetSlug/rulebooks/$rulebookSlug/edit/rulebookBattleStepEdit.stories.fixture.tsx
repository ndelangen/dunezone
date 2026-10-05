import { Box } from '@mantine/core';
import type { RulebookResolvedFactionsById } from '@shared/rulebooks/projectRenderDocument';
import { projectRulebookDraftRenderBlock } from '@shared/rulebooks/projectRenderDocument';
import { DocumentEditorLayout } from '@ui/layout/DocumentEditorLayout';
import { useState } from 'react';

import { factionTokenFixtures } from '@game/fixtures/factionTokens';
import { RulebookBlockCanvas } from '@game/rulebook/RulebookBlockRenderer';

import { BattleStepEdit } from './rulebookBattleStepEdit';
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
          <BattleStepEdit value={value} onChange={setValue} references={{ factionsById: factions, assetsById: {} }} />
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
