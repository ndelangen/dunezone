import { trackerArcSlots } from '@shared/play/tableTrackers';
import { Vector3 } from 'three';
import { describe, expect, test } from 'vitest';

import type { TABLE_VIEW_OPTIONS } from './playView';
import {
  cameraFogRange,
  cameraPoseFor,
  cameraTiltAfterWheel,
  cameraViewTransitionProgress,
  createTableViewState,
  mapViewTopLimitForViewport,
  reduceTableView,
  CAMERA_VIEW_TRANSITION_MS,
  MAP_VIEW_BOTTOM_LIMIT,
  MAP_VIEW_HORIZONTAL_LIMIT,
  MAP_VIEW_MINIMUM_CAMERA_SCALE,
  MAP_VIEW_TOP_LIMIT,
  tableCamera,
} from './playView';
import { mapViewFramingPoints } from './tablePlateGeometry';

describe('table views', () => {
  test('frames the complete map area while preserving its approved angle', () => {
    const pose = cameraPoseFor('map', 1, mapViewFramingPoints(trackerArcSlots(9)));
    const scale = (pose.position[1] - pose.target[1]) / 9.4;

    expect(pose.target).toEqual([0, 0.1, 0.8]);
    expect(scale).toBeGreaterThan(0.9);
    expect(scale).toBeLessThan(1);
    expect(pose.position[1]).toBeLessThan(9.5);
    expect((pose.position[1] - pose.target[1]) / (pose.position[2] - pose.target[2])).toBeCloseTo(9.4 / 11.2);
  });

  test('moves focus views closer without changing the approved camera angle', () => {
    const cameraDistance = (view: (typeof TABLE_VIEW_OPTIONS)[number]['id']) => {
      const pose = cameraPoseFor(view);
      return Math.hypot(
        pose.position[0] - pose.target[0],
        pose.position[1] - pose.target[1],
        pose.position[2] - pose.target[2]
      );
    };
    const mapDistance = cameraDistance('map');
    const baseDistance = Math.hypot(9.4, 11.2);

    for (const view of ['left', 'right', 'bottom'] as const) {
      const pose = cameraPoseFor(view);
      const offset = pose.position.map((value, index) => value - pose.target[index]);
      expect(cameraDistance(view) / baseDistance).toBeCloseTo(view === 'bottom' ? 0.74 : 0.68);
      expect(cameraDistance(view)).toBeLessThan(mapDistance);
      expect(offset[1] / offset[2]).toBeCloseTo(9.4 / 11.2);
    }
    expect(cameraPoseFor('left').target[0]).toBe(-cameraPoseFor('right').target[0]);
    expect(cameraPoseFor('bottom').target[2]).toBeGreaterThan(0);
  });

  test('keeps side workspaces in frame on narrow screens', () => {
    const wideLeft = cameraPoseFor('left', 1);
    const narrowLeft = cameraPoseFor('left', 390 / 844);
    const narrowRight = cameraPoseFor('right', 390 / 844);

    expect(narrowLeft.target[0]).toBeLessThan(wideLeft.target[0]);
    expect(narrowRight.target[0]).toBe(-narrowLeft.target[0]);
    expect(narrowLeft.position[0] - narrowLeft.target[0]).toBe(0);
  });

  test('backs the map camera away for narrow screens, and a composed turn keeps the standard arc', () => {
    const standardFrame = mapViewFramingPoints(trackerArcSlots(9));
    const wide = cameraPoseFor('map', 1, standardFrame);
    const narrow = cameraPoseFor('map', 390 / 844, standardFrame);
    const expandedArc = cameraPoseFor('map', 1, mapViewFramingPoints(trackerArcSlots(30)));

    expect(narrow.position[1]).toBeGreaterThan(wide.position[1]);
    expect(narrow.position[2]).toBeGreaterThan(wide.position[2]);
    /* Extra phase discs refit into the standard arc (#1138), so the map framing does not move. */
    expect(expandedArc.position).toEqual(wide.position);
    expect(narrow.target).toEqual(wide.target);
    expect(expandedArc.target).toEqual(wide.target);
  });

  test('keeps a wide map tighter than the base pose while fitting its seats', () => {
    const pose = cameraPoseFor('map', 16 / 9, mapViewFramingPoints(trackerArcSlots(9)));
    const scale = (pose.position[1] - pose.target[1]) / 9.4;

    expect(scale).toBeGreaterThanOrEqual(MAP_VIEW_MINIMUM_CAMERA_SCALE);
    expect(scale).toBeLessThan(0.93);
  });

  test('reserves header clearance at the maximum controls-panel split', () => {
    const viewportWidth = 1366;
    const canvasHeight = 650 * 0.5;
    const headerHeight = 5.2 * 16;
    const aspectRatio = viewportWidth / canvasHeight;
    const frame = mapViewFramingPoints(trackerArcSlots(9));
    const topLimit = mapViewTopLimitForViewport(canvasHeight, headerHeight);
    const pose = cameraPoseFor('map', aspectRatio, frame, topLimit);
    const camera = tableCamera(pose, aspectRatio);
    const headerBottom = 1 - (2 * headerHeight) / canvasHeight;

    expect(topLimit).toBeLessThan(MAP_VIEW_TOP_LIMIT);
    frame.forEach((point) => {
      const projected = new Vector3(...point).project(camera);
      expect(projected.y).toBeLessThan(headerBottom);
    });
  });

  /* An iPhone 13 and a 360px Android phone in the browser: the seated header takes most of the canvas's upper half. */
  test.each([
    [390, 456, 155],
    [360, 518, 200],
  ])('fills a %ipx phone canvas with the map below its header', (canvasWidth, canvasHeight, headerHeight) => {
    const aspectRatio = canvasWidth / canvasHeight;
    const frame = mapViewFramingPoints(trackerArcSlots(9));
    const topLimit = mapViewTopLimitForViewport(canvasHeight, headerHeight);
    const camera = tableCamera(cameraPoseFor('map', aspectRatio, frame, topLimit), aspectRatio);
    const projected = frame.map((point) => new Vector3(...point).project(camera));
    const widest = Math.max(...projected.map((point) => Math.abs(point.x)));
    const headerBottom = 1 - (2 * headerHeight) / canvasHeight;

    expect(widest).toBeGreaterThan(0.6);
    expect(widest).toBeLessThanOrEqual(MAP_VIEW_HORIZONTAL_LIMIT + 1e-9);
    projected.forEach((point) => {
      expect(point.y).toBeLessThan(headerBottom);
      expect(point.y).toBeGreaterThanOrEqual(-MAP_VIEW_BOTTOM_LIMIT - 1e-9);
    });
  });

  test('keeps the phase crown close to the header in the standard map view', () => {
    const canvasWidth = 1165;
    const canvasHeight = 920;
    const headerHeight = 83;
    const aspectRatio = canvasWidth / canvasHeight;
    const frame = mapViewFramingPoints(trackerArcSlots(9));
    const topLimit = mapViewTopLimitForViewport(canvasHeight, headerHeight);
    const pose = cameraPoseFor('map', aspectRatio, frame, topLimit);
    const camera = tableCamera(pose, aspectRatio);
    const projectedPoints = frame.map((point) => new Vector3(...point).project(camera));
    const topmostPoint = Math.max(...projectedPoints.map((point) => point.y));
    const bottommostPoint = Math.min(...projectedPoints.map((point) => point.y));
    const widestPoint = Math.max(...projectedPoints.map((point) => Math.abs(point.x)));
    const crownTop = ((1 - topmostPoint) / 2) * canvasHeight;

    expect(crownTop - headerHeight).toBeLessThanOrEqual(72);
    expect(topmostPoint).toBeLessThanOrEqual(topLimit + 1e-12);
    expect(bottommostPoint).toBeGreaterThanOrEqual(-MAP_VIEW_BOTTOM_LIMIT);
    expect(widestPoint).toBeLessThanOrEqual(MAP_VIEW_HORIZONTAL_LIMIT);
  });

  test('changes map distance continuously around a square viewport', () => {
    const frame = mapViewFramingPoints(trackerArcSlots(9));
    const scaleAt = (aspectRatio: number) => {
      const pose = cameraPoseFor('map', aspectRatio, frame);
      return (pose.position[1] - pose.target[1]) / 9.4;
    };
    const belowSquare = scaleAt(0.99);
    const square = scaleAt(1);
    const aboveSquare = scaleAt(1.01);

    expect(Math.abs(belowSquare - square)).toBeLessThan(0.02);
    expect(Math.abs(square - aboveSquare)).toBeLessThan(0.02);
  });

  test('keeps every portrait focus view closer than the full map', () => {
    const aspectRatio = 390 / 844;
    const distance = (view: (typeof TABLE_VIEW_OPTIONS)[number]['id']) => {
      const pose = cameraPoseFor(view, aspectRatio);
      return Math.hypot(
        pose.position[0] - pose.target[0],
        pose.position[1] - pose.target[1],
        pose.position[2] - pose.target[2]
      );
    };
    const mapDistance = distance('map');

    for (const view of ['left', 'right', 'bottom'] as const) {
      expect(distance(view)).toBeLessThan(mapDistance);
    }
  });

  test('tilts toward top-down without losing the board from view', () => {
    const aspectRatio = 1165 / 920;
    const frame = mapViewFramingPoints(trackerArcSlots(9));
    const polarAngle = (tilt: number) => {
      const pose = cameraPoseFor('map', aspectRatio, frame, MAP_VIEW_TOP_LIMIT, tilt);
      return Math.atan2(pose.position[2] - pose.target[2], pose.position[1] - pose.target[1]);
    };

    expect(cameraPoseFor('map', aspectRatio, frame, MAP_VIEW_TOP_LIMIT, 0)).toEqual(
      cameraPoseFor('map', aspectRatio, frame)
    );
    expect(polarAngle(0.5)).toBeLessThan(polarAngle(0));
    expect(polarAngle(1)).toBeLessThan(polarAngle(0.5));
    expect(polarAngle(1)).toBeCloseTo(0.2);
    expect(polarAngle(2)).toBeCloseTo(polarAngle(1));
    expect(polarAngle(-1)).toBeCloseTo(polarAngle(0));
    for (const tilt of [0.5, 1]) {
      const camera = tableCamera(cameraPoseFor('map', aspectRatio, frame, MAP_VIEW_TOP_LIMIT, tilt), aspectRatio);
      frame.forEach((point) => {
        const projected = new Vector3(...point).project(camera);
        expect(projected.y).toBeLessThanOrEqual(MAP_VIEW_TOP_LIMIT + 1e-9);
        expect(projected.y).toBeGreaterThanOrEqual(-MAP_VIEW_BOTTOM_LIMIT - 1e-9);
        expect(Math.abs(projected.x)).toBeLessThanOrEqual(MAP_VIEW_HORIZONTAL_LIMIT + 1e-9);
      });
    }
  });

  test('steers the tilt with the wheel, in pixels, lines or pages, within its range', () => {
    expect(cameraTiltAfterWheel(0, 100)).toBeCloseTo(1 / 6);
    expect(cameraTiltAfterWheel(0, 3, 1)).toBeCloseTo(48 / 600);
    expect(cameraTiltAfterWheel(0, 1, 2)).toBeCloseTo(400 / 600);
    expect(cameraTiltAfterWheel(0.5, -100)).toBeCloseTo(1 / 3);
    expect(cameraTiltAfterWheel(0, -100)).toBe(0);
    expect(cameraTiltAfterWheel(0.9, 1000)).toBe(1);
    expect(cameraTiltAfterWheel(0.4, Number.NaN)).toBe(0.4);
  });

  test('moves the fog range with responsive camera framing', () => {
    const defaultRange = cameraFogRange(cameraPoseFor('map').position);
    const distantPose = cameraPoseFor('map', 390 / 844, mapViewFramingPoints(trackerArcSlots(30)));
    const distantRange = cameraFogRange(distantPose.position);
    const distantCameraDistance = Math.hypot(
      distantPose.position[0],
      distantPose.position[1] - 0.1,
      distantPose.position[2]
    );

    expect(defaultRange).toEqual({ near: 10, far: 22 });
    expect(distantRange.near).toBeGreaterThan(defaultRange.near);
    expect(distantRange.far).toBeGreaterThan(distantCameraDistance);
  });

  test('eases camera moves over 300 ms along the configured cubic Bezier', () => {
    expect(CAMERA_VIEW_TRANSITION_MS).toBe(300);
    expect(cameraViewTransitionProgress(0)).toBe(0);
    expect(cameraViewTransitionProgress(CAMERA_VIEW_TRANSITION_MS / 2)).toBe(0.5);
    expect(cameraViewTransitionProgress(CAMERA_VIEW_TRANSITION_MS)).toBe(1);
  });

  test('clamps camera transition progress', () => {
    expect(cameraViewTransitionProgress(-100)).toBe(0);
    expect(cameraViewTransitionProgress(CAMERA_VIEW_TRANSITION_MS + 100)).toBe(1);
  });

  test('keeps the camera curve monotonic and symmetric', () => {
    const samples = Array.from({ length: 11 }, (_, index) =>
      cameraViewTransitionProgress((index / 10) * CAMERA_VIEW_TRANSITION_MS)
    );

    for (let index = 1; index < samples.length; index += 1) {
      expect(samples[index]).toBeGreaterThanOrEqual(samples[index - 1] ?? 0);
    }
    for (let index = 0; index < samples.length; index += 1) {
      expect(samples[index]).toBeCloseTo(1 - (samples.at(-index - 1) ?? 0));
    }
  });

  test('a table opened mid-phase stays on the map until the phase changes', () => {
    let state = createTableViewState('bidding');
    expect(state.activeView).toBe('map');

    state = reduceTableView(state, { type: 'phase.changed', phase: 'bidding' });
    expect(state.activeView).toBe('map');
    expect(state.cameraRevision).toBe(0);

    state = reduceTableView(state, { type: 'phase.changed', phase: 'revival' });
    expect(state.activeView).toBe('bottom');
    expect(state.cameraRevision).toBe(1);
  });

  test('lets a player override the view of the current phase', () => {
    let state = createTableViewState('storm');
    state = reduceTableView(state, { type: 'phase.changed', phase: 'spice-blow' });
    state = reduceTableView(state, { type: 'view.selected', view: 'map' });
    const overridden = state;
    state = reduceTableView(state, { type: 'phase.changed', phase: 'spice-blow' });

    expect(state).toBe(overridden);
    expect(state.activeView).toBe('map');
  });

  test('a ready renderer opens the shell once; a second report changes nothing', () => {
    let state = createTableViewState();
    expect(state.sceneReady).toBe(false);
    state = reduceTableView(state, { type: 'scene.ready' });
    expect(state.sceneReady).toBe(true);
    const ready = state;
    state = reduceTableView(state, { type: 'scene.ready' });
    expect(state).toBe(ready);
  });

  test('waits for an active interaction before applying a phase change', () => {
    let state = createTableViewState('storm');
    state = reduceTableView(state, { type: 'interaction.changed', active: true });
    state = reduceTableView(state, { type: 'phase.changed', phase: 'spice-blow' });

    expect(state.activeView).toBe('map');
    expect(state.cameraRevision).toBe(0);

    state = reduceTableView(state, { type: 'interaction.changed', active: false });

    expect(state.activeView).toBe('right');
    expect(state.cameraRevision).toBe(1);
  });

  test('discards a waiting phase view when the phase ends during an interaction', () => {
    let state = createTableViewState('storm');
    state = reduceTableView(state, { type: 'interaction.changed', active: true });
    state = reduceTableView(state, { type: 'phase.changed', phase: 'spice-blow' });
    state = reduceTableView(state, { type: 'phase.changed', phase: null });
    state = reduceTableView(state, { type: 'interaction.changed', active: false });

    expect(state.activeView).toBe('map');
    expect(state.cameraRevision).toBe(0);
  });

  test('keeps a queued player choice when the phase ends', () => {
    let state = createTableViewState('storm');
    state = reduceTableView(state, { type: 'interaction.changed', active: true });
    state = reduceTableView(state, { type: 'view.selected', view: 'left' });
    state = reduceTableView(state, { type: 'phase.changed', phase: null });
    state = reduceTableView(state, { type: 'interaction.changed', active: false });

    expect(state.activeView).toBe('left');
    expect(state.cameraRevision).toBe(1);
  });

  test('applies only the latest view queued during an interaction', () => {
    let state = createTableViewState('choam-charity');
    state = reduceTableView(state, { type: 'interaction.changed', active: true });
    state = reduceTableView(state, { type: 'phase.changed', phase: 'bidding' });
    state = reduceTableView(state, { type: 'phase.changed', phase: 'revival' });
    state = reduceTableView(state, { type: 'interaction.changed', active: false });

    expect(state.activeView).toBe('bottom');
    expect(state.cameraRevision).toBe(1);
  });
});
