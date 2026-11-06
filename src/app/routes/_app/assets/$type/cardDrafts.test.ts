import { DUKE_PRAD_VIDAL_TOKEN } from '@shared/assets/leaderToken';
import { LeaderTokenAssetInput } from '@shared/assets/schema';
import { expect, test } from 'vite-plus/test';

import { emptyBackgroundModeMemory } from '@app/widgets/background-composer/BackgroundComposer';

import { memoryDraftSession } from './cardDrafts';

/* The leader token's own session: its memory holds strength text the field refused, which a reset must drop. */
const { reduce: reduceLeaderTokenDraft } = memoryDraftSession(LeaderTokenAssetInput, () => ({
  declaredCustom: false,
  backgroundMode: emptyBackgroundModeMemory(),
  refusedStrength: null as string | null,
}));

test('a completed save retains edits made after the submitted payload', () => {
  const submitted = { ...DUKE_PRAD_VIDAL_TOKEN, strength: '7' };
  const current = reduceLeaderTokenDraft(
    {
      data: submitted,
      baseline: DUKE_PRAD_VIDAL_TOKEN,
      memory: { declaredCustom: false, backgroundMode: emptyBackgroundModeMemory(), refusedStrength: null },
    },
    { kind: 'patch', update: { strength: '8' } }
  );
  const saved = reduceLeaderTokenDraft(current, { kind: 'saved', data: submitted });
  expect(saved.baseline.strength).toBe('7');
  expect(saved.data.strength).toBe('8');
  expect(saved.data).not.toEqual(saved.baseline);
  expect(saved.memory).toBe(current.memory);
});

test('replacing the draft drops strength text the field refused', () => {
  const refused = reduceLeaderTokenDraft(
    {
      data: DUKE_PRAD_VIDAL_TOKEN,
      baseline: DUKE_PRAD_VIDAL_TOKEN,
      memory: { declaredCustom: false, backgroundMode: emptyBackgroundModeMemory(), refusedStrength: null },
    },
    { kind: 'remember', update: { refusedStrength: '5x' } }
  );
  expect(refused.memory.refusedStrength).toBe('5x');
  const replaced = reduceLeaderTokenDraft(refused, { kind: 'replace', data: DUKE_PRAD_VIDAL_TOKEN });
  expect(replaced.memory.refusedStrength).toBeNull();
});
