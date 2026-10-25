import { resolveRulebookBoardDefinition } from '../../../src/shared/rulebooks/boardDefinitions';
import type { Binding, DataPath, Environment, RecordSpec } from './contracts';
import { at, put } from './files';

export type TypedReference = {
  path: DataPath;
  field: 'id' | 'slug';
  kind: 'asset' | 'faction';
  types?: readonly string[];
};
const tokenTypes = ['token-disc', 'token-tech', 'token-plate', 'token-pointer', 'token-enhance'];
const marker = (key: string) => `@gf9/${key.replace(/^gf9-/, '')}`;
const pathKey = (value: DataPath) => JSON.stringify(value.map(String));

/** Only schema-defined reference fields are binding sites. Prose and component UUIDs never are. */
function typedReferences(spec: RecordSpec, value: unknown): TypedReference[] {
  const refs: TypedReference[] = [];
  const add = (path: DataPath, kind: 'asset' | 'faction', field: 'id' | 'slug' = 'id', types?: readonly string[]) =>
    refs.push({ path, kind, field, ...(types ? { types } : {}) });
  const data = value as Record<string, unknown>;
  if (spec.kind === 'faction') {
    for (const [index, extra] of ((data.extras ?? []) as { type: string; slug: string }[]).entries()) {
      add(['extras', index, 'slug'], 'asset', 'slug', [extra.type]);
    }
  } else if (spec.kind === 'asset') {
    const back = data.back as { mode?: string; asset_id?: string } | undefined;
    if (back?.mode === 'reference' && back.asset_id) {
      add(['back', 'asset_id'], 'asset', 'id', [spec.type!]);
    }
    const cardback = data.cardback as { mode?: string; asset_id?: string } | undefined;
    if (cardback?.mode === 'reference') {
      add(['cardback', 'asset_id'], 'asset', 'id', ['deck']);
    }
    if (spec.type === 'card-spice' && data.board) {
      add(['board', 'asset_id'], 'asset', 'id', ['board']);
      const board = data.board as { tokens: { asset_id: string }[]; typeToken?: { asset_id: string } };
      for (const [index] of board.tokens.entries()) {
        add(['board', 'tokens', index, 'asset_id'], 'asset', 'id', tokenTypes);
      }
      if (board.typeToken) {
        add(['board', 'typeToken', 'asset_id'], 'asset', 'id', tokenTypes);
      }
    }
    if (spec.type === 'card-custom' || spec.type === 'card-storm') {
      for (const [index, layer] of (data.layers as { kind: string }[]).entries()) {
        if (layer.kind === 'token') {
          add(['layers', index, 'asset_id'], 'asset', 'id', tokenTypes);
        }
      }
    }
    if (data.factionLink) {
      add(['factionLink', 'id'], 'faction');
      add(['factionLink', 'slug'], 'faction', 'slug');
    }
  } else {
    const walk = (node: unknown, path: DataPath) => {
      if (!node || typeof node !== 'object') {
        return;
      }
      for (const [key, child] of Object.entries(node)) {
        const next = [...path, Array.isArray(node) ? Number(key) : key];
        if (typeof child === 'string' && child) {
          if (key === 'factionId' || key === 'leftFactionId' || key === 'rightFactionId') {
            add(next, 'faction');
          }
          if (key === 'assetId' || key === 'artworkAssetId') {
            add(next, 'asset');
          }
          if (key === 'asset_id') {
            add(next, 'asset', 'id', tokenTypes);
          }
          if (key === 'boardId' && !resolveRulebookBoardDefinition(child)) {
            add(next, 'asset', 'id', ['board']);
          }
        } else if (child && typeof child === 'object') {
          walk(child, next);
        }
      }
    };
    walk(data, []);
  }
  return refs;
}
function assertBindingTarget(ref: TypedReference, target: RecordSpec) {
  if (target.kind !== ref.kind || (ref.types && !ref.types.includes(target.type ?? ''))) {
    throw new Error(
      `Reference ${ref.path.join('.')} requires ${ref.types?.join(' or ') ?? ref.kind}; ${target.key} has ${target.kind}/${target.type ?? ''}.`
    );
  }
}
function declaredBindings(spec: RecordSpec, bindings: readonly Binding[]) {
  const declared = new Map<string, Binding>();
  for (const binding of bindings.filter((item) => item.entityKey === spec.key)) {
    const key = pathKey(binding.path);
    if (declared.has(key)) {
      throw new Error(`Duplicate binding ${spec.key}:${binding.path.join('.')}`);
    }
    declared.set(key, binding);
  }
  const id = declared.get(pathKey(['factionLink', 'id'])),
    slug = declared.get(pathKey(['factionLink', 'slug']));
  if (id && slug && id.targetKey !== slug.targetKey) {
    throw new Error('A Faction link ID and slug must name the same semantic faction.');
  }
  return declared;
}
export function bindValue(
  spec: RecordSpec,
  value: unknown,
  bindings: readonly Binding[],
  records: ReadonlyMap<string, RecordSpec>,
  environment: Environment
) {
  const result = structuredClone(value);
  const references = typedReferences(spec, value);
  const declared = declaredBindings(spec, bindings);
  for (const ref of references) {
    const binding = declared.get(pathKey(ref.path));
    if (!binding || binding.field !== ref.field) {
      throw new Error(`Declare the typed binding ${spec.key}:${ref.path.join('.')}`);
    }
    declared.delete(pathKey(ref.path));
    const target = records.get(binding.targetKey);
    if (!target) {
      throw new Error(`Unknown target ${binding.targetKey}`);
    }
    assertBindingTarget(ref, target);
    if (at(value, ref.path) !== marker(target.key)) {
      throw new Error(`${spec.key}:${ref.path.join('.')} must contain ${marker(target.key)}.`);
    }
    const destination = environment.bindings[target.key];
    if (!destination || destination.state !== 'bound') {
      throw new Error(`Bind ${target.key} to its actual saved ${environment.name} target before preparing consumers.`);
    }
    if (destination.kind !== target.kind || (target.kind === 'asset' && destination.type !== target.type)) {
      throw new Error(`Destination kind/type mismatch for ${target.key}.`);
    }
    put(result, ref.path, destination[ref.field]);
  }
  if (declared.size) {
    throw new Error(`Binding is not a typed reference: ${spec.key}:${[...declared.values()][0].path.join('.')}`);
  }
  return result;
}
/** Collection reverses declared paths only. A newly selected or moved source needs an explicit binding. */
export function collectValue(
  spec: RecordSpec,
  value: unknown,
  bindings: readonly Binding[],
  records: ReadonlyMap<string, RecordSpec>,
  environment: Environment
) {
  const result = structuredClone(value);
  const references = typedReferences(spec, value);
  const declared = declaredBindings(spec, bindings);
  for (const ref of references) {
    const binding = declared.get(pathKey(ref.path));
    if (!binding || binding.field !== ref.field) {
      throw new Error(
        `Unknown collected reference ${spec.key}:${ref.path.join('.')}. Add its typed binding before collecting.`
      );
    }
    declared.delete(pathKey(ref.path));
    const target = records.get(binding.targetKey);
    if (!target) {
      throw new Error(`Unknown target ${binding.targetKey}`);
    }
    assertBindingTarget(ref, target);
    const destination = environment.bindings[target.key];
    if (!destination || destination.state !== 'bound' || at(value, ref.path) !== destination[ref.field]) {
      throw new Error(
        `Unknown collected reference at ${spec.key}:${ref.path.join('.')}. Do not infer it from its name.`
      );
    }
    put(result, ref.path, marker(target.key));
  }
  if (declared.size) {
    throw new Error(`A collected binding path disappeared: ${spec.key}:${[...declared.values()][0].path.join('.')}`);
  }
  return result;
}
export function assertNoUnboundMarkers(value: unknown) {
  const walk = (node: unknown, path: string) => {
    if (typeof node === 'string' && node.startsWith('@gf9/')) {
      throw new Error(`Unresolved marker at ${path}`);
    }
    if (node && typeof node === 'object') {
      for (const [key, child] of Object.entries(node)) {
        walk(child, `${path}.${key}`);
      }
    }
  };
  walk(value, '$');
}
