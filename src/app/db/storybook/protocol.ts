import type { FunctionReturnType, WithoutSystemFields } from 'convex/server';
import type { GenericId } from 'convex/values';

import type { api } from '../../../../convex/_generated/api';
import type { Doc, TableNames } from '../../../../convex/_generated/dataModel';

/** The characters `refText` replaces with the resolved id, chosen so `encodeURIComponent` leaves them alone. */
export const SEED_REF_TOKEN = '__seed_ref__';

/* A bare reference resolves to the id; one carrying `$seedText` resolves to that text with the token replaced. */
export type SeedReference = { $seedRef: string; $seedText?: string };
export type WithSeedReferences<Value> =
  Value extends GenericId<string>
    ? Value | SeedReference
    : Value extends (infer Item)[]
      ? WithSeedReferences<Item>[]
      : Value extends ArrayBuffer
        ? Value
        : Value extends object
          ? { [Key in keyof Value]: WithSeedReferences<Value[Key]> }
          : Value;

export type SeedDocumentFor<TableName extends TableNames> = {
  key?: string;
  table: TableName;
  value: WithSeedReferences<WithoutSystemFields<Doc<TableName>>>;
};

export type SeedDocument = {
  [TableName in TableNames]: SeedDocumentFor<TableName>;
}[TableNames];

export type WorkerIdentity = {
  name?: string;
  subjectKey: string;
};

export type SchedulerProbeResult = {
  after: FunctionReturnType<typeof api.statistics.getGlobalTotals>;
};

export type RollbackProbeResult = {
  error: string;
  usersAfterFailure: number;
};

export type ContextTraceEntry = {
  actual: string | null;
  expected: string;
  step: string;
};

export type ContextConformanceResult = {
  date: {
    deterministicDefault: boolean;
    multiArgumentMatchesNative: boolean;
  };
  ambient: {
    mismatches: number;
    trace: ContextTraceEntry[];
  };
  explicit: {
    iterations: number;
    mismatches: number;
    sources: string[];
  };
  convexHelper: {
    error: string;
    handle: string | null;
    status: 'blocked' | 'supported';
  };
};

export type WorkerRequest =
  | { id: number; operation: 'ping' }
  | { id: number; operation: 'networkProbe' }
  | { id: number; operation: 'subworkerProbe' }
  | { id: number; operation: 'httpProbe' }
  | { id: number; operation: 'schedulerProbe' }
  | { id: number; operation: 'rollbackProbe' }
  | { id: number; operation: 'contextConformance' }
  | { id: number; operation: 'query'; name: string; args: unknown; identity?: WorkerIdentity }
  | { id: number; operation: 'mutation'; name: string; args: unknown; identity?: WorkerIdentity }
  | { id: number; operation: 'reset'; seed: SeedDocument[] };

export type WorkerResponse = { id: number; ok: true; result: unknown } | { id: number; ok: false; error: string };
