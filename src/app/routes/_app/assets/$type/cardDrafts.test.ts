import { DUKE_PRAD_VIDAL_TOKEN } from '@shared/assets/leaderToken';
import { LeaderTokenAssetInput } from '@shared/assets/schema';
import { expect, test } from 'vite-plus/test';
import { z } from 'zod';

import { emptyBackgroundModeMemory } from '@app/widgets/background-composer/BackgroundComposer';

import { memoryDraftSession, openEvent, plainDraftSession, reduceOpened } from './cardDrafts';

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

const Named = z.object({ name: z.string().min(1, 'Add a name') });
const named = plainDraftSession<{ name: string; note?: string }>(Named);

test('a draft that fails its schema posts nothing and says why', () => {
  const status = named.status(named.open({ name: '' }, { name: '' }));
  expect(status.payload).toBeUndefined();
  expect(status.invalid).toBe('Add a name');
  expect(status.isDirty).toBe(false);
});

test('a valid draft posts only the stored keys and is dirty by value', () => {
  const draft = { name: 'Spice', note: 'ui only' };
  const status = named.status(named.open(draft, { name: 'Spice', note: 'other' }));
  expect(status.payload).toEqual({ name: 'Spice' });
  expect(status.isDirty).toBe(true);
});

test('the edit reducer drops events until the card opens, then opens only once', () => {
  const reduce = reduceOpened(named.reduce);
  expect(reduce(null, { kind: 'patch', update: { name: 'early' } })).toBeNull();
  const opened = reduce(null, openEvent(named.open({ name: 'A' }, { name: 'A' })));
  expect(opened?.data.name).toBe('A');
  const patched = reduce(opened, { kind: 'patch', update: { name: 'B' } });
  expect(reduce(patched, openEvent(named.open({ name: 'C' }, { name: 'C' })))).toBe(patched);
});
