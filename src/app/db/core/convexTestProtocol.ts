import type { WithoutSystemFields } from 'convex/server';
import type { GenericId } from 'convex/values';

import type { Doc, TableNames } from '../../../../convex/_generated/dataModel';

type SeedReference = { $seedRef: string };
type WithSeedReferences<Value> =
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

type StatisticsTotals = {
  answers: number;
  factions: number;
  questions: number;
  rulesets: number;
  users: number;
};

export type SchedulerProbeResult = {
  after: StatisticsTotals;
};

export type RollbackProbeResult = {
  error: string;
  usersAfterFailure: number;
};

export type WorkerRequest =
  | { id: number; operation: 'ping' }
  | { id: number; operation: 'networkProbe' }
  | { id: number; operation: 'httpProbe' }
  | { id: number; operation: 'schedulerProbe' }
  | { id: number; operation: 'rollbackProbe' }
  | { id: number; operation: 'query'; name: string; args: unknown; identity?: WorkerIdentity }
  | { id: number; operation: 'mutation'; name: string; args: unknown; identity?: WorkerIdentity }
  | { id: number; operation: 'insert'; documents: SeedDocument[] }
  | { id: number; operation: 'reset'; seed: SeedDocument[] }
  | {
      id: number;
      operation: 'concurrency';
      name: string;
      args: unknown;
      first: SeedDocument[];
      second: SeedDocument[];
    };

export type WorkerResponse = { id: number; ok: true; result: unknown } | { id: number; ok: false; error: string };
