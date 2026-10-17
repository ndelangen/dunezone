/// <reference types="vite/client" />
// @vitest-environment edge-runtime

/**
 * PROTOTYPE measurements for approach B.
 * Opt-in: FACTION_CATALOGUE_BENCH=100,1000,10000 bun run test convex/factionCatalogueIndex.bench
 * Reads and bytes come from convex-test's transaction metrics (component reads included);
 * wall time is convex-test's, so only relative.
 */
import aggregateTest from '@convex-dev/aggregate/test';
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';

import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import type { Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import { applicationTriggers } from './lib/applicationTriggers';
import { loadFactionCatalogue } from './lib/factionCatalogue';
import {
  loadCataloguePage,
  selectCataloguePageEntries,
  syncFactionCatalogueEntries,
} from './lib/factionCatalogueIndex';
import type { CataloguePageArgs } from './lib/factionCatalogueIndex';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const SIZES = (process.env.FACTION_CATALOGUE_BENCH ?? '')
  .split(',')
  .map(Number)
  .filter((n) => n > 0);
const NAMES = ['Atreides', 'Harkonnen', 'Fremen', 'Emperor', 'Guild', 'Bene Gesserit', 'Ixians', 'Tleilaxu', 'Richese'];
const BATCH = 250;

type Metrics = {
  bytesRead: { used: number };
  documentsRead: { used: number };
  documentsWritten: { used: number };
  bytesWritten: { used: number };
  databaseQueries: { used: number };
};

async function metrics(ctx: { meta: unknown }): Promise<Metrics> {
  return await (ctx.meta as { getTransactionMetrics: () => Promise<Metrics> }).getTransactionMetrics();
}

function factionRow(ownerId: Id<'users'>, index: number) {
  return {
    owner_id: ownerId,
    data: {
      ...assetPublishingFaction,
      name: `${NAMES[index % NAMES.length]} ${index}`,
      complexity: { calculated: Math.round((index * 37) % 101) / 100 },
    },
    slug: `faction-${index}`,
    created_at: new Date(Date.UTC(2025, 0, 1) + index * 3_600_000).toISOString(),
    updated_at: new Date(Date.UTC(2026, 0, 1) + ((index * 7919) % 100_000) * 60_000).toISOString(),
    is_deleted: false,
    group_id: null,
  };
}

describe.skipIf(SIZES.length === 0)('faction catalogue approach B measurements', () => {
  for (const size of SIZES) {
    test(`${size} factions`, { timeout: 3_600_000 }, async () => {
      const t = convexTest(schema, modules);
      aggregateTest.register(t, 'statistics');
      aggregateTest.register(t, 'factionCatalogueOrder');
      aggregateTest.register(t, 'profileActivity');
      aggregateTest.register(t, 'profileDiscovery');
      const { ownerId, rulesetId } = await t.run(async (ctx) => {
        const ownerId = await ctx.db.insert('users', { name: 'Owner' });
        const rulesetId = await ctx.db.insert('rulesets', {
          name: 'Advanced',
          about: 'A test ruleset with an About long enough to satisfy the fifty character floor.',
          slug: 'advanced',
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
          owner_id: ownerId,
          group_id: null,
          is_deleted: false,
          image_cover: null,
        });
        return { ownerId, rulesetId };
      });

      const seedStart = performance.now();
      for (let start = 0; start < size; start += BATCH) {
        await t.run(async (rawCtx) => {
          const ctx = applicationTriggers.wrapDB(rawCtx);
          for (let index = start; index < Math.min(size, start + BATCH); index += 1) {
            const id = await ctx.db.insert('factions', factionRow(ownerId, index));
            if (index % 3 === 0) {
              await ctx.db.insert('ruleset_factions', { ruleset_id: rulesetId, faction_id: id });
            }
          }
        });
      }
      const seedMs = performance.now() - seedStart;

      /* Write amplification of the read model alone: one faction (linked to one ruleset) after a rename. */
      const writeCost = await t.run(async (rawCtx) => {
        const factionId = (await rawCtx.db.query('ruleset_factions').first())!.faction_id;
        const faction = (await rawCtx.db.get('factions', factionId))!;
        await rawCtx.db.patch('factions', factionId, {
          data: { ...faction.data, name: 'Zzz renamed' },
          updated_at: '2027-01-01T00:00:00.000Z',
        });
        const before = await metrics(rawCtx);
        await syncFactionCatalogueEntries(applicationTriggers.wrapDB(rawCtx) as MutationCtx, factionId);
        const after = await metrics(rawCtx);
        return {
          docsWritten: after.documentsWritten.used - before.documentsWritten.used,
          bytesWritten: after.bytesWritten.used - before.bytesWritten.used,
          docsRead: after.documentsRead.used - before.documentsRead.used,
        };
      });
      const insertCost = await t.run(async (rawCtx) => {
        const before = await metrics(rawCtx);
        const ctx = applicationTriggers.wrapDB(rawCtx);
        const id = await ctx.db.insert('factions', factionRow(ownerId, size + 1));
        await ctx.db.insert('ruleset_factions', { ruleset_id: rulesetId, faction_id: id });
        const mid = await metrics(rawCtx);
        await ctx.db.patch('factions', id, { is_deleted: true });
        const after = await metrics(rawCtx);
        return {
          createAndLinkWritten: mid.documentsWritten.used - before.documentsWritten.used,
          softDeleteWritten: after.documentsWritten.used - mid.documentsWritten.used,
        };
      });

      const scenarios: Array<[string, CataloguePageArgs]> = [
        ['name p1', { sort: 'name', page: 1 }],
        ['name last page', { sort: 'name', page: Math.ceil(size / 24) }],
        ['updated desc p5', { sort: 'updated', direction: 'desc', page: 5 }],
        ['ruleset complexity p2', { ruleset: rulesetId, sort: 'complexity', page: 2 }],
        ['cx 0.4-0.6 sort cx p3', { sort: 'complexity', complexityMin: 0.4, complexityMax: 0.6, page: 3 }],
        ['cx 0.4-0.6 sort name p1', { sort: 'name', complexityMin: 0.4, complexityMax: 0.6, page: 1 }],
        ['cx 0.4-0.6 sort name p20', { sort: 'name', complexityMin: 0.4, complexityMax: 0.6, page: 20 }],
        ['cx 0.9-1 sort name p1', { sort: 'name', complexityMin: 0.9, complexityMax: 1, page: 1 }],
        ['q "harkonnen" p1', { q: 'harkonnen', sort: 'relevance', page: 1 }],
        ['q "jessica" (all) p1', { q: 'jessica', sort: 'relevance', page: 1 }],
      ];
      const rows: string[] = [];
      for (const [label, args] of scenarios) {
        const select = await t.run(async (ctx) => {
          await selectCataloguePageEntries(ctx, args);
          const m = await metrics(ctx);
          return `select docs=${m.documentsRead.used} KB=${(m.bytesRead.used / 1024).toFixed(1)} | `;
        });
        const row = await t.run(async (ctx) => {
          const start = performance.now();
          const result = await loadCataloguePage(ctx, args);
          const ms = performance.now() - start;
          const m = await metrics(ctx);
          return `${label.padEnd(26)} ${select}mode=${result.mode.padEnd(17)} exact=${String(result.exact).padEnd(5)} total=${String(result.total).padEnd(6)} items=${String(result.items.length).padEnd(3)} docs=${String(m.documentsRead.used).padEnd(6)} KB=${(m.bytesRead.used / 1024).toFixed(1).padEnd(8)} queries=${String(m.databaseQueries.used).padEnd(4)} ms=${ms.toFixed(0)}`;
        });
        rows.push(row);
      }
      rows.push(
        await t.run(async (ctx) => {
          const start = performance.now();
          const { factions } = await loadFactionCatalogue(ctx);
          const ms = performance.now() - start;
          const m = await metrics(ctx);
          return `${'current cataloguePage'.padEnd(26)} rows=${factions.length} docs=${m.documentsRead.used} KB=${(m.bytesRead.used / 1024).toFixed(1)} queries=${m.databaseQueries.used} ms=${ms.toFixed(0)}`;
        })
      );
      const counts = await t.run(async (ctx) => ({
        entries: (await ctx.db.query('faction_catalogue_entries').collect()).length,
      }));
      expect(rows).toHaveLength(scenarios.length + 1);
      console.log(
        [
          `=== ${size} factions: seed ${(seedMs / 1000).toFixed(1)}s, entries=${counts.entries}`,
          `rename (1 ruleset link): read-model writes=${writeCost.docsWritten} (${(writeCost.bytesWritten / 1024).toFixed(1)} KB), reads=${writeCost.docsRead}`,
          `create+link: all-trigger writes=${insertCost.createAndLinkWritten}; soft delete: ${insertCost.softDeleteWritten}`,
          ...rows,
        ].join('\n')
      );
    });
  }
});
