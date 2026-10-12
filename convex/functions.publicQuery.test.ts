import { getAuthUserId } from '@convex-dev/auth/server';
import { convexTest } from 'convex-test';
import { createFunctionHandle, makeFunctionReference } from 'convex/server';
import { describe, expect, test } from 'vitest';

import { publicQuery, viewerQuery } from './functions';
import schema from './schema';

/* Probe functions registered only for this suite, under a module name no real file uses. */
const probes = {
  readsAuth: publicQuery({ args: {}, handler: async (ctx) => await getAuthUserId(ctx) }),
  nestsViewerQuery: publicQuery({
    args: {},
    handler: async (ctx) => await ctx.runQuery(makeFunctionReference<'query'>('publicQueryProbe:viewer'), {}),
  }),
  nestsViewerQueryByHandle: publicQuery({
    args: {},
    handler: async (ctx) =>
      await ctx.runQuery(await createFunctionHandle(makeFunctionReference<'query'>('publicQueryProbe:viewer')), {}),
  }),
  /* Names an app query the way Convex reads first, while claiming a component path the way the guard reads. */
  nestsDisguisedViewerQuery: publicQuery({
    args: {},
    handler: async (ctx) =>
      await ctx.runQuery(
        {
          [Symbol.for('functionName')]: 'publicQueryProbe:viewer',
          [Symbol.for('toReferencePath')]: '_reference/childComponent/statistics/btree/count',
        } as unknown as Parameters<typeof ctx.runQuery>[0],
        {}
      ),
  }),
  /* A component reference while some backend code has planted an app function's name on Object.prototype. */
  nestsUnderPollutedPrototype: publicQuery({
    args: {},
    handler: async (ctx) => {
      const prototype = Object.prototype as Record<symbol, unknown>;
      prototype[Symbol.for('functionName')] = 'publicQueryProbe:viewer';
      try {
        return await ctx.runQuery(
          {
            [Symbol.for('toReferencePath')]: '_reference/childComponent/statistics/btree/count',
          } as unknown as Parameters<typeof ctx.runQuery>[0],
          {}
        );
      } finally {
        delete prototype[Symbol.for('functionName')];
      }
    },
  }),
  viewer: viewerQuery({ args: {}, handler: async (ctx) => (await ctx.auth.getUserIdentity())?.subject ?? null }),
};

const modules = { ...import.meta.glob('./**/*.ts'), './publicQueryProbe.ts': async () => probes };

function probe(name: keyof typeof probes) {
  return makeFunctionReference<'query'>(`publicQueryProbe:${name}`);
}

describe('publicQuery', () => {
  test('refuses to read the viewer through an auth helper', async () => {
    const t = convexTest(schema, modules).withIdentity({ subject: 'probe-viewer' });
    await expect(t.query(probe('readsAuth'), {})).rejects.toThrow('A publicQuery cannot read the viewer');
  });

  test('refuses a nested query, which would run with the caller identity', async () => {
    const t = convexTest(schema, modules).withIdentity({ subject: 'probe-viewer' });
    await expect(t.query(probe('viewer'), {})).resolves.toBe('probe-viewer');
    await expect(t.query(probe('nestsViewerQuery'), {})).rejects.toThrow('Nested ctx.runQuery is refused');
  });

  test('refuses a nested query by function handle, which can name an app query as easily as a component', async () => {
    const t = convexTest(schema, modules).withIdentity({ subject: 'probe-viewer' });
    await expect(t.query(probe('nestsViewerQueryByHandle'), {})).rejects.toThrow('Nested ctx.runQuery is refused');
  });

  test('a reference that names an app query while claiming a component path never reaches the app query', async () => {
    const t = convexTest(schema, modules).withIdentity({ subject: 'probe-viewer' });
    await expect(t.query(probe('nestsDisguisedViewerQuery'), {})).rejects.toThrow();
  });

  test('a name planted on Object.prototype cannot redirect a component call to an app query', async () => {
    const t = convexTest(schema, modules).withIdentity({ subject: 'probe-viewer' });
    await expect(t.query(probe('nestsUnderPollutedPrototype'), {})).rejects.toThrow();
  });
});
