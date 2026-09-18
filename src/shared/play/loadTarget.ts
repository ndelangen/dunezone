import { z } from 'zod';

import { loadProfileSchema } from './loadProfile';

/** Reject application Worker names and known application storage targets before hosted preparation. */
export const hostedTargetSchema = z
  .object({
    project: z.literal('norbert-de-langen:dunezone-play-load'),
    reference: z.string().regex(/^dev\/[a-z0-9-]+$/),
    backendName: z.string().regex(/^[a-z]+-[a-z]+-\d+$/),
    backendOrigin: z.url(),
    applicationOrigin: z.string().regex(/^https:\/\/dunezone-play-load-[a-z0-9-]+\.ndelangen\.workers\.dev$/),
    gameWorker: z.string().regex(/^dunezone-game-load-[a-z0-9-]+$/),
    namespaceId: z.string().regex(/^[a-f0-9]{32}$/),
    sourceRevision: z.string().regex(/^[a-f0-9]{40}$/),
  })
  .strict()
  .superRefine((target, ctx) => {
    if (target.backendOrigin !== `https://${target.backendName}.eu-west-1.convex.cloud`) {
      ctx.addIssue({
        code: 'custom',
        message: 'The backend origin must match the isolated European deployment.',
      });
    }
    if (['exuberant-finch-263', 'tame-raccoon-541'].includes(target.backendName)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Application deployments cannot host load tests.',
      });
    }
    if (target.namespaceId === '3163dfec12ff4ab0a3887f8aaef457bd') {
      ctx.addIssue({
        code: 'custom',
        message: 'The production game namespace cannot host load tests.',
      });
    }
  });

export const hostedRunSchema = z
  .object({
    runId: z.string().regex(/^[a-f0-9]{32}$/),
    startsAt: z.number().int().nonnegative(),
    expiresAt: z.number().int().positive(),
  })
  .strict()
  .refine((run) => run.expiresAt > run.startsAt && run.expiresAt - run.startsAt <= 20 * 60_000);

export type HostedLoadTarget = z.infer<typeof hostedTargetSchema>;

/**
 * The isolated room's ceilings for one game.
 * The maxima are fixed in code, and an activation or a local fixture selects a cell's ceilings at or below them.
 * One steady cell schedules 86,400 motion inputs and 720 saved commands before carries, syncs and admissions.
 */
export const loadRoomCeilingSchema = z
  .object({
    messages: z.number().int().min(1).max(120_000),
    incomingBytes: z
      .number()
      .int()
      .min(1)
      .max(32 * 1024 * 1024),
    requests: z.number().int().min(1).max(1000),
    connections: z.number().int().min(1).max(44),
  })
  .strict();

export const loadCaseSchema = z.enum(['probe', 'peak', 'reconnect', 'trace', 'multitab', 'steady', 'slow', 'browser']);

/** What makes one cell of the matrix distinct from another, carried into the room's ledger with the ceilings. */
export const loadCellIdentitySchema = z
  .object({
    profile: loadProfileSchema,
    case: loadCaseSchema,
    repetition: z.number().int().min(1).max(3),
    compression: z.enum(['on', 'off']),
  })
  .strict();

/** The largest byte stop an approved cell may carry: above the 1.5 GiB of a separated steady cell, below two. */
const MAX_CELL_APPLICATION_BYTES = 2 * 1024 * 1024 * 1024;

/**
 * One approved cell of the hosted matrix: the case the coordinator may run against one activation.
 * The approval names the owner's comment on the ticket that permitted this cell's bounds.
 */
export const hostedCellSchema = loadCellIdentitySchema
  .extend({
    maxApplicationBytes: z.number().int().positive().max(MAX_CELL_APPLICATION_BYTES),
    ceilings: loadRoomCeilingSchema,
    approval: z.string().regex(/^https:\/\/github\.com\/ndelangen\/dunezone\/issues\/\d+#issuecomment-\d+$/),
  })
  .strict()
  .refine((cell) => cell.case !== 'browser' || cell.compression === 'on', {
    message: 'Browser cells keep the browser negotiation.',
  });

const activationSchema = z
  .object({
    gameId: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),
    run: hostedRunSchema,
    ceilings: loadRoomCeilingSchema,
    cell: loadCellIdentitySchema,
  })
  .strict();

/** Uploaded Workers stay parked until the operator supplies one game, its bounded run, its cell and the cell's ceilings. */
export function hostedActivation(value: string | undefined) {
  try {
    return activationSchema.parse(JSON.parse(value ?? 'null'));
  } catch {
    return null;
  }
}

export function requireHostedRun(target: HostedLoadTarget, environment: Record<string, string | undefined>) {
  z.object({
    CONVEX_CLOUD_URL: z.literal(target.backendOrigin),
    SITE_URL: z.literal(target.applicationOrigin),
    IS_TEST: z.literal('true'),
    E2E_LOCAL_AUTH: z.literal('true'),
  }).parse({
    CONVEX_CLOUD_URL: environment.CONVEX_CLOUD_URL,
    SITE_URL: environment.SITE_URL,
    IS_TEST: environment.IS_TEST,
    E2E_LOCAL_AUTH: environment.E2E_LOCAL_AUTH,
  });
  const run = hostedRunSchema.parse(JSON.parse(environment.PLAY_LOAD_RUN ?? 'null'));
  if (Date.now() < run.startsAt || Date.now() >= run.expiresAt) {
    throw new Error('The hosted load run is inactive.');
  }
  return run;
}

/** Real Password Auth owns hashing, sessions and JWTs; this guard limits the copied backend's account inputs. */
export function hostedLoadIdentity(
  target: HostedLoadTarget,
  environment: Record<string, string | undefined>,
  params: Record<string, unknown>
) {
  const run = requireHostedRun(target, environment);
  const { email } = z
    .object({
      email: z.string(),
      password: z.string().min(32).max(128),
      flow: z.enum(['signUp', 'signIn']),
    })
    .parse(params);
  const accounts = Array.from({ length: 38 }, (_, index) => `load-${index}-${run.runId}@example.invalid`);
  if (!accounts.includes(email)) {
    throw new Error('Only the fixed synthetic load accounts may sign in.');
  }
  return { email };
}
