import { execFileSync } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import { authoredCardback, DeckAsset } from '../../../src/shared/assets/schema';
import { parseRawFaction, rawRulebookSchema, readRawAuthoringJson } from '../../../src/shared/authoring/raw';
import { contentImportPackageSchema } from '../../../src/shared/contentImports/package';
import { assertRulebookReferences } from '../../../src/shared/rulebooks/references';
import type { RulebookResolvedFactionsById } from '../../../src/shared/rulebooks/references';
import type { RulebookResolvedAssetsById } from '../../../src/shared/rulebooks/sources';
import { checkpointSchema, readbackSchema, reviewSchema, syncSchema } from './contracts';
import type { BoundRecord, Checkpoint, Environment, Readback, RecordSpec, Sync } from './contracts';
import { atomicJson, at, canonical, differences, fileHash, inside, pretty, readJson, sha256, valueHash } from './files';
import {
  loadEnvironment,
  loadProject,
  normalize,
  ownedIdentities,
  assertIdentities,
  assertBook,
  validateLinks,
} from './project';
import type { Project } from './project';
import { assertNoUnboundMarkers, bindValue, collectValue } from './references';

const CHECKPOINT_MAX_AGE_MS = 30 * 60 * 1000;
const fingerprint = (environment: Environment) => valueHash(environment.identity);
export type Options = {
  root: string;
  environment: 'local' | 'production';
  checkpoint: string;
  run: string;
  keys?: string[];
  initialBaseline?: boolean;
  prepared?: string;
  localCheckpoint?: string;
  review?: string;
  now?: Date;
};
type Saved = { readback: Readback; data: unknown; savedHash: string; protectedHash: string; exportStateHash?: string };
type SavedCheckpoint = {
  checkpoint: Checkpoint;
  hash: string;
  files: Record<string, string>;
  records: Map<string, Saved>;
  errors: Map<string, string>;
};

export function protectedValue(readback: Readback, spec?: RecordSpec) {
  const { id, kind, ownerId } = readback.record;
  const type = spec?.operation === 'convert' ? spec.type : readback.record.type;
  const groupId = spec?.changes?.assignGroup ? readback.groupScopeId : readback.record.groupId;
  return {
    id,
    kind,
    type,
    groupId,
    ownerId,
    relationships: {
      ...readback.relationships,
      members: [...readback.relationships.members].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
      rulesetSlots: [...readback.relationships.rulesetSlots].sort(),
      rulesetIds: [...readback.relationships.rulesetIds].sort(),
    },
  };
}
function assertFresh(value: string, now: Date) {
  const age = now.getTime() - Date.parse(value);
  if (age < -60_000 || age > CHECKPOINT_MAX_AGE_MS) {
    throw new Error('Capture fresh normal authenticated exports/readbacks within the last 30 minutes.');
  }
}
function exportSubject(readback: Readback) {
  const common = {
    id: readback.record.id,
    slug: readback.record.slug,
    data: readback.data,
    groupId: readback.record.groupId,
  };
  if (readback.record.kind === 'rulebook') {
    return {
      ...common,
      data: { name: readback.record.name, ...(readback.data as object) },
      groupId: null,
      revision: readback.record.revision,
    };
  }
  if (readback.record.kind === 'faction') {
    return { ...common, linked: readback.relationships.rulesetIds.includes(readback.rulesetId) };
  }
  return {
    ...common,
    slots: [...readback.relationships.rulesetSlots].sort(),
    members: [...readback.relationships.members].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
  };
}
export function unwrapExport(value: unknown, spec: RecordSpec, readback: Readback) {
  const bundle = contentImportPackageSchema.parse(value);
  const item = bundle.items[0];
  if (
    bundle.items.length !== 1 ||
    bundle.packageKey !== `export-${readback.record.slug}` ||
    item.key !== readback.record.slug ||
    item.existing?.slug !== readback.record.slug ||
    item.kind !== spec.kind ||
    (item.kind === 'asset' && item.type !== readback.record.type) ||
    item.bindings?.length ||
    ('members' in item && item.members) ||
    ('slot' in item && item.slot) ||
    ('link' in item && item.link)
  ) {
    throw new Error('Use the unchanged normal single-record Download JSON export, not an importer package.');
  }
  const data =
    spec.kind === 'rulebook'
      ? z
          .strictObject({
            name: z.string(),
            settings: rawRulebookSchema.shape.settings,
            contents: rawRulebookSchema.shape.contents,
          })
          .parse(item.data)
      : item.data;
  const writable =
    spec.kind === 'rulebook'
      ? (({ settings, contents }) => ({ settings, contents }))(data as z.infer<typeof rawRulebookSchema>)
      : data;
  if (canonical(writable) !== canonical(readback.data)) {
    throw new Error('The saved export and current readback disagree. Capture them again.');
  }
  const expected = `v1:${valueHash(exportSubject(readback))}`;
  if (item.expectedStateHash !== expected) {
    throw new Error('The export state hash does not match the captured identity, data and relationships.');
  }
  return {
    data: normalize({ ...spec, ...(spec.kind === 'asset' ? { type: readback.record.type } : {}) }, writable),
    exportStateHash: expected,
  };
}
async function savedCheckpoint(
  project: Project,
  environment: Environment,
  file: string,
  now: Date
): Promise<SavedCheckpoint> {
  const resolved = await inside(project.root, file),
    checkpoint = await readJson(resolved, checkpointSchema);
  if (
    checkpoint.environment !== environment.name ||
    checkpoint.applicationOrigin !== environment.identity!.applicationOrigin ||
    checkpoint.backendOrigin !== environment.identity!.backendOrigin
  ) {
    throw new Error('The checkpoint belongs to another application/backend environment.');
  }
  assertFresh(checkpoint.capturedAt, now);
  const records = new Map<string, Saved>(),
    errors = new Map<string, string>(),
    files: Record<string, string> = { [file]: await fileHash(resolved) };
  const seen = new Set<string>();
  for (const captured of checkpoint.records) {
    if (seen.has(captured.key)) {
      throw new Error(`Duplicate checkpoint record ${captured.key}`);
    }
    seen.add(captured.key);
    try {
      const spec = project.records.get(captured.key),
        binding = environment.bindings[captured.key];
      if (!spec || !binding || binding.state !== 'bound') {
        throw new Error(`No verified ${environment.name} binding for ${captured.key}`);
      }
      const readbackPath = await inside(project.root, captured.readback);
      if ((await fileHash(readbackPath)) !== captured.readbackSha256) {
        throw new Error('Readback file changed after checkpoint capture.');
      }
      files[captured.readback] = captured.readbackSha256;
      const readback = await readJson(readbackPath, readbackSchema);
      assertFresh(readback.observedAt, now);
      if (
        readback.applicationOrigin !== checkpoint.applicationOrigin ||
        readback.backendOrigin !== checkpoint.backendOrigin ||
        readback.rulesetId !== environment.identity!.ruleset.id ||
        readback.groupScopeId !== environment.identity!.group.id
      ) {
        throw new Error('Readback environment or GF9 scope does not match.');
      }
      for (const key of ['id', 'slug', 'kind', 'type', 'groupId'] as const) {
        if (readback.record[key] !== binding[key]) {
          throw new Error(`Readback ${key} does not match the verified target.`);
        }
      }
      let data: unknown, exportStateHash: string | undefined;
      if (spec.operation === 'reference') {
        data = normalize(spec, readback.data);
      } else {
        if (!captured.export || !captured.exportSha256 || !captured.exportedAt) {
          throw new Error('Obtain a fresh normal saved Download JSON export.');
        }
        assertFresh(captured.exportedAt, now);
        const exportPath = await inside(project.root, captured.export);
        if ((await fileHash(exportPath)) !== captured.exportSha256) {
          throw new Error('Export file changed after checkpoint capture.');
        }
        files[captured.export] = captured.exportSha256;
        ({ data, exportStateHash } = unwrapExport(JSON.parse(await readFile(exportPath, 'utf8')), spec, readback));
      }
      records.set(spec.key, {
        readback,
        data,
        savedHash: valueHash(data),
        protectedHash: valueHash(protectedValue(readback, spec)),
        exportStateHash,
      });
    } catch (error) {
      errors.set(captured.key, message(error));
    }
  }
  return { checkpoint, hash: valueHash(checkpoint), files, records, errors };
}
const message = (error: unknown) => (error instanceof Error ? error.message : 'File preparation failed.');
async function currentSync(project: Project, environment: Environment) {
  try {
    const sync = await readJson(await inside(project.root, 'environments/local-sync.json'), syncSchema);
    if (sync.environmentFingerprint !== fingerprint(environment)) {
      throw new Error('Local synchronization belongs to another runtime.');
    }
    return sync;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}
function selected(project: Project, keys?: string[]) {
  if (keys && new Set(keys).size !== keys.length) {
    throw new Error('Selected record keys must be unique.');
  }
  const records = keys?.length
    ? keys.map((key) => {
        const spec = project.records.get(key);
        if (!spec) {
          throw new Error(`Unknown selected key ${key}`);
        }
        return spec;
      })
    : project.manifest.records.filter((spec) => spec.operation !== 'reference');
  if (records.some((spec) => spec.operation === 'reference')) {
    throw new Error('Reference-only records are never generated for Save.');
  }
  return records;
}
function dependencyKeys(project: Project, key: string) {
  return [
    ...new Set(project.bindings.filter((binding) => binding.entityKey === key).map((binding) => binding.targetKey)),
  ];
}
function requireSaved(checkpoint: SavedCheckpoint, key: string) {
  const record = checkpoint.records.get(key);
  if (!record) {
    throw new Error(checkpoint.errors.get(key) ?? `Missing fresh saved checkpoint for ${key}`);
  }
  return record;
}
/** Readiness uses captured saved sources, never a dependency's proposed replacement. */
function assertCapturedReferences(spec: RecordSpec, desired: unknown, targetId: string | undefined, sources: Saved[]) {
  if (spec.kind === 'asset') {
    const data = desired as Record<string, unknown>;
    const back = (spec.type === 'deck' ? data.cardback : spec.type?.startsWith('token-') ? data.back : undefined) as
      | { mode?: string; asset_id?: string }
      | undefined;
    if (back?.mode !== 'reference' || !back.asset_id) {
      return;
    }
    if (back.asset_id === targetId) {
      throw new Error(
        spec.type === 'deck' ? 'A deck cannot reference its own cardback.' : 'A token cannot reference itself.'
      );
    }
    const source = sources.find((row) => row.readback.record.id === back.asset_id);
    if (!source || source.readback.record.kind !== 'asset' || source.readback.record.type !== spec.type) {
      throw new Error(`Choose a captured ${spec.type} for the referenced back.`);
    }
    if (spec.type === 'deck') {
      if (!authoredCardback(DeckAsset.parse(source.data).cardback)) {
        throw new Error('Only a deck with an authored cardback can be referenced.');
      }
    } else if ((source.data as { back: { mode: string } }).back.mode !== 'custom') {
      throw new Error('Only a token with an authored back can be referenced.');
    }
  } else if (spec.kind === 'rulebook') {
    const assets: Record<string, RulebookResolvedAssetsById[string]> = Object.create(null);
    const factions: Record<string, RulebookResolvedFactionsById[string]> = Object.create(null);
    for (const { readback, data } of sources) {
      const { id, kind, type } = readback.record;
      if (kind === 'asset') {
        assets[id] = { assetId: id, type: type!, name: (data as { name: string }).name, imageUrl: null };
      } else if (kind === 'faction') {
        const faction = parseRawFaction(data);
        const background = faction.background.colors[0];
        const members: NonNullable<RulebookResolvedFactionsById[string]['leaders']> = [
          faction.factionLeader,
          ...faction.leaders,
        ].map((member) =>
          member.memberId
            ? {
                status: 'unavailable',
                reference: { kind: 'faction-member', factionId: id, memberId: member.memberId },
              }
            : { status: 'unselected' }
        );
        factions[id] = {
          factionId: id,
          name: faction.name,
          color: typeof background === 'string' ? background : (background.stops[0]?.[0] ?? '#20394a'),
          troops: faction.troops,
          ruler: members[0],
          leaders: members.slice(1),
        };
      }
    }
    assertRulebookReferences(rawRulebookSchema.parse(desired).contents, assets, factions);
  }
}
function verifyProtected(spec: RecordSpec, binding: BoundRecord, saved: Saved) {
  if (!binding.baselineSavedHash || !binding.baselineProtectedHash) {
    throw new Error('Inspect the captured checkpoint and record its verified baseline hashes before preparation.');
  }
  if (spec.operation === 'reference' && saved.savedHash !== binding.baselineSavedHash) {
    throw new Error(
      'A reference-only source changed after its verified baseline. Review it and refresh its explicit binding before preparing consumers.'
    );
  }
  if (saved.protectedHash !== binding.baselineProtectedHash) {
    throw new Error(
      'Protected identity, ownership, Group, address or relationship/count state changed. Reconcile its explicit binding before continuing.'
    );
  }
  if (
    spec.scope === 'gf9' &&
    saved.readback.record.kind !== 'rulebook' &&
    saved.readback.record.groupId !== saved.readback.groupScopeId &&
    !spec.changes?.assignGroup
  ) {
    throw new Error('The GF9 Group assignment needs its own listed normal operation.');
  }
}
function validateEvolution(project: Project, spec: RecordSpec, saved: unknown, desired: unknown) {
  if (spec.kind !== 'rulebook') {
    return;
  }
  const previous = rawRulebookSchema.parse(saved).contents,
    next = rawRulebookSchema.parse(desired).contents;
  const registry = project.identities.records.find((record) => record.entityKey === spec.key)!;
  for (const page of Object.values(previous.pagesById)) {
    const current = next.pagesById[page.id];
    if (current && current.layoutId !== page.layoutId) {
      throw new Error(`Page ${page.id} changed layout without a replacement ID.`);
    }
    for (const block of Object.values(page.blocksById)) {
      if (!current?.blocksById[block.id]) {
        for (const other of Object.values(next.pagesById)) {
          if (
            other.id !== page.id &&
            other.blocksById[block.id] &&
            !previous.pagesById[other.id]?.blocksById[block.id]
          ) {
            throw new Error(`Block ${block.id} moved to a different Page without a new ID.`);
          }
        }
      }
    }
  }
  const identities = [...registry.entries, ...registry.retired];
  const previousOwner = (old: ReturnType<typeof ownedIdentities>[number]) => {
    if (!old.ownerPath) {
      return undefined;
    }
    const pageId = String(old.ownerPath[2]);
    const page = identities.find((entry) => entry.kind === 'page' && entry.value === pageId);
    if (old.kind === 'block') {
      return page?.key;
    }
    const blockId = at(saved, [...old.ownerPath, 'id']);
    return identities.find((entry) => entry.kind === 'block' && entry.value === blockId && entry.owner === page?.key)
      ?.key;
  };
  const currentIds = ownedIdentities(spec, desired);
  for (const old of ownedIdentities(spec, saved)) {
    if (
      !currentIds.some(
        (entry) =>
          entry.value === old.value &&
          entry.kind === old.kind &&
          canonical(entry.ownerPath) === canonical(old.ownerPath)
      ) &&
      !registry.retired.some(
        (entry) => entry.value === old.value && entry.kind === old.kind && entry.owner === previousOwner(old)
      )
    ) {
      throw new Error(`Record retired ${old.kind} identity ${old.value} before preparation.`);
    }
  }
  const anchors = (value: typeof previous) =>
    new Set(
      Object.values(value.pagesById).flatMap((page) => [
        page.anchor,
        ...Object.values(page.blocksById).flatMap((block) => (block.anchor ? [block.anchor] : [])),
      ])
    );
  const nextAnchors = anchors(next);
  for (const anchor of anchors(previous)) {
    if (
      !nextAnchors.has(anchor) &&
      !project.links.retired.some((link) => link.entityKey === spec.key && link.anchor === anchor)
    ) {
      throw new Error(`Record the removed/split anchor ${spec.key}#${anchor}.`);
    }
  }
}
function assertProductionOrigins(value: unknown) {
  const walk = (node: unknown) => {
    if (typeof node === 'string') {
      for (const match of node.matchAll(/https?:\/\/[^\s"'<>\\)]+/gi)) {
        let url: URL;
        try {
          url = new URL(match[0]);
        } catch {
          continue;
        }
        const host = url.hostname.toLowerCase().replace(/\.$/, '');
        if (
          ['localhost', '0.0.0.0', '[::1]', 'host.docker.internal'].includes(host) ||
          host.endsWith('.localhost') ||
          host.startsWith('127.') ||
          /^\[::ffff:7f[0-9a-f]{2}:/.test(host)
        ) {
          throw new Error('Production data contains a local origin.');
        }
      }
    } else if (node && typeof node === 'object') {
      for (const child of Object.values(node)) {
        walk(child);
      }
    }
  };
  walk(value);
}
function targetPath(spec: RecordSpec, environment: Environment) {
  const binding = environment.bindings[spec.key];
  if (!binding) {
    throw new Error(`Missing ${environment.name} target ${spec.key}`);
  }
  if (binding.state === 'uncreated') {
    return spec.kind === 'asset'
      ? `/assets/${spec.type}/create`
      : spec.kind === 'faction'
        ? '/factions/create'
        : '/rulesets/gf9/rulebooks/create';
  }
  if (spec.kind === 'rulebook') {
    return `/rulesets/gf9/rulebooks/${binding.slug}/edit`;
  }
  if (spec.kind === 'faction') {
    return `/factions/${binding.slug}/edit`;
  }
  return spec.operation === 'convert' && binding.type === spec.sourceType
    ? `/assets/${binding.type}/${binding.slug}/convert-to-spice`
    : `/assets/${binding.type}/${binding.slug}/edit`;
}
async function immutableReport(project: Project, relative: string, report: unknown, payloads: Map<string, unknown>) {
  const directory = await inside(project.root, relative, true);
  await mkdir(path.dirname(directory), { recursive: true });
  try {
    await mkdir(directory, { recursive: false });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw error;
    }
    const existing = JSON.parse(await readFile(`${directory}/report.json`, 'utf8'));
    if (canonical(existing) !== canonical(report)) {
      throw new Error('This run already has different inputs. Choose a new --run.');
    }
  }
  for (const [key, value] of payloads) {
    await atomicJson(await inside(project.root, `${relative}/${key}.json`, true), value);
  }
  await atomicJson(await inside(project.root, `${relative}/report.json`, true), report);
  return `${relative}/report.json`;
}
export async function prepare(options: Options) {
  const project = await loadProject(options.root),
    environment = await loadEnvironment(project, options.environment),
    now = options.now ?? new Date();
  const checkpoint = await savedCheckpoint(project, environment, options.checkpoint, now),
    specs = selected(project, options.keys);
  let sync: Sync | null = null,
    localEnvironment: Environment | undefined,
    localCheckpoint: SavedCheckpoint | undefined;
  if (environment.name === 'local') {
    sync = await currentSync(project, environment);
    if (options.initialBaseline) {
      sync ??= { version: 1, environmentFingerprint: fingerprint(environment), records: {} };
      for (const spec of specs) {
        if (!sync.records[spec.key] && environment.bindings[spec.key]?.state === 'bound') {
          const saved = requireSaved(checkpoint, spec.key),
            binding = environment.bindings[spec.key] as BoundRecord;
          if (saved.savedHash !== binding.baselineSavedHash) {
            throw new Error(`Initial local content differs from the explicitly recorded baseline for ${spec.key}.`);
          }
          verifyProtected(spec, binding, saved);
          sync.records[spec.key] = {
            authoredHash: valueHash(project.values.get(spec.key)),
            savedHash: saved.savedHash,
            protectedHash: saved.protectedHash,
            checkpointHash: checkpoint.hash,
            collectedAt: checkpoint.checkpoint.capturedAt,
            status: 'baseline',
          };
        }
      }
      await atomicJson(await inside(project.root, 'environments/local-sync.json', true), sync);
    }
    if (!sync) {
      throw new Error('Initialize the verified local baseline with --initial-baseline before preparing replacements.');
    }
  } else {
    if (!options.localCheckpoint || !options.review) {
      throw new Error('Production needs a fresh --local-checkpoint and the independent --review manifest.');
    }
    localEnvironment = await loadEnvironment(project, 'local');
    sync = await currentSync(project, localEnvironment);
    if (!sync) {
      throw new Error('Collect the reviewed local content before production preparation.');
    }
    localCheckpoint = await savedCheckpoint(project, localEnvironment, options.localCheckpoint, now);
    const review = await readJson(await inside(project.root, options.review), reviewSchema);
    if (
      review.authoringHash !== project.authoringHash ||
      review.localEnvironmentFingerprint !== fingerprint(localEnvironment) ||
      review.localBindingsHash !== valueHash(localEnvironment.bindings) ||
      review.localSyncHash !== valueHash(sync)
    ) {
      throw new Error('The review does not identify the current authored files and synchronized local content.');
    }
    if (specs.some((spec) => !review.reviewedKeys.includes(spec.key))) {
      throw new Error('The review does not cover every selected entity.');
    }
    if (specs.some((spec) => spec.kind === 'rulebook') && !review.userBookApproval) {
      throw new Error('Record user approval of all four complete local books before production book preparation.');
    }
    execFileSync('git', ['merge-base', '--is-ancestor', review.authoringCommit, 'HEAD'], {
      cwd: project.root,
      stdio: 'pipe',
    });
    const dirty = execFileSync(
      'git',
      ['status', '--porcelain', '--', 'authoring', ...Object.keys(project.fileHashes)],
      {
        cwd: project.root,
        encoding: 'utf8',
      }
    );
    if (dirty.trim()) {
      throw new Error('Commit the reviewed authoring files before production preparation.');
    }
    const prefix = execFileSync('git', ['rev-parse', '--show-prefix'], { cwd: project.root, encoding: 'utf8' }).trim();
    for (const [file, hash] of Object.entries(project.fileHashes)) {
      const committed = execFileSync('git', ['show', `${review.authoringCommit}:${prefix}${file}`], {
        cwd: project.root,
        maxBuffer: 32 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      if (sha256(committed) !== hash) {
        throw new Error(`The reviewed authoring commit does not contain the current ${file}.`);
      }
    }
  }
  const payloads = new Map<string, unknown>(),
    entries: {
      key: string;
      status: 'ready' | 'blocked';
      error?: string;
      payloadHash?: string;
      authoredHash?: string;
      beforeHash?: string;
      target?: string;
      alsoRename?: boolean;
      separateGroupAssignment?: boolean;
      dependencies?: string[];
    }[] = [];
  const checkLocal = (key: string, localSaved: Saved) => {
    const previous = sync!.records[key];
    if (
      !previous ||
      localSaved.savedHash !== previous.savedHash ||
      localSaved.protectedHash !== previous.protectedHash
    ) {
      throw new Error(`Uncollected local saved changes in ${key}. Collect them before preparation.`);
    }
    if (
      environment.name === 'production' &&
      (previous.status !== 'collected' || previous.authoredHash !== valueHash(project.values.get(key)))
    ) {
      throw new Error(`Local review is stale for ${key}. Save, collect and review the current authored value.`);
    }
    if (environment.name === 'production') {
      const spec = project.records.get(key)!;
      const resolved = normalize(
        spec,
        bindValue(spec, project.values.get(key), project.bindings, project.records, localEnvironment!)
      );
      if (valueHash(resolved) !== localSaved.savedHash) {
        throw new Error(`Local saved content no longer agrees with the current typed bindings for ${key}.`);
      }
    }
  };
  for (const spec of specs) {
    try {
      const binding = environment.bindings[spec.key];
      if (!binding) {
        throw new Error(`Missing verified ${environment.name} binding.`);
      }
      const source = project.values.get(spec.key),
        desired = normalize(spec, bindValue(spec, source, project.bindings, project.records, environment));
      assertNoUnboundMarkers(desired);
      readRawAuthoringJson(pretty(desired));
      let saved: Saved | undefined;
      if (binding.state === 'bound') {
        saved = requireSaved(checkpoint, spec.key);
        verifyProtected(spec, binding, saved);
        if (!saved.readback.viewer.capabilities.edit) {
          throw new Error('The signed-in viewer cannot edit this target.');
        }
        if (
          spec.changes?.assignGroup &&
          saved.readback.record.groupId !== saved.readback.groupScopeId &&
          !saved.readback.viewer.capabilities.changeGroup
        ) {
          throw new Error('The signed-in viewer cannot assign this target to the GF9 Group.');
        }
        if (environment.name === 'local') {
          checkLocal(spec.key, saved);
        }
        const currentName = (saved.data as { name?: string }).name,
          desiredName = (desired as { name?: string }).name;
        if (
          currentName !== desiredName &&
          spec.kind !== 'rulebook' &&
          (!spec.changes?.rename || !saved.readback.viewer.capabilities.rename)
        ) {
          throw new Error('A differing name requires a listed rename and the actual normal rename capability.');
        }
        if (spec.kind === 'rulebook') {
          validateEvolution(project, spec, saved.data, desired);
        }
      } else if (spec.operation !== 'create') {
        throw new Error('Only a declared creation may lack a saved target.');
      }
      const dependencies = dependencyKeys(project, spec.key);
      for (const dependency of dependencies) {
        const target = project.records.get(dependency)!,
          destination = environment.bindings[dependency];
        if (!destination || destination.state !== 'bound') {
          throw new Error(`Create and verify dependency ${dependency} first.`);
        }
        const referenced = requireSaved(checkpoint, dependency);
        verifyProtected(target, destination, referenced);
        if (environment.name === 'local' && target.operation !== 'reference') {
          checkLocal(dependency, referenced);
        }
      }
      assertCapturedReferences(
        spec,
        desired,
        binding.state === 'bound' ? binding.id : undefined,
        dependencies.map((key) => requireSaved(checkpoint, key))
      );
      if (environment.name === 'production') {
        for (const key of [spec.key, ...dependencies]) {
          if (project.records.get(key)!.operation !== 'reference') {
            checkLocal(key, requireSaved(localCheckpoint!, key));
          }
        }
        assertProductionOrigins(desired);
      }
      payloads.set(spec.key, desired);
      entries.push({
        key: spec.key,
        status: 'ready',
        payloadHash: sha256(pretty(desired)),
        authoredHash: valueHash(source),
        beforeHash: saved?.savedHash,
        target: environment.identity!.applicationOrigin + targetPath(spec, environment),
        alsoRename:
          binding.state === 'bound' &&
          spec.kind !== 'rulebook' &&
          (saved?.data as { name?: string } | undefined)?.name !== (desired as { name?: string }).name,
        separateGroupAssignment: spec.changes?.assignGroup ?? false,
        dependencies,
      });
    } catch (error) {
      entries.push({ key: spec.key, status: 'blocked', error: message(error) });
    }
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const entry of entries) {
      if (
        entry.status === 'ready' &&
        entry.dependencies?.some((key) => entries.some((other) => other.key === key && other.status === 'blocked'))
      ) {
        entry.status = 'blocked';
        entry.error = 'A selected dependency is blocked.';
        payloads.delete(entry.key);
        changed = true;
      }
    }
  }
  const additionalInputs: Record<string, string> = {};
  if (sync) {
    additionalInputs['environments/local-sync.json'] = await fileHash(
      await inside(project.root, 'environments/local-sync.json')
    );
  }
  if (environment.name === 'production') {
    additionalInputs['environments/local.json'] = await fileHash(await inside(project.root, 'environments/local.json'));
    Object.assign(additionalInputs, localCheckpoint!.files);
    additionalInputs[options.review!] = await fileHash(await inside(project.root, options.review!));
  }
  const report = {
    format: 'gf9-preparation',
    version: 1,
    environment: environment.name,
    environmentFingerprint: fingerprint(environment),
    authoringHash: project.authoringHash,
    checkpointHash: checkpoint.hash,
    inputFiles: {
      ...project.fileHashes,
      ...checkpoint.files,
      ...additionalInputs,
      [`environments/${environment.name}.json`]: await fileHash(
        await inside(project.root, `environments/${environment.name}.json`)
      ),
    },
    entries,
  };
  const output = await immutableReport(project, `generated/${environment.name}/${options.run}`, report, payloads);
  return { report, output };
}

const preparationSchema = z.strictObject({
  format: z.literal('gf9-preparation'),
  version: z.literal(1),
  environment: z.literal('local'),
  environmentFingerprint: z.string(),
  authoringHash: z.string(),
  checkpointHash: z.string(),
  inputFiles: z.record(z.string(), z.string()),
  entries: z.array(
    z.strictObject({
      key: z.string(),
      status: z.enum(['ready', 'blocked']),
      error: z.string().optional(),
      payloadHash: z.string().optional(),
      authoredHash: z.string().optional(),
      beforeHash: z.string().optional(),
      target: z.string().optional(),
      alsoRename: z.boolean().optional(),
      separateGroupAssignment: z.boolean().optional(),
      dependencies: z.array(z.string()).optional(),
    })
  ),
});
const planSchema = z.strictObject({
  format: z.literal('gf9-collection-plan'),
  version: z.literal(1),
  environment: z.literal('local'),
  collectedAt: z.iso.datetime(),
  environmentFingerprint: z.string(),
  checkpoint: z.string(),
  checkpointHash: z.string(),
  prepared: z.string().optional(),
  authoringHash: z.string(),
  inputFiles: z.record(z.string(), z.string()),
  changes: z.array(
    z.strictObject({
      key: z.string(),
      file: z.string(),
      beforeFileHash: z.string(),
      authoredHash: z.string(),
      savedHash: z.string(),
      protectedHash: z.string(),
      paths: z.array(z.string()),
      data: z.unknown(),
    })
  ),
  blocked: z.array(z.strictObject({ key: z.string(), error: z.string() })),
});
type CollectionPlan = z.infer<typeof planSchema>;
async function makeCollectionPlan(options: Options) {
  if (options.environment !== 'local') {
    throw new Error(
      'Collect operates on the local review copy only. Production content is never collected over reviewed files.'
    );
  }
  const project = await loadProject(options.root),
    environment = await loadEnvironment(project, 'local'),
    now = options.now ?? new Date(),
    checkpoint = await savedCheckpoint(project, environment, options.checkpoint, now),
    sync = await currentSync(project, environment);
  if (!sync) {
    throw new Error('Initialize the verified local baseline before collecting saved changes.');
  }
  let prepared: z.infer<typeof preparationSchema> | undefined;
  if (options.prepared) {
    prepared = preparationSchema.parse(
      JSON.parse(await readFile(await inside(project.root, options.prepared), 'utf8'))
    );
  }
  if (prepared && prepared.environmentFingerprint !== fingerprint(environment)) {
    throw new Error('The prepared report belongs to another local runtime.');
  }
  if (prepared) {
    for (const entry of prepared.entries) {
      if (entry.status === 'ready') {
        const file = path.posix.join(path.posix.dirname(options.prepared!), `${entry.key}.json`);
        if ((await fileHash(await inside(project.root, file))) !== entry.payloadHash) {
          throw new Error(`Prepared payload changed for ${entry.key}.`);
        }
      }
    }
  }
  const changes: CollectionPlan['changes'] = [],
    blocked: CollectionPlan['blocked'] = [];
  for (const spec of selected(project, options.keys)) {
    try {
      const binding = environment.bindings[spec.key];
      if (
        !binding ||
        binding.state !== 'bound' ||
        binding.kind !== spec.kind ||
        (spec.kind === 'asset' && binding.type !== spec.type)
      ) {
        throw new Error(
          'Save/create/convert the exact destination and record its actual local binding before collecting.'
        );
      }
      const saved = requireSaved(checkpoint, spec.key);
      verifyProtected(spec, binding, saved);
      const baseline = sync.records[spec.key];
      if (!baseline) {
        throw new Error('No synchronization baseline for this record.');
      }
      const fileValue = project.values.get(spec.key),
        fileValueHash = valueHash(fileValue);
      if (baseline.authoredHash !== fileValueHash && baseline.savedHash !== saved.savedHash) {
        const intent = prepared?.entries.find((entry) => entry.key === spec.key && entry.status === 'ready');
        if (intent?.authoredHash !== fileValueHash || prepared?.authoringHash !== project.authoringHash) {
          throw new Error(
            'Both authored files and local saved content changed. Reconcile them explicitly, or supply the exact --prepared report used for this local authoring pass.'
          );
        }
      }
      const collected = normalize(spec, collectValue(spec, saved.data, project.bindings, project.records, environment));
      readRawAuthoringJson(pretty(collected));
      assertIdentities(spec, collected, project.identities);
      if (spec.kind === 'rulebook') {
        assertBook(spec, collected);
      }
      const collectedValues = new Map(project.values);
      collectedValues.set(spec.key, collected);
      validateLinks(project.records, collectedValues, project.links);
      const desired = normalize(spec, bindValue(spec, collected, project.bindings, project.records, environment));
      if (valueHash(desired) !== saved.savedHash) {
        throw new Error('Collection is not reversible after documented write normalization.');
      }
      changes.push({
        key: spec.key,
        file: `authoring/${spec.file!}`,
        beforeFileHash: project.fileHashes[`authoring/${spec.file!}`],
        authoredHash: valueHash(collected),
        savedHash: saved.savedHash,
        protectedHash: saved.protectedHash,
        paths: differences(fileValue, collected),
        data: collected,
      });
    } catch (error) {
      blocked.push({ key: spec.key, error: message(error) });
    }
  }
  const inputFiles = {
    ...project.fileHashes,
    ...checkpoint.files,
    'environments/local.json': await fileHash(await inside(project.root, 'environments/local.json')),
    'environments/local-sync.json': await fileHash(await inside(project.root, 'environments/local-sync.json')),
    ...(options.prepared ? { [options.prepared]: await fileHash(await inside(project.root, options.prepared)) } : {}),
  };
  const plan: CollectionPlan = {
    format: 'gf9-collection-plan',
    version: 1,
    environment: 'local',
    collectedAt: now.toISOString(),
    environmentFingerprint: fingerprint(environment),
    checkpoint: options.checkpoint,
    checkpointHash: checkpoint.hash,
    ...(options.prepared ? { prepared: options.prepared } : {}),
    authoringHash: project.authoringHash,
    inputFiles,
    changes,
    blocked,
  };
  return { project, environment, checkpoint, sync, plan };
}
export async function collect(options: Options) {
  const { project, plan } = await makeCollectionPlan(options);
  const output = await immutableReport(project, `generated/local/${options.run}`, plan, new Map());
  return { plan, output, planHash: valueHash(plan) };
}
export async function applyCollection(options: { root: string; plan: string; reviewedHash: string }) {
  const project = await loadProject(options.root),
    file = await inside(project.root, options.plan),
    plan = await readJson(file, planSchema);
  if (valueHash(plan) !== options.reviewedHash) {
    throw new Error('The collection plan changed after review.');
  }
  for (const [relative, hash] of Object.entries(plan.inputFiles)) {
    if ((await fileHash(await inside(project.root, relative))) !== hash) {
      throw new Error(`Input changed after collection review: ${relative}. Generate and review a new plan.`);
    }
  }
  const computed = await makeCollectionPlan({
    root: project.root,
    environment: 'local',
    checkpoint: plan.checkpoint,
    run: 'recheck',
    keys: plan.changes.map((change) => change.key),
    prepared: plan.prepared,
    // Reproduce the reviewed capture checks at collection time, after verifying every input hash.
    now: new Date(plan.collectedAt),
  });
  if (
    canonical(computed.plan.changes) !== canonical(plan.changes) ||
    computed.plan.checkpointHash !== plan.checkpointHash
  ) {
    throw new Error('The reviewed collection cannot be reproduced from its captured inputs.');
  }
  for (const change of plan.changes) {
    await atomicJson(await inside(project.root, change.file, true), change.data);
  }
  const sync = structuredClone(computed.sync);
  for (const change of plan.changes) {
    sync.records[change.key] = {
      authoredHash: change.authoredHash,
      savedHash: change.savedHash,
      protectedHash: change.protectedHash,
      checkpointHash: plan.checkpointHash,
      collectedAt: computed.checkpoint.checkpoint.capturedAt,
      status: 'collected',
    };
  }
  await atomicJson(await inside(project.root, 'environments/local-sync.json', true), sync);
  return { applied: plan.changes.map((change) => change.key), blocked: plan.blocked, localSyncHash: valueHash(sync) };
}
/** Prints binding hashes from captured files; it never invents an ID or writes an environment binding. */
export async function inspectCheckpoint(options: {
  root: string;
  environment: 'local' | 'production';
  checkpoint: string;
  now?: Date;
}) {
  const project = await loadProject(options.root),
    environment = await loadEnvironment(project, options.environment),
    checkpoint = await savedCheckpoint(project, environment, options.checkpoint, options.now ?? new Date());
  return {
    environmentFingerprint: fingerprint(environment),
    authoringHash: project.authoringHash,
    checkpointHash: checkpoint.hash,
    records: [...checkpoint.records].map(([key, saved]) => ({
      key,
      id: saved.readback.record.id,
      kind: saved.readback.record.kind,
      type: saved.readback.record.type,
      slug: saved.readback.record.slug,
      groupId: saved.readback.record.groupId,
      savedHash: saved.savedHash,
      protectedHash: saved.protectedHash,
    })),
    errors: [...checkpoint.errors].map(([key, error]) => ({ key, error })),
  };
}
