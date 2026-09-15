import { afterEach, expect, test, vi } from 'vitest';

import { interactions } from './interactions.mjs';

afterEach(() => vi.useRealTimers());

test('whole interaction timing retains carry admission and a slow browser independently of confirmation', async () => {
  vi.useFakeTimers({ toFake: ['performance'] });
  const peers = [
    { index: 0, role: 'player' },
    { index: 1, role: 'observer' },
    { index: 2, role: 'observer', browser: true },
  ];
  const timing = interactions(peers);
  const sample = timing.begin({
    peer: peers[0],
    operation: 'move',
    phase: 'measured',
    scheduledAt: 0,
    dispatchedAt: 10,
  });
  sample.carryRequestedAt = 10;
  await vi.advanceTimersByTimeAsync(300);
  sample.carryAdmittedAt = performance.now();
  sample.commandSentAt = performance.now();
  await vi.advanceTimersByTimeAsync(100);
  timing.observe(peers[1], 5);
  timing.observe(peers[0], 5);
  timing.confirm(sample, 5);
  expect(timing.outstanding()).toEqual([{ revision: 5, missingRecipients: [2] }]);
  await vi.advanceTimersByTimeAsync(1000);
  timing.observe(peers[2], 5);
  const report = timing.finish();
  expect(report.byPhase.measured.carryAdmission.p95).toBe(290);
  expect(report.byPhase.measured.savedConfirmation.p95).toBe(100);
  expect(report.byPhase.measured.intentToConfirmation.p95).toBe(400);
  expect(report.byPhase.measured.fullInteraction.p95).toBe(1400);
  expect(report.byRecipientClass['protocol-observer'].fullInteraction.p95).toBe(400);
  expect(report.byRecipientClass['browser-observer'].fullInteraction.p95).toBe(1400);
  expect(timing.outstanding()).toEqual([]);
});

test('preparation and missing recipient observations cannot improve measured results', async () => {
  vi.useFakeTimers({ toFake: ['performance'] });
  const peers = [
    { index: 0, role: 'player' },
    { index: 1, role: 'observer', browser: true },
  ];
  const timing = interactions(peers);
  const prep = timing.begin({ peer: peers[0], operation: 'rotate', phase: 'preparation' });
  prep.commandSentAt = 0;
  timing.observe(peers[0], 1);
  timing.observe(peers[1], 1);
  timing.confirm(prep, 1);
  const sample = timing.begin({ peer: peers[0], operation: 'flip', phase: 'measured' });
  sample.commandSentAt = 0;
  await vi.advanceTimersByTimeAsync(700);
  timing.observe(peers[0], 2);
  timing.confirm(sample, 2);
  const report = timing.finish();
  expect(report.byPhase.preparation.savedConfirmation.samples).toBe(1);
  expect(report.byPhase.measured.savedConfirmation.p95).toBe(700);
  expect(report.byPhase.measured.missingCompletions).toBe(1);
  expect(report.perClient[1]).toMatchObject({ missing: 1, fullInteraction: { samples: 0 } });
  expect(report.rows[1].missingRecipients).toEqual([1]);
});
