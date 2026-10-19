import { describe, expect, it } from 'vite-plus/test';

import {
  COLUMNS_MIN_WIDTH_REM,
  controlsColumnLimits,
  controlsColumnLimitsWithoutPlayers,
  playersColumnLimits,
} from './tableLayout';

const REM = 16;

describe('table columns', () => {
  it('keeps every column its floor in the narrowest shell the columns fit', () => {
    const room = (COLUMNS_MIN_WIDTH_REM - 0.5) * REM;
    const controls = controlsColumnLimits(room, REM);
    expect(controls.min).toBeLessThanOrEqual(controls.max);
    const rest = room * (1 - controls.max / 100);
    /* The table and the players never fall below the kit split's stacking width. */
    expect(rest / REM).toBeGreaterThanOrEqual(40.75);
    const players = playersColumnLimits(rest, REM);
    expect(players.min).toBeLessThanOrEqual(players.max);
  });

  it("lets the controls take the players column's room when there are no players", () => {
    const room = 1600;
    expect(controlsColumnLimitsWithoutPlayers(room, REM).max).toBeGreaterThan(controlsColumnLimits(room, REM).max);
    /* In a narrow shell the controls keep their 18rem floor and may take everything but the table's 26rem floor. */
    const narrow = 50 * REM;
    const limits = controlsColumnLimitsWithoutPlayers(narrow, REM);
    expect(((limits.min / 100) * narrow) / REM).toBeCloseTo(18);
    expect((narrow * (1 - limits.max / 100)) / REM).toBeCloseTo(26);
  });

  it('never lets a column take more than 60% of a wide shell', () => {
    expect(controlsColumnLimits(4000, REM).max).toBe(60);
    expect(playersColumnLimits(4000, REM).max).toBe(60);
  });

  it('keeps min at or under max when the room is too small', () => {
    const limits = controlsColumnLimits(300, REM);
    expect(limits.min).toBeLessThanOrEqual(limits.max);
  });
});
