import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { z } from 'zod';

import { playPendingProvisionSchema } from '../../src/shared/play/admission.ts';
import { hostedCellSchema, hostedRunSchema, hostedTargetSchema } from '../../src/shared/play/loadTarget.ts';
import { privateInputFile } from './hosted-paths.ts';

const sessionSchema = z
  .object({
    target: hostedTargetSchema,
    run: hostedRunSchema,
    game: playPendingProvisionSchema,
    cell: hostedCellSchema,
    controlSecret: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

const identity = ({ profile, case: loadCase, repetition, compression }) => ({
  profile,
  case: loadCase,
  repetition,
  compression,
});

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

async function request(session, method, timeoutMs = 15_000) {
  const { target, game, controlSecret } = session;
  return fetch(`${target.applicationOrigin}/__play/games/${game.gameId}/load-control`, {
    method,
    headers: { Authorization: `Bearer ${controlSecret}` },
    redirect: 'error',
    signal: AbortSignal.timeout(timeoutMs),
  });
}

function attest(session, state, response) {
  const { target, game } = session;
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
  assert.deepEqual(state.cell, identity(session.cell), 'The room was activated for a different cell.');
  return { ...state, edgeColo: response.headers.get('cf-ray')?.split('-')[1] ?? null };
}

async function control(session, method) {
  const response = await request(session, method);
  assert.equal(response.status, 200, 'The isolated load controller refused the request.');
  return attest(session, await controllerState(response), response);
}

/*
 * Publishing an activation creates a new Worker version, and for a few seconds a request can still reach one that
 * holds the previous activation or none: it answers 404 (another game's paths) or 410 (parked). The 22 September
 * browser cell failed on exactly that, one read after a passing one. So the coordinator waits until consecutive
 * reads all reach this cell's activation, and only a read that reaches it is held to the attestation.
 * The wait ends early enough to leave the fixture's one-minute provisioning lease `leaseMarginMs` for provisioning.
 */
const ACTIVATION_SETTLE = { reads: 3, intervalMs: 1000, timeoutMs: 20_000, leaseMarginMs: 20_000 };

async function settledActivation(session, settle) {
  const deadline = Math.min(Date.now() + settle.timeoutMs, session.game.expiresAt - settle.leaseMarginMs);
  const seen = [];
  let agreeing = 0;
  let state;
  while (agreeing < settle.reads) {
    const remaining = deadline - Date.now();
    assert.ok(
      remaining > 0,
      `The activation did not settle before the fixture's provisioning lease needed the rest of its time: ${agreeing} of ${settle.reads} consecutive controller reads reached this cell; the last reads that did not answered ${seen.slice(-5).join(', ') || 'nothing'}.`
    );
    const response = await request(session, 'GET', Math.min(15_000, remaining));
    let body = null;
    if (response.status === 200) {
      body = await controllerState(response);
    } else {
      await response.body?.cancel();
    }
    if (body?.gameId === session.game.gameId) {
      state = attest(session, body, response);
      agreeing++;
    } else {
      seen.push(response.status === 200 ? `200 for game ${body?.gameId}` : String(response.status));
      agreeing = 0;
    }
    if (agreeing < settle.reads) {
      await new Promise((resolve) => setTimeout(resolve, settle.intervalMs));
    }
  }
  return { ...state, unsettledReads: seen };
}

/**
 * Each approved cell runs against its own activation.
 * The coordinator's arguments must restate the cell, so an activation cannot be reused for a different one.
 */
function assertCell(cell, values) {
  assert.equal(values.profile, cell.profile, 'The hosted activation was approved for a different profile.');
  assert.equal(values.case, cell.case, 'The hosted activation was approved for a different case.');
  assert.equal(Number(values.repetition ?? '1'), cell.repetition, 'The repetition differs from the approved cell.');
  assert.equal(values.compression, cell.compression, 'The compression setting differs from the approved cell.');
  assert.ok(
    values['max-bytes'] === undefined || Number(values['max-bytes']) === cell.maxApplicationBytes,
    'The byte limit differs from the approved cell.'
  );
  assert.equal(values.seed, undefined, 'A hosted cell keeps the seed of its repetition.');
}

/** The coordinator needs a private run file and a deploy key minted for the explicit isolated deployment. */
export async function openHostedSession(filename, values, settle = ACTIVATION_SETTLE) {
  const input = await privateInputFile(filename);
  const session = sessionSchema.parse(JSON.parse(await readFile(input, 'utf8')));
  const key = process.env.CONVEX_DEPLOY_KEY ?? '';
  assert.ok(
    key.startsWith(`dev:${session.target.backendName}|`),
    'The deploy key must belong to the isolated development deployment.'
  );
  assert.equal(values.origin, session.target.applicationOrigin);
  assertCell(session.cell, values);
  assert.equal(values['profile-cpu'], false, 'Hosted CPU must come from namespace analytics.');
  assert.ok(
    Date.now() >= session.run.startsAt && Date.now() + 120_000 < session.run.expiresAt,
    'The hosted run needs at least two minutes remaining.'
  );
  const initial = await settledActivation(session, settle);
  assert.equal(initial.stopped, null, 'A stopped hosted run cannot be reused.');
  return {
    ...session,
    key,
    initial,
    /** The room expires on its own clock, so the wall bound and the fixture's retirement must end inside the window. */
    assertWindow(wallSeconds) {
      assert.ok(
        Date.now() + (wallSeconds + 60) * 1000 < session.run.expiresAt,
        `The ${session.cell.case} cell needs ${wallSeconds} seconds and a minute of margin inside the run window.`
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
