/* @vitest-environment jsdom */

import { serverMessageSchema } from '@shared/play/protocol';
import { describe, expect, test, vi } from 'vitest';

import { journeySteps, journeyViewers, stepCode } from './journey.stories.fixture';
import { SandboxTable, sandboxSteps } from './sandbox.stories.fixture';

/* The fixture reaches the Storybook database module, whose application client needs a Convex address a unit run does not have. */
vi.mock('@db/core', () => ({ db: {} }));

describe('The Play sandbox', () => {
  test('starts from every step of setup and play, and only those', () => {
    const stages = journeySteps().map((step) => step.views['seat-1']!.snapshot.stage);
    expect(sandboxSteps()).toEqual(
      stages.flatMap((stage, index) => (stage === 'setup' || stage === 'play' ? [index] : []))
    );
  });

  test('every starting table shows each viewer a view the page accepts', () => {
    for (const start of sandboxSteps()) {
      const table = new SandboxTable({ start, seat: 'seat-1' });
      for (const seat of journeyViewers()) {
        const parsed = serverMessageSchema.safeParse(table.frame(seat));
        expect(parsed.error?.issues ?? [], `${stepCode(start)} as ${seat}`).toEqual([]);
      }
      table.dispose();
    }
  });

  test('a step before setup starts at the first table the recording kept', () => {
    const table = new SandboxTable({ start: 0, seat: 'seat-1' });
    expect(table.start).toBe(sandboxSteps()[0]);
    table.dispose();
  });

  test('the table changes on a phase command and tells the page, while a result command is refused', () => {
    /* The recording ends with the winner being determined, which holds the phase, so the test starts just before. */
    const start = sandboxSteps()
      .filter((step) => !journeySteps()[step]!.views['seat-1']!.snapshot.ending)
      .at(-1)!;
    const table = new SandboxTable({ start, seat: 'seat-1' });
    const delivered: unknown[] = [];
    table.deliver = (message) => delivered.push(message);
    const revision = table.room.snapshot.revision;
    table.receive({
      type: 'command',
      commandId: 'phase',
      expectedRevision: revision,
      action: { kind: 'phase', direction: -1 },
    });
    expect(table.refusal).toBeUndefined();
    expect(table.room.snapshot.revision).toBe(revision + 1);
    expect(delivered.at(-1)).toMatchObject({ type: 'view', completedCommandId: 'phase' });
    table.receive({
      type: 'command',
      commandId: 'declare',
      expectedRevision: revision + 1,
      action: { kind: 'result-open' },
    });
    expect(table.refusal).toMatch(/runs the table only/);
    expect(delivered).toContainEqual(expect.objectContaining({ type: 'rejected', requestId: 'declare' }));
    table.dispose();
  });

  test('viewing as another seat shows that seat its own hand and spice reserve', () => {
    const table = new SandboxTable({ start: sandboxSteps().at(-1)!, seat: 'seat-1' });
    const delivered: { type: string; viewer?: { viewerSeat: string } }[] = [];
    table.deliver = (message) => delivered.push(message as (typeof delivered)[number]);
    table.viewAs('seat-3');
    expect(delivered.at(-1)?.viewer?.viewerSeat).toBe('seat-3');
    expect(table.frame().snapshot.bank?.factionId).not.toBe(
      new SandboxTable({ start: sandboxSteps().at(-1)!, seat: 'seat-1' }).frame().snapshot.bank?.factionId
    );
    table.dispose();
  });
});
