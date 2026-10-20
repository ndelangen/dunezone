import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, test } from 'vite-plus/test';

import { rulebookContentsHash } from '../../../convex/lib/rulebookEditionContents';
import { assetPublishingFaction } from '../../../src/shared/factions/fixtures/assetPublishingFaction';
import { createRulebookEditorialStarterContents } from '../../../src/shared/rulebooks/fixtures';
import { environmentSchema } from './contracts';
import type { Binding, Environment, Readback, RecordSpec } from './contracts';
import { atomicJson, fileHash, inside, valueHash } from './files';
import { assertBook, assertIdentities, loadProject, normalize, ownedIdentities } from './project';
import { bindValue, collectValue } from './references';
import { applyCollection, collect, inspectCheckpoint, prepare, protectedValue, unwrapExport } from './workflow';

const roots: string[] = [];
const now = new Date('2026-10-20T12:00:00.000Z');
const token = (name: string) => ({
  name,
  about: 'A fixture token.',
  front: {
    image: '/vector/icon/spice.svg',
    background: {
      colors: ['#bda35d', '#f2dfa1'],
      definition: 0,
      image: '/image/texture/076.jpg',
      influence: 1,
      invert: true,
    },
    symbolScale: 1,
    top: '',
    bottomFirst: '',
    bottomSecond: '',
    ring: true,
  },
  back: { mode: 'same' },
});
const spec = (key: string): RecordSpec => ({
  key,
  kind: 'asset',
  type: 'token-disc',
  operation: 'update',
  scope: 'gf9',
  file: `assets/${key}.json`,
});
const bindings: Binding[] = [{ entityKey: 'gf9-a', path: ['back', 'asset_id'], targetKey: 'gf9-b', field: 'id' }];
function readback(key: string, data: unknown): Readback {
  return {
    format: 'gf9-record-readback',
    version: 1,
    applicationOrigin: 'http://127.0.0.1:43210',
    backendOrigin: 'http://127.0.0.1:43211',
    observedAt: now.toISOString(),
    rulesetId: 'fixture-ruleset',
    groupScopeId: 'fixture-group',
    viewer: { id: 'fixture-viewer', capabilities: { edit: true, rename: true, changeGroup: true } },
    record: {
      id: `fixture-${key}`,
      kind: 'asset',
      type: 'token-disc',
      slug: key,
      groupId: 'fixture-group',
      ownerId: 'fixture-owner',
    },
    data,
    relationships: { members: [], rulesetSlots: [], rulesetIds: [] },
  };
}
function normalExport(saved: Readback) {
  const { id, slug, groupId } = saved.record;
  const data = saved.record.kind === 'rulebook' ? { name: saved.record.name, ...(saved.data as object) } : saved.data;
  const subject =
    saved.record.kind === 'rulebook'
      ? { id, slug, groupId: null, data, revision: saved.record.revision }
      : saved.record.kind === 'faction'
        ? { id, slug, groupId, data, linked: saved.relationships.rulesetIds.includes(saved.rulesetId) }
        : { id, slug, groupId, data, slots: saved.relationships.rulesetSlots, members: saved.relationships.members };
  return {
    format: 'dunezone-package',
    version: 1,
    packageKey: `export-${slug}`,
    items: [
      {
        key: slug,
        kind: saved.record.kind,
        ...(saved.record.kind === 'asset' ? { type: saved.record.type } : {}),
        existing: { slug },
        data,
        expectedStateHash: rulebookContentsHash(subject),
      },
    ],
  };
}
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'gf9-authoring-test-'));
  roots.push(root);
  const records = ['gf9-a', 'gf9-b', 'gf9-c'].map(spec);
  const saved = new Map(
    records.map((record) => [record.key, readback(record.key, normalize(record, token(record.key)))])
  );
  saved.get('gf9-a')!.data = { ...token('gf9-a'), back: { mode: 'reference', asset_id: 'fixture-gf9-b' } };
  const authored = new Map(
    [...saved].map(([key, row]) => [key, { ...structuredClone(row.data as object), about: 'Reviewed fixture text.' }])
  );
  (authored.get('gf9-a') as { back?: unknown }).back = { mode: 'reference', asset_id: '@gf9/b' };
  for (const record of records) {
    await atomicJson(path.join(root, 'authoring', record.file!), authored.get(record.key));
  }
  await atomicJson(path.join(root, 'authoring/manifest.json'), { version: 1, status: 'ready', records });
  await atomicJson(path.join(root, 'authoring/reference-bindings.json'), { version: 1, bindings });
  await atomicJson(path.join(root, 'authoring/identities.json'), { version: 1, records: [] });
  await atomicJson(path.join(root, 'authoring/links.json'), { version: 1, retired: [], links: [] });
  await atomicJson(path.join(root, 'authoring/artwork.json'), {
    version: 1,
    maintainedCatalogue: '../artwork/provenance.json',
    records: [],
  });
  await atomicJson(path.join(root, 'artwork/provenance.json'), { records: [] });
  const environment = environmentSchema.parse({
    version: 1,
    name: 'local',
    status: 'bound',
    identity: {
      applicationOrigin: 'http://127.0.0.1:43210',
      backendOrigin: 'http://127.0.0.1:43211',
      ruleset: { id: 'fixture-ruleset', slug: 'gf9' },
      group: { id: 'fixture-group', slug: 'gf9' },
    },
    bindings: Object.fromEntries(
      records.map((record) => {
        const row = saved.get(record.key)!;
        return [
          record.key,
          {
            state: 'bound',
            id: row.record.id,
            slug: row.record.slug,
            kind: record.kind,
            type: record.type,
            groupId: row.record.groupId,
            baselineSavedHash: valueHash(normalize(record, row.data)),
            baselineProtectedHash: valueHash(protectedValue(row, record)),
          },
        ];
      })
    ),
  });
  await atomicJson(path.join(root, 'environments/local.json'), environment);
  async function checkpoint(name = 'checkpoint', rows = saved) {
    const captured = [];
    for (const [key, row] of rows) {
      const readbackPath = `review/${name}/${key}-readback.json`,
        exportPath = `review/${name}/${key}-export.json`;
      await atomicJson(path.join(root, readbackPath), row);
      await atomicJson(path.join(root, exportPath), normalExport(row));
      captured.push({
        key,
        readback: readbackPath,
        readbackSha256: await fileHash(path.join(root, readbackPath)),
        export: exportPath,
        exportSha256: await fileHash(path.join(root, exportPath)),
        exportedAt: now.toISOString(),
      });
    }
    const file = `review/${name}/checkpoint.json`;
    await atomicJson(path.join(root, file), {
      format: 'gf9-saved-checkpoint',
      version: 1,
      environment: 'local',
      applicationOrigin: environment.identity!.applicationOrigin,
      backendOrigin: environment.identity!.backendOrigin,
      capturedAt: now.toISOString(),
      openDrafts: 'saved-or-discarded',
      records: captured,
    });
    return file;
  }
  return { root, records, saved, authored, environment, checkpoint };
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('file-only GF9 authoring', () => {
  test('prepares deterministic typed values and collects the saved value without changing references or identities', async () => {
    const f = await fixture(),
      checkpoint = await f.checkpoint(),
      options = { root: f.root, environment: 'local' as const, checkpoint, run: 'first', initialBaseline: true, now };
    const first = await prepare(options),
      again = await prepare(options);
    expect(first).toEqual(again);
    expect(first.report.entries.map((row) => row.status)).toEqual(['ready', 'ready', 'ready']);
    const generated = JSON.parse(await readFile(path.join(f.root, 'generated/local/first/gf9-a.json'), 'utf8'));
    expect(generated.back).toEqual({ mode: 'reference', asset_id: 'fixture-gf9-b' });
    expect(first.report.entries[0].alsoRename).toBe(false);
    for (const record of f.records) {
      f.saved.get(record.key)!.data = JSON.parse(
        await readFile(path.join(f.root, `generated/local/first/${record.key}.json`), 'utf8')
      );
    }
    (f.saved.get('gf9-a')!.data as { about: string }).about = 'A local correction that must be collected.';
    const next = await f.checkpoint('saved');
    const plan = await collect({ root: f.root, environment: 'local', checkpoint: next, run: 'collect', now });
    expect(plan.plan.blocked).toEqual([]);
    expect(plan.plan.changes[0].paths).toContain('$.about');
    expect((plan.plan.changes[0].data as { back: unknown }).back).toEqual({ mode: 'reference', asset_id: '@gf9/b' });
    const applied = await applyCollection({ root: f.root, plan: plan.output, reviewedHash: plan.planHash, now });
    expect(applied.applied).toHaveLength(3);
    const prepared = await prepare({ root: f.root, environment: 'local', checkpoint: next, run: 'again', now });
    expect(prepared.report.entries.every((row) => row.status === 'ready')).toBe(true);
    expect(JSON.parse(await readFile(path.join(f.root, 'generated/local/again/gf9-a.json'), 'utf8'))).toEqual(
      f.saved.get('gf9-a')!.data
    );
  });
  test('blocks only a changed local record and its consumers', async () => {
    const f = await fixture();
    await prepare({
      root: f.root,
      environment: 'local',
      checkpoint: await f.checkpoint(),
      run: 'baseline',
      initialBaseline: true,
      now,
    });
    (f.saved.get('gf9-b')!.data as { about: string }).about = 'An uncollected edit.';
    const result = await prepare({
      root: f.root,
      environment: 'local',
      checkpoint: await f.checkpoint('changed'),
      run: 'changed',
      now,
    });
    expect(result.report.entries.map((row) => row.status)).toEqual(['blocked', 'blocked', 'ready']);
  });
  test.each(['members', 'owner', 'group', 'origin', 'target', 'capability'] as const)(
    'refuses changed %s evidence',
    async (change) => {
      const f = await fixture();
      await prepare({
        root: f.root,
        environment: 'local',
        checkpoint: await f.checkpoint(),
        run: 'baseline',
        initialBaseline: true,
        now,
      });
      const row = f.saved.get('gf9-c')!;
      if (change === 'members') {
        row.relationships.members = [{ id: 'other-fixture-record', count: 2 }];
      }
      if (change === 'owner') {
        row.record.ownerId = 'another-fixture-owner';
      }
      if (change === 'group') {
        row.record.groupId = 'another-fixture-group';
      }
      if (change === 'origin') {
        row.applicationOrigin = 'http://127.0.0.1:44444';
      }
      if (change === 'target') {
        row.record.id = 'another-fixture-target';
      }
      if (change === 'capability') {
        row.viewer.capabilities.edit = false;
      }
      const result = await prepare({
        root: f.root,
        environment: 'local',
        checkpoint: await f.checkpoint('changed'),
        run: 'changed',
        keys: ['gf9-c'],
        now,
      });
      expect(result.report.entries[0].status).toBe('blocked');
    }
  );
  test('stops collection when both sources changed, until the exact reviewed prepared intent is supplied', async () => {
    const f = await fixture();
    await prepare({
      root: f.root,
      environment: 'local',
      checkpoint: await f.checkpoint(),
      run: 'baseline',
      initialBaseline: true,
      now,
    });
    const file = path.join(f.root, 'authoring/assets/gf9-c.json'),
      newValue = { ...f.authored.get('gf9-c'), about: 'Changed in authored files.' };
    await atomicJson(file, newValue);
    const intent = await prepare({
      root: f.root,
      environment: 'local',
      checkpoint: await f.checkpoint('before-save'),
      run: 'intent',
      keys: ['gf9-c'],
      now,
    });
    f.saved.get('gf9-c')!.data = JSON.parse(
      await readFile(path.join(f.root, 'generated/local/intent/gf9-c.json'), 'utf8')
    );
    const checkpoint = await f.checkpoint('saved');
    const blocked = await collect({
      root: f.root,
      environment: 'local',
      checkpoint,
      run: 'blocked',
      keys: ['gf9-c'],
      now,
    });
    expect(blocked.plan.blocked[0].error).toContain('Both authored files');
    const accepted = await collect({
      root: f.root,
      environment: 'local',
      checkpoint,
      run: 'accepted',
      keys: ['gf9-c'],
      prepared: intent.output,
      now,
    });
    expect(accepted.plan.blocked).toEqual([]);
    await writeFile(file, JSON.stringify({ ...newValue, about: 'Edited after review.' }));
    await expect(
      applyCollection({ root: f.root, plan: accepted.output, reviewedHash: accepted.planHash, now })
    ).rejects.toThrow('Input changed');
  });
  test('unknown or mis-typed references never use name-based guessing', async () => {
    const f = await fixture(),
      source = f.records[0],
      records = new Map(f.records.map((item) => [item.key, item]));
    expect(() => bindValue(source, f.authored.get(source.key), [], records, f.environment)).toThrow(
      'Declare the typed binding'
    );
    const wrong = new Map(records);
    wrong.set('gf9-b', { ...f.records[1], type: 'board' });
    expect(() => bindValue(source, f.authored.get(source.key), bindings, wrong, f.environment)).toThrow(
      'requires token-disc'
    );
    const unknown = { ...token('gf9-a'), back: { mode: 'reference', asset_id: 'unknown-fixture-id' } };
    expect(() => collectValue(source, unknown, bindings, records, f.environment)).toThrow(
      'Unknown collected reference'
    );
    expect(() =>
      bindValue(source, f.authored.get(source.key), [...bindings, bindings[0]], records, f.environment)
    ).toThrow('Duplicate binding');
  });
  test('inspection bootstraps measured hashes without invented baseline hashes, but preparation still requires them', async () => {
    const f = await fixture();
    for (const binding of Object.values(f.environment.bindings)) {
      if (binding.state === 'bound') {
        delete binding.baselineSavedHash;
        delete binding.baselineProtectedHash;
      }
    }
    await atomicJson(path.join(f.root, 'environments/local.json'), f.environment);
    const checkpoint = await f.checkpoint(),
      observed = await inspectCheckpoint({ root: f.root, environment: 'local', checkpoint, now });
    expect(observed.records).toHaveLength(3);
    expect(observed.records[0].savedHash).toMatch(/^[a-f0-9]{64}$/);
    await expect(
      prepare({ root: f.root, environment: 'local', checkpoint, run: 'refused', initialBaseline: true, now })
    ).rejects.toThrow('baseline');
  });
  test('rejects stale checkpoints, altered exports and importer additions', async () => {
    const f = await fixture(),
      checkpoint = await f.checkpoint();
    await expect(
      prepare({
        root: f.root,
        environment: 'local',
        checkpoint,
        run: 'old',
        initialBaseline: true,
        now: new Date(now.getTime() + 31 * 60_000),
      })
    ).rejects.toThrow('fresh normal authenticated');
    const row = f.saved.get('gf9-a')!,
      bundle = normalExport(row);
    expect(unwrapExport(bundle, f.records[0], row).data).toEqual(normalize(f.records[0], row.data));
    expect(() =>
      unwrapExport(
        {
          ...bundle,
          items: [{ ...bundle.items[0], bindings: [{ path: ['back', 'asset_id'], key: 'invented', field: 'id' }] }],
        },
        f.records[0],
        row
      )
    ).toThrow();
    await writeFile(path.join(f.root, 'review/checkpoint/gf9-a-export.json'), '{}');
    await expect(
      prepare({ root: f.root, environment: 'local', checkpoint, run: 'altered', initialBaseline: true, now })
    ).rejects.toThrow('Export file changed');
  });
  test('refuses path and symlink escapes', async () => {
    const f = await fixture();
    await expect(inside(f.root, '../escape.json', true)).rejects.toThrow('leaves');
    await symlink(os.tmpdir(), path.join(f.root, 'outside'));
    await expect(inside(f.root, 'outside/escape.json', true)).rejects.toThrow('Symlink leaves');
  });
  test('uses the same writable budgets and documented faction normalization', () => {
    const record = spec('gf9-large');
    expect(() => normalize(record, { ...token('large'), about: 'é'.repeat(262_144) })).toThrow('512 KiB');
    expect(() => normalize(record, { nested: JSON.parse('['.repeat(65) + '0' + ']'.repeat(65)) })).toThrow('64 levels');
    expect(() => normalize(record, { nodes: Array(50_000).fill(0) })).toThrow('50,000');
    const factionSpec: RecordSpec = {
      key: 'fixture-faction',
      kind: 'faction',
      operation: 'update',
      scope: 'gf9',
      file: 'factions/fixture.json',
    };
    const faction = normalize(factionSpec, assetPublishingFaction) as typeof assetPublishingFaction;
    expect(faction.factionLeader.memberId).toBe(assetPublishingFaction.factionLeader.memberId);
    expect(faction.troops.map((troop) => troop.troopId)).toEqual(
      assetPublishingFaction.troops.map((troop) => troop.troopId)
    );
  });
  test('enforces accepted stock covers, owned Page/Block/item identity and the 100-Page limit', () => {
    const contents = createRulebookEditorialStarterContents();
    contents.pagesById.CVER = {
      id: 'CVER',
      anchor: 'cover',
      title: 'Fixture book',
      layoutId: 'cover',
      showHeading: false,
      controlValues: {
        cover: {
          subtitle: '',
          supportingText: '',
          showDuneLogo: false,
          showSubtitle: false,
          backgroundSource: { kind: 'preset', presetId: 'sandworm' },
        },
      },
      blockOrderByRegion: {},
      blocksById: {},
    };
    contents.pageOrder.unshift('CVER');
    const cover = contents.pagesById.CVER;
    if (cover.layoutId !== 'cover') {
      throw new Error('Missing fixture cover');
    }
    cover.controlValues.cover.backgroundSource = { kind: 'preset', presetId: 'sandworm' };
    const bookSpec: RecordSpec = {
      key: 'core-rules',
      kind: 'rulebook',
      operation: 'update',
      scope: 'gf9',
      file: 'books/core.json',
      book: 'core',
    };
    const data = normalize(bookSpec, { settings: { size: 'gf9-core', design: 'illustrated' }, contents });
    assertBook(bookSpec, data);
    const entries = ownedIdentities(bookSpec, data).map((item, index, all) => ({
      ...item,
      key: `identity-${index}`,
      ...(item.ownerPath
        ? {
            owner: `identity-${all.findIndex((owner) => JSON.stringify(owner.path.slice(0, -1)) === JSON.stringify(item.ownerPath))}`,
          }
        : {}),
    }));
    const registry = {
      version: 1 as const,
      records: [
        { entityKey: 'core-rules', entries: entries.map(({ ownerPath: _ownerPath, ...entry }) => entry), retired: [] },
      ],
    };
    expect(() => assertIdentities(bookSpec, data, registry)).not.toThrow();
    registry.records[0].entries[0].value = 'ZZZZ';
    expect(() => assertIdentities(bookSpec, data, registry)).toThrow('Identity changed');
    cover.controlValues.cover.backgroundSource = { kind: 'url' };
    expect(() => assertBook(bookSpec, { settings: { size: 'gf9-core', design: 'illustrated' }, contents })).toThrow(
      'stock cover'
    );
    const many = structuredClone(contents);
    many.pageOrder = ['CVER'];
    many.pagesById = { CVER: cover };
    const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    for (let index = 0; index < 100; index++) {
      const id = '22' + alphabet[Math.floor(index / alphabet.length)] + alphabet[index % alphabet.length];
      many.pageOrder.push(id);
      many.pagesById[id] = {
        id,
        anchor: `page-${index}`,
        title: 'Fixture page',
        layoutId: 'single-column',
        showHeading: false,
        controlValues: {},
        blockOrderByRegion: { content: [] },
        blocksById: {},
      };
    }
    expect(() =>
      normalize(bookSpec, { settings: { size: 'gf9-core', design: 'illustrated' }, contents: many })
    ).toThrow('between 1 and 100');
    const last = many.pageOrder.pop()!;
    delete many.pagesById[last];
    expect(() =>
      normalize(bookSpec, { settings: { size: 'gf9-core', design: 'illustrated' }, contents: many })
    ).not.toThrow();
  });
  test('scaffolds and unbound environments never become ready payloads', async () => {
    const f = await fixture();
    await atomicJson(path.join(f.root, 'authoring/manifest.json'), { version: 1, status: 'scaffold', records: [] });
    await expect(loadProject(f.root)).rejects.toThrow('still a scaffold');
  });
});

describe('production preparation gates', () => {
  test('uses explicit production references, permits the approved content overwrite and still requires exact local review', async () => {
    const f = await fixture();
    const initial = await f.checkpoint();
    await prepare({
      root: f.root,
      environment: 'local',
      checkpoint: initial,
      run: 'initial',
      initialBaseline: true,
      now,
    });
    for (const record of f.records) {
      f.saved.get(record.key)!.data = JSON.parse(
        await readFile(path.join(f.root, `generated/local/initial/${record.key}.json`), 'utf8')
      );
    }
    const localCheckpoint = await f.checkpoint('local-saved');
    const collection = await collect({
      root: f.root,
      environment: 'local',
      checkpoint: localCheckpoint,
      run: 'collect',
      now,
    });
    await applyCollection({ root: f.root, plan: collection.output, reviewedHash: collection.planHash, now });
    const production = structuredClone(f.environment);
    production.name = 'production';
    production.identity = {
      applicationOrigin: 'https://dune.zone',
      backendOrigin: 'https://fixture-production.convex.cloud',
      ruleset: { id: 'production-fixture-ruleset', slug: 'gf9' },
      group: { id: 'production-fixture-group', slug: 'gf9' },
    };
    const captured = [];
    for (const record of f.records) {
      const row = structuredClone(f.saved.get(record.key)!);
      row.applicationOrigin = production.identity.applicationOrigin;
      row.backendOrigin = production.identity.backendOrigin;
      row.rulesetId = production.identity.ruleset.id;
      row.groupScopeId = production.identity.group.id;
      row.record.id = `production-${record.key}`;
      row.record.groupId = production.identity.group.id;
      (row.data as { about: string }).about = 'A later production content edit is deliberately replaced.';
      production.bindings[record.key] = {
        state: 'bound',
        kind: 'asset',
        type: record.type,
        id: row.record.id,
        slug: row.record.slug,
        groupId: row.record.groupId,
        baselineSavedHash: valueHash(row.data),
        baselineProtectedHash: valueHash(protectedValue(row, record)),
      };
      const readbackPath = `review/production/${record.key}-readback.json`,
        exportPath = `review/production/${record.key}-export.json`;
      await atomicJson(path.join(f.root, readbackPath), row);
      await atomicJson(path.join(f.root, exportPath), normalExport(row));
      captured.push({
        key: record.key,
        readback: readbackPath,
        readbackSha256: await fileHash(path.join(f.root, readbackPath)),
        export: exportPath,
        exportSha256: await fileHash(path.join(f.root, exportPath)),
        exportedAt: now.toISOString(),
      });
    }
    await atomicJson(path.join(f.root, 'environments/production.json'), production);
    const checkpoint = 'review/production/checkpoint.json';
    await atomicJson(path.join(f.root, checkpoint), {
      format: 'gf9-saved-checkpoint',
      version: 1,
      environment: 'production',
      applicationOrigin: production.identity.applicationOrigin,
      backendOrigin: production.identity.backendOrigin,
      capturedAt: now.toISOString(),
      openDrafts: 'saved-or-discarded',
      records: captured,
    });
    const { execFileSync } = await import('node:child_process');
    execFileSync('git', ['init', '-q'], { cwd: f.root });
    execFileSync('git', ['add', 'authoring', 'artwork'], { cwd: f.root });
    execFileSync(
      'git',
      [
        '-c',
        'user.name=Fixture',
        '-c',
        'user.email=fixture@example.invalid',
        'commit',
        '-qm',
        'Fixture authored files',
      ],
      { cwd: f.root }
    );
    const authoringCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: f.root, encoding: 'utf8' }).trim();
    const project = await loadProject(f.root),
      sync = JSON.parse(await readFile(path.join(f.root, 'environments/local-sync.json'), 'utf8'));
    const review = 'review/approval.json';
    await atomicJson(path.join(f.root, review), {
      version: 1,
      authoringHash: project.authoringHash,
      authoringCommit,
      localEnvironmentFingerprint: valueHash(f.environment.identity),
      localBindingsHash: valueHash(f.environment.bindings),
      localSyncHash: valueHash(sync),
      codeIdentity: 'fixture-code',
      mediaIdentity: 'fixture-media',
      rulesReview: 'fixture://rules',
      visualReview: 'fixture://visual',
      workflowReview: 'fixture://workflow',
      reviewedKeys: f.records.map((record) => record.key),
    });
    const prepared = await prepare({
      root: f.root,
      environment: 'production',
      checkpoint,
      localCheckpoint,
      review,
      run: 'production',
      now,
    });
    expect(prepared.report.entries.every((entry) => entry.status === 'ready')).toBe(true);
    const payload = JSON.parse(await readFile(path.join(f.root, 'generated/production/production/gf9-a.json'), 'utf8'));
    expect(payload.back.asset_id).toBe('production-gf9-b');
    expect(payload.about).toBe('Reviewed fixture text.');
    await atomicJson(path.join(f.root, 'authoring/assets/gf9-c.json'), {
      ...token('gf9-c'),
      about: 'Unreviewed changes.',
    });
    await expect(
      prepare({ root: f.root, environment: 'production', checkpoint, localCheckpoint, review, run: 'stale', now })
    ).rejects.toThrow('review does not identify');
  });
});

test('new native fields and bold content survive typed collection and preparation', () => {
  const spiceSpec: RecordSpec = {
    key: 'fixture-spice',
    kind: 'asset',
    type: 'card-spice',
    operation: 'update',
    scope: 'gf9',
    file: 'assets/spice.json',
  };
  const boardSpec: RecordSpec = {
    key: 'fixture-board',
    kind: 'asset',
    type: 'board',
    operation: 'reference',
    scope: 'shared',
  };
  const tokenSpec = spec('gf9-token');
  const asset = {
    name: 'Discovery fixture',
    subName: 'Discovery',
    icon: '/vector/icon/spice.svg',
    highlights: [],
    amount: 6,
    text: 'Place *6 spice* here.',
    about: 'A fixture.',
    board: {
      asset_id: '@gf9/fixture-board',
      tints: [],
      tokens: [{ layerId: 'stable-layer', asset_id: '@gf9/token', x: 100, y: 100, size: 30, rotation: 0 }],
      typeToken: { asset_id: '@gf9/token' },
      look: { style: 'textured-burn', strength: 1 },
    },
  };
  const references: Binding[] = [
    { entityKey: spiceSpec.key, path: ['board', 'asset_id'], targetKey: boardSpec.key, field: 'id' },
    { entityKey: spiceSpec.key, path: ['board', 'tokens', 0, 'asset_id'], targetKey: tokenSpec.key, field: 'id' },
    { entityKey: spiceSpec.key, path: ['board', 'typeToken', 'asset_id'], targetKey: tokenSpec.key, field: 'id' },
  ];
  const records = new Map([spiceSpec, boardSpec, tokenSpec].map((record) => [record.key, record]));
  const environment: Environment = {
    version: 1,
    name: 'local',
    status: 'bound',
    identity: null,
    bindings: {
      [boardSpec.key]: {
        state: 'bound',
        id: 'fixture-board-id',
        slug: 'fixture-board',
        kind: 'asset',
        type: 'board',
        groupId: null,
      },
      [tokenSpec.key]: {
        state: 'bound',
        id: 'fixture-token-id',
        slug: 'fixture-token',
        kind: 'asset',
        type: 'token-disc',
        groupId: 'fixture-group',
      },
    },
  };
  const authored = normalize(spiceSpec, asset),
    prepared = normalize(spiceSpec, bindValue(spiceSpec, authored, references, records, environment));
  expect(collectValue(spiceSpec, prepared, references, records, environment)).toEqual(authored);
  expect(prepared).toMatchObject({
    text: 'Place *6 spice* here.',
    board: {
      look: { style: 'textured-burn', strength: 1 },
      typeToken: { asset_id: 'fixture-token-id' },
      tokens: [{ layerId: 'stable-layer' }],
    },
  });
  const styled = token('Styled fixture');
  Object.assign(styled.front, {
    symbolFill: '#111111',
    symbolStroke: '#eeeeee',
    symbolStrokeWidth: 2.5,
    symbolShadow: false,
  });
  expect(normalize(tokenSpec, styled)).toEqual(styled);
  const cardSpec: RecordSpec = { ...spiceSpec, type: 'card-treachery' };
  const treachery = {
    name: 'Fixture card',
    subName: 'Special',
    head: styled.front.background,
    icon: [styled.front.background, '/vector/icon/treachery.svg'],
    decals: [],
    bodyLayout: 'text-only',
    text: 'Preserve *bold text*.',
    about: 'A fixture.',
  };
  expect(normalize(cardSpec, treachery)).toEqual(treachery);
});

test('replacement layouts and cross-Page Block moves require new owned identities', async () => {
  const f = await fixture();
  const bookSpec: RecordSpec = {
    key: 'core-rules',
    kind: 'rulebook',
    operation: 'update',
    scope: 'gf9',
    file: 'books/core.json',
    book: 'core',
  };
  const cover = {
    id: 'CVER',
    anchor: 'cover',
    title: 'Dune',
    layoutId: 'cover',
    showHeading: false,
    controlValues: {
      cover: {
        backgroundSource: { kind: 'preset', presetId: 'sandworm' },
        showDuneLogo: false,
        showSubtitle: false,
        subtitle: '',
        supportingText: '',
      },
    },
    blockOrderByRegion: {},
    blocksById: {},
  };
  const block = { id: 'TEXT', kind: 'text', text: 'A fixture rule.' };
  const page = {
    id: 'PAGE',
    anchor: 'rules',
    title: 'Rules',
    layoutId: 'two-columns',
    showHeading: true,
    controlValues: {},
    blockOrderByRegion: { column1: ['TEXT'], column2: [] },
    blocksById: { TEXT: block },
  };
  const previous = {
    settings: { size: 'gf9-core', design: 'illustrated' },
    contents: { schemaVersion: 1, pageOrder: ['CVER', 'PAGE'], pagesById: { CVER: cover, PAGE: page } },
  };
  const saved = readback('core-rules', previous);
  saved.record = {
    id: 'fixture-core-rules',
    kind: 'rulebook',
    slug: 'core',
    groupId: null,
    ownerId: 'fixture-owner',
    name: 'Dune',
    revision: 1,
  };
  f.saved.set(bookSpec.key, saved);
  f.records.push(bookSpec);
  f.environment.bindings[bookSpec.key] = {
    state: 'bound',
    id: saved.record.id,
    slug: 'core',
    kind: 'rulebook',
    groupId: null,
    baselineSavedHash: valueHash(previous),
    baselineProtectedHash: valueHash(protectedValue(saved, bookSpec)),
  };
  await atomicJson(path.join(f.root, 'environments/local.json'), f.environment);
  await atomicJson(path.join(f.root, 'authoring/manifest.json'), { version: 1, status: 'ready', records: f.records });
  async function writeBook(pageId: string, blockId: string, retired: boolean) {
    const desired = {
      ...previous,
      contents: {
        schemaVersion: 1,
        pageOrder: ['CVER', pageId],
        pagesById: {
          CVER: cover,
          [pageId]: {
            ...page,
            id: pageId,
            layoutId: 'single-column',
            blockOrderByRegion: { content: [blockId] },
            blocksById: { [blockId]: { ...block, id: blockId } },
          },
        },
      },
    };
    await atomicJson(path.join(f.root, 'authoring/books/core.json'), desired);
    await atomicJson(path.join(f.root, 'authoring/identities.json'), {
      version: 1,
      records: [
        {
          entityKey: bookSpec.key,
          entries: [
            {
              key: 'page-cover',
              path: ['contents', 'pagesById', 'CVER', 'id'],
              value: 'CVER',
              kind: 'page',
              layoutId: 'cover',
            },
            {
              key: 'page-new',
              path: ['contents', 'pagesById', pageId, 'id'],
              value: pageId,
              kind: 'page',
              layoutId: 'single-column',
            },
            {
              key: 'block-new',
              path: ['contents', 'pagesById', pageId, 'blocksById', blockId, 'id'],
              value: blockId,
              kind: 'block',
              owner: 'page-new',
            },
          ],
          retired: retired
            ? [
                {
                  key: 'page-old',
                  kind: 'page',
                  value: 'PAGE',
                  replacementKeys: ['page-new'],
                  reason: 'Changed layout.',
                },
                {
                  key: 'block-old',
                  kind: 'block',
                  value: 'TEXT',
                  owner: 'page-old',
                  replacementKeys: ['block-new'],
                  reason: 'Changed Page owner.',
                },
              ]
            : [],
        },
      ],
    });
  }
  await writeBook('PAGE', 'TEXT', false);
  const checkpoint = await f.checkpoint('book');
  const invalidLayout = await prepare({
    root: f.root,
    environment: 'local',
    checkpoint,
    run: 'invalid-layout',
    initialBaseline: true,
    keys: [bookSpec.key],
    now,
  });
  expect(invalidLayout.report.entries[0].error).toContain('changed layout without a replacement ID');
  await writeBook('NEW3', 'TEXT', true);
  const invalidMove = await prepare({
    root: f.root,
    environment: 'local',
    checkpoint,
    run: 'invalid-move',
    keys: [bookSpec.key],
    now,
  });
  expect(invalidMove.report.entries[0].error).toContain('moved to a different Page without a new ID');
  await writeBook('NEW3', 'NEW4', true);
  const correct = await prepare({
    root: f.root,
    environment: 'local',
    checkpoint,
    run: 'replacement',
    keys: [bookSpec.key],
    now,
  });
  expect(correct.report.entries[0].status).toBe('ready');
});

test('native piece kinds stay items and board token layers are owned by their Block', () => {
  const bookSpec: RecordSpec = {
    key: 'core-rules',
    kind: 'rulebook',
    scope: 'gf9',
    operation: 'update',
    file: 'books/core.json',
    book: 'core',
  };
  const owned = ownedIdentities(bookSpec, {
    contents: {
      pagesById: {
        PAGE: {
          id: 'PAGE',
          layoutId: 'single-column',
          blocksById: {
            BLOK: {
              id: 'BLOK',
              kind: 'piece-transfer',
              pieces: [{ id: 'troop-item', kind: 'troops' }],
              scene: { tokens: [{ layerId: 'token-layer' }] },
            },
          },
        },
      },
    },
  });
  expect(owned.map((item) => item.kind)).toEqual(['page', 'block', 'item', 'layer']);
  expect(owned[2].ownerPath).toEqual(['contents', 'pagesById', 'PAGE', 'blocksById', 'BLOK']);
  expect(owned[3].ownerPath).toEqual(owned[2].ownerPath);
});
