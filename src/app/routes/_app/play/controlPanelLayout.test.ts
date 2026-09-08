import { describe, expect, test } from 'vitest';

import {
  clampControlsPanelPercent,
  controlsPanelPercentForKey,
  controlsPanelPercentFromPointer,
  DEFAULT_CONTROLS_PANEL_PERCENT,
  MAX_CONTROLS_PANEL_PERCENT,
  maxControlsPanelPercentForHeight,
  MIN_CONTROLS_PANEL_PERCENT,
  PREFERRED_TABLETOP_SCENE_HEIGHT_PX,
} from './controlPanelLayout';

describe('table controls panel layout', () => {
  test('clamps the panel to usable bounds', () => {
    expect(clampControlsPanelPercent(2)).toBe(MIN_CONTROLS_PANEL_PERCENT);
    expect(clampControlsPanelPercent(34)).toBe(34);
    expect(clampControlsPanelPercent(92)).toBe(MAX_CONTROLS_PANEL_PERCENT);
    expect(clampControlsPanelPercent(30, 20)).toBe(20);
  });

  test('reserves the preferred tabletop height when both panes fit', () => {
    expect(maxControlsPanelPercentForHeight(1000)).toBe(MAX_CONTROLS_PANEL_PERCENT);
    expect(maxControlsPanelPercentForHeight(400)).toBe(20);
    expect(400 * (1 - maxControlsPanelPercentForHeight(400) / 100)).toBe(PREFERRED_TABLETOP_SCENE_HEIGHT_PX);
  });

  test.each([300, 320, 360])('keeps controls reachable in a %ipx shell', (height) => {
    const maximum = maxControlsPanelPercentForHeight(height);
    expect(maximum).toBe(MIN_CONTROLS_PANEL_PERCENT);
    expect(clampControlsPanelPercent(0, maximum)).toBe(MIN_CONTROLS_PANEL_PERCENT);
    expect(controlsPanelPercentForKey(30, 'Home', maximum)).toBe(MIN_CONTROLS_PANEL_PERCENT);
  });

  test('converts a divider pointer position into panel height', () => {
    expect(controlsPanelPercentFromPointer(700, 100, 1000)).toBe(40);
    expect(controlsPanelPercentFromPointer(-500, 100, 1000)).toBe(MAX_CONTROLS_PANEL_PERCENT);
    expect(controlsPanelPercentFromPointer(2000, 100, 1000)).toBe(MIN_CONTROLS_PANEL_PERCENT);
    expect(controlsPanelPercentFromPointer(700, 100, 0)).toBe(DEFAULT_CONTROLS_PANEL_PERCENT);
    expect(controlsPanelPercentFromPointer(-500, 100, 1000, 20)).toBe(20);
  });

  test.each([
    ['ArrowUp', 32],
    ['ArrowDown', 28],
    ['PageUp', 35],
    ['PageDown', 25],
    ['Home', MIN_CONTROLS_PANEL_PERCENT],
    ['End', MAX_CONTROLS_PANEL_PERCENT],
  ])('handles %s from the keyboard', (key, expected) => {
    expect(controlsPanelPercentForKey(30, key)).toBe(expected);
  });

  test('clamps keyboard changes and ignores unrelated keys', () => {
    expect(controlsPanelPercentForKey(MAX_CONTROLS_PANEL_PERCENT, 'ArrowUp')).toBe(MAX_CONTROLS_PANEL_PERCENT);
    expect(controlsPanelPercentForKey(MIN_CONTROLS_PANEL_PERCENT, 'ArrowDown')).toBe(MIN_CONTROLS_PANEL_PERCENT);
    expect(controlsPanelPercentForKey(30, 'Enter')).toBeNull();
    expect(controlsPanelPercentForKey(18, 'End', 20)).toBe(20);
  });
});
