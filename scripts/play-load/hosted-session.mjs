import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { z } from 'zod';

import { playPendingProvisionSchema } from '../../src/shared/play/admission.ts';
import { loadProfileSchema } from '../../src/shared/play/loadProfile.ts';
import { hostedCellSchema, hostedRunSchema, hostedTargetSchema } from '../../src/shared/play/loadTarget.ts';
import { privateInputFile } from './hosted-paths.ts';

const sessionSchema = z
  .object({
    target: hostedTargetSchema,
    run: hostedRunSchema,
    game: playPendingProvisionSchema,
    profile: loadProfileSchema,
    cell: hostedCellSchema,
    controlSecret: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

async function controllerState(response) {
  assert.ok(response.body, 'The controller returned no state.');
  const chunks = [];
  let length = 0;
  for await (const chunk of response.body) {
    length += chunk.byteLength;
    assert.ok(length <= 16 * 1024, 'The controller response exceeds its size bound.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString());
}

async function control(session, method) {
  const { target, game, controlSecret } = session;
  const response = await fetch(`${target.applicationOrigin}/__play/games/${game.gameId}/load-control`, {
    method,
    headers: { Authorization: `Bearer ${controlSecret}` },
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  });
  assert.equal(response.status, 200, 'The isolated load controller refused the request.');
  const state = await controllerState(response);
  assert.equal(state.gameId, game.gameId);
  assert.equal(state.gitSha, target.sourceRevision);
  assert.equal(state.backendOrigin, target.backendOrigin);
  assert.equal(state.applicationOrigin, target.applicationOrigin);
  assert.equal(state.expiresAt, session.run.expiresAt);
  assert.deepEqual(
    state.ceilings,
    session.cell.ceilings,
    'The room enforces different ceilings than the approved cell.'
  );
  return { ...state, edgeColo: response.headers.get('cf-ray')?.split('-')[1] ?? null };
}

/**
 * Each approved cell runs against its own activation.
 * The coordinator's arguments must restate the cell, so an activation cannot be reused for a different case.
 */
function assertCell(cell, values) {
  assert.equal(values.case, cell.case, 'The hosted activation was approved for a different case.');
  assert.equal(Number(values.repetition ?? '1'), cell.repetition, 'The repetition differs from the approved cell.');
  assert.equal(values.compression, cell.compression, 'The compression setting differs from the approved cell.');
  assert.ok(
    values['max-bytes'] === undefined || Number(values['max-bytes']) === cell.maxApplicationBytes,
    'The byte limit differs from the approved cell.'
  );
}

/** The coordinator needs a private run file and a deploy key minted for the explicit isolated deployment. */
export async function openHostedSession(filename, values) {
  const input = await privateInputFile(filename);
  const session = sessionSchema.parse(JSON.parse(await readFile(input, 'utf8')));
  const key = process.env.CONVEX_DEPLOY_KEY ?? '';
  assert.ok(
    key.startsWith(`dev:${session.target.backendName}|`),
    'The deploy key must belong to the isolated development deployment.'
  );
  assert.equal(values.origin, session.target.applicationOrigin);
  assert.equal(values.profile, session.profile);
  assertCell(session.cell, values);
  assert.equal(values['profile-cpu'], false, 'Hosted CPU must come from namespace analytics.');
  assert.ok(
    Date.now() >= session.run.startsAt && Date.now() + 120_000 < session.run.expiresAt,
    'The hosted run needs at least two minutes remaining.'
  );
  const initial = await control(session, 'GET');
  assert.equal(initial.stopped, null, 'A stopped hosted run cannot be reused.');
  return {
    ...session,
    key,
    initial,
    /** The room expires on its own clock, so the coordinator's wall bound must end inside the window. */
    assertWindow(wallSeconds) {
      assert.ok(
        Date.now() + (wallSeconds + 30) * 1000 < session.run.expiresAt,
        `The ${session.cell.case} cell needs ${wallSeconds} seconds and a margin inside the run window.`
      );
    },
    async stop() {
      const state = await control(session, 'DELETE');
      assert.ok(state.stopped, 'The hosted room did not stop.');
      assert.equal(state.alarm, null, 'The hosted room retained an alarm.');
      assert.ok(
        Object.values(state.rows).every((count) => count === 0),
        'The hosted room retained game records.'
      );
      return state;
    },
  };
}
