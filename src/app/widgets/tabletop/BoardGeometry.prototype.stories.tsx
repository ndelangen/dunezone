import { Button, Group, Select, Stack, Text } from '@mantine/core';
import preview from '@sb/preview';
import { CENTER, RADIUS, edgePath } from '@shared/boards/geometry';
import { homepageSnapshot } from '@shared/homepage/setup';
import { tableProgressFor } from '@shared/play/phases';
import { SPECTATOR_SEAT } from '@shared/play/schema';
import { BOARD_RADIUS } from '@shared/play/tableGeometry';
import type { RoomView } from '@shared/play/updates';
import { Surface } from '@ui/surface/Surface';
import { useEffect, useState, useSyncExternalStore, useMemo, useReducer } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TextureLoader, SRGBColorSpace, BufferAttribute } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { TableSession } from '@db/tabletop/TableSession';
import { BOARD_ARTWORK } from '@game/assets/board/artwork';
import { BoardArtwork } from '@game/assets/board/Board';

import { cases, savedBoard, convertBoard, inspectGeometry, territoryName } from './boardGeometry.prototype';
import type { Case } from './boardGeometry.prototype';
import styles from './BoardGeometry.prototype.module.css';
import { BoardGeometryPrototypeContext } from './BoardGeometryPrototypeContext';
import { boardMapGeometry } from './boardMapGeometry';
import { PointerSession } from './PointerSession';
import { PointerSessionContext } from './PointerSessionContext';
import { TableKeyboard } from './TableKeyboard';
import { TableKeyboardContext } from './TableKeyboardContext';
import { TabletopSessionProvider } from './TabletopContext';
import { TabletopScene } from './TabletopScene';

function PreparedTable({ presentation }: { presentation: 'play' | 'preview' }) {
  const [session] = useState(() => {
    const view: RoomView = {
      type: 'view',
      epoch: 'story',
      sequence: 1,
      viewer: { connectionId: 'story', userId: 'story', viewerSeat: SPECTATOR_SEAT, displayName: '', color: '#d7b65c' },
      snapshot: homepageSnapshot(location.origin),
      carries: [],
      pointers: [],
    };
    return new TableSession(
      'story',
      {
        status: 'authorized',
        ready: true,
        getSnapshot: () => view,
        serverNow: () => 0,
        send: () => false,
        supportsCommand: () => false,
        subscribe(listener) {
          listener({ ...view, previous: null, snapshotChanged: true });
          return () => {};
        },
      },
      {
        openSocket() {
          throw new Error('The prepared story has no transport.');
        },
        monotonicNow: () => 0,
        onHidden: () => () => {},
        onVisible: () => () => {},
        onOnline: () => () => {},
      }
    );
  });
  const [pointer] = useState(() => new PointerSession());
  const [keyboard] = useState(() => new TableKeyboard());
  const ready = useSyncExternalStore(
    session.subscribeTable,
    () => session.getTable() !== null,
    () => false
  );
  useEffect(() => session.connect(), [session]);
  if (!ready) {
    return null;
  }
  return (
    <PointerSessionContext value={pointer}>
      <TableKeyboardContext value={keyboard}>
        <TabletopSessionProvider session={session}>
          <div style={{ height: 700, display: 'grid' }}>
            <TabletopScene presentation={presentation} stage="play" tableProgress={tableProgressFor(0)} />
          </div>
        </TabletopSessionProvider>
      </TableKeyboardContext>
    </PointerSessionContext>
  );
}

function build(which: Case) {
  const converted = convertBoard(savedBoard(which));
  const source = (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="2048"
      height="2048"
      viewBox={`${CENTER[0] - RADIUS} ${CENTER[1] - RADIUS} ${RADIUS * 2} ${RADIUS * 2}`}
    >
      <BoardArtwork board={converted.board} faces={converted.faces} artwork={BOARD_ARTWORK} />
    </svg>
  );
  const svg = renderToStaticMarkup(source);
  let loaded!: () => void;
  const textureReady = new Promise<void>((resolve) => {
    loaded = resolve;
  });
  const texture = new TextureLoader().load(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, () =>
    loaded()
  );
  texture.colorSpace = SRGBColorSpace;
  const start = performance.now();
  const bridge = boardMapGeometry(svg, BOARD_RADIUS);
  const bridgeMs = performance.now() - start;
  const outlines = renderToStaticMarkup(
    <svg viewBox={`${CENTER[0] - RADIUS} ${CENTER[1] - RADIUS} ${RADIUS * 2} ${RADIUS * 2}`}>
      <g fill="none" stroke="#000" strokeWidth={1.5}>
        {converted.board.edges.map((edge) => (
          <path key={edge.id} d={edgePath(converted.board, edge)} />
        ))}
      </g>
    </svg>
  );
  const strokes = boardMapGeometry(outlines, BOARD_RADIUS);
  strokes.setAttribute('uv', new BufferAttribute(new Float32Array(strokes.getAttribute('position').count * 2), 2));
  const outlined = mergeGeometries([converted.geometry, strokes]);
  strokes.dispose();
  return { converted, svg, bridge, outlined, bridgeMs, texture, textureReady };
}

type Report = ReturnType<typeof inspectGeometry>;
declare global {
  interface Window {
    boardGeometrySpike?: { inspectAll(): Record<string, Report & { bridgeMs: number; bridgeTriangles: number }> };
  }
}
function inspectAll() {
  return Object.fromEntries(
    cases.map((which) => {
      const sample = build(which);
      const report = {
        ...inspectGeometry(sample.converted),
        bridgeMs: sample.bridgeMs,
        bridgeTriangles: sample.bridge.getAttribute('position').count / 3,
      };
      sample.bridge.dispose();
      sample.texture.dispose();
      sample.outlined.dispose();
      sample.converted.geometry.dispose();
      return [which, report];
    })
  );
}

type State = { which: Case; mode: string; hover: number | null; report: Record<string, Report> | null };
type Action =
  | { type: 'board'; value: Case }
  | { type: 'mode'; value: string }
  | { type: 'hover'; value: number | null }
  | { type: 'report'; value: Record<string, Report> };
function reduce(state: State, action: Action): State {
  if (action.type === 'board') {
    return { ...state, which: action.value, hover: null };
  }
  if (action.type === 'mode') {
    return { ...state, mode: action.value };
  }
  if (action.type === 'hover') {
    return state.hover === action.value ? state : { ...state, hover: action.value };
  }
  return { ...state, report: action.value };
}

function GeometrySpike() {
  const [state, dispatch] = useReducer(reduce, {
    which: 'Arrakis',
    mode: 'Browser artwork texture',
    hover: null,
    report: null,
  });
  const sample = useMemo(() => build(state.which), [state.which]);
  useEffect(
    () => () => {
      sample.bridge.dispose();
      sample.texture.dispose();
      sample.outlined.dispose();
      sample.converted.geometry.dispose();
    },
    [sample]
  );
  useEffect(() => {
    window.boardGeometrySpike = { inspectAll };
    return () => {
      delete window.boardGeometrySpike;
    };
  }, []);
  const context = useMemo(
    () => ({
      geometry:
        state.mode === 'Existing SVG converter'
          ? sample.bridge
          : state.mode === 'Browser artwork texture'
            ? sample.converted.geometry
            : sample.outlined,
      texture: state.mode === 'Browser artwork texture' ? sample.texture : undefined,
      textureReady: sample.textureReady,
      onHover(x: number, z: number, triangle: number | null) {
        const sourcePoint = [(x * RADIUS) / BOARD_RADIUS + CENTER[0], (z * RADIUS) / BOARD_RADIUS + CENTER[1]] as const;
        const canvas = document.createElement('canvas').getContext('2d')!;
        const index =
          state.mode !== 'Existing SVG converter' &&
          triangle !== null &&
          triangle < sample.converted.triangleTerritories.length
            ? sample.converted.triangleTerritories[triangle]
            : sample.converted.faces.findIndex((face) =>
                canvas.isPointInPath(new Path2D(face.path), ...sourcePoint, 'evenodd')
              );
        dispatch({ type: 'hover', value: index >= 0 ? index : null });
      },
    }),
    [sample, state.mode]
  );
  const face = state.hover === null ? undefined : sample.converted.faces[state.hover];
  return (
    <Stack gap="sm">
      <Surface padding="sm">
        <Stack gap="xs">
          <Text fw={700}>Saved board to Play geometry · throwaway spike</Text>
          <Group>
            <Select
              label="Saved board"
              value={state.which}
              data={[...cases]}
              onChange={(value) => dispatch({ type: 'board', value: value as Case })}
            />
            <Select
              label="Table conversion"
              value={state.mode}
              data={['Territory triangles', 'Browser artwork texture', 'Existing SVG converter']}
              onChange={(value) => dispatch({ type: 'mode', value: value! })}
            />
            <Button onClick={() => dispatch({ type: 'report', value: inspectAll() })}>Measure all boards</Button>
          </Group>
          <Text size="sm">
            The left image uses the board renderer. Move over the real Play table to highlight its territory on the
            source.
          </Text>
          <Text size="sm">
            Territory triangles show topology. The browser texture preserves SVG artwork at 2048 pixels; the existing
            SVG converter may lose clipping or filters.
          </Text>
          <Text data-testid="picked-territory" fw={700}>
            {territoryName(sample.converted.board, face)}
          </Text>
        </Stack>
      </Surface>
      <div className={styles.comparison}>
        <div className={styles.source}>
          <svg
            viewBox={`${CENTER[0] - RADIUS} ${CENTER[1] - RADIUS} ${RADIUS * 2} ${RADIUS * 2}`}
            aria-label="Saved board reference"
          >
            <BoardArtwork board={sample.converted.board} faces={sample.converted.faces} artwork={BOARD_ARTWORK} />
            {face && (
              <path
                d={face.path}
                fill="#00ddff"
                fillOpacity={0.5}
                fillRule="evenodd"
                stroke="#ffffff"
                strokeWidth={2}
              />
            )}
          </svg>
          <Text size="sm">
            {sample.converted.metrics.territories} territories · {sample.converted.metrics.holes} holes ·{' '}
            {sample.converted.metrics.triangles.toLocaleString()} triangles
          </Text>
          <Text size="sm">
            Derive {sample.converted.metrics.deriveMs.toFixed(1)} ms · Triangulate{' '}
            {sample.converted.metrics.triangulateMs.toFixed(1)} ms
          </Text>
        </div>
        <div className={styles.table}>
          <BoardGeometryPrototypeContext value={context}>
            <PreparedTable presentation="play" />
          </BoardGeometryPrototypeContext>
        </div>
      </div>
      {state.report && (
        <Surface padding="sm">
          <pre data-testid="measurements">{JSON.stringify(state.report, null, 2)}</pre>
        </Surface>
      )}
    </Stack>
  );
}
const meta = preview.meta({
  component: GeometrySpike,
  parameters: { layout: 'fullscreen' },
  globals: { colorScheme: 'dark' },
});
export const Inspect = meta.story({});
