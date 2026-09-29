/* @vitest-environment jsdom */

import { serverMessageSchema } from '@shared/play/protocol';
import { describe, expect, test, vi } from 'vitest';

import { journeyFrame, journeySteps, journeyViewers, railsTarget, stepCode } from './journey.stories.fixture';

/* The fixture reaches the Storybook database module, whose application client needs a Convex address a unit run does not have. */
vi.mock('@db/core', () => ({ db: {} }));

describe('The Play journey recording', () => {
  test('every recorded frame is a view the page accepts today', () => {
    for (const [index, step] of journeySteps().entries()) {
      for (const seat of Object.keys(step.views)) {
        const parsed = serverMessageSchema.safeParse(journeyFrame(index, seat));
        expect(parsed.error?.issues ?? [], `${stepCode(index)} as ${seat}`).toEqual([]);
      }
    }
  });

  test('the game runs from drafting to a finished result, seen by six seats and a spectator', () => {
    const steps = journeySteps();
    expect(steps[0]!.views['seat-1']!.snapshot.stage).toBe('drafting');
    expect(steps.at(-1)!.views['seat-1']!.snapshot.stage).toBe('finished');
    expect(journeyViewers()).toEqual(['seat-1', 'seat-2', 'seat-3', 'seat-4', 'seat-5', 'seat-6', 'neutral']);
  });

  test('a step shows what its viewer may see: a seat its own bank, a spectator none', () => {
    const last = journeySteps().length - 1;
    expect(journeyFrame(last, 'seat-2').snapshot.bank).toBeDefined();
    expect(journeyFrame(last, 'neutral').snapshot.bank).toBeUndefined();
  });

  test('a command advances only when it is the one the recording took next from that seat', () => {
    const steps = journeySteps();
    const index = steps.findIndex((step, position) => position > 0 && step.actor && step.action);
    const { actor, action } = steps[index]!;
    expect(railsTarget(index - 1, actor!, action!)).toBe(index);
    expect(railsTarget(index - 1, actor!, { kind: 'not-recorded' })).toBeNull();
    expect(railsTarget(index - 1, actor === 'seat-1' ? 'seat-2' : 'seat-1', action!)).toBeNull();
  });

  test('images point at the Storybook fixtures, never at the recording origin', () => {
    const text = JSON.stringify(journeyFrame(journeySteps().length - 1, 'seat-1'));
    expect(text).not.toContain('table.test');
    expect(text).not.toContain('{{origin}}');
  });
});
