import { describe, expect, test } from 'vitest';

import {
  controlsPanelLimits,
  MAX_CONTROLS_PANEL_PERCENT,
  maxControlsPanelPercentForHeight,
  MIN_CONTROLS_PANEL_PERCENT,
  PREFERRED_TABLETOP_SCENE_HEIGHT_PX,
} from './controlPanelLayout';

describe('table controls panel layout', () => {
  test('reserves the preferred tabletop height when both panes fit', () => {
    expect(maxControlsPanelPercentForHeight(1000)).toBe(MAX_CONTROLS_PANEL_PERCENT);
    expect(maxControlsPanelPercentForHeight(400)).toBe(20);
    expect(400 * (1 - maxControlsPanelPercentForHeight(400) / 100)).toBe(PREFERRED_TABLETOP_SCENE_HEIGHT_PX);
  });

  test.each([300, 320, 360])('keeps controls reachable in a %ipx shell', (height) => {
    expect(maxControlsPanelPercentForHeight(height)).toBe(MIN_CONTROLS_PANEL_PERCENT);
  });

  test('the separator stays above the dock floor, so the dock never rises over it', () => {
    /* 17rem at 16px is 272px: 30% of a 720px shell would leave the dock 56px short. */
    expect(controlsPanelLimits(720, 16).min).toBeCloseTo((272 / 720) * 100);
    expect(controlsPanelLimits(2000, 16)).toEqual({ min: MIN_CONTROLS_PANEL_PERCENT, max: MAX_CONTROLS_PANEL_PERCENT });
  });

  test('a shell with room for the dock floor and the least of the table gives the scene less than it prefers', () => {
    const limits = controlsPanelLimits(480, 16);
    expect(limits.min).toBeCloseTo((272 / 480) * 100);
    expect(limits.max).toBe(limits.min);
    expect(limits.concealed).toBeUndefined();
  });

  test('a shell too short for both keeps the table and fixes the split, with the dock over the scene', () => {
    expect(controlsPanelLimits(400, 16)).toEqual({
      min: MIN_CONTROLS_PANEL_PERCENT,
      max: MIN_CONTROLS_PANEL_PERCENT,
      concealed: true,
    });
  });
});
