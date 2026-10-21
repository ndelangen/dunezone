import { z } from 'zod';

const key = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(160);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const timestamp = z.iso.datetime();
const pathPart = z
  .union([z.string().min(1), z.number().int().nonnegative()])
  .refine((value) => !['__proto__', 'prototype', 'constructor'].includes(String(value)));
const dataPath = z.array(pathPart).min(1).max(64);
export type DataPath = z.infer<typeof dataPath>;
const kind = z.enum(['rulebook', 'faction', 'asset']);
export const manifestSchema = z.strictObject({
  version: z.literal(1),
  status: z.enum(['scaffold', 'ready']),
  records: z
    .array(
      z.strictObject({
        key,
        kind,
        type: z.string().min(1).optional(),
        operation: z.enum(['update', 'create', 'convert', 'reference']),
        scope: z.enum(['gf9', 'shared']),
        file: z.string().min(1).optional(),
        book: z.enum(['core', 'ixian-tleilaxu', 'choam-richese', 'ecaz-moritani']).optional(),
        sourceType: z.string().min(1).optional(),
        changes: z
          .strictObject({ rename: z.boolean(), assignGroup: z.boolean(), relationships: z.array(z.string()) })
          .optional(),
      })
    )
    .max(1000),
});
type Manifest = z.infer<typeof manifestSchema>;
export type RecordSpec = Manifest['records'][number];
export const bindingsSchema = z.strictObject({
  version: z.literal(1),
  bindings: z
    .array(z.strictObject({ entityKey: key, path: dataPath, targetKey: key, field: z.enum(['id', 'slug']) }))
    .max(10_000),
});
export type Binding = z.infer<typeof bindingsSchema>['bindings'][number];
const identity = z.strictObject({
  key: z.string().min(1),
  path: dataPath,
  value: z.string().min(1),
  kind: z.enum(['page', 'block', 'item', 'member', 'troop', 'layer']),
  owner: z.string().min(1).optional(),
  layoutId: z.string().optional(),
});
export const identitiesSchema = z.strictObject({
  version: z.literal(1),
  records: z.array(
    z.strictObject({
      entityKey: key,
      entries: z.array(identity),
      retired: z.array(
        z.strictObject({
          key: z.string().min(1),
          kind: identity.shape.kind,
          value: z.string().min(1),
          owner: z.string().optional(),
          replacementKeys: z.array(z.string()),
          reason: z.string().min(1),
        })
      ),
    })
  ),
});
export const linksSchema = z.strictObject({
  version: z.literal(1),
  historical: z
    .array(
      z.strictObject({
        entityKey: key,
        edition: z.number().int().positive(),
        anchor: z.string(),
        file: z.string().min(1),
        sha256: hash,
      })
    )
    .default([]),
  retired: z.array(
    z.strictObject({
      entityKey: key,
      anchor: z.string().min(1),
      destinations: z.array(z.strictObject({ entityKey: key, anchor: z.string().min(1) })),
      reason: z.string().min(1),
    })
  ),
  links: z.array(
    z.strictObject({
      sourceKey: key,
      targetKey: key,
      anchor: z.string().min(1),
      edition: z.number().int().positive().optional(),
    })
  ),
});
export const artworkSchema = z.strictObject({
  version: z.literal(1),
  maintainedCatalogue: z.literal('../artwork/provenance.json'),
  records: z.array(
    z.strictObject({
      key,
      path: z.string().min(1),
      sha256: hash,
      source: z.string().min(1),
      sourceSha256: hash,
      sourcePage: z.number().int().positive().optional(),
      operation: z.string().min(1),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      limitation: z.string(),
      assetKey: z.string().min(1),
    })
  ),
});
const boundRecord = z.strictObject({
  state: z.literal('bound'),
  id: z.string().min(1),
  slug: z.string().min(1),
  kind,
  type: z.string().optional(),
  groupId: z.string().nullable(),
  baselineSavedHash: hash.optional(),
  baselineProtectedHash: hash.optional(),
});
const uncreatedRecord = z.strictObject({ state: z.literal('uncreated'), kind, type: z.string().optional() });
export const environmentSchema = z.strictObject({
  version: z.literal(1),
  name: z.enum(['local', 'production']),
  status: z.enum(['unbound', 'bound']),
  identity: z
    .strictObject({
      applicationOrigin: z.string().url(),
      backendOrigin: z.string().url(),
      ruleset: z.strictObject({ id: z.string().min(1), slug: z.literal('gf9') }),
      group: z.strictObject({ id: z.string().min(1), slug: z.literal('gf9') }),
    })
    .nullable(),
  bindings: z.record(key, z.union([boundRecord, uncreatedRecord])),
});
export type Environment = z.infer<typeof environmentSchema>;
export type BoundRecord = z.infer<typeof boundRecord>;
export const readbackSchema = z.strictObject({
  format: z.literal('gf9-record-readback'),
  version: z.literal(1),
  applicationOrigin: z.string().url(),
  backendOrigin: z.string().url(),
  observedAt: timestamp,
  rulesetId: z.string().min(1),
  groupScopeId: z.string().min(1),
  viewer: z.strictObject({
    id: z.string().min(1),
    capabilities: z.strictObject({ edit: z.boolean(), rename: z.boolean(), changeGroup: z.boolean() }),
  }),
  record: z.strictObject({
    id: z.string().min(1),
    kind,
    type: z.string().optional(),
    slug: z.string().min(1),
    groupId: z.string().nullable(),
    ownerId: z.string().min(1),
    name: z.string().optional(),
    revision: z.number().int().positive().optional(),
    edition: z.number().int().positive().optional(),
  }),
  data: z.unknown(),
  relationships: z.strictObject({
    members: z.array(z.strictObject({ id: z.string().min(1), count: z.number().int().positive() })),
    rulesetSlots: z.array(z.string()),
    rulesetIds: z.array(z.string()),
  }),
});
export type Readback = z.infer<typeof readbackSchema>;
export const checkpointSchema = z.strictObject({
  format: z.literal('gf9-saved-checkpoint'),
  version: z.literal(1),
  environment: z.enum(['local', 'production']),
  capturedAt: timestamp,
  applicationOrigin: z.string().url(),
  backendOrigin: z.string().url(),
  openDrafts: z.literal('saved-or-discarded'),
  records: z.array(
    z.strictObject({
      key,
      readback: z.string().min(1),
      readbackSha256: hash,
      export: z.string().min(1).optional(),
      exportSha256: hash.optional(),
      exportedAt: timestamp.optional(),
    })
  ),
});
export type Checkpoint = z.infer<typeof checkpointSchema>;
export const syncSchema = z.strictObject({
  version: z.literal(1),
  environmentFingerprint: hash,
  records: z.record(
    key,
    z.strictObject({
      authoredHash: hash,
      savedHash: hash,
      protectedHash: hash,
      checkpointHash: hash,
      collectedAt: timestamp,
      status: z.enum(['baseline', 'collected']),
    })
  ),
});
export type Sync = z.infer<typeof syncSchema>;
export const reviewSchema = z.strictObject({
  version: z.literal(1),
  authoringHash: hash,
  authoringCommit: z.string().regex(/^[a-f0-9]{40}$/),
  localEnvironmentFingerprint: hash,
  localBindingsHash: hash,
  localSyncHash: hash,
  codeIdentity: z.string().min(1),
  mediaIdentity: z.string().min(1),
  rulesReview: z.string().min(1),
  visualReview: z.string().min(1),
  workflowReview: z.string().min(1),
  userBookApproval: z.string().min(1).optional(),
  reviewedKeys: z.array(key).min(1),
});
