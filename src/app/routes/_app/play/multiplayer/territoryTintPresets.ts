import type { Board } from '@shared/boards/schema';
import { territoryId } from '@shared/boards/schema';
import { boardTerritories } from '@shared/boards/territories';
import { fitsTintCommand } from '@shared/play/territoryTints';
import type { TerritoryTint } from '@shared/play/territoryTints';

type Preset = Omit<TerritoryTint, 'id'>;

type Stretch = { edge: string; t0: number; t1: number };
/* Shorter stretches than this are a shared corner, not a shared border. */
const TOUCH = 1e-6;

/** Whether two stretches lie along the same part of one edge, not merely the same edge. */
function overlaps(a: Stretch, b: Stretch) {
  const from = Math.max(Math.min(a.t0, a.t1), Math.min(b.t0, b.t1));
  const to = Math.min(Math.max(a.t0, a.t1), Math.max(b.t0, b.t1));
  return a.edge === b.edge && to - from > TOUCH;
}

/** Territories by ID, each with the territories it shares a stretch of border with. */
function neighbours(board: Board) {
  const faces = boardTerritories(board).map((face) => ({
    id: territoryId(board.properties[face.key].name),
    stretches: face.boundaries.flat(),
  }));
  const borders = (a: Stretch[], b: Stretch[]) => a.some((stretch) => b.some((other) => overlaps(stretch, other)));
  return new Map(
    faces.map((face) => [
      face.id,
      faces.filter((other) => other !== face && borders(face.stretches, other.stretches)).map((other) => other.id),
    ])
  );
}

/** A territory and every territory within the given number of borders of it. */
function within(board: Board, start: string, steps: number) {
  const graph = neighbours(board);
  let reached = new Set([start]);
  for (let step = 0; step < steps; step++) {
    reached = new Set([...reached, ...[...reached].flatMap((id) => graph.get(id) ?? [])]);
  }
  return [...reached];
}

/** The presets this board can lay: a custom board missing a preset's territories, or with more of them than one command carries, offers fewer. */
export function territoryTintPresets(board: Board): Preset[] {
  const ids = new Set(Object.values(board.properties).map((property) => territoryId(property.name)));
  const greatFlat = ['the_great_flat', 'great_flat'].find((id) => ids.has(id));
  const presets: Preset[] = [
    ...(greatFlat
      ? [
          {
            name: 'Fremen deployment',
            color: '#e8b923' as const,
            /* The Fremen send forces from their reserves to the Great Flat or any territory within two territories of it. */
            territories: within(board, greatFlat, 2),
          },
        ]
      : []),
    ...(ids.has('shield_wall')
      ? [
          {
            name: 'Shield Wall destroyed',
            color: '#1b1b1b' as const,
            stamps: ['atomics' as const],
            territories: ['shield_wall'],
          },
        ]
      : []),
  ];
  /* The ID only stands in for the one the panel makes, which is as long. */
  return presets.filter((preset) =>
    fitsTintCommand({ kind: 'tint-create', tintId: `tint-${crypto.randomUUID()}`, ...preset })
  );
}
