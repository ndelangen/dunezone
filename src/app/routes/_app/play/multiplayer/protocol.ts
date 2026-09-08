import type { Vector3Tuple } from '../model';

type FixtureRole = 'alice' | 'bob' | 'spectator';

/** Passive presence shapes retained from the table. The local fixture never connects them. */
export type PublicPointer = {
  sessionId: string;
  role: FixtureRole;
  position: Vector3Tuple;
  updatedAt: number;
};

export const ROLE_LABELS: Record<FixtureRole, string> = {
  alice: 'Alice',
  bob: 'Bob',
  spectator: 'Spectator',
};
export const ROLE_COLORS: Record<FixtureRole, string> = {
  alice: '#ed927c',
  bob: '#75d8a7',
  spectator: '#d0c8b9',
};
