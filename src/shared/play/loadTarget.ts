import { z } from 'zod';

/** Reject application Worker names and known application storage targets before hosted preparation. */
export const hostedTargetSchema = z
  .object({
    project: z.literal('norbert-de-langen:dunezone-play-load'),
    reference: z.string().regex(/^dev\/[a-z0-9-]+$/),
    backendName: z.string().regex(/^[a-z]+-[a-z]+-[0-9]+$/),
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

export function requireHostedRun(target: HostedLoadTarget, environment: Record<string, string | undefined>) {
  const matches =
    environment.CONVEX_CLOUD_URL === target.backendOrigin && environment.SITE_URL === target.applicationOrigin;
  const enabled = environment.IS_TEST === 'true' && environment.E2E_LOCAL_AUTH === 'true';
  if (!matches || !enabled) {
    throw new Error('The hosted load backend does not match its isolated target.');
  }
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
  const email = params.email;
  const password = params.password;
  if (typeof email !== 'string' || typeof password !== 'string' || password.length < 32 || password.length > 128) {
    throw new Error('Invalid synthetic load credentials.');
  }
  const accounts = Array.from({ length: 38 }, (_, index) => `load-${index}-${run.runId}@example.invalid`);
  if (!accounts.includes(email) || !['signUp', 'signIn'].includes(String(params.flow))) {
    throw new Error('Only the fixed synthetic load accounts may sign in.');
  }
  return { email };
}
