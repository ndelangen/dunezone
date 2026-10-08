import {
  Button,
  Group,
  Stack,
  Text,
  Select,
  NumberInput,
  TextInput,
  Switch,
  SegmentedControl,
  Divider,
  Table,
  ScrollArea,
  Badge,
} from '@mantine/core';
import { createFileRoute } from '@tanstack/react-router';
import { PageTitle } from '@ui/block/PageTitle';
import { Section } from '@ui/block/Section';
import { ConfirmDeleteAction } from '@ui/control/ConfirmDeleteAction';
import { IconAction } from '@ui/control/IconAction';
import { AsymmetricSplitLayout } from '@ui/layout/AsymmetricSplitLayout';
import { ColumnsWithRailLayout } from '@ui/layout/ColumnsWithRailLayout';
import { DocumentEditorLayout } from '@ui/layout/DocumentEditorLayout';
import { PageLayout } from '@ui/layout/PageLayout';
import { WorkbenchLayout } from '@ui/layout/WorkbenchLayout';
import { Surface } from '@ui/surface/Surface';
import {
  ArrowLeft,
  ArrowRight,
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
} from 'lucide-react';
import { useEffect, useId, useMemo, useReducer, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

import reference from '../../../../../../media/vector/background/map.svg?raw';
import city from '../../../../../../media/vector/icon/city.svg?raw';
import ornithopter from '../../../../../../media/vector/icon/ornithopter.svg?raw';
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
  referenceSectors,
  referenceSymbols,
  referenceAdjustment,
} from './geometry';
import type { Board, Point, Face, Properties, Decal } from './geometry';
import styles from './route.module.css';

/* Three throwaway editor arrangements share editable linework on this asset route. */
export const Route = createFileRoute('/_app/assets/board-prototype')({
  validateSearch: (search: Record<string, unknown>) => ({
    variant: ['A', 'B', 'C'].includes(String(search.variant)) ? String(search.variant) : 'A',
    fixture: search.fixture === 'arrakis' ? 'arrakis' : 'study',
  }),
  head: ({ match }) => pageHead('Board editor study', { match }),
  component: BoardPrototypePage,
});
type Tool = 'select' | 'line' | 'cubic' | 'arc' | 'pan';
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
  step: string;
  artwork: Record<string, string>;
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
const variants = ['A', 'B', 'C'];
const variantNames = { A: 'Canvas and inspector', B: 'Draw, then assign', C: 'Territory ledger' };
const vectorModules = import.meta.glob('../../../../../../media/vector/**/*.svg', { query: '?raw', import: 'default' });
const vectorOptions = Object.keys(vectorModules)
  .filter((key) => !key.includes('/background/'))
  .map((key) => ({ value: key, label: key.split('/vector/')[1].replace('.svg', '') }));
const artworkOptions = [
  { value: 'city', label: 'City' },
  { value: 'sietch', label: 'Sietch' },
  { value: 'ornithopter', label: 'Ornithopter' },
  ...vectorOptions,
];
const baseColors = { sand: '#F6D979', rock: '#A67A3E', stronghold: '#F7BA7A', polar: '#fff' };
const decorationColors = { sand: '#A67A3E', rock: '#67371C', stronghold: '#67371C', polar: '#888' };

function download(name: string, contents: string, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
function BoardPrototypePage() {
  const { variant, fixture } = Route.useSearch(),
    navigate = Route.useNavigate();
  const [state, dispatch] = useReducer(reducer, fixture, (fixture): State => {
    const board = fixture === 'arrakis' ? arrakisBoard() : studyBoard();
    return {
      board,
      past: [],
      future: [],
      selected: Object.keys(board.properties).find((key) => board.properties[key].type === 'stronghold')!,
      edge: null,
      tool: variant === 'B' ? 'line' : 'select',
      points: [],
      guide: true,
      snap: true,
      ghosts: false,
      compare: false,
      zoom: 1,
      pan: [0, 0],
      hover: null,
      message: 'Select a territory, or choose a drawing tool',
      step: 'draw',
      artwork: { city, ornithopter, sietch: referenceSymbols['reference-symbol-2'], ...referenceSymbols },
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
            edge.id === state.dragNode ? { ...edge, [state.dragHandle!]: state.dragPoint } : edge
          ),
        }
      : { ...state.board, nodes: { ...state.board.nodes, [state.dragNode]: state.dragPoint } };
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
  const selectedFace = faces.find((face) => face.key === state.selected),
    property = state.selected ? shownBoard.properties[state.selected] : undefined;
  const edge = state.board.edges.find((edge) => edge.id === state.edge);
  const view = (patch: Partial<State>) => dispatch({ type: 'view.changed', patch });
  const commit = (board: Board, message: string, topology = false) => {
    const next = topology ? reconcile(board, state.board, derive(state.board).faces, derive(board).faces) : board;
    dispatch({ type: 'board.edited', board: next, message });
  };
  const patchProperty = (patch: Partial<Properties>) => {
    if (!state.selected || !property) {
      return;
    }
    commit(
      { ...state.board, properties: { ...state.board.properties, [state.selected]: { ...property, ...patch } } },
      'Territory updated'
    );
  };
  const chooseVariant = (next: string) =>
    void navigate({ search: (old) => ({ ...old, variant: next }), replace: true });
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
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        chooseVariant(variants[(variants.indexOf(variant) + (event.key === 'ArrowRight' ? 1 : 2)) % 3]);
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
  function placePoint(point: Point) {
    const connection = connectPoint(state.board, point, state.snap),
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
  };

  const tools = (
    <Group gap="xs" wrap="nowrap">
      {(
        [
          ['select', MousePointer2, 'Select territories'],
          ['line', PenLine, 'Draw connected lines'],
          ['cubic', Spline, 'Draw a cubic curve'],
          ['arc', Circle, 'Draw a circular arc'],
          ['pan', Hand, 'Pan'],
        ] as const
      ).map(([tool, Icon, label]) => (
        <IconAction
          key={tool}
          label={label}
          icon={<Icon size={17} />}
          emphasis={state.tool === tool ? 'strong' : 'standard'}
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
    <Surface padding="md">
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
                    ([key, p]) => key !== state.selected && p.name === property.name
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
              <SegmentedControl
                aria-label="Inset line"
                value={property.insetLine}
                data={['none', 'solid', 'dashed']}
                onChange={(value) => patchProperty({ insetLine: value as Properties['insetLine'] })}
              />
              <Text size="xs" c="dimmed">
                Type supplies a starting inset treatment. Change it independently.
              </Text>
              <Divider />
              <Group gap="xs">
                <Button size="xs" onClick={() => addDecal('sietch')}>
                  Add sietch icon
                </Button>
                <Button size="xs" onClick={() => addDecal('city')}>
                  Add city icon
                </Button>
                <Button size="xs" onClick={() => addDecal('ornithopter')}>
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
              <Switch
                label="Show decal before cropping"
                checked={state.ghosts}
                onChange={(e) => view({ ghosts: e.currentTarget.checked })}
              />
              {property.decals.map((decal, i) => (
                <Stack key={decal.id} gap="xs">
                  <Group justify="space-between">
                    <Text size="sm" fw={700}>
                      Decal {i + 1} · {decal.artwork.split('/').at(-1)?.replace('.svg', '')}
                    </Text>
                    <ConfirmDeleteAction
                      size="sm"
                      label={`Remove decal ${i + 1}`}
                      pending={false}
                      onConfirm={() => patchProperty({ decals: property.decals.filter((v) => v.id !== decal.id) })}
                    />
                  </Group>
                  <Group grow gap="xs">
                    <NumberInput
                      label={`Decal ${i + 1} X`}
                      value={decal.x}
                      step={2}
                      onChange={(v) => patchDecal(decal.id, { x: Number(v) })}
                    />
                    <NumberInput
                      label={`Decal ${i + 1} Y`}
                      value={decal.y}
                      step={2}
                      onChange={(v) => patchDecal(decal.id, { y: Number(v) })}
                    />
                  </Group>
                  <Group grow gap="xs">
                    <NumberInput
                      label={`Decal ${i + 1} scale`}
                      value={decal.scale}
                      min={1}
                      step={5}
                      onChange={(v) => patchDecal(decal.id, { scale: Math.max(1, Number(v)) })}
                    />
                    <NumberInput
                      label={`Decal ${i + 1} rotation`}
                      value={decal.rotation}
                      step={5}
                      onChange={(v) => patchDecal(decal.id, { rotation: Number(v) })}
                    />
                  </Group>
                  <Divider />
                </Stack>
              ))}
            </Stack>
          )}
        </Section>
        {edge && (
          <Section title="Selected shared edge" description="One edit changes both neighboring territories.">
            <Stack gap="xs">
              <Text size="xs">{edge.kind}</Text>
              <Group grow>
                <NumberInput
                  label="Start X"
                  value={state.board.nodes[edge.a][0]}
                  onChange={(v) =>
                    commit(
                      {
                        ...state.board,
                        nodes: { ...state.board.nodes, [edge.a]: [Number(v), state.board.nodes[edge.a][1]] },
                      },
                      'Shared point moved',
                      true
                    )
                  }
                />
                <NumberInput
                  label="Start Y"
                  value={state.board.nodes[edge.a][1]}
                  onChange={(v) =>
                    commit(
                      {
                        ...state.board,
                        nodes: { ...state.board.nodes, [edge.a]: [state.board.nodes[edge.a][0], Number(v)] },
                      },
                      'Shared point moved',
                      true
                    )
                  }
                />
              </Group>
              <ConfirmDeleteAction
                label="Delete shared edge"
                pending={false}
                disabled={edge.id.startsWith('rim')}
                onConfirm={() => {
                  commit(
                    { ...state.board, edges: state.board.edges.filter((v) => v.id !== edge.id) },
                    'Edge removed; merged territory keeps the first identity',
                    true
                  );
                  view({ edge: null });
                }}
              />
            </Stack>
          </Section>
        )}
      </Stack>
    </Surface>
  );
  const ledger = (
    <Surface padding="md">
      <Section title="Territories" description={`${faces.length} regions from shared linework`}>
        <ScrollArea h={variant === 'C' ? 560 : 220}>
          <Table highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th>Type</Table.Th>
                <Table.Th>Inset</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {faces.map((face) => {
                const p = shownBoard.properties[face.key] || defaults('Unassigned');
                return (
                  <Table.Tr key={face.key} data-selected={face.key === state.selected || undefined}>
                    <Table.Td>
                      <Button
                        variant="subtle"
                        size="xs"
                        onClick={() => view({ selected: face.key, tool: 'select', message: `${p.name} selected` })}
                      >
                        {p.name}
                      </Button>
                    </Table.Td>
                    <Table.Td>{p.type}</Table.Td>
                    <Table.Td>{p.insetLine}</Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      </Section>
    </Surface>
  );

  const canvas = (
    <Surface padding="md">
      <Stack gap="sm">
        {tools}
        {viewTools}
        <Text size="sm">{toolHelp[state.tool]}</Text>
        <div className={styles.canvasFrame}>
          <svg
            ref={svgRef}
            viewBox="0 0 487.06 487.06"
            className={styles.canvas}
            aria-label="Editable board"
            role="group"
            onPointerDown={(event) => {
              if (event.button !== 0) {
                return;
              }
              const point = canvasPoint(event),
                target = event.target as SVGElement;
              if (state.tool === 'pan') {
                event.currentTarget.setPointerCapture(event.pointerId);
                panStart.current = { cursor: [event.clientX, event.clientY], pan: state.pan };
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
                view({ selected: face.key, edge: null, message: `${shownBoard.properties[face.key]?.name} selected` });
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
                snapped = snapPoint(state.board, point, state.snap);
              if (state.dragNode) {
                view({ dragPoint: snapped.point, message: snapped.feedback });
              } else {
                view({ hover: snapped.point, message: state.tool !== 'select' ? snapped.feedback : state.message });
              }
            }}
            onPointerUp={() => {
              panStart.current = null;
              if (state.dragNode) {
                try {
                  commit(drawBoard, 'Shared boundary moved; territory crops updated', true);
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
              {state.guide && (
                <g
                  data-editor-guide
                  pointerEvents="none"
                  opacity="0.45"
                  dangerouslySetInnerHTML={{ __html: referenceSectors }}
                />
              )}
              {selectedFace && (
                <path d={selectedFace.path} fill="none" stroke="#386c8e" strokeWidth="2.5" pointerEvents="none" />
              )}
              {state.ghosts &&
                property?.decals.map((d) => (
                  <g key={d.id} opacity="0.28" pointerEvents="none">
                    <DecalArtwork decal={d} svg={state.artwork[d.artwork]} />
                  </g>
                ))}
              {state.tool === 'select' &&
                state.board.edges
                  .filter((e) => state.edge === e.id || selectedFace?.edges.includes(e.id))
                  .map((e) => (
                    <g key={e.id}>
                      <path
                        d={edgePath(shownBoard, e)}
                        fill="none"
                        stroke="transparent"
                        strokeWidth="9"
                        data-edge={e.id}
                      />
                      {[e.a, e.b].map((key) => (
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
                              {
                                ...state.board,
                                nodes: {
                                  ...state.board.nodes,
                                  [key]: [p[0] + delta[0] * step, p[1] + delta[1] * step],
                                },
                              },
                              'Boundary point moved with keyboard',
                              true
                            );
                          }}
                        />
                      ))}
                      {e.kind === 'cubic' &&
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
              {state.points.map((key, i) => (
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
              {state.points.length > 0 && state.hover && (
                <path
                  d={`M${state.board.nodes[state.points.at(-1)!].join(' ')}L${state.hover.join(' ')}`}
                  fill="none"
                  stroke="#386c8e"
                  strokeDasharray="3 3"
                  pointerEvents="none"
                />
              )}
              {state.hover && state.tool !== 'select' && (
                <circle
                  cx={state.hover[0]}
                  cy={state.hover[1]}
                  r="4"
                  fill="none"
                  stroke="#386c8e"
                  pointerEvents="none"
                />
              )}
            </g>
          </svg>
        </div>
        <Text size="xs" role="status" aria-live="polite">
          {state.message}
        </Text>
        {result.error && <Text c="red">{result.error}</Text>}
      </Stack>
    </Surface>
  );

  return (
    <PageLayout>
      <PageLayout.Header size="compact">
        <PageTitle title="Board editor study" eyebrow="Throwaway prototype" />
      </PageLayout.Header>
      <PageLayout.Toolbar>
        <Group justify="space-between" gap="sm">
          <Group gap="xs">
            <Select
              aria-label="Study fixture"
              value={state.board.fixture}
              data={['Interaction study', 'Blank board', 'Arrakis recreation']}
              onChange={(value) => {
                const board =
                  value === 'Arrakis recreation'
                    ? arrakisBoard()
                    : value === 'Blank board'
                      ? blankBoard()
                      : studyBoard();
                dispatch({ type: 'fixture.loaded', board });
              }}
            />
            <IconAction
              label="Undo"
              icon={<Undo2 size={17} />}
              disabled={!state.past.length}
              onClick={() => dispatch({ type: 'history.undo' })}
            />
            <IconAction
              label="Redo"
              icon={<Redo2 size={17} />}
              disabled={!state.future.length}
              onClick={() => dispatch({ type: 'history.redo' })}
            />
          </Group>
          <Group gap="xs">
            <Switch
              label="SVG proof"
              checked={state.compare}
              onChange={(e) => view({ compare: e.currentTarget.checked })}
            />
            <IconAction
              label="Download SVG"
              icon={<Download size={17} />}
              onClick={() => {
                const svg = artRef.current!.cloneNode(true) as SVGSVGElement;
                svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
                download('board-study.svg', new XMLSerializer().serializeToString(svg), 'image/svg+xml');
              }}
            />
            <Button
              variant="subtle"
              onClick={() => download('board-study.json', JSON.stringify(state.board, null, 2), 'application/json')}
            >
              Download draft
            </Button>
          </Group>
        </Group>
      </PageLayout.Toolbar>
      <PageLayout.Content width="viewport">
        <div className={styles.study}>
          <Stack gap="md">
            {variant === 'A' && (
              <AsymmetricSplitLayout narrowSide="start">
                <AsymmetricSplitLayout.Narrow>
                  <Stack gap="md">
                    {inspector}
                    {ledger}
                  </Stack>
                </AsymmetricSplitLayout.Narrow>
                <AsymmetricSplitLayout.Wide>{canvas}</AsymmetricSplitLayout.Wide>
              </AsymmetricSplitLayout>
            )}
            {variant === 'B' && (
              <>
                <Group justify="space-between">
                  <SegmentedControl
                    aria-label="Authoring stage"
                    value={state.step}
                    data={[
                      { value: 'draw', label: '1 · Draw boundaries' },
                      { value: 'assign', label: '2 · Assign territories' },
                    ]}
                    onChange={(step) => view({ step, tool: step === 'assign' ? 'select' : 'line', points: [] })}
                  />
                  <Text size="sm">
                    {state.step === 'draw' ? 'Make the regions first' : 'Select each region and give it properties'}
                  </Text>
                </Group>
                <div className={styles.wideCanvas}>{canvas}</div>
                {state.step === 'assign' && (
                  <WorkbenchLayout>
                    <WorkbenchLayout.Workbench>
                      <WorkbenchLayout.Chapters>{ledger}</WorkbenchLayout.Chapters>
                      <WorkbenchLayout.Rail>{inspector}</WorkbenchLayout.Rail>
                    </WorkbenchLayout.Workbench>
                  </WorkbenchLayout>
                )}
              </>
            )}
            {variant === 'C' && (
              <ColumnsWithRailLayout>
                <ColumnsWithRailLayout.Primary>{ledger}</ColumnsWithRailLayout.Primary>
                <ColumnsWithRailLayout.Secondary>{canvas}</ColumnsWithRailLayout.Secondary>
                <ColumnsWithRailLayout.Rail>{inspector}</ColumnsWithRailLayout.Rail>
              </ColumnsWithRailLayout>
            )}
            {state.board.fixture === 'Arrakis recreation' && (
              <Text size="sm" c="red">
                Recreation feasibility remains open. The source has 42 territories; this graph produces {faces.length}{' '}
                regions, including {faces.filter((face) => face.area < 1).length} small overlap regions. Insets are
                generated, so exact artwork equivalence is not established.
              </Text>
            )}
            <div hidden={!state.compare}>
              <Section
                title="Generated SVG proof"
                description="This output has no guide, selection marks, control points, or territory-name labels."
              >
                <DocumentEditorLayout ratio={1} fit="width">
                  <DocumentEditorLayout.Sidebar>
                    <Stack gap="sm">
                      <Text size="sm">
                        {state.board.fixture === 'Arrakis recreation'
                          ? 'Current Arrakis reference'
                          : 'Try the oversized city decal. Toggle its uncropped outline, then move the shared boundary.'}
                      </Text>
                      {state.board.fixture === 'Arrakis recreation' && (
                        <div className={styles.reference} dangerouslySetInnerHTML={{ __html: reference }} />
                      )}
                      <Badge variant="light">Editable geometry</Badge>
                      <Text size="xs">
                        {faces.length} regions · {state.board.edges.length} edges · {result.samples} graph segments
                      </Text>
                      <Text size="xs">Last geometry computation {result.milliseconds.toFixed(1)} ms</Text>
                      <Text size="xs">Unrecovered graph segments {result.unrecoveredSegments}</Text>
                      {state.board.fixture === 'Arrakis recreation' && (
                        <Text size="xs">
                          Endpoint recovery adjustment ≤ {referenceAdjustment.toFixed(6)} units. The disposable legacy
                          graph uses a 0.01-unit grid.
                        </Text>
                      )}
                    </Stack>
                  </DocumentEditorLayout.Sidebar>
                  <DocumentEditorLayout.Preview>
                    <Surface padding="md">
                      <svg ref={artRef} viewBox="0 0 487.06 487.06" width="100%" aria-label="Generated board artwork">
                        <BoardArtwork board={shownBoard} faces={faces} artwork={state.artwork} />
                      </svg>
                    </Surface>
                  </DocumentEditorLayout.Preview>
                </DocumentEditorLayout>
              </Section>
            </div>
            <details>
              <summary>Inspect draft state</summary>
              <Text size="xs">
                The guide, snapping toggle, zoom, and selection are editor state. They are absent from this draft.
              </Text>
              <pre className={styles.state}>{JSON.stringify(state.board, null, 2)}</pre>
            </details>
            {import.meta.env.DEV && (
              <Surface className={styles.switcher} padding="sm">
                <Group gap="sm" wrap="nowrap">
                  <IconAction
                    label="Previous variation"
                    icon={<ArrowLeft size={16} />}
                    onClick={() => chooseVariant(variants[(variants.indexOf(variant) + 2) % 3])}
                  />
                  <Text size="sm" fw={700}>
                    {variant} · {variantNames[variant as keyof typeof variantNames]}
                  </Text>
                  <IconAction
                    label="Next variation"
                    icon={<ArrowRight size={16} />}
                    onClick={() => chooseVariant(variants[(variants.indexOf(variant) + 1) % 3])}
                  />
                </Group>
              </Surface>
            )}
          </Stack>
        </div>
      </PageLayout.Content>
    </PageLayout>
  );
}
function DecalArtwork({ decal, svg }: { decal: Decal; svg?: string }) {
  if (!svg) {
    return null;
  }
  const viewBox = svg.match(/viewBox="([^"]+)"/)?.[1] || '0 0 100 100';
  const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>[\s\S]*$/, '');
  return (
    <g transform={`translate(${decal.x} ${decal.y}) rotate(${decal.rotation})`}>
      <svg
        x={-decal.scale / 2}
        y={-decal.scale / 2}
        width={decal.scale}
        height={decal.scale}
        viewBox={viewBox}
        dangerouslySetInnerHTML={{ __html: inner }}
      />
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
