import { DUKE_PRAD_VIDAL_TOKEN } from '@shared/assets/leaderToken';
import { expect, test } from 'vite-plus/test';

import { emptyBackgroundModeMemory } from '@app/widgets/background-composer/BackgroundComposer';

import { reduceLeaderTokenDraft } from './leaderTokenAuthoring';

test('a completed save retains edits made after the submitted payload', () => {
  const submitted = { ...DUKE_PRAD_VIDAL_TOKEN, strength: '7' };
  const current = reduceLeaderTokenDraft(
    {
      data: submitted,
      baseline: DUKE_PRAD_VIDAL_TOKEN,
      memory: { declaredCustom: false, backgroundMode: emptyBackgroundModeMemory() },
    },
    { kind: 'patch', update: { strength: '8' } }
  );
  const saved = reduceLeaderTokenDraft(current, { kind: 'saved', data: submitted });
  expect(saved.baseline.strength).toBe('7');
  expect(saved.data.strength).toBe('8');
  expect(saved.data).not.toEqual(saved.baseline);
  expect(saved.memory).toBe(current.memory);
});
