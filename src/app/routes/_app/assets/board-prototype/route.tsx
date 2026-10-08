import { Button, Group, Stack, Text, Select, TextInput, Switch, Slider, Divider } from '@mantine/core';
import { Link, createFileRoute } from '@tanstack/react-router';
import { PageTitle } from '@ui/block/PageTitle';
import { Section } from '@ui/block/Section';
import { ConfirmDeleteAction } from '@ui/control/ConfirmDeleteAction';
import { ControlBlock } from '@ui/control/ControlBlock';
import { IconAction } from '@ui/control/IconAction';
import { DocumentEditorLayout } from '@ui/layout/DocumentEditorLayout';
import { PageLayout } from '@ui/layout/PageLayout';
import { NestedTabs } from '@ui/surface/NestedTabs';
import { Surface } from '@ui/surface/Surface';
import { Toolbar } from '@ui/surface/Toolbar';
import {
  ArrowLeft,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Maximize,
  Download,
  MousePointer2,
  PenLine,
  Spline,
  Circle,
  Hand,
  X,
  Check,
  Plus,
  Minus,
  Unlink,
  Eye,
  FileJson,
} from 'lucide-react';
import { useEffect, useId, useMemo, useReducer, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

import city from '../../../../../../media/vector/icon/city.svg?raw';
import ornithopter from '../../../../../../media/vector/icon/ornithopter.svg?raw';
import sietch from '../../../../../../media/vector/icon/seitch.svg?raw';
import { pageHead } from '../../../pageTitle';
import {
  arrakisBoard,
  blankBoard,
  studyBoard,
  derive,
  defaults,
  reconcile,
  connectPoint,
  snapPoint,
  edgePath,
  contains,
  CENTER,
  RADIUS,
  referenceSectors,
  commonArtwork,
  removePoint,
  pointRemovalReason,
  boundPoint,
  movePoint,
} from './geometry';
import type { Board, Point, Face, Properties, Decal } from './geometry';
import styles from './route.module.css';

/* The board editor study keeps the shared geometry draft in memory. */
export const Route = createFileRoute('/_app/assets/board-prototype')({
  validateSearch: (search: Record<string, unknown>) => ({
    fixture: ['arrakis', 'blank'].includes(String(search.fixture)) ? String(search.fixture) : 'study',
  }),
  head: ({ match }) => pageHead('Board editor', { match }),
  component: BoardPrototypePage,
});
type Tool = 'select' | 'line' | 'cubic' | 'arc' | 'pan' | 'add-point' | 'remove-point' | 'remove-edge';
type State = {
  board: Board;
  past: Board[];
  future: Board[];
  selected: string | null;
  edge: string | null;
  tool: Tool;
  points: string[];
  guide: boolean;
  snap: boolean;
  ghosts: boolean;
  compare: boolean;
  zoom: number;
  pan: Point;
  hover: Point | null;
  message: string;
  artwork: Record<string, string>;
  activeNode: string | null;
  dragNode: string | null;
  dragHandle: 'c1' | 'c2' | null;
  dragPoint: Point | null;
};
type Event =
  | { type: 'board.edited'; board: Board; message: string }
  | { type: 'fixture.loaded'; board: Board }
  | { type: 'history.undo' | 'history.redo' }
  | { type: 'view.changed'; patch: Partial<State> }
  | { type: 'artwork.loaded'; key: string; svg: string };
function reducer(state: State, event: Event): State {
  if (event.type === 'view.changed') {
    return { ...state, ...event.patch };
  }
  if (event.type === 'artwork.loaded') {
    return { ...state, artwork: { ...state.artwork, [event.key]: event.svg } };
  }
  if (event.type === 'fixture.loaded') {
    return {
      ...state,
      board: event.board,
      past: [],
      future: [],
      selected: Object.keys(event.board.properties)[0],
      edge: null,
      activeNode: null,
      points: [],
      zoom: 1,
      pan: [0, 0],
      message: `${event.board.fixture} loaded`,
    };
  }
  if (event.type === 'board.edited') {
    const name = state.selected && state.board.properties[state.selected]?.name;
    const selected =
      state.selected && event.board.properties[state.selected]
        ? state.selected
        : Object.keys(event.board.properties).find((key) => event.board.properties[key].name === name) ||
          Object.keys(event.board.properties)[0] ||
          null;
    return {
      ...state,
      board: event.board,
      past: [...state.past, state.board],
      future: [],
      selected,
      message: event.message,
      dragNode: null,
      dragPoint: null,
      dragHandle: null,
    };
  }
  if (event.type === 'history.undo') {
    if (!state.past.length) {
      return state;
    }
    return {
      ...state,
      board: state.past.at(-1)!,
      past: state.past.slice(0, -1),
      future: [state.board, ...state.future],
      selected: null,
      activeNode: null,
      edge: null,
      points: [],
      message: 'Undid the last edit',
    };
  }
  if (!state.future.length) {
    return state;
  }
  return {
    ...state,
    board: state.future[0],
    past: [...state.past, state.board],
    future: state.future.slice(1),
    selected: null,
    edge: null,
    points: [],
    message: 'Restored the edit',
  };
}
const vectorModules = import.meta.glob('../../../../../../media/vector/**/*.svg', { query: '?raw', import: 'default' });
const vectorOptions = Object.keys(vectorModules)
  .filter((key) => !key.includes('/background/'))
  .map((key) => ({ value: key, label: key.split('/vector/')[1].replace('.svg', '') }));
const artworkOptions = vectorOptions.map((option) => ({
  ...option,
  label: option.value === commonArtwork.sietch ? 'icon/sietch' : option.label,
}));
const baseColors = { sand: '#F6D979', rock: '#A67A3E', stronghold: '#F7BA7A', polar: '#fff' };
const decorationColors = { sand: '#A67A3E', rock: '#67371C', stronghold: '#67371C', polar: '#888' };

function download(name: string, contents: string, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.hidden = true;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function BoardPrototypePage() {
  const { fixture } = Route.useSearch();
  const [state, dispatch] = useReducer(reducer, fixture, (fixture): State => {
    const board = fixture === 'arrakis' ? arrakisBoard() : fixture === 'blank' ? blankBoard() : studyBoard();
    return {
      board,
      past: [],
      future: [],
      selected:
        Object.keys(board.properties).find((key) => board.properties[key].type === 'stronghold') ||
        Object.keys(board.properties)[0] ||
        null,
      edge: null,
      tool: 'select',
      points: [],
      guide: true,
      snap: true,
      ghosts: false,
      compare: false,
      zoom: 1,
      pan: [0, 0],
      hover: null,
      message: 'Select a territory, or choose a drawing tool',
      artwork: { [commonArtwork.city]: city, [commonArtwork.ornithopter]: ornithopter, [commonArtwork.sietch]: sietch },
      activeNode: null,
      dragNode: null,
      dragHandle: null,
      dragPoint: null,
    };
  });
  const svgRef = useRef<SVGSVGElement>(null),
    artRef = useRef<SVGSVGElement>(null),
    panStart = useRef<{ cursor: Point; pan: Point } | null>(null);
  const drawBoard = useMemo(() => {
    if (!state.dragNode || !state.dragPoint) {
      return state.board;
    }
    return state.dragHandle
      ? {
          ...state.board,
          edges: state.board.edges.map((edge) =>
            edge.id === state.dragNode ? { ...edge, [state.dragHandle!]: boundPoint(state.dragPoint!) } : edge
          ),
        }
      : movePoint(state.board, state.dragNode, state.dragPoint);
  }, [state.board, state.dragNode, state.dragPoint, state.dragHandle]);
  const result = useMemo(() => {
    try {
      return { ...derive(drawBoard), error: null };
    } catch (error) {
      return {
        faces: [] as Face[],
        milliseconds: 0,
        samples: 0,
        dangles: 0,
        unrecoveredSegments: 0,
        error: String(error),
      };
    }
  }, [drawBoard]);
  const faces = result.faces;
  const shownBoard = useMemo(
    () => (state.dragPoint ? reconcile(drawBoard, state.board, derive(state.board).faces, faces) : drawBoard),
    [state.dragPoint, drawBoard, state.board, faces]
  );
  const selectedKey = faces.some((face) => face.key === state.selected) ? state.selected : faces[0]?.key;
  const selectedFace = faces.find((face) => face.key === selectedKey),
    property = selectedKey ? shownBoard.properties[selectedKey] : undefined;
  const edge = state.board.edges.find((edge) => edge.id === state.edge);
  const view = (patch: Partial<State>) => dispatch({ type: 'view.changed', patch });
  const commit = (board: Board, message: string, topology = false) => {
    const next = topology ? reconcile(board, state.board, derive(state.board).faces, derive(board).faces) : board;
    dispatch({ type: 'board.edited', board: next, message });
  };
  const patchProperty = (patch: Partial<Properties>) => {
    if (!selectedKey || !property) {
      return;
    }
    commit(
      { ...state.board, properties: { ...state.board.properties, [selectedKey]: { ...property, ...patch } } },
      'Territory updated'
    );
  };
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.closest('input,textarea,select,[contenteditable],svg [tabindex]')) {
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        dispatch({ type: event.shiftKey ? 'history.redo' : 'history.undo' });
      } else if (event.key === 'Escape') {
        view({
          tool: 'select',
          points: [],
          edge: null,
          dragNode: null,
          dragPoint: null,
          message: 'Drawing finished. Open cuts remain visible.',
        });
      }
    };
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  });
  useEffect(() => {
    const keys = new Set(Object.values(state.board.properties).flatMap((p) => p.decals.map((d) => d.artwork)));
    keys.forEach((key) => {
      if (state.artwork[key] || !vectorModules[key]) {
        return;
      }
      void vectorModules[key]().then((svg) => dispatch({ type: 'artwork.loaded', key, svg: String(svg) }));
    });
  }, [state.board.properties, state.artwork]);

  function canvasPoint(event: ReactPointerEvent<SVGSVGElement>): Point {
    const svg = svgRef.current!,
      matrix = svg.getScreenCTM()!.inverse();
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix);
    return [
      (p.x - CENTER[0] - state.pan[0]) / state.zoom + CENTER[0],
      (p.y - CENTER[1] - state.pan[1]) / state.zoom + CENTER[1],
    ];
  }
  const magnetRadius = () =>
    (20 * 487.06) /
    (Math.min(svgRef.current!.getBoundingClientRect().width, svgRef.current!.getBoundingClientRect().height) *
      state.zoom);
  function deletePoint(node: string) {
    const reason = pointRemovalReason(state.board, node);
    if (reason) {
      view({ activeNode: node, message: reason });
      return;
    }
    commit(removePoint(state.board, node), 'Point removed; neighboring boundaries reconnected', true);
    view({ activeNode: null, edge: null });
  }
  function deleteConnection(id: string) {
    if (id.startsWith('rim')) {
      view({ message: 'The circular rim stays connected' });
      return;
    }
    commit(
      { ...state.board, edges: state.board.edges.filter((edge) => edge.id !== id) },
      'Connection removed; both points kept',
      true
    );
    view({ edge: null, activeNode: null });
  }
  function placePoint(point: Point) {
    const connection = connectPoint(state.board, point, state.snap, magnetRadius()),
      { node } = connection;
    const points = [...state.points, node];
    let board = connection.board;
    if (state.tool === 'line' && state.points.length && state.points.at(-1) !== node) {
      board = {
        ...board,
        edges: [...board.edges, { id: `cut-${crypto.randomUUID()}`, a: state.points.at(-1)!, b: node, kind: 'line' }],
      };
    }
    if (state.tool === 'cubic' && points.length === 4) {
      board = {
        ...board,
        edges: [
          ...board.edges,
          {
            id: `curve-${crypto.randomUUID()}`,
            a: points[0],
            b: points[3],
            kind: 'cubic',
            c1: board.nodes[points[1]],
            c2: board.nodes[points[2]],
          },
        ],
      };
    }
    if (state.tool === 'arc' && points.length === 3) {
      const [a, m, b] = points.map((p) => board.nodes[p]),
        ab = Math.hypot(a[0] - b[0], a[1] - b[1]),
        am = Math.hypot(a[0] - m[0], a[1] - m[1]),
        mb = Math.hypot(m[0] - b[0], m[1] - b[1]);
      const cross = (m[0] - a[0]) * (b[1] - a[1]) - (m[1] - a[1]) * (b[0] - a[0]);
      if (Math.abs(cross) < 0.001) {
        view({ message: 'Choose a bend away from the straight line', points: points.slice(0, 2) });
        return;
      }
      const radius = (ab * am * mb) / (2 * Math.abs(cross));
      const dot = (a[0] - m[0]) * (b[0] - m[0]) + (a[1] - m[1]) * (b[1] - m[1]);
      board = {
        ...board,
        edges: [
          ...board.edges,
          {
            id: `arc-${crypto.randomUUID()}`,
            a: points[0],
            b: points[2],
            kind: 'arc',
            arc: [radius, radius, 0, dot > 0 ? 1 : 0, cross > 0 ? 1 : 0],
          },
        ],
      };
    }
    try {
      commit(board, connection.feedback, true);
      view({
        points:
          (state.tool === 'cubic' && points.length === 4) ||
          (state.tool === 'arc' && points.length === 3) ||
          (state.tool === 'line' && points.length > 2 && node === points[0])
            ? []
            : points,
      });
    } catch (error) {
      view({ message: `Geometry needs correction: ${String(error)}` });
    }
  }
  function addDecal(artwork: string) {
    if (!property || !selectedFace) {
      return;
    }
    patchProperty({
      decals: [
        ...property.decals,
        {
          id: crypto.randomUUID(),
          artwork,
          x: selectedFace.center[0],
          y: selectedFace.center[1],
          scale: 24,
          rotation: 0,
          outline: true,
        },
      ],
    });
  }
  function patchDecal(id: string, patch: Partial<Decal>) {
    patchProperty({ decals: property!.decals.map((decal) => (decal.id === id ? { ...decal, ...patch } : decal)) });
  }
  const toolHelp = {
    select: 'Click a region to assign properties. Drag a boundary point to reshape both neighbors.',
    line: 'Click points along your cut. Click the first point to close a loop; Finish keeps an open cut.',
    cubic: 'Click start, first handle, second handle, then endpoint.',
    arc: 'Click start, a point on the bend, then endpoint.',
    pan: 'Drag the board to move your view.',
    'add-point': 'Click a boundary to insert a point without changing its shape.',
    'remove-point': 'Click a point to remove it. Its neighbors reconnect; curved joins become straight.',
    'remove-edge': 'Click a connection to remove it and keep both points.',
  };

  const tools = (
    <Group gap="xs" wrap="nowrap">
      {(
        [
          ['select', MousePointer2, 'Select territories'],
          ['line', PenLine, 'Draw connected lines'],
          ['cubic', Spline, 'Draw a cubic curve'],
          ['arc', Circle, 'Draw a circular arc'],
          ['add-point', Plus, 'Add boundary point'],
          ['remove-point', Minus, 'Remove boundary point'],
          ['remove-edge', Unlink, 'Remove connection'],
          ['pan', Hand, 'Pan'],
        ] as const
      ).map(([tool, Icon, label]) => (
        <IconAction
          key={tool}
          label={label}
          icon={<Icon size={17} />}
          emphasis="standard"
          pressed={state.tool === tool}
          intent="neutral"
          onClick={() => view({ tool, points: [], edge: null, message: toolHelp[tool] })}
        />
      ))}
      {state.points.length > 0 && (
        <>
          <IconAction
            label="Finish cut"
            icon={<Check size={17} />}
            intent="positive"
            onClick={() =>
              view({ points: [], tool: 'select', message: 'Cut finished. Unfinished cuts also appear in artwork.' })
            }
          />
          <IconAction
            label="Cancel drawing"
            icon={<X size={17} />}
            onClick={() => view({ points: [], tool: 'select' })}
          />
        </>
      )}
    </Group>
  );
  const viewTools = (
    <Group gap="xs">
      <Switch
        label="18-sector guide"
        checked={state.guide}
        onChange={(e) => view({ guide: e.currentTarget.checked })}
      />
      <Switch label="Snap points" checked={state.snap} onChange={(e) => view({ snap: e.currentTarget.checked })} />
      <Switch
        label="Show decal before cropping"
        checked={state.ghosts}
        onChange={(e) => view({ ghosts: e.currentTarget.checked })}
      />
      <IconAction
        label="Zoom out"
        icon={<ZoomOut size={17} />}
        onClick={() => view({ zoom: Math.max(0.5, state.zoom / 1.25) })}
      />
      <Text size="sm">{Math.round(state.zoom * 100)}%</Text>
      <IconAction
        label="Zoom in"
        icon={<ZoomIn size={17} />}
        onClick={() => view({ zoom: Math.min(5, state.zoom * 1.25) })}
      />
      <IconAction label="Fit board" icon={<Maximize size={17} />} onClick={() => view({ zoom: 1, pan: [0, 0] })} />
    </Group>
  );
  const inspector = (
    <Stack gap="sm">
      <Section
        title={property?.name || 'Territory properties'}
        description={
          property
            ? 'Names identify targets. They do not appear on board artwork.'
            : 'Select a territory on the board or in the list.'
        }
      >
        {property && (
          <Stack gap="sm">
            <TextInput
              label="Territory name"
              value={property.name}
              error={
                Object.entries(state.board.properties).some(
                  ([key, p]) => key !== selectedKey && p.name === property.name
                )
                  ? 'Use a unique name'
                  : undefined
              }
              onChange={(e) => patchProperty({ name: e.currentTarget.value })}
            />
            <Select
              label="Territory type"
              value={property.type}
              data={['sand', 'rock', 'stronghold', 'polar']}
              onChange={(value) => {
                if (value) {
                  patchProperty({
                    type: value as Properties['type'],
                    insetLine: defaults('', value as Properties['type']).insetLine,
                  });
                }
              }}
            />
            <Select
              label="Inset line"
              value={property.insetLine}
              data={['none', 'solid', 'dashed']}
              onChange={(value) => value && patchProperty({ insetLine: value as Properties['insetLine'] })}
            />
            <Text size="xs" c="dimmed">
              Type supplies a starting inset treatment. Change it independently.
            </Text>
            <Divider />
            <Group gap="xs">
              <Button size="xs" onClick={() => addDecal(commonArtwork.sietch)}>
                Add sietch icon
              </Button>
              <Button size="xs" onClick={() => addDecal(commonArtwork.city)}>
                Add city icon
              </Button>
              <Button size="xs" onClick={() => addDecal(commonArtwork.ornithopter)}>
                Add ornithopter icon
              </Button>
            </Group>
            <Select
              label="Add artwork"
              placeholder="Choose any vector"
              searchable
              data={artworkOptions}
              value={null}
              onChange={(value) => {
                if (value) {
                  addDecal(value);
                }
              }}
            />
            {property.decals.map((decal, i) => (
              <Stack key={decal.id} gap="xs">
                <Group justify="space-between">
                  <Text size="sm" fw={700}>
                    Decal {i + 1} ·{' '}
                    {artworkOptions.find((option) => option.value === decal.artwork)?.label || decal.artwork}
                  </Text>
                  <ConfirmDeleteAction
                    size="sm"
                    label={`Remove decal ${i + 1}`}
                    pending={false}
                    onConfirm={() => patchProperty({ decals: property.decals.filter((v) => v.id !== decal.id) })}
                  />
                </Group>
                {(
                  [
                    ['X', 'x', 0, 487.06, 0.5],
                    ['Y', 'y', 0, 487.06, 0.5],
                    ['Scale', 'scale', 1, 180, 1],
                    ['Rotation', 'rotation', -180, 180, 1],
                  ] as const
                ).map(([label, key, min, max, step]) => (
                  <ControlBlock
                    key={key}
                    title={label}
                    tool={
                      <Text size="xs">
                        {decal[key].toFixed(1)}
                        {key === 'rotation' ? '°' : ''}
                      </Text>
                    }
                    input={
                      <Slider
                        thumbLabel={`Decal ${i + 1} ${label.toLowerCase()}`}
                        min={min}
                        max={max}
                        step={step}
                        value={decal[key]}
                        onChange={(value) => patchDecal(decal.id, { [key]: value })}
                      />
                    }
                  />
                ))}
                <Switch
                  label={`Decal ${i + 1} white outline`}
                  checked={decal.outline}
                  onChange={(e) => patchDecal(decal.id, { outline: e.currentTarget.checked })}
                />
                <Divider />
              </Stack>
            ))}
          </Stack>
        )}
      </Section>
      {state.activeNode && state.board.nodes[state.activeNode] && (
        <Section title="Selected boundary point">
          <Stack gap="xs">
            <Text size="xs">
              Removing a corner reconnects its neighbors with a straight boundary. Undo restores it.
            </Text>
            {pointRemovalReason(state.board, state.activeNode) && (
              <Text size="xs">{pointRemovalReason(state.board, state.activeNode)}</Text>
            )}
            <ConfirmDeleteAction
              label="Remove selected point"
              pending={false}
              disabled={Boolean(pointRemovalReason(state.board, state.activeNode))}
              onConfirm={() => deletePoint(state.activeNode!)}
            />
          </Stack>
        </Section>
      )}
      {edge && (
        <Section title="Selected shared edge" description="One edit changes both neighboring territories.">
          <Stack gap="xs">
            <Text size="xs">{edge.kind}</Text>
            {(['X', 'Y'] as const).map((label, axis) => (
              <ControlBlock
                key={label}
                title={`Start ${label}`}
                tool={<Text size="xs">{state.board.nodes[edge.a][axis].toFixed(1)}</Text>}
                input={
                  <Slider
                    thumbLabel={`Start ${label}`}
                    min={0}
                    max={487.06}
                    step={0.5}
                    value={state.board.nodes[edge.a][axis]}
                    onChange={(value) => {
                      const point: Point = [...state.board.nodes[edge.a]];
                      point[axis] = value;
                      commit(movePoint(state.board, edge.a, point), 'Point moved', true);
                    }}
                  />
                }
              />
            ))}
            <ConfirmDeleteAction
              label="Delete shared edge"
              pending={false}
              disabled={edge.id.startsWith('rim')}
              onConfirm={() => deleteConnection(edge.id)}
            />
          </Stack>
        </Section>
      )}
    </Stack>
  );
  const editableEdges = state.board.edges;
  const visiblePoints = Object.keys(state.board.nodes);
  const pointControl = (key: string) => (
    <circle
      key={key}
      cx={shownBoard.nodes[key][0]}
      cy={shownBoard.nodes[key][1]}
      r={3 / state.zoom}
      fill="#fff"
      stroke="#386c8e"
      strokeWidth={1 / state.zoom}
      data-node={key}
      tabIndex={0}
      role="button"
      aria-label={`Move boundary point ${key}`}
      onKeyDown={(event) => {
        if (event.key === 'Delete' || event.key === 'Backspace') {
          event.preventDefault();
          deletePoint(key);
          return;
        }
        const delta = {
          ArrowLeft: [-1, 0],
          ArrowRight: [1, 0],
          ArrowUp: [0, -1],
          ArrowDown: [0, 1],
        }[event.key];
        if (!delta) {
          return;
        }
        event.preventDefault();
        const p = state.board.nodes[key],
          step = event.shiftKey ? 5 : 1;
        commit(
          movePoint(state.board, key, [p[0] + delta[0] * step, p[1] + delta[1] * step]),
          'Point moved with keyboard',
          true
        );
      }}
    />
  );
  const boardCanvas = (
    <div className={styles.canvasFrame}>
      <svg
        ref={svgRef}
        viewBox="0 0 487.06 487.06"
        className={styles.canvas}
        aria-label="Editable board"
        role="group"
        onPointerDown={(event) => {
          if (state.compare || event.button !== 0) {
            return;
          }
          const point = canvasPoint(event),
            target = event.target as SVGElement;
          if (state.tool === 'pan') {
            event.currentTarget.setPointerCapture(event.pointerId);
            panStart.current = { cursor: [event.clientX, event.clientY], pan: state.pan };
            return;
          }
          const clickedNode = target.getAttribute('data-node');
          const clickedEdge = target.getAttribute('data-edge');
          if (state.tool === 'remove-edge') {
            if (clickedEdge) {
              deleteConnection(clickedEdge);
            } else {
              view({ message: 'Click a connection to remove it' });
            }
            return;
          }
          if (state.tool === 'remove-point') {
            if (clickedNode) {
              deletePoint(clickedNode);
            } else {
              view({ message: 'Click a visible boundary point to remove it' });
            }
            return;
          }
          if (state.tool === 'add-point') {
            if (!clickedEdge) {
              view({ message: 'Click a boundary to add a point' });
              return;
            }
            const connection = connectPoint(state.board, point, false, 0.5, clickedEdge);
            commit(connection.board, 'Point added; shared boundary shape preserved', true);
            view({ activeNode: connection.node, edge: null });
            return;
          }
          if (state.tool !== 'select') {
            placePoint(point);
            return;
          }
          const node = target.getAttribute('data-node'),
            handle = target.getAttribute('data-handle') as 'c1' | 'c2' | null;
          if (node) {
            event.currentTarget.setPointerCapture(event.pointerId);
            view({
              activeNode: handle ? null : node,
              dragNode: node,
              dragHandle: handle,
              dragPoint: handle
                ? state.board.edges.find((edge) => edge.id === node)![handle]!
                : state.board.nodes[node],
            });
            return;
          }
          const edgeId = target.getAttribute('data-edge');
          if (edgeId) {
            view({ edge: edgeId, message: 'Shared boundary selected. Drag its handles or edit coordinates.' });
            return;
          }
          const face = faces.find((face) => contains(face.rings, point));
          if (face) {
            view({
              selected: face.key,
              activeNode: null,
              edge: null,
              message: `${shownBoard.properties[face.key]?.name} selected`,
            });
          }
        }}
        onPointerMove={(event) => {
          if (panStart.current) {
            const rect = event.currentTarget.getBoundingClientRect(),
              ratio = 487.06 / rect.width;
            view({
              pan: [
                panStart.current.pan[0] + (event.clientX - panStart.current.cursor[0]) * ratio,
                panStart.current.pan[1] + (event.clientY - panStart.current.cursor[1]) * ratio,
              ],
            });
            return;
          }
          const point = canvasPoint(event),
            snapped = snapPoint(state.board, point, state.snap, magnetRadius(), state.dragNode || undefined);
          if (state.dragNode) {
            view({ dragPoint: snapped.point, message: snapped.feedback });
          } else {
            view({
              hover: boundPoint(snapped.point),
              message: state.tool !== 'select' ? snapped.feedback : state.message,
            });
          }
        }}
        onPointerUp={() => {
          panStart.current = null;
          if (state.dragNode) {
            try {
              commit(drawBoard, 'Point moved', true);
            } catch (error) {
              view({ dragNode: null, dragPoint: null, message: String(error) });
            }
          }
        }}
        onPointerCancel={() => {
          panStart.current = null;
          view({ dragNode: null, dragPoint: null });
        }}
      >
        <g
          transform={`translate(${CENTER[0] + state.pan[0]} ${CENTER[1] + state.pan[1]}) scale(${state.zoom}) translate(${-CENTER[0]} ${-CENTER[1]})`}
        >
          <BoardArtwork board={shownBoard} faces={faces} artwork={state.artwork} />
          {!state.compare && state.guide && (
            <g
              data-editor-guide
              pointerEvents="none"
              opacity="0.45"
              dangerouslySetInnerHTML={{ __html: referenceSectors }}
            />
          )}
          {!state.compare && selectedFace && (
            <path d={selectedFace.path} fill="none" stroke="#386c8e" strokeWidth="2.5" pointerEvents="none" />
          )}
          {!state.compare &&
            state.ghosts &&
            property?.decals.map((d) => (
              <g key={d.id} opacity="0.28" pointerEvents="none">
                <DecalArtwork decal={d} svg={state.artwork[d.artwork]} />
              </g>
            ))}
          {!state.compare &&
            ['select', 'add-point', 'remove-point', 'remove-edge'].includes(state.tool) &&
            editableEdges.map((e) => (
              <g key={e.id}>
                <path
                  d={edgePath(shownBoard, e)}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={14 / state.zoom}
                  data-edge={e.id}
                />
                {e.kind === 'cubic' &&
                  state.edge === e.id &&
                  (['c1', 'c2'] as const).map((key) => (
                    <g key={key}>
                      <path
                        d={`M${shownBoard.nodes[key === 'c1' ? e.a : e.b].join(' ')}L${shownBoard.edges.find((edge) => edge.id === e.id)![key]!.join(' ')}`}
                        stroke="#386c8e"
                        fill="none"
                      />
                      <circle
                        cx={shownBoard.edges.find((edge) => edge.id === e.id)![key]![0]}
                        cy={shownBoard.edges.find((edge) => edge.id === e.id)![key]![1]}
                        r={4 / state.zoom}
                        fill="#386c8e"
                        data-node={e.id}
                        data-handle={key}
                      />
                    </g>
                  ))}
              </g>
            ))}
          {!state.compare &&
            ['select', 'add-point', 'remove-point', 'remove-edge'].includes(state.tool) &&
            [...visiblePoints].map(pointControl)}
          {!state.compare &&
            state.points.map((key, i) => (
              <g key={`${key}-${i}`}>
                <circle cx={state.board.nodes[key][0]} cy={state.board.nodes[key][1]} r="3" fill="#386c8e" />
                {i > 0 && state.tool !== 'line' && (
                  <path
                    d={`M${state.board.nodes[state.points[i - 1]].join(' ')}L${state.board.nodes[key].join(' ')}`}
                    fill="none"
                    stroke="#386c8e"
                    strokeDasharray="3 3"
                  />
                )}
              </g>
            ))}
          {!state.compare && state.points.length > 0 && state.hover && (
            <path
              d={`M${state.board.nodes[state.points.at(-1)!].join(' ')}L${state.hover.join(' ')}`}
              fill="none"
              stroke="#386c8e"
              strokeDasharray="3 3"
              pointerEvents="none"
            />
          )}
          {!state.compare && state.hover && state.tool !== 'select' && (
            <circle cx={state.hover[0]} cy={state.hover[1]} r="4" fill="none" stroke="#386c8e" pointerEvents="none" />
          )}
        </g>
      </svg>
    </div>
  );
  return (
    <PageLayout>
      <PageLayout.Header size="compact">
        <PageTitle title="Board editor" />
      </PageLayout.Header>
      <PageLayout.Toolbar>
        <Toolbar>
          <Toolbar.Left label="Navigation">
            <IconAction
              label="Back to assets"
              icon={<ArrowLeft size={17} />}
              size="lg"
              emphasis="standard"
              renderRoot={(props) => <Link {...props} to="/assets" />}
            />
          </Toolbar.Left>
          <Toolbar.Right label="Board actions">
            <Toolbar.Cluster kind="content">
              <IconAction
                label="Undo"
                icon={<Undo2 size={17} />}
                size="lg"
                emphasis="standard"
                disabled={!state.past.length}
                onClick={() => dispatch({ type: 'history.undo' })}
              />
              <IconAction
                label="Redo"
                icon={<Redo2 size={17} />}
                size="lg"
                emphasis="standard"
                disabled={!state.future.length}
                onClick={() => dispatch({ type: 'history.redo' })}
              />
              <IconAction
                label="Preview artwork"
                icon={<Eye size={17} />}
                size="lg"
                emphasis="standard"
                pressed={state.compare}
                onClick={() => view({ compare: !state.compare })}
              />
            </Toolbar.Cluster>
            <Toolbar.Cluster kind="commit">
              <IconAction
                label="Download board draft"
                icon={<FileJson size={17} />}
                size="lg"
                intent="export"
                emphasis="strong"
                onClick={() => download('board.json', JSON.stringify(state.board, null, 2), 'application/json')}
              />
              <IconAction
                label="Download SVG"
                icon={<Download size={17} />}
                size="lg"
                intent="export"
                emphasis="strong"
                onClick={() => {
                  const svg = artRef.current!.cloneNode(true) as SVGSVGElement;
                  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
                  download('board.svg', new XMLSerializer().serializeToString(svg), 'image/svg+xml');
                }}
              />
            </Toolbar.Cluster>
          </Toolbar.Right>
        </Toolbar>
      </PageLayout.Toolbar>
      <PageLayout.Content width="viewport">
        <div className={styles.study}>
          <DocumentEditorLayout ratio={1} fit="width" sidebarSize="compact">
            <DocumentEditorLayout.Sidebar>
              <NestedTabs
                className={styles.territories}
                activePath={selectedKey ? [selectedKey] : []}
                ariaLabel="Territories"
              >
                <NestedTabs.Level label="Territories">
                  {faces.map((face) => {
                    const p = shownBoard.properties[face.key] || defaults('Unassigned');
                    return (
                      <NestedTabs.Item
                        key={face.key}
                        as="button"
                        path={[face.key]}
                        label={p.name}
                        icon={
                          <svg width="28" height="28" viewBox="-12 -12 511.06 511.06" aria-hidden>
                            <circle
                              cx={CENTER[0]}
                              cy={CENTER[1]}
                              r={RADIUS}
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="18"
                              opacity="0.55"
                            />
                            <path d={face.path} fill="currentColor" fillRule="evenodd" />
                          </svg>
                        }
                        onClick={() =>
                          view({
                            selected: face.key,
                            activeNode: null,
                            edge: null,
                            tool: 'select',
                            message: `${p.name} selected`,
                          })
                        }
                      />
                    );
                  })}
                </NestedTabs.Level>
                <NestedTabs.ContentPanel
                  className={styles.territoryDetails}
                  aria-label={property ? `${property.name} properties` : 'Territory properties'}
                >
                  {inspector}
                </NestedTabs.ContentPanel>
              </NestedTabs>
            </DocumentEditorLayout.Sidebar>
            <DocumentEditorLayout.Preview>
              <div className={styles.editor}>
                <Group justify="space-between" gap="sm">
                  {tools}
                  {viewTools}
                </Group>
                <Text size="xs">{toolHelp[state.tool]}</Text>
                <Surface padding="none" className={styles.map}>
                  {boardCanvas}
                </Surface>
                <Text size="xs" role="status" aria-live="polite">
                  {state.message}
                </Text>
                {result.error && <Text c="red">{result.error}</Text>}
              </div>
            </DocumentEditorLayout.Preview>
          </DocumentEditorLayout>
          <div hidden>
            <svg ref={artRef} viewBox="0 0 487.06 487.06" width="100%" aria-label="Generated board artwork">
              <BoardArtwork board={shownBoard} faces={faces} artwork={state.artwork} />
            </svg>
          </div>
        </div>
      </PageLayout.Content>
    </PageLayout>
  );
}

function DecalArtwork({ decal, svg }: { decal: Decal; svg?: string }) {
  const outlineId = useId().replaceAll(':', '');
  if (!svg) {
    return null;
  }
  const viewBox = svg.match(/viewBox="([^"]+)"/)?.[1] || '0 0 100 100';
  const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>[\s\S]*$/, '');
  return (
    <g transform={`translate(${decal.x} ${decal.y}) rotate(${decal.rotation})`}>
      {decal.outline && (
        <defs>
          <filter id={outlineId} x="-50%" y="-50%" width="200%" height="200%" colorInterpolationFilters="sRGB">
            <feMorphology in="SourceAlpha" operator="dilate" radius="1.4" result="expanded" />
            <feFlood floodColor="#fff" result="white" />
            <feComposite in="white" in2="expanded" operator="in" result="outline" />
            <feMerge>
              <feMergeNode in="outline" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      )}
      <g filter={decal.outline ? `url(#${outlineId})` : undefined}>
        <svg
          x={-decal.scale / 2}
          y={-decal.scale / 2}
          width={decal.scale}
          height={decal.scale}
          viewBox={viewBox}
          dangerouslySetInnerHTML={{ __html: inner }}
        />
      </g>
    </g>
  );
}
function BoardArtwork({ board, faces, artwork }: { board: Board; faces: Face[]; artwork: Record<string, string> }) {
  const prefix = useId().replaceAll(':', '');
  return (
    <g data-generated-artwork>
      <defs>
        {faces.map((face, i) => (
          <clipPath key={face.key} id={`${prefix}-face-${i}`}>
            <path d={face.path} clipRule="evenodd" />
          </clipPath>
        ))}
      </defs>
      {faces.map((face, i) => {
        const p = board.properties[face.key] || defaults('');
        return (
          <g key={face.key}>
            <path d={face.path} fill={baseColors[p.type]} fillRule="evenodd" />
            {p.type === 'stronghold' && (
              <path
                d={face.path}
                fill="none"
                stroke={decorationColors.stronghold}
                strokeWidth="13.2"
                clipPath={`url(#${prefix}-face-${i})`}
              />
            )}
            {p.insetLine !== 'none' && (
              <path
                d={face.inset}
                fill="none"
                stroke={p.type === 'stronghold' ? '#F7BA7A' : decorationColors[p.type]}
                strokeWidth="1.1"
                strokeDasharray={p.insetLine === 'dashed' ? '6.6 3.3' : undefined}
                strokeLinejoin="round"
              />
            )}
            <g clipPath={`url(#${prefix}-face-${i})`} data-clipped-territory={p.name}>
              {p.decals.map((decal) => (
                <DecalArtwork key={decal.id} decal={decal} svg={artwork[decal.artwork]} />
              ))}
            </g>
          </g>
        );
      })}
      <g fill="none" stroke="#000" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        {board.edges.map((edge) => (
          <path key={edge.id} d={edgePath(board, edge)} />
        ))}
      </g>
    </g>
  );
}
