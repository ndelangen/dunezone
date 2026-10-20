import { readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import {
  parseRawAsset,
  parseRawFaction,
  rawRulebookSchema,
  readRawAuthoringJson,
} from '../../../src/shared/authoring/raw';
import { recalculateFactionComplexity } from '../../../src/shared/factions/complexity';
import type { RulebookContentsV1 } from '../../../src/shared/rulebooks/contents';
import {
  artworkSchema,
  bindingsSchema,
  environmentSchema,
  identitiesSchema,
  linksSchema,
  manifestSchema,
} from './contracts';
import type { DataPath, Environment, RecordSpec } from './contracts';
import { at, fileHash, inside, readJson, valueHash } from './files';

export function normalize(spec: RecordSpec, data: unknown) {
  readRawAuthoringJson(JSON.stringify(data));
  if (spec.kind === 'asset') {
    return parseRawAsset(spec.type!, data).data;
  }
  if (spec.kind === 'faction') {
    return parseRawFaction(recalculateFactionComplexity(parseRawFaction(data)));
  }
  return rawRulebookSchema.parse(data);
}
export type Project = Awaited<ReturnType<typeof loadProject>>;
export async function loadProject(directory: string, options: { inspectIdentities?: boolean } = {}) {
  const root = await realpath(directory);
  const files = [
    'authoring/manifest.json',
    'authoring/reference-bindings.json',
    'authoring/identities.json',
    'authoring/links.json',
    'authoring/artwork.json',
  ] as const;
  const [manifest, bindings, identities, links, artwork] = await Promise.all([
    readJson(await inside(root, files[0]), manifestSchema),
    readJson(await inside(root, files[1]), bindingsSchema),
    readJson(await inside(root, files[2]), identitiesSchema),
    readJson(await inside(root, files[3]), linksSchema),
    readJson(await inside(root, files[4]), artworkSchema),
  ]);
  if (manifest.status !== 'ready' || !manifest.records.length) {
    throw new Error('The GF9 inventory is still a scaffold. Populate verified records and set status to ready.');
  }
  const records = new Map<string, RecordSpec>();
  const fileHashes: Record<string, string> = {};
  for (const file of files) {
    fileHashes[file] = await fileHash(await inside(root, file));
  }
  const values = new Map<string, unknown>();
  const fileOwners = new Set<string>();
  const markerOwners = new Set<string>();
  for (const spec of manifest.records) {
    if (records.has(spec.key)) {
      throw new Error(`Duplicate record key ${spec.key}`);
    }
    records.set(spec.key, spec);
    const semantic = spec.key.replace(/^gf9-/, '');
    if (markerOwners.has(semantic)) {
      throw new Error(`Ambiguous semantic marker @gf9/${semantic}`);
    }
    markerOwners.add(semantic);
    if ((spec.kind === 'asset') !== Boolean(spec.type)) {
      throw new Error(`Asset type must be explicit for ${spec.key} only.`);
    }
    if (spec.scope === 'shared' && spec.operation !== 'reference') {
      throw new Error(`Shared stock ${spec.key} is reference-only.`);
    }
    if (
      spec.operation === 'convert' &&
      (spec.kind !== 'asset' || spec.sourceType !== 'card-custom' || spec.type !== 'card-spice')
    ) {
      throw new Error('Only the reviewed Custom-to-Spice conversion is supported.');
    }
    if (spec.operation === 'reference') {
      if (spec.file) {
        throw new Error(`Reference-only ${spec.key} has no authored replacement file.`);
      }
      continue;
    }
    const expected = `${spec.kind === 'rulebook' ? 'books' : spec.kind === 'faction' ? 'factions' : 'assets'}/`;
    if (!spec.file?.startsWith(expected) || !spec.file.endsWith('.json')) {
      throw new Error(`Use ${expected}<key>.json for ${spec.key}.`);
    }
    if (spec.kind === 'rulebook') {
      const bookPath = `books/${spec.book === 'ixian-tleilaxu' ? 'ixians-tleilaxu' : spec.book}.json`;
      if (spec.file !== bookPath) {
        throw new Error(`Use the canonical book path ${bookPath}.`);
      }
    }
    const file = await realpath(await inside(root, `authoring/${spec.file}`));
    const canonicalFile = path.relative(root, file).split(path.sep).join('/');
    if (!canonicalFile.startsWith(`authoring/${expected}`) || canonicalFile !== `authoring/${spec.file}`) {
      throw new Error(`Use a canonical ${expected} path for ${spec.key}: ${spec.file}`);
    }
    if (fileOwners.has(file)) {
      throw new Error(`Authored file has two owners: ${spec.file}`);
    }
    fileOwners.add(file);
    const data = normalize(spec, readRawAuthoringJson(await readFile(file, 'utf8')));
    fileHashes[`authoring/${spec.file}`] = await fileHash(file);
    values.set(spec.key, data);
    if (spec.kind === 'rulebook') {
      assertBook(spec, data);
    }
    if (!options.inspectIdentities) {
      assertIdentities(spec, data, identities);
    }
  }
  for (const binding of bindings.bindings) {
    if (!records.has(binding.entityKey) || !records.has(binding.targetKey)) {
      throw new Error(`Binding references an unknown inventory key: ${binding.entityKey}/${binding.targetKey}`);
    }
  }
  for (const record of identities.records) {
    if (!records.has(record.entityKey)) {
      throw new Error(`Unknown identity owner ${record.entityKey}`);
    }
  }
  validateLinks(records, values, links);
  async function evidenceFiles(directory: string) {
    const entries = await readdir(await inside(root, directory), { withFileTypes: true });
    for (const entry of entries) {
      const relative = `${directory}/${entry.name}`;
      if (entry.isSymbolicLink()) {
        throw new Error(`Evidence cannot be a symlink: ${relative}`);
      }
      if (entry.isDirectory()) {
        await evidenceFiles(relative);
      } else if (entry.isFile()) {
        if (!/\.(?:json|md|txt)$/.test(entry.name)) {
          throw new Error(`Keep bitmaps and binary proof outside authored evidence: ${relative}`);
        }
        fileHashes[relative] = await fileHash(await inside(root, relative));
      }
    }
  }
  try {
    await evidenceFiles('authoring/evidence');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  const catalogue = 'artwork/provenance.json';
  fileHashes[catalogue] = await fileHash(await inside(root, catalogue));
  const maintained = z
    .object({
      records: z.array(
        z.object({
          key: z.string(),
          path: z.string(),
          sha256: z.string(),
          assetKey: z.string(),
          presetId: z.string().optional(),
        })
      ),
    })
    .parse(JSON.parse(await readFile(await inside(root, catalogue), 'utf8')));

  for (const artworkRecord of artwork.records) {
    const source = maintained.records.find((record) => record.key === artworkRecord.key);
    if (
      !source ||
      source.sha256 !== artworkRecord.sha256 ||
      source.path !== artworkRecord.path ||
      source.assetKey !== artworkRecord.assetKey
    ) {
      throw new Error(`Artwork ${artworkRecord.key} does not match the maintained provenance catalogue.`);
    }
  }
  for (const historical of links.historical) {
    if (records.get(historical.entityKey)?.kind !== 'rulebook') {
      throw new Error('Historical links need a declared book.');
    }
    if ((await fileHash(await inside(root, historical.file))) !== historical.sha256) {
      throw new Error(`Historical link evidence changed: ${historical.file}`);
    }
    fileHashes[historical.file] = historical.sha256;
  }
  for (const link of links.links) {
    if (
      link.edition &&
      !links.historical.some(
        (record) =>
          record.entityKey === link.targetKey && record.edition === link.edition && record.anchor === link.anchor
      )
    ) {
      throw new Error(`Capture historical Edition link evidence for ${link.targetKey}#${link.anchor}.`);
    }
  }
  return {
    root,
    manifest,
    records,
    values,
    bindings: bindings.bindings,
    identities,
    links,
    artwork,
    fileHashes,
    authoringHash: valueHash(fileHashes),
  };
}
export async function loadEnvironment(project: Project, name: 'local' | 'production'): Promise<Environment> {
  const environment = await readJson(await inside(project.root, `environments/${name}.json`), environmentSchema);
  if (environment.name !== name || environment.status !== 'bound' || !environment.identity) {
    throw new Error(`The ${name} environment is not bound to verified targets.`);
  }
  const application = new URL(environment.identity.applicationOrigin),
    backend = new URL(environment.identity.backendOrigin);
  if (
    application.origin !== environment.identity.applicationOrigin ||
    backend.origin !== environment.identity.backendOrigin
  ) {
    throw new Error('Environment addresses must be origins with no path, credentials, query or fragment.');
  }
  const local = (url: URL) =>
    ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && ['http:', 'https:'].includes(url.protocol);
  if (name === 'local' && (!local(application) || !local(backend))) {
    throw new Error('The local environment must use isolated loopback origins.');
  }
  if (
    name === 'production' &&
    (application.origin !== 'https://dune.zone' ||
      backend.protocol !== 'https:' ||
      local(backend) ||
      !backend.hostname.endsWith('.convex.cloud'))
  ) {
    throw new Error('Production must name https://dune.zone and its verified HTTPS Convex origin.');
  }
  const identities = new Set<string>();
  for (const [key, binding] of Object.entries(environment.bindings)) {
    const spec = project.records.get(key);
    if (!spec) {
      throw new Error(`Unknown ${name} binding ${key}`);
    }
    if (binding.kind !== spec.kind) {
      throw new Error(`Wrong ${name} kind for ${key}`);
    }
    if (spec.kind !== 'asset' && binding.type !== undefined) {
      throw new Error(`Unexpected ${name} Asset type for ${key}`);
    }
    if (binding.state === 'uncreated') {
      if (spec.kind === 'asset' && binding.type !== spec.type) {
        throw new Error(`Wrong ${name} creation type for ${key}`);
      }
      if (spec.operation !== 'create') {
        throw new Error(`Only an explicit creation may be uncreated: ${key}`);
      }
      continue;
    }
    const expectedType = spec.operation === 'convert' ? spec.sourceType : spec.type;
    if (
      spec.kind === 'asset' &&
      binding.type !== expectedType &&
      !(spec.operation === 'convert' && binding.type === spec.type)
    ) {
      throw new Error(`Wrong ${name} type for ${key}`);
    }
    if (identities.has(binding.id)) {
      throw new Error(`Two semantic records bind to ${name} ID ${binding.id}`);
    }
    identities.add(binding.id);
  }
  return environment;
}
export function assertBook(spec: RecordSpec, data: unknown) {
  if (!spec.book) {
    throw new Error(`Choose the canonical book key for ${spec.key}`);
  }
  const value = data as { settings: { size: string }; contents: RulebookContentsV1 };
  if (value.settings.size !== (spec.book === 'core' ? 'gf9-core' : 'gf9-expansion')) {
    throw new Error(`${spec.key} needs its original GF9 dimensions.`);
  }
  const covers = Object.values(value.contents.pagesById).filter((page) => page.layoutId === 'cover');
  if (covers.length !== 1 || covers[0].id !== value.contents.pageOrder[0]) {
    throw new Error(`${spec.key} needs one first cover Page.`);
  }
  const cover = covers[0].controlValues.cover;
  if (cover.backgroundSource?.kind !== 'preset') {
    throw new Error(`${spec.key} must use a valid existing stock cover preset.`);
  }
  if (cover.backgroundImage || cover.backgroundImageUrl) {
    throw new Error(`${spec.key} must use stock cover controls rather than stored or URL cover images.`);
  }
  for (const page of Object.values(value.contents.pagesById)) {
    for (const block of Object.values(page.blocksById)) {
      if (block.kind === 'question-answer') {
        throw new Error(`FAQ/Q&A Blocks are excluded from ${spec.key}.`);
      }
      if (block.kind === 'text' && block.references) {
        for (const ref of block.references) {
          const target = value.contents.pagesById[ref.pageId];
          if (!target || (ref.blockId && !target.blocksById[ref.blockId])) {
            throw new Error(`Broken Page/Block reference in ${spec.key}:${page.id}/${block.id}`);
          }
        }
      }
    }
  }
}
export function ownedIdentities(spec: RecordSpec, data: unknown) {
  const found: {
    path: DataPath;
    value: string;
    kind: 'page' | 'block' | 'item' | 'member' | 'troop' | 'layer';
    ownerPath?: DataPath;
    layoutId?: string;
  }[] = [];
  const walk = (node: unknown, path: DataPath) => {
    if (!node || typeof node !== 'object') {
      return;
    }
    const row = node as Record<string, unknown>;
    if (spec.kind === 'rulebook' && typeof row.id === 'string') {
      const kind =
        path.length === 3 && path[0] === 'contents' && path[1] === 'pagesById'
          ? 'page'
          : path.length === 5 && path[3] === 'blocksById'
            ? 'block'
            : 'item';
      found.push({
        path: [...path, 'id'],
        value: row.id,
        kind,
        ...(kind === 'page'
          ? { layoutId: row.layoutId as string }
          : { ownerPath: path.slice(0, kind === 'block' ? 3 : 5) }),
      });
    }
    if (spec.kind === 'faction') {
      for (const [key, kind] of [
        ['memberId', 'member'],
        ['troopId', 'troop'],
      ] as const) {
        if (typeof row[key] === 'string') {
          found.push({ path: [...path, key], value: row[key] as string, kind });
        }
      }
    }
    if ((spec.kind === 'asset' || spec.kind === 'rulebook') && typeof row.layerId === 'string') {
      found.push({
        path: [...path, 'layerId'],
        value: row.layerId,
        kind: 'layer',
        ...(spec.kind === 'rulebook' ? { ownerPath: path.slice(0, 5) } : {}),
      });
    }
    for (const [key, value] of Object.entries(row)) {
      if (value && typeof value === 'object') {
        walk(value, [...path, Array.isArray(node) ? Number(key) : key]);
      }
    }
  };
  walk(data, []);
  return found;
}
export function assertIdentities(spec: RecordSpec, data: unknown, identities: z.infer<typeof identitiesSchema>) {
  const candidates = identities.records.filter((item) => item.entityKey === spec.key);
  if (candidates.length > 1) {
    throw new Error(`Duplicate identity registry for ${spec.key}`);
  }
  const registry = candidates[0];
  const owned = ownedIdentities(spec, data);
  if (!owned.length) {
    return;
  }
  if (!registry) {
    throw new Error(`Record the authored identities for ${spec.key}.`);
  }
  const keys = new Set<string>(),
    paths = new Set<string>();
  for (const entry of registry.entries) {
    if (keys.has(entry.key)) {
      throw new Error(`Duplicate semantic identity ${spec.key}:${entry.key}`);
    }
    keys.add(entry.key);
    const token = JSON.stringify(entry.path.map(String));
    if (paths.has(token)) {
      throw new Error(`Duplicate identity path ${spec.key}:${entry.path.join('.')}`);
    }
    paths.add(token);
    if (at(data, entry.path) !== entry.value) {
      throw new Error(`Identity changed without its registry: ${spec.key}:${entry.key}`);
    }
    const actual = owned.find((item) => JSON.stringify(item.path.map(String)) === token);
    if (!actual || actual.kind !== entry.kind || actual.layoutId !== entry.layoutId) {
      throw new Error(`Wrong identity kind/layout for ${spec.key}:${entry.key}`);
    }
  }
  for (const actual of owned) {
    if (actual.ownerPath) {
      const entry = registry.entries.find(
        (item) => JSON.stringify(item.path.map(String)) === JSON.stringify(actual.path.map(String))
      )!;
      const owner = registry.entries.find(
        (item) => JSON.stringify(item.path.slice(0, -1).map(String)) === JSON.stringify(actual.ownerPath!.map(String))
      );
      if (!owner || entry.owner !== owner.key) {
        throw new Error(`Wrong semantic owner for ${spec.key}:${entry.key}`);
      }
    }
  }
  if (paths.size !== owned.length) {
    throw new Error(`The identity registry does not cover every owned ID in ${spec.key}.`);
  }
  for (const entry of registry.entries) {
    if (entry.owner && !keys.has(entry.owner) && entry.owner !== spec.key) {
      throw new Error(`Unknown semantic owner ${spec.key}:${entry.owner}`);
    }
  }
  for (const retired of registry.retired) {
    if (keys.has(retired.key) || retired.replacementKeys.some((key) => !keys.has(key))) {
      throw new Error(`Invalid retired identity ${spec.key}:${retired.key}`);
    }
  }
}
function anchors(value: unknown) {
  if (!value) {
    throw new Error('A current link target needs an authored book.');
  }
  const book = value as { contents: RulebookContentsV1 };
  return new Set(
    Object.values(book.contents.pagesById).flatMap((page) => [
      page.anchor,
      ...Object.values(page.blocksById).flatMap((block) => (block.anchor ? [block.anchor] : [])),
    ])
  );
}
export function validateLinks(
  records: ReadonlyMap<string, RecordSpec>,
  values: ReadonlyMap<string, unknown>,
  links: z.infer<typeof linksSchema>
) {
  for (const link of links.links) {
    if (records.get(link.sourceKey)?.kind !== 'rulebook' || records.get(link.targetKey)?.kind !== 'rulebook') {
      throw new Error('Book links need declared source and target books.');
    }
    if (!link.edition && !anchors(values.get(link.targetKey)).has(link.anchor)) {
      throw new Error(`Broken current link ${link.sourceKey} → ${link.targetKey}#${link.anchor}`);
    }
  }
  for (const retired of links.retired) {
    if (records.get(retired.entityKey)?.kind !== 'rulebook') {
      throw new Error(`Unknown retired link owner ${retired.entityKey}`);
    }
    for (const target of retired.destinations) {
      if (!values.has(target.entityKey) || !anchors(values.get(target.entityKey)).has(target.anchor)) {
        throw new Error(`Unknown retirement destination ${target.entityKey}#${target.anchor}`);
      }
    }
  }
}
