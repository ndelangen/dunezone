import type { GameSnapshot } from '@shared/play/protocol';

/**
 * What the table draws beside the board in each stage.
 * Drafting, swapping and a discarded game have no storm or trackers, and setup shows only the spice supply.
 * Play, a finished game and a fixture show both.
 */
export function boardFurnitureFor(stage: GameSnapshot['stage']): {
  storm: boolean;
  trackers: 'none' | 'spice' | 'all';
} {
  switch (stage) {
    case 'drafting':
    case 'swapping':
    case 'discarded':
      return { storm: false, trackers: 'none' };
    case 'setup':
      return { storm: false, trackers: 'spice' };
    case undefined:
    case 'play':
    case 'finished':
      return { storm: true, trackers: 'all' };
  }
}
