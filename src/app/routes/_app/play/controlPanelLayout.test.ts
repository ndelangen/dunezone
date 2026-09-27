import { describe, expect, test } from 'vitest';

import {
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
});
