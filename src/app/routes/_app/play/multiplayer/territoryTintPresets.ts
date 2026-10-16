import type { Board } from '@shared/boards/schema';
import { territoryId } from '@shared/boards/schema';
import { boardTerritories } from '@shared/boards/territories';
import type { TerritoryTint } from '@shared/play/territoryTints';

type Preset = Omit<TerritoryTint, 'id'>;

/** Territories by ID, each with the territories it shares a border with. */
function neighbours(board: Board) {
  const faces = boardTerritories(board).map((face) => ({
    id: territoryId(board.properties[face.key].name),
    edges: new Set(face.edges),
  }));
  return new Map(
    faces.map((face) => [
      face.id,
      faces
        .filter((other) => other !== face && [...other.edges].some((edge) => face.edges.has(edge)))
        .map((other) => other.id),
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

/** The presets this board can lay: each needs the territories it names, so a custom board without them offers fewer. */
export function territoryTintPresets(board: Board): Preset[] {
  const ids = new Set(Object.values(board.properties).map((property) => territoryId(property.name)));
  const greatFlat = ['the_great_flat', 'great_flat'].find((id) => ids.has(id));
  return [
    ...(greatFlat
      ? [
          {
            name: 'Fremen deployment',
            color: '#2f7fe0' as const,
            /* The Fremen send forces from their reserves to the Great Flat or any territory within two territories of it. */
            territories: within(board, greatFlat, 2),
          },
        ]
      : []),
    ...(ids.has('shield_wall')
      ? [
          {
            name: 'Shield Wall destroyed',
            color: '#d63a2a' as const,
            stamp: 'atomics' as const,
            territories: ['shield_wall'],
          },
        ]
      : []),
  ];
}
