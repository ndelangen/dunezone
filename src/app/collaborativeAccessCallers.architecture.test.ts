import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

const sources = {
  collaborativeAccess: readFileSync(
    new URL('../../convex/lib/collaborativeAccess.ts', import.meta.url),
    'utf8'
  ),
  factionDb: readFileSync(new URL('./factions/db.ts', import.meta.url), 'utf8'),
  factionDetail: readFileSync(
    new URL('./routes/_app/factions/$factionId/index.tsx', import.meta.url),
    'utf8'
  ),
  factionEdit: readFileSync(
    new URL('./routes/_app/factions/$factionId/edit.tsx', import.meta.url),
    'utf8'
  ),
  rulesetDb: readFileSync(new URL('./rulesets/db.ts', import.meta.url), 'utf8'),
  rulesetDetail: readFileSync(
    new URL('./routes/_app/rulesets/$rulesetSlug/index.tsx', import.meta.url),
    'utf8'
  ),
  rulesetEdit: readFileSync(
    new URL('./routes/_app/rulesets/$rulesetSlug/edit.tsx', import.meta.url),
    'utf8'
  ),
};

describe('faction and ruleset collaborative-access caller contract', () => {
  test('domain page adapters expose the canonical viewer projection', () => {
    expect(sources.factionDb).toContain('viewerAccess');
    expect(sources.rulesetDb).toContain('viewerAccess');
    expect(sources.factionDb).not.toContain('FactionPageGroupAccess');
    expect(sources.factionDb).not.toMatch(/^\s+memberships:/m);
    expect(sources.factionDb).not.toMatch(/^\s+groupAccess:/m);
    expect(sources.rulesetDb).not.toContain('canEditRuleset');
    expect(sources.rulesetDb).not.toMatch(/^\s+groupAccess:/m);
  });

  test('the server policy module owns its public contract', () => {
    expect(sources.collaborativeAccess).not.toContain('../../src/app');
    expect(sources.collaborativeAccess).toContain('export type CollaborativeAccess =');
    expect(sources.factionDb).toContain("from '../../../convex/lib/collaborativeAccess'");
    expect(sources.rulesetDb).toContain("from '../../../convex/lib/collaborativeAccess'");
  });

  test('detail and edit routes render authorization from viewerAccess capabilities', () => {
    for (const source of [
      sources.factionDetail,
      sources.factionEdit,
      sources.rulesetDetail,
      sources.rulesetEdit,
    ]) {
      expect(source).toContain('viewerAccess');
    }

    expect(sources.factionDetail).not.toContain('canEditFaction(');
    expect(sources.factionDetail).not.toContain('groupAccess');
    expect(sources.factionDetail).not.toContain('memberships');
    expect(sources.rulesetDetail).not.toContain('canEditRuleset');
    expect(sources.rulesetDetail).not.toContain('groupAccess');
    expect(sources.rulesetEdit).not.toContain('canEditRuleset');
  });

  test('ruleset owner actions do not depend on profile projection availability', () => {
    expect(sources.rulesetDetail).not.toMatch(
      /\{profile\.data\?\._id \? \(\s*<Group[^>]+aria-label="Ruleset actions"/
    );
  });

  test('membership request handlers consume command rejections after state records the error', () => {
    for (const source of [sources.factionDetail, sources.rulesetDetail]) {
      expect(source).not.toMatch(
        /onClick=\{\(\) => void membershipWorkflow\.request\.run\(assignedGroup\.id\)\}/
      );
      expect(source).toMatch(
        /void membershipWorkflow\.request\s*\.run\(assignedGroup\.id\)\s*\.catch\(\(\) => undefined\)/
      );
    }
  });
});
