import { describe, expect, it } from 'vitest';

import { TABLE_PHASES } from './phases';
import { phaseGate } from './setup';
import type { SetupState } from './setup';

const MENTAT_PAUSE = TABLE_PHASES.findIndex((phase) => phase.id === 'mentat-pause');
const roster = {
  seatCount: 2 as const,
  seats: [
    { id: 's1', position: 0, faction: null },
    { id: 's2', position: 1, faction: null },
  ],
};
const step = (id: string, kind: 'prediction' | 'traitors' | 'forces') => ({
  id,
  kind,
  title: id,
  instructions: '',
  symbol: '',
});
const setupAt = (index: number): SetupState => ({
  steps: [step('prediction-0-0', 'prediction'), step('traitors', 'traitors'), step('forces', 'forces')],
  index,
  visit: 1,
  mapRevealed: false,
  completed: [],
  instructions: [],
});
const locked = { 'prediction-0-0': { factionId: 'a', lockedAt: 1, revealedAt: null } };

describe('the phase-advance gate', () => {
  it('asks for readiness only at Mentat pause during play', () => {
    const play = { stage: 'play' as const, roster, seats: ['s1', 's2'] };
    expect(phaseGate({ ...play, phase: 0, ready: [] })).toEqual({ needsReady: false, refusal: null });
    expect(phaseGate({ ...play, phase: MENTAT_PAUSE, ready: ['s1'] })).toEqual({
      needsReady: true,
      refusal: 'Every seated player must be ready before advancing.',
    });
    expect(phaseGate({ ...play, phase: MENTAT_PAUSE, ready: ['s1', 's2'] }).refusal).toBeNull();
  });

  it('asks for the locked prediction on a prediction step and a full ready table after it', () => {
    const setup = { stage: 'setup' as const, phase: 0, roster, ready: ['s1', 's2'], seats: ['s1', 's2'] };
    expect(phaseGate({ ...setup, setup: setupAt(0) })).toEqual({
      needsReady: false,
      refusal: 'Lock the required prediction before advancing.',
    });
    expect(phaseGate({ ...setup, setup: setupAt(0), predictions: locked }).refusal).toBeNull();
    expect(phaseGate({ ...setup, setup: setupAt(1) })).toEqual({ needsReady: true, refusal: null });
    expect(phaseGate({ ...setup, setup: setupAt(2), seats: ['s1'], ready: ['s1'] })).toEqual({
      needsReady: true,
      refusal: 'Every fixed seat must be occupied and ready before advancing.',
    });
  });

  it('reads an empty seat list as not ready', () => {
    expect(phaseGate({ stage: 'play', phase: MENTAT_PAUSE, ready: [], seats: [] }).refusal).toBe(
      'Every seated player must be ready before advancing.'
    );
    const empty = { seatCount: 2 as const, seats: [] };
    expect(
      phaseGate({ stage: 'setup', setup: setupAt(1), phase: 0, roster: empty, ready: [], seats: [] }).refusal
    ).toBe('Every fixed seat must be occupied and ready before advancing.');
  });
});
