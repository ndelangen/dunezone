/** Explicit, in-memory source revisions for the AssetExplainer authoring prototype. */
export type Revision = 'current' | 'updated' | 'missing-part' | 'unavailable';

export type Source = {
  id: string;
  kind: 'board' | 'leader';
  name: string;
  factionId?: string;
  leaderId?: string;
};

export type Entry = {
  id: string;
  label: string;
  color?: string;
  text: string;
  target: { kind: 'named'; key: string } | { kind: 'position'; x: number; y: number; sourceId: string };
};

export type DisplayEntry = Entry & { color: string };

export type Target = {
  key: string;
  label: string;
  x: number;
  y: number;
  fragmentId?: string;
  /** Named part hit areas use the same 100-unit viewBox as the board overlay. */
  path?: string;
};

export const sources: Source[] = [
  { id: 'dreamrules-board', kind: 'board', name: 'Dreamrules board' },
  { id: 'classic-board', kind: 'board', name: 'Classic board' },
  { id: 'atreides-paul', kind: 'leader', name: 'Paul Atreides', factionId: 'atreides', leaderId: 'paul' },
  { id: 'atreides-gurney', kind: 'leader', name: 'Gurney Halleck', factionId: 'atreides', leaderId: 'gurney' },
  { id: 'fremen-stilgar', kind: 'leader', name: 'Stilgar', factionId: 'fremen', leaderId: 'stilgar' },
];

export const entryColors = ['#b14235', '#a76e16', '#737320', '#3d754d', '#315a99', '#7b4593'];

const boardTargets: Target[] = [
  { key: 'arrakeen', label: 'Arrakeen', x: 0.65475, y: 0.14725, fragmentId: 'arrakeen' },
  { key: 'carthag', label: 'Carthag', x: 0.48575, y: 0.18365, fragmentId: 'carthag' },
  { key: 'tabr', label: 'Sietch Tabr', x: 0.142, y: 0.28295, fragmentId: 'tabr' },
  { key: 'habbanya', label: 'Habbanya Sietch', x: 0.15995, y: 0.7239, fragmentId: 'habbanya' },
  { key: 'tueks', label: "Tuek's Sietch", x: 0.8636, y: 0.70745, fragmentId: 'tueks' },
  { key: 'shield-wall', label: 'Shield Wall', x: 0.70955, y: 0.3146, fragmentId: 'shield-wall' },
];

const leaderTargets: Target[] = [
  { key: 'portrait', label: 'Portrait', x: 0.43, y: 0.37, path: 'M50 6a38 38 0 1 1 0 76a38 38 0 1 1 0-76' },
  { key: 'strength', label: 'Fighting strength', x: 0.81, y: 0.47, path: 'M72 29h21v36H72z' },
  { key: 'faction-emblem', label: 'Faction emblem', x: 0.5, y: 0.8017, path: 'M42 71h16v18H42z' },
  { key: 'name', label: 'Leader name', x: 0.31, y: 0.83, path: 'M5 48a45 45 0 0 0 90 0H86a36 36 0 0 1-72 0z' },
];

export function getSourceName(source: Source, revision: Revision) {
  if (revision !== 'updated') {
    return source.name;
  }
  if (source.id === 'atreides-paul') {
    return "Paul Muad'Dib";
  }
  return `${source.name}, revised`;
}

export function getBoardRotation(revision: Revision) {
  return revision === 'updated' ? 18 : 0;
}

export function getTargets(source: Source, revision: Revision): Target[] {
  if (revision === 'unavailable') {
    return [];
  }
  if (source.kind === 'leader') {
    return leaderTargets.filter((target) => revision !== 'missing-part' || target.key !== 'strength');
  }
  const rotation = (getBoardRotation(revision) * Math.PI) / 180;
  return boardTargets
    .filter((target) => source.id !== 'classic-board' || target.key !== 'shield-wall')
    .filter((target) => revision !== 'missing-part' || target.key !== 'arrakeen')
    .map((target) => ({
      ...target,
      x: 0.5 + (target.x - 0.5) * Math.cos(rotation) - (target.y - 0.5) * Math.sin(rotation),
      y: 0.5 + (target.x - 0.5) * Math.sin(rotation) + (target.y - 0.5) * Math.cos(rotation),
    }));
}

export function resolveTarget(source: Source, revision: Revision, target: Entry['target']): Target | undefined {
  if (revision === 'unavailable') {
    return undefined;
  }
  if (target.kind === 'named') {
    return getTargets(source, revision).find(({ key }) => key === target.key);
  }
  if (target.sourceId !== source.id) {
    return undefined;
  }
  return { key: 'position', label: 'Placed marker', x: target.x, y: target.y };
}

export function getTargetName(target: Entry['target']) {
  if (target.kind === 'position') {
    return 'Placed marker';
  }
  return [...boardTargets, ...leaderTargets].find(({ key }) => key === target.key)?.label ?? target.key;
}

export function createBoardEntries(): Entry[] {
  const descriptions = [
    'Home of House Atreides. Forces here provide access to ornithopters and collect 2 spice during collection.',
    'Home of House Harkonnen. Forces here provide access to ornithopters and collect 2 spice during collection.',
    'Home of the Fremen. This stronghold sits on the western edge of the northern basin.',
    'An isolated stronghold, difficult to reach from the northern cities.',
    'Home of the Spacing Guild. Forces here collect 1 spice during collection.',
    'In Dreamrules, this becomes a stronghold for victory purposes after the fourth Shai-Hulud card.',
  ];
  return boardTargets.map((target, index) => ({
    id: `board-entry-${target.key}`,
    label: String(index + 1),
    text: descriptions[index]!,
    target: { kind: 'named', key: target.key },
  }));
}

export function createLeaderEntries(): Entry[] {
  const descriptions: Record<string, string> = {
    portrait: 'The portrait helps you identify the leader at the table.',
    strength:
      "Add this value to the forces committed in your battle plan. Apply the leader's special rules where relevant.",
    'faction-emblem': 'The emblem identifies the faction this leader belongs to.',
    name: 'Use the printed name to match the leader with their Traitor Card.',
  };
  return leaderTargets.map((target, index) => ({
    id: `leader-entry-${target.key}`,
    label: String(index + 1),
    text: descriptions[target.key]!,
    target: { kind: 'named', key: target.key },
  }));
}
