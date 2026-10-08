import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Group, Stack, Text, Select, TextInput, Switch, Slider, Divider, VisuallyHidden } from '@mantine/core';
import { ALL } from '@shared/assetIds';
import {
  derive,
  facePath,
  defaults,
  reconcile,
  connectPoint,
  snapPoint,
  edgePath,
  contains,
  CENTER,
  RADIUS,
  commonArtwork,
  removePoint,
  removeConnection,
  pointRemovalReason,
  boundPoint,
  distance,
  movePoint,
} from '@shared/boards/geometry';
import type { Board, Point, Face, Properties, Decal, Edge } from '@shared/boards/geometry';
import { Section } from '@ui/block/Section';
import { stockAssetOptions } from '@ui/content/stockAssetOptions';
import { AssetSelect } from '@ui/control/AssetSelect';
import { ConfirmDeleteAction } from '@ui/control/ConfirmDeleteAction';
import { ControlBlock } from '@ui/control/ControlBlock';
import { IconAction } from '@ui/control/IconAction';
import { SortableItem } from '@ui/control/SortableItem';
import { SortableReorderHandle } from '@ui/control/SortableReorderHandle';
import { DocumentEditorLayout } from '@ui/layout/DocumentEditorLayout';
import { NestedTabs } from '@ui/surface/NestedTabs';
import { Toolbar } from '@ui/surface/Toolbar';
import {
  ZoomIn,
  ZoomOut,
  Maximize,
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
  Radar,
  Magnet,
  Scan,
} from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { Dispatch, ReactNode } from 'react';

import { BOARD_ARTWORK } from '@game/assets/board/artwork';
import { BoardArtwork, DecalArtwork } from '@game/assets/board/Board';

import styles from './BoardEditor.module.css';
import type { BoardEditorState, BoardEditorEvent } from './state';
const artworkOptions = stockAssetOptions(
  ALL.options
    .flatMap((category) => category.options)
    .filter((key) => key.startsWith('/vector/') && !key.includes('/background/'))
);

const TOOL_SHORTCUTS: Record<string, BoardEditorState['tool']> = {
  v: 'select',
  l: 'line',
  c: 'cubic',
  a: 'arc',
  i: 'add-point',
  d: 'remove-point',
  x: 'remove-edge',
  h: 'pan',
};

type DrawingPoints = BoardEditorState['points'];
function drawingComplete(tool: BoardEditorState['tool'], points: DrawingPoints) {
  switch (tool) {
    case 'cubic':
      return points.length === 4;
    case 'arc':
      return points.length === 3;
    case 'line':
      return points.length > 2 && points.at(-1)!.node === points[0].node;
    default:
      return false;
  }
}
function circularEdge(points: DrawingPoints): Edge {
  const [a, m, b] = points.map((p) => p.point);
  const ab = distance(a, b),
    am = distance(a, m),
    mb = distance(m, b);
  const cross = (m[0] - a[0]) * (b[1] - a[1]) - (m[1] - a[1]) * (b[0] - a[0]);
  if (Math.abs(cross) < 0.001) {
    throw new Error('Choose a bend away from the straight line');
  }
  const radius = (ab * am * mb) / (2 * Math.abs(cross));
  const dot = (a[0] - m[0]) * (b[0] - m[0]) + (a[1] - m[1]) * (b[1] - m[1]);
  return {
    id: `arc-${crypto.randomUUID()}`,
    a: points[0].node!,
    b: points[2].node!,
    kind: 'arc',
    arc: [radius, radius, 0, dot > 0 ? 1 : 0, cross > 0 ? 1 : 0],
  };
}
function drawingEdge(tool: BoardEditorState['tool'], points: DrawingPoints): Edge | null {
  switch (tool) {
    case 'line': {
      if (points.length < 2) {
        return null;
      }
      const a = points.at(-2)!.node!,
        b = points.at(-1)!.node!;
      return a === b ? null : { id: `cut-${crypto.randomUUID()}`, a, b, kind: 'line' };
    }
    case 'cubic':
      return points.length === 4
        ? {
            id: `curve-${crypto.randomUUID()}`,
            a: points[0].node!,
            b: points[3].node!,
            kind: 'cubic',
            c1: points[1].point,
            c2: points[2].point,
          }
        : null;
    case 'arc':
      return points.length === 3 ? circularEdge(points) : null;
    default:
      return null;
  }
}

export function BoardEditor({
  state,
  dispatch,
  identity,
}: {
  state: BoardEditorState;
  dispatch: Dispatch<BoardEditorEvent>;
  identity?: ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null),
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
  const { nodes, edges } = state.board;
  const baseline = useMemo(() => derive({ nodes, edges, properties: {} }), [nodes, edges]);
  const baselineFaces = baseline.faces;
  const result = useMemo(() => {
    try {
      return {
        ...(state.dragPoint
          ? {
              faces: baselineFaces.map((face) => ({ ...face, path: facePath(drawBoard, face) })),
              unrecoveredSegments: 0,
            }
          : baseline),
        error: null,
      };
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
  }, [drawBoard, state.dragPoint, baselineFaces, baseline]);
  const faces = result.faces;
  const shownBoard = drawBoard;
  const selectedKey = faces.some((face) => face.key === state.selected) ? state.selected : faces[0]?.key;
  const selectedFace = faces.find((face) => face.key === selectedKey),
    property = selectedKey ? shownBoard.properties[selectedKey] : undefined;
  const edge = state.board.edges.find((edge) => edge.id === state.edge);
  const view = (patch: Extract<BoardEditorEvent, { type: 'view.changed' }>['patch']) =>
    dispatch({ type: 'view.changed', patch });
  const commit = (board: Board, message: string, topology = false, group?: string) => {
    if (board === state.board) {
      view({ dragNode: null, dragPoint: null, dragHandle: null });
      return;
    }
    const next = topology ? reconcile(board, state.board, baselineFaces, derive(board).faces) : board;
    dispatch({ type: 'board.edited', board: next, message, group });
  };
  const patchProperty = (patch: Partial<Properties>, group?: string) => {
    if (!selectedKey || !property) {
      return;
    }
    commit(
      { ...state.board, properties: { ...state.board.properties, [selectedKey]: { ...property, ...patch } } },
      'Territory updated',
      false,
      group
    );
  };
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        return;
      }
      if ((event.target as HTMLElement)?.closest('input,textarea,select,[contenteditable],svg [tabindex]')) {
        return;
      }
      if (event.defaultPrevented) {
        return;
      }
      const key = event.key.toLowerCase();
      if (event.metaKey || event.ctrlKey) {
        if (key === 'z') {
          event.preventDefault();
          dispatch({ type: event.shiftKey ? 'history.redo' : 'history.undo' });
        }
        return;
      }
      if (event.altKey) {
        return;
      }
      const tool = TOOL_SHORTCUTS[key];
      if (tool) {
        event.preventDefault();
        view({ tool, points: [], edge: null });
        return;
      }
      const settings: Record<string, () => void> = {
        g: () => view({ guide: !state.guide }),
        s: () => view({ snap: !state.snap }),
        p: () => view({ compare: !state.compare }),
        '0': () => view({ zoom: 1, pan: [0, 0] }),
        escape: () =>
          view({
            tool: 'select',
            points: [],
            edge: null,
            dragNode: null,
            dragPoint: null,
            message: 'Drawing finished. Open cuts remain visible.',
          }),
      };
      settings[key]?.();
    };
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  });
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) {
      return;
    }
    let pending = { zoom: state.zoom, pan: state.pan };
    let frame = 0;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const factor = 487.06 / svg.getBoundingClientRect().width;
      const pixelGesture =
        event.deltaMode === 0 &&
        (Math.abs(event.deltaX) > 0 || Math.abs(event.deltaY) < 40 || !Number.isInteger(event.deltaY));
      if (pixelGesture && !event.ctrlKey && !event.metaKey) {
        pending = { ...pending, pan: [pending.pan[0] - event.deltaX * factor, pending.pan[1] - event.deltaY * factor] };
      } else {
        const matrix = svg.getScreenCTM();
        if (!matrix) {
          return;
        }
        const cursor = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
        const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1);
        const zoom = Math.max(0.5, Math.min(5, pending.zoom * Math.exp(-delta * 0.002)));
        const ratio = zoom / pending.zoom;
        pending = {
          zoom,
          pan: [
            cursor.x - CENTER[0] - (cursor.x - CENTER[0] - pending.pan[0]) * ratio,
            cursor.y - CENTER[1] - (cursor.y - CENTER[1] - pending.pan[1]) * ratio,
          ],
        };
      }
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          dispatch({ type: 'view.changed', patch: pending });
        });
      }
    };
    svg.addEventListener('wheel', wheel, { passive: false });
    return () => {
      svg.removeEventListener('wheel', wheel);
      cancelAnimationFrame(frame);
    };
  }, [state.zoom, state.pan, dispatch]);

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
    if (id.startsWith('rim') || state.board.edges.find((edge) => edge.id === id)?.fixed) {
      view({ message: 'The circular rim stays connected' });
      return;
    }
    commit(removeConnection(state.board, id), 'Connection removed; both points kept', true);
    view({ edge: null, activeNode: null });
  }
  function placePoint(point: Point) {
    const controls: Partial<Record<BoardEditorState['tool'], number[]>> = { cubic: [1, 2], arc: [1] };
    if (controls[state.tool]?.includes(state.points.length)) {
      const snapped = snapPoint(state.board, boundPoint(point), state.snap, magnetRadius());
      view({ points: [...state.points, { point: snapped.point }], message: snapped.feedback });
      return;
    }
    const connection = connectPoint(state.board, point, state.snap, magnetRadius());
    const points = [...state.points, { node: connection.node, point: connection.point }];
    try {
      const edge = drawingEdge(state.tool, points);
      const board = edge ? { ...connection.board, edges: [...connection.board.edges, edge] } : connection.board;
      commit(board, connection.feedback, true);
      view({ points: drawingComplete(state.tool, points) ? [] : points });
    } catch (error) {
      view({ message: `Geometry needs correction: ${String(error)}` });
    }
  }
  function addDecal(artwork: Decal['artwork']) {
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
  function patchDecal(id: string, patch: Partial<Decal>, group?: string) {
    patchProperty(
      { decals: property!.decals.map((decal) => (decal.id === id ? { ...decal, ...patch } : decal)) },
      group
    );
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
          tooltip={`${label} · ${Object.entries(TOOL_SHORTCUTS)
            .find(([, value]) => value === tool)?.[0]
            .toUpperCase()}`}
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
      <IconAction
        label="18-sector guide"
        tooltip="18-sector guide · G"
        icon={<Radar size={17} />}
        emphasis="standard"
        pressed={state.guide}
        onClick={() => view({ guide: !state.guide })}
      />
      <IconAction
        label="Snap points"
        tooltip="Snap points · S"
        icon={<Magnet size={17} />}
        emphasis="standard"
        pressed={state.snap}
        onClick={() => view({ snap: !state.snap })}
      />
      <IconAction
        label="Show decal before cropping"
        icon={<Scan size={17} />}
        emphasis="standard"
        pressed={state.ghosts}
        onClick={() => view({ ghosts: !state.ghosts })}
      />
      <IconAction
        label="Preview artwork"
        tooltip="Preview artwork · P"
        icon={<Eye size={17} />}
        emphasis="standard"
        pressed={state.compare}
        onClick={() => view({ compare: !state.compare })}
      />
      <IconAction
        label="Zoom out"
        icon={<ZoomOut size={17} />}
        emphasis="standard"
        onClick={() => view({ zoom: Math.max(0.5, state.zoom / 1.25) })}
      />
      <IconAction
        label="Zoom in"
        icon={<ZoomIn size={17} />}
        emphasis="standard"
        onClick={() => view({ zoom: Math.min(5, state.zoom * 1.25) })}
      />
      <IconAction
        label="Fit board"
        tooltip="Fit board · 0"
        icon={<Maximize size={17} />}
        emphasis="standard"
        onClick={() => view({ zoom: 1, pan: [0, 0] })}
      />
    </Group>
  );
  const inspector = (
    <Stack gap="sm">
      {property && (
        <Stack gap="sm">
          <TextInput
            label="Territory name"
            value={property.name}
            error={
              Object.entries(state.board.properties).some(([key, p]) => key !== selectedKey && p.name === property.name)
                ? 'Use a unique name'
                : undefined
            }
            onChange={(e) => patchProperty({ name: e.currentTarget.value }, 'territory-name')}
            onBlur={() => dispatch({ type: 'history.group-ended' })}
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
                  appearance: undefined,
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
          <Divider />
          <Group gap="xs">
            {(
              [
                [commonArtwork.sietch, 'Add sietch icon'],
                [commonArtwork.city, 'Add city icon'],
                [commonArtwork.ornithopter, 'Add ornithopter icon'],
              ] as const
            ).map(([key, label]) => (
              <IconAction
                key={key}
                label={label}
                emphasis="standard"
                icon={
                  <svg width="20" height="20" viewBox="0 0 487.06 487.06">
                    <DecalArtwork
                      decal={{ id: key, artwork: key, x: 243.53, y: 243.53, scale: 470, rotation: 0, outline: true }}
                      svg={BOARD_ARTWORK[key]}
                    />
                  </svg>
                }
                onClick={() => addDecal(key)}
              />
            ))}
            <AssetSelect
              trigger={{ label: 'Add decal', icon: <Plus size={17} /> }}
              data={artworkOptions}
              value={null}
              glyphPreviews
              getPreviewSrc={(key) => key || null}
              onChange={(value) => value && addDecal(value as Decal['artwork'])}
            />
          </Group>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={({ active, over }) => {
              const from = property.decals.findIndex((decal) => decal.id === active.id);
              const to = property.decals.findIndex((decal) => decal.id === over?.id);
              if (from >= 0 && to >= 0 && from !== to) {
                patchProperty({ decals: arrayMove(property.decals, from, to) });
              }
            }}
          >
            <SortableContext items={property.decals.map((decal) => decal.id)} strategy={verticalListSortingStrategy}>
              {property.decals.map((decal, i) => (
                <SortableItem key={decal.id} id={decal.id}>
                  {({ setActivatorNodeRef, attributes, listeners }) => (
                    <Stack gap="xs">
                      <Group justify="space-between">
                        <Text size="sm" fw={700}>
                          Decal {i + 1} ·{' '}
                          {artworkOptions.find((option) => option.value === decal.artwork)?.label || decal.artwork}
                        </Text>
                        <Group gap="xs">
                          <SortableReorderHandle
                            label={`Reorder decal ${i + 1}`}
                            emphasis="quiet"
                            setActivatorNodeRef={setActivatorNodeRef}
                            attributes={attributes}
                            listeners={listeners}
                          />
                          <IconAction
                            emphasis="standard"
                            icon={<Minus size={17} />}
                            label={`Remove decal ${i + 1}`}
                            onClick={() => patchProperty({ decals: property.decals.filter((v) => v.id !== decal.id) })}
                          />
                        </Group>
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
                              onChangeEnd={() => dispatch({ type: 'history.group-ended' })}
                              onChange={(value) => patchDecal(decal.id, { [key]: value }, `${decal.id}:${key}`)}
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
                  )}
                </SortableItem>
              ))}
            </SortableContext>
          </DndContext>
        </Stack>
      )}
      {state.activeNode && state.board.nodes[state.activeNode] && (
        <Section title="Selected boundary point">
          <Stack gap="xs">
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
        <Section title="Selected shared edge">
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
                    disabled={edge.fixed}
                    min={0}
                    max={487.06}
                    step={0.5}
                    value={state.board.nodes[edge.a][axis]}
                    onChange={(value) => {
                      const point: Point = [...state.board.nodes[edge.a]];
                      point[axis] = value;
                      commit(movePoint(state.board, edge.a, point), 'Point moved', true, `edge-${edge.id}-${axis}`);
                    }}
                    onChangeEnd={() => dispatch({ type: 'history.group-ended' })}
                  />
                }
              />
            ))}
            <ConfirmDeleteAction
              label="Delete shared edge"
              pending={false}
              disabled={edge.id.startsWith('rim') || edge.fixed}
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
            const start = state.dragHandle
              ? state.board.edges.find((edge) => edge.id === state.dragNode)![state.dragHandle]!
              : state.board.nodes[state.dragNode];
            if (!state.dragPoint || distance(start, state.dragPoint) < 1e-6) {
              view({ dragNode: null, dragPoint: null, dragHandle: null });
              return;
            }
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
          <BoardArtwork
            board={shownBoard}
            faces={faces}
            artwork={BOARD_ARTWORK}
            sectorGuide={!state.compare && state.guide}
          />
          {!state.compare && selectedFace && (
            <path d={selectedFace.path} fill="none" stroke="#386c8e" strokeWidth="2.5" pointerEvents="none" />
          )}
          {!state.compare &&
            state.ghosts &&
            property?.decals.map((d) => (
              <g key={d.id} opacity="0.28" pointerEvents="none">
                <DecalArtwork decal={d} svg={BOARD_ARTWORK[d.artwork]} />
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
                  !e.fixed &&
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
            state.points.map(({ point }, i) => (
              <g key={i}>
                <circle cx={point[0]} cy={point[1]} r="3" fill="#386c8e" />
                {i > 0 && state.tool !== 'line' && (
                  <path
                    d={`M${state.points[i - 1].point.join(' ')}L${point.join(' ')}`}
                    fill="none"
                    stroke="#386c8e"
                    strokeDasharray="3 3"
                  />
                )}
              </g>
            ))}
          {!state.compare && state.points.length > 0 && state.hover && (
            <path
              d={`M${state.points.at(-1)!.point.join(' ')}L${state.hover.join(' ')}`}
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
    <div ref={rootRef} className={styles.study}>
      <DocumentEditorLayout ratio={1} fit="width" sidebarSize="compact">
        <DocumentEditorLayout.Sidebar>
          <Stack gap="sm">
            {identity}
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
          </Stack>
        </DocumentEditorLayout.Sidebar>
        <DocumentEditorLayout.PreviewTools>
          <Toolbar>
            <Toolbar.Left label="Drawing tools">{tools}</Toolbar.Left>
            <Toolbar.Right label="Map settings">
              <Toolbar.Cluster kind="content">{viewTools}</Toolbar.Cluster>
            </Toolbar.Right>
          </Toolbar>
        </DocumentEditorLayout.PreviewTools>
        <DocumentEditorLayout.Preview>
          <div className={styles.editor}>
            {boardCanvas}
            <VisuallyHidden role="status" aria-live="polite">
              {state.message}
            </VisuallyHidden>
            {result.error && <Text c="red">{result.error}</Text>}
          </div>
        </DocumentEditorLayout.Preview>
      </DocumentEditorLayout>
    </div>
  );
}
