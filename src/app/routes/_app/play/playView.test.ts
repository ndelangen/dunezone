import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, test } from 'vitest';

import type { TABLE_VIEW_OPTIONS } from './playView';
import {
  cameraFogRange,
  cameraPoseFor,
  cameraViewTransitionProgress,
  createTableViewState,
  mapViewTopLimitForViewport,
  reduceTableView,
  CAMERA_VIEW_TRANSITION_MS,
  MAP_VIEW_BOTTOM_LIMIT,
  MAP_VIEW_HORIZONTAL_LIMIT,
  MAP_VIEW_MINIMUM_CAMERA_SCALE,
  MAP_VIEW_TOP_LIMIT,
  TABLE_CAMERA_FIELD_OF_VIEW,
} from './playView';
import { mapViewFramingPoints } from './tablePlateGeometry';
import { trackerArcSlots } from './tableTrackers';

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
      expect(cameraDistance(view) / baseDistance).toBeCloseTo(0.68);
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

  test('backs the map camera away for narrow screens and larger tracker arcs', () => {
    const standardFrame = mapViewFramingPoints(trackerArcSlots(9));
    const wide = cameraPoseFor('map', 1, standardFrame);
    const narrow = cameraPoseFor('map', 390 / 844, standardFrame);
    const expandedArc = cameraPoseFor('map', 1, mapViewFramingPoints(trackerArcSlots(30)));

    expect(narrow.position[1]).toBeGreaterThan(wide.position[1]);
    expect(narrow.position[2]).toBeGreaterThan(wide.position[2]);
    expect(expandedArc.position[1]).toBeGreaterThan(wide.position[1]);
    expect(expandedArc.position[2]).toBeGreaterThan(wide.position[2]);
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
    const camera = new PerspectiveCamera(TABLE_CAMERA_FIELD_OF_VIEW, aspectRatio, 0.1, 100);
    camera.position.set(...pose.position);
    camera.lookAt(...pose.target);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    const headerBottom = 1 - (2 * headerHeight) / canvasHeight;

    expect(topLimit).toBeLessThan(MAP_VIEW_TOP_LIMIT);
    frame.forEach((point) => {
      const projected = new Vector3(...point).project(camera);
      expect(projected.y).toBeLessThan(headerBottom);
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
    const camera = new PerspectiveCamera(TABLE_CAMERA_FIELD_OF_VIEW, aspectRatio, 0.1, 100);
    camera.position.set(...pose.position);
    camera.lookAt(...pose.target);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
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

  test('lets a player override one phase request', () => {
    const request = { id: 'turn-1:phase-6', view: 'left' } as const;
    let state = createTableViewState(request);

    state = reduceTableView(state, { type: 'view.selected', view: 'map' });
    const overridden = state;
    state = reduceTableView(state, { type: 'phase.requested', request });

    expect(state).toBe(overridden);
    expect(state.activeView).toBe('map');
  });

  test('waits for an active interaction before applying a phase request', () => {
    let state = createTableViewState();
    state = reduceTableView(state, { type: 'interaction.changed', active: true });
    state = reduceTableView(state, {
      type: 'phase.requested',
      request: { id: 'turn-1:phase-4', view: 'right' },
    });

    expect(state.activeView).toBe('map');
    expect(state.pendingView).toBe('right');
    expect(state.pendingPhaseRequestId).toBe('turn-1:phase-4');
    expect(state.cameraRevision).toBe(0);

    state = reduceTableView(state, { type: 'interaction.changed', active: false });

    expect(state.activeView).toBe('right');
    expect(state.pendingView).toBeNull();
    expect(state.pendingPhaseRequestId).toBeNull();
    expect(state.cameraRevision).toBe(1);
  });

  test('discards obsolete phase guidance while an interaction is active', () => {
    let state = createTableViewState();
    state = reduceTableView(state, { type: 'interaction.changed', active: true });
    state = reduceTableView(state, {
      type: 'phase.requested',
      request: { id: 'turn-1:phase-4', view: 'right' },
    });
    state = reduceTableView(state, { type: 'phase.cleared' });
    state = reduceTableView(state, { type: 'interaction.changed', active: false });

    expect(state.activeView).toBe('map');
    expect(state.pendingView).toBeNull();
    expect(state.cameraRevision).toBe(0);
  });

  test('keeps a queued player choice when phase guidance clears', () => {
    let state = createTableViewState();
    state = reduceTableView(state, { type: 'interaction.changed', active: true });
    state = reduceTableView(state, { type: 'view.selected', view: 'left' });
    state = reduceTableView(state, { type: 'phase.cleared' });
    state = reduceTableView(state, { type: 'interaction.changed', active: false });

    expect(state.activeView).toBe('left');
    expect(state.cameraRevision).toBe(1);
  });

  test('applies only the latest view queued during an interaction', () => {
    let state = createTableViewState();
    state = reduceTableView(state, { type: 'interaction.changed', active: true });
    state = reduceTableView(state, {
      type: 'phase.requested',
      request: { id: 'turn-1:phase-4', view: 'left' },
    });
    state = reduceTableView(state, {
      type: 'phase.requested',
      request: { id: 'turn-1:phase-5', view: 'bottom' },
    });
    state = reduceTableView(state, { type: 'interaction.changed', active: false });

    expect(state.activeView).toBe('bottom');
    expect(state.cameraRevision).toBe(1);
  });

  test('recenters the active view without returning to the map', () => {
    let state = createTableViewState();
    state = reduceTableView(state, { type: 'view.selected', view: 'right' });
    state = reduceTableView(state, { type: 'view.reset' });

    expect(state.activeView).toBe('right');
    expect(state.cameraRevision).toBe(2);
  });
});
