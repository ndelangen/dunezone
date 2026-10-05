import {
  Accordion,
  Button,
  ColorInput,
  Group,
  Loader,
  NumberInput,
  Select,
  Stack,
  Switch,
  TextInput,
  Textarea,
} from '@mantine/core';
import { resolveRulebookBoardDefinition, RULEBOOK_BOARD_DEFINITIONS } from '@shared/rulebooks/boardDefinitions';
import { createRulebookLocalId } from '@shared/rulebooks/contents';
import type { RulebookBoardSceneValue, RulebookPieceMovementValue } from '@shared/rulebooks/illustratedScenes';
import { ControlBlock } from '@ui/control/ControlBlock';
import { ListLengthActions } from '@ui/control/ListLengthActions';
import { lazy, Suspense, useState } from 'react';

import { BattleSourceControl, BattleStepEdit } from './rulebookBattleStepEdit';
import type { RulebookBlockEditorProps } from './rulebookBlockEditors';
import type { RulebookEditorReferences } from './rulebookVisualBlockEditors';

const FactionPicker = lazy(() =>
  import('@app/pickers/FactionPicker').then((module) => ({ default: module.FactionPicker }))
);
const emptyReferences = { assetsById: {}, factionsById: {} };
const emptyBoard: RulebookBoardSceneValue = {
  boardId: 'arrakis',
  caption: '',
  players: [],
  troops: [],
  highlights: [],
  annotations: [],
};

function FactionControl({
  label,
  factionId,
  references,
  onChange,
}: {
  label: string;
  factionId?: string;
  references: RulebookEditorReferences;
  onChange: (id: string | undefined) => void;
}) {
  const [opened, setOpened] = useState(false);
  return (
    <ControlBlock
      title="Faction"
      input={
        <Stack gap="sm">
          <Group gap="sm">
            <Button variant="default" aria-label={`Choose ${label} faction`} onClick={() => setOpened(!opened)}>
              {factionId ? (references.factionsById[factionId]?.name ?? 'Unavailable faction') : 'Choose faction'}
            </Button>
            {factionId ? (
              <Button variant="subtle" aria-label={`Clear ${label} faction`} onClick={() => onChange(undefined)}>
                Clear
              </Button>
            ) : null}
          </Group>
          {opened ? (
            <Suspense fallback={<Loader size="sm" aria-label="Loading factions" />}>
              <FactionPicker
                copy={{
                  title: 'Choose faction',
                  intro: 'Use this faction in the illustration.',
                  errorTitle: 'Factions could not be loaded',
                  emptyMessage: 'No factions are available.',
                  confirmTitle: 'Selected faction',
                  confirmLabel: 'Use faction',
                  confirmIntent: 'positive',
                }}
                onPick={(picked) => {
                  onChange(picked.id);
                  setOpened(false);
                }}
                onCancel={() => setOpened(false)}
              />
            </Suspense>
          ) : null}
        </Stack>
      }
    />
  );
}

function TroopFields({
  label,
  value,
  references,
  onChange,
}: {
  label: string;
  value: { factionId?: string; troopId?: string; face: 'front' | 'back'; count: number };
  references: RulebookEditorReferences;
  onChange: (fields: Partial<typeof value>) => void;
}) {
  const troops = value.factionId ? (references.factionsById[value.factionId]?.troops ?? []) : [];
  const selected = troops.find((troop) => troop.troopId === value.troopId);
  const options = troops.flatMap((troop) =>
    troop.troopId ? [{ value: troop.troopId, label: troop.name || 'Unnamed troop' }] : []
  );
  if (value.troopId && !options.some((option) => option.value === value.troopId)) {
    options.push({ value: value.troopId, label: 'Unavailable troop' });
  }
  return (
    <Stack gap="sm">
      <FactionControl
        label={label}
        factionId={value.factionId}
        references={references}
        onChange={(factionId) => onChange({ factionId, troopId: undefined, face: 'front' })}
      />
      <Group grow align="start">
        <Select
          label="Troop"
          aria-label={`${label} troop`}
          placeholder="Choose troop"
          data={options}
          value={value.troopId ?? null}
          clearable
          onChange={(troopId) => onChange({ troopId: troopId ?? undefined, face: 'front' })}
        />
        <Select
          label="Face"
          aria-label={`${label} face`}
          value={value.face}
          data={[
            { value: 'front', label: selected?.name || 'Front' },
            ...(selected?.back || value.face === 'back'
              ? [{ value: 'back', label: selected?.back?.name || 'Back' }]
              : []),
          ]}
          onChange={(face) => {
            if (face === 'front' || face === 'back') {
              onChange({ face });
            }
          }}
        />
        <NumberInput
          clampBehavior="strict"
          allowLeadingZeros={false}
          label="Count"
          aria-label={`${label} count`}
          min={0}
          max={100}
          allowDecimal={false}
          value={value.count}
          onChange={(count) => onChange({ count: typeof count === 'number' ? count : 0 })}
        />
      </Group>
    </Stack>
  );
}

function PositionFields({
  label,
  x,
  y,
  onChange,
  max = 100,
  min = 0,
}: {
  label: string;
  x: number;
  y: number;
  max?: number;
  min?: number;
  onChange: (fields: { x?: number; y?: number }) => void;
}) {
  return (
    <Group grow>
      {(['x', 'y'] as const).map((axis) => (
        <NumberInput
          clampBehavior="strict"
          allowLeadingZeros={false}
          key={axis}
          label={axis === 'x' ? 'Across (%)' : 'Down (%)'}
          aria-label={`${label} ${axis}`}
          min={min}
          max={max}
          decimalScale={2}
          value={(axis === 'x' ? x : y) * 100}
          onChange={(next) => onChange({ [axis]: (typeof next === 'number' ? next : 0) / 100 })}
        />
      ))}
    </Group>
  );
}

function NamedPosition({
  boardId,
  label,
  onChange,
}: {
  boardId: string;
  label: string;
  onChange: (position: { x: number; y: number }) => void;
}) {
  const parts = resolveRulebookBoardDefinition(boardId)?.geometry.parts ?? [];
  return (
    <Select
      label="Place at board feature"
      aria-label={`${label} board feature`}
      placeholder="Choose a named location"
      searchable
      value={null}
      data={parts.map((part) => ({ value: part.key, label: part.label ?? part.key }))}
      onChange={(key) => {
        const part = parts.find((entry) => entry.key === key);
        if (part) {
          onChange({ x: part.x + part.width / 2, y: part.y + part.height / 2 });
        }
      }}
    />
  );
}

type BoardSceneFieldsProps = {
  value: RulebookBoardSceneValue;
  references: RulebookEditorReferences;
  onChange: (value: RulebookBoardSceneValue) => void;
};

function BoardTroopRow({
  troop,
  index,
  boardId,
  onChange,
  references,
}: {
  troop: RulebookBoardSceneValue['troops'][number];
  index: number;
  boardId: string;
  onChange: (fields: Partial<RulebookBoardSceneValue['troops'][number]>) => void;
  references: RulebookEditorReferences;
}) {
  return (
    <Stack gap="sm">
      <TroopFields label={`Board group ${index + 1}`} value={troop} references={references} onChange={onChange} />
      <NamedPosition boardId={boardId} label={`Board group ${index + 1}`} onChange={onChange} />
      <PositionFields label={`Board group ${index + 1}`} x={troop.x} y={troop.y} onChange={onChange} />
      <Group grow>
        <NumberInput
          clampBehavior="strict"
          allowLeadingZeros={false}
          label="Columns"
          min={1}
          max={20}
          allowDecimal={false}
          value={troop.columns}
          onChange={(columns) => onChange({ columns: typeof columns === 'number' ? columns : 1 })}
        />
        <NumberInput
          clampBehavior="strict"
          allowLeadingZeros={false}
          label="Token size (%)"
          min={0.1}
          max={20}
          value={troop.size * 100}
          onChange={(size) => onChange({ size: (typeof size === 'number' ? size : 1) / 100 })}
        />
        <NumberInput
          clampBehavior="strict"
          allowLeadingZeros={false}
          label="Gap (%)"
          min={0}
          max={10}
          value={troop.gap * 100}
          onChange={(gap) => onChange({ gap: (typeof gap === 'number' ? gap : 0) / 100 })}
        />
      </Group>
    </Stack>
  );
}

function BoardHighlightRow({
  highlight,
  index,
  boardId,
  onChange,
}: {
  highlight: RulebookBoardSceneValue['highlights'][number];
  index: number;
  boardId: string;
  onChange: (fields: Partial<RulebookBoardSceneValue['highlights'][number]>) => void;
}) {
  const parts = resolveRulebookBoardDefinition(boardId)?.geometry.parts ?? [];
  return (
    <Group grow align="start">
      <Select
        label="Board feature"
        aria-label={`Highlight ${index + 1} feature`}
        searchable
        data={parts.map((part) => ({ value: part.key, label: part.label ?? part.key }))}
        value={highlight.territory}
        onChange={(territory) => {
          if (territory) {
            onChange({ territory });
          }
        }}
      />
      <ColorInput
        label="Colour"
        aria-label={`Highlight ${index + 1} colour`}
        value={highlight.color}
        onChange={(color) => {
          if (/^#[0-9a-fA-F]{6}$/.test(color)) {
            onChange({ color });
          }
        }}
      />
      <NumberInput
        clampBehavior="strict"
        allowLeadingZeros={false}
        label="Opacity (%)"
        min={0}
        max={100}
        value={(highlight.opacity ?? 0.4) * 100}
        onChange={(opacity) => onChange({ opacity: (typeof opacity === 'number' ? opacity : 0) / 100 })}
      />
    </Group>
  );
}

function BoardAnnotationRow({
  annotation,
  index,
  boardId,
  onChange,
}: {
  annotation: RulebookBoardSceneValue['annotations'][number];
  index: number;
  boardId: string;
  onChange: (fields: Partial<RulebookBoardSceneValue['annotations'][number]>) => void;
}) {
  return (
    <Stack gap="sm">
      <TextInput
        label="Title"
        aria-label={`Annotation ${index + 1} title`}
        value={annotation.title}
        onChange={(event) => onChange({ title: event.currentTarget.value })}
      />
      <Textarea
        label="Explanation"
        aria-label={`Annotation ${index + 1} explanation`}
        value={annotation.text}
        onChange={(event) => onChange({ text: event.currentTarget.value })}
      />
      <NamedPosition boardId={boardId} label={`Annotation ${index + 1}`} onChange={onChange} />
      <PositionFields label={`Annotation ${index + 1}`} x={annotation.x} y={annotation.y} onChange={onChange} />
      <Switch
        label="Point at another location"
        checked={annotation.targetX !== undefined && annotation.targetY !== undefined}
        onChange={(event) =>
          onChange({
            targetX: event.currentTarget.checked ? annotation.x : undefined,
            targetY: event.currentTarget.checked ? annotation.y : undefined,
          })
        }
      />
      {annotation.targetX !== undefined && annotation.targetY !== undefined ? (
        <PositionFields
          label={`Annotation ${index + 1} target`}
          x={annotation.targetX}
          y={annotation.targetY}
          onChange={({ x, y }) =>
            onChange({
              ...(x !== undefined ? { targetX: x } : {}),
              ...(y !== undefined ? { targetY: y } : {}),
            })
          }
        />
      ) : null}
      <ColorInput
        label="Colour"
        aria-label={`Annotation ${index + 1} colour`}
        value={annotation.color ?? ''}
        onChange={(color) => {
          if (!color || /^#[0-9a-fA-F]{6}$/.test(color)) {
            onChange({ color: color || undefined });
          }
        }}
      />
    </Stack>
  );
}

function BoardPlayerFields({ value, onChange, references }: BoardSceneFieldsProps) {
  return (
    <Accordion.Item value="players">
      <Accordion.Control>Player markers ({value.players.length})</Accordion.Control>
      <Accordion.Panel>
        <ControlBlock
          title="Player markers"
          tool={
            <ListLengthActions
              addLabel="Add player marker"
              addDisabled={value.players.length >= 64}
              removeLabel="Remove last player marker"
              removeDisabled={!value.players.length}
              onAdd={() =>
                onChange({
                  ...value,
                  players: [
                    ...value.players,
                    { id: createRulebookLocalId(value.players.map((entry) => entry.id)), angle: 0 },
                  ],
                })
              }
              onRemove={() => onChange({ ...value, players: value.players.slice(0, -1) })}
            />
          }
          input={
            <Stack gap="md">
              {value.players.map((player, index) => (
                <Stack key={player.id} gap="sm">
                  <FactionControl
                    label={`player ${index + 1}`}
                    factionId={player.factionId}
                    references={references}
                    onChange={(factionId) =>
                      onChange({
                        ...value,
                        players: value.players.map((entry) =>
                          entry.id === player.id ? { ...entry, factionId } : entry
                        ),
                      })
                    }
                  />
                  <NumberInput
                    clampBehavior="strict"
                    allowLeadingZeros={false}
                    label="Position angle"
                    aria-label={`Player ${index + 1} angle`}
                    min={-360}
                    max={360}
                    value={player.angle}
                    onChange={(angle) =>
                      onChange({
                        ...value,
                        players: value.players.map((entry) =>
                          entry.id === player.id ? { ...entry, angle: typeof angle === 'number' ? angle : 0 } : entry
                        ),
                      })
                    }
                  />
                </Stack>
              ))}
            </Stack>
          }
        />
      </Accordion.Panel>
    </Accordion.Item>
  );
}

function BoardTroopFields({ value, onChange, references }: BoardSceneFieldsProps) {
  return (
    <Accordion.Item value="troops">
      <Accordion.Control>Troop groups ({value.troops.length})</Accordion.Control>
      <Accordion.Panel>
        <ControlBlock
          title="Troop groups"
          tool={
            <ListLengthActions
              addLabel="Add board troop group"
              addDisabled={value.troops.length >= 64}
              removeLabel="Remove last board troop group"
              removeDisabled={!value.troops.length}
              onAdd={() =>
                onChange({
                  ...value,
                  troops: [
                    ...value.troops,
                    {
                      id: createRulebookLocalId(value.troops.map((entry) => entry.id)),
                      face: 'front',
                      count: 1,
                      x: 0.5,
                      y: 0.5,
                      columns: 3,
                      size: 0.04,
                      gap: 0.005,
                    },
                  ],
                })
              }
              onRemove={() => onChange({ ...value, troops: value.troops.slice(0, -1) })}
            />
          }
          input={
            <Stack gap="md">
              {value.troops.map((troop, index) => (
                <BoardTroopRow
                  key={troop.id}
                  troop={troop}
                  index={index}
                  boardId={value.boardId}
                  references={references}
                  onChange={(fields) =>
                    onChange({
                      ...value,
                      troops: value.troops.map((entry) => (entry.id === troop.id ? { ...entry, ...fields } : entry)),
                    })
                  }
                />
              ))}
            </Stack>
          }
        />
      </Accordion.Panel>
    </Accordion.Item>
  );
}

function BoardHighlightFields({ value, onChange }: BoardSceneFieldsProps) {
  const parts = resolveRulebookBoardDefinition(value.boardId)?.geometry.parts ?? [];
  return (
    <Accordion.Item value="highlights">
      <Accordion.Control>Highlights ({value.highlights.length})</Accordion.Control>
      <Accordion.Panel>
        <ControlBlock
          title="Highlights"
          tool={
            <ListLengthActions
              addLabel="Add highlight"
              addDisabled={value.highlights.length >= 64}
              removeLabel="Remove last highlight"
              removeDisabled={!value.highlights.length}
              onAdd={() =>
                onChange({
                  ...value,
                  highlights: [
                    ...value.highlights,
                    { territory: parts[0]?.key ?? 'strongholds', color: '#e9bb42', opacity: 0.4 },
                  ],
                })
              }
              onRemove={() => onChange({ ...value, highlights: value.highlights.slice(0, -1) })}
            />
          }
          input={
            <Stack gap="md">
              {value.highlights.map((highlight, index) => (
                <BoardHighlightRow
                  key={index}
                  highlight={highlight}
                  index={index}
                  boardId={value.boardId}
                  onChange={(fields) =>
                    onChange({
                      ...value,
                      highlights: value.highlights.map((entry, position) =>
                        position === index ? { ...entry, ...fields } : entry
                      ),
                    })
                  }
                />
              ))}
            </Stack>
          }
        />
      </Accordion.Panel>
    </Accordion.Item>
  );
}

function BoardAnnotationFields({ value, onChange }: BoardSceneFieldsProps) {
  return (
    <Accordion.Item value="annotations">
      <Accordion.Control>Annotations ({value.annotations.length})</Accordion.Control>
      <Accordion.Panel>
        <ControlBlock
          title="Annotations"
          tool={
            <ListLengthActions
              addLabel="Add annotation"
              addDisabled={value.annotations.length >= 64}
              removeLabel="Remove last annotation"
              removeDisabled={!value.annotations.length}
              onAdd={() =>
                onChange({
                  ...value,
                  annotations: [
                    ...value.annotations,
                    {
                      id: createRulebookLocalId(value.annotations.map((entry) => entry.id)),
                      title: '',
                      text: '',
                      x: 0.5,
                      y: 0.5,
                    },
                  ],
                })
              }
              onRemove={() => onChange({ ...value, annotations: value.annotations.slice(0, -1) })}
            />
          }
          input={
            <Stack gap="md">
              {value.annotations.map((annotation, index) => (
                <BoardAnnotationRow
                  key={annotation.id}
                  annotation={annotation}
                  index={index}
                  boardId={value.boardId}
                  onChange={(fields) =>
                    onChange({
                      ...value,
                      annotations: value.annotations.map((entry) =>
                        entry.id === annotation.id ? { ...entry, ...fields } : entry
                      ),
                    })
                  }
                />
              ))}
            </Stack>
          }
        />
      </Accordion.Panel>
    </Accordion.Item>
  );
}

function BoardViewportFields({ value, onChange }: BoardSceneFieldsProps) {
  return (
    <>
      <Switch
        label="Focus on part of the board"
        checked={Boolean(value.viewport)}
        onChange={(event) =>
          onChange({
            ...value,
            viewport: event.currentTarget.checked ? { x: 0, y: 0, width: 1, height: 1 } : undefined,
          })
        }
      />
      {value.viewport ? (
        <Stack gap="sm">
          <PositionFields
            label="Crop"
            min={-100}
            max={200}
            x={value.viewport.x}
            y={value.viewport.y}
            onChange={(position) => {
              onChange({ ...value, viewport: { ...value.viewport!, ...position } });
            }}
          />
          <Group grow>
            {(['width', 'height'] as const).map((dimension) => (
              <NumberInput
                clampBehavior="strict"
                allowLeadingZeros={false}
                key={dimension}
                label={dimension === 'width' ? 'Width (%)' : 'Height (%)'}
                min={1}
                max={300}
                value={value.viewport![dimension] * 100}
                onChange={(next) =>
                  onChange({
                    ...value,
                    viewport: { ...value.viewport!, [dimension]: (typeof next === 'number' ? next : 1) / 100 },
                  })
                }
              />
            ))}
          </Group>
        </Stack>
      ) : null}
    </>
  );
}

function BoardStormFields({ value, onChange }: BoardSceneFieldsProps) {
  return (
    <>
      <Switch
        label="Show storm"
        checked={Boolean(value.storm)}
        onChange={(event) => onChange({ ...value, storm: event.currentTarget.checked ? { angle: 0 } : undefined })}
      />
      {value.storm ? (
        <NumberInput
          clampBehavior="strict"
          allowLeadingZeros={false}
          label="Storm angle"
          description="Degrees counterclockwise from the right edge."
          min={-360}
          max={360}
          value={value.storm.angle}
          onChange={(angle) => onChange({ ...value, storm: { angle: typeof angle === 'number' ? angle : 0 } })}
        />
      ) : null}
    </>
  );
}

function BoardSceneFields({ value, references, onChange }: BoardSceneFieldsProps) {
  return (
    <Stack gap="md">
      <Select
        label="Board"
        data={RULEBOOK_BOARD_DEFINITIONS.map((board) => ({ value: board.id, label: board.name }))}
        value={value.boardId}
        onChange={(boardId) => {
          if (boardId) {
            onChange({ ...value, boardId });
          }
        }}
      />
      <Textarea
        label="Caption"
        autosize
        minRows={2}
        value={value.caption}
        onChange={(event) => onChange({ ...value, caption: event.currentTarget.value })}
      />
      <Select
        label="Board size"
        value={value.size ?? 'compact'}
        data={[
          { value: 'compact', label: 'Compact' },
          { value: 'fit-width', label: 'Fill available width' },
        ]}
        onChange={(size) => {
          if (size === 'compact' || size === 'fit-width') {
            onChange({ ...value, size });
          }
        }}
      />
      <BoardViewportFields value={value} references={references} onChange={onChange} />
      <BoardStormFields value={value} references={references} onChange={onChange} />
      <Accordion multiple>
        <BoardPlayerFields value={value} references={references} onChange={onChange} />
        <BoardTroopFields value={value} references={references} onChange={onChange} />
        <BoardHighlightFields value={value} references={references} onChange={onChange} />
        <BoardRouteFields value={value} references={references} onChange={onChange} />
        <BoardAnnotationFields value={value} references={references} onChange={onChange} />
      </Accordion>
    </Stack>
  );
}

export function BoardSceneEdit({
  value,
  onChange,
  references = emptyReferences,
}: RulebookBlockEditorProps<'board-scene'>) {
  return <BoardSceneFields value={value} onChange={onChange} references={references} />;
}

type MovementGroup = RulebookPieceMovementValue['left'];
function MovementGroupEdit({
  label,
  value,
  onChange,
  references,
}: {
  label: string;
  value: MovementGroup;
  onChange: (value: MovementGroup) => void;
  references: RulebookEditorReferences;
}) {
  return (
    <Stack gap="md">
      <TextInput
        label="Group label"
        aria-label={`${label} group label`}
        value={value.label}
        onChange={(event) => onChange({ ...value, label: event.currentTarget.value })}
      />
      <ControlBlock
        title="Pieces"
        tool={
          <ListLengthActions
            addLabel={`Add ${label} piece`}
            addDisabled={value.pieces.length >= 64}
            removeLabel={`Remove last ${label} piece`}
            removeDisabled={!value.pieces.length}
            onAdd={() =>
              onChange({
                ...value,
                pieces: [
                  ...value.pieces,
                  { id: createRulebookLocalId(value.pieces.map((piece) => piece.id)), kind: 'source', count: 1 },
                ],
              })
            }
            onRemove={() => onChange({ ...value, pieces: value.pieces.slice(0, -1) })}
          />
        }
        input={
          <Stack gap="md">
            {value.pieces.map((piece, index) => {
              const update = (next: typeof piece) =>
                onChange({ ...value, pieces: value.pieces.map((entry) => (entry.id === piece.id ? next : entry)) });
              return (
                <Stack key={piece.id} gap="sm">
                  <Select
                    label="Piece type"
                    aria-label={`${label} piece ${index + 1} type`}
                    value={piece.kind}
                    data={[
                      { value: 'source', label: 'Card, leader or token' },
                      { value: 'troops', label: 'Troops' },
                    ]}
                    onChange={(kind) => {
                      if (kind === 'source' || kind === 'troops') {
                        update(
                          kind === 'source'
                            ? { id: piece.id, kind, count: piece.count, label: piece.label }
                            : { id: piece.id, kind, count: piece.count, label: piece.label, face: 'front' }
                        );
                      }
                    }}
                  />
                  <TextInput
                    label="Label"
                    aria-label={`${label} piece ${index + 1} label`}
                    value={piece.label ?? ''}
                    onChange={(event) => update({ ...piece, label: event.currentTarget.value || undefined })}
                  />
                  {piece.kind === 'source' ? (
                    <>
                      <BattleSourceControl
                        title={`${label} piece ${index + 1}`}
                        source={piece.source}
                        references={references}
                        onChange={(source) => update({ ...piece, source })}
                      />
                      <NumberInput
                        clampBehavior="strict"
                        allowLeadingZeros={false}
                        label="Count"
                        aria-label={`${label} piece ${index + 1} count`}
                        min={0}
                        max={100}
                        allowDecimal={false}
                        value={piece.count}
                        onChange={(count) => update({ ...piece, count: typeof count === 'number' ? count : 0 })}
                      />
                    </>
                  ) : (
                    <TroopFields
                      label={`${label} piece ${index + 1}`}
                      value={piece}
                      references={references}
                      onChange={(fields) => update({ ...piece, ...fields })}
                    />
                  )}
                </Stack>
              );
            })}
          </Stack>
        }
      />
    </Stack>
  );
}

export function PieceMovementEdit({
  value,
  onChange,
  references = emptyReferences,
}: RulebookBlockEditorProps<'piece-movement'>) {
  return (
    <Stack gap="md">
      <Group grow>
        <TextInput
          label="Step"
          value={value.step}
          onChange={(event) => onChange({ ...value, step: event.currentTarget.value })}
        />
        <TextInput
          label="Title"
          value={value.title}
          onChange={(event) => onChange({ ...value, title: event.currentTarget.value })}
        />
      </Group>
      <Textarea
        label="Explanation"
        autosize
        value={value.caption}
        onChange={(event) => onChange({ ...value, caption: event.currentTarget.value })}
      />
      <TextInput
        label="Outcome"
        value={value.outcome ?? ''}
        onChange={(event) => onChange({ ...value, outcome: event.currentTarget.value || undefined })}
      />
      <PieceTransferFields
        value={value}
        references={references}
        onChange={(fields) => onChange({ ...value, ...fields })}
      />
      <Switch
        label="Include board scene"
        checked={Boolean(value.board)}
        onChange={(event) => onChange({ ...value, board: event.currentTarget.checked ? { ...emptyBoard } : undefined })}
      />
      {value.board ? (
        <BoardSceneFields
          value={value.board}
          references={references}
          onChange={(board) => onChange({ ...value, board })}
        />
      ) : null}
      <MovementNotesFields value={value} references={references} onChange={onChange} />
    </Stack>
  );
}

export function BattleComparisonEdit({
  value,
  onChange,
  references = emptyReferences,
}: RulebookBlockEditorProps<'battle-comparison'>) {
  return (
    <Accordion multiple defaultValue={['0']}>
      {value.examples.map((example, index) => (
        <Accordion.Item key={index} value={String(index)}>
          <Accordion.Control>
            Example {index + 1}: {example.title || 'Battle plan'}
          </Accordion.Control>
          <Accordion.Panel>
            <BattleStepEdit
              value={example}
              hideStep
              labelPrefix={`Example ${index + 1} `}
              references={references}
              onChange={(next) =>
                onChange({ ...value, examples: index === 0 ? [next, value.examples[1]] : [value.examples[0], next] })
              }
            />
          </Accordion.Panel>
        </Accordion.Item>
      ))}
    </Accordion>
  );
}

function MovementNotesFields({
  value,
  references,
  onChange,
}: {
  value: RulebookPieceMovementValue;
  references: RulebookEditorReferences;
  onChange: (value: RulebookPieceMovementValue) => void;
}) {
  return (
    <ControlBlock
      title="Notes"
      tool={
        <ListLengthActions
          addLabel="Add movement note"
          addDisabled={(value.notes?.length ?? 0) >= 64}
          removeLabel="Remove last movement note"
          removeDisabled={!value.notes?.length}
          onAdd={() =>
            onChange({
              ...value,
              notes: [
                ...(value.notes ?? []),
                { id: createRulebookLocalId((value.notes ?? []).map((note) => note.id)), label: '', count: 1 },
              ],
            })
          }
          onRemove={() => onChange({ ...value, notes: value.notes?.slice(0, -1) })}
        />
      }
      input={
        <Stack gap="md">
          {value.notes?.map((note, index) => {
            const update = (fields: Partial<typeof note>) =>
              onChange({
                ...value,
                notes: value.notes?.map((entry) => (entry.id === note.id ? { ...entry, ...fields } : entry)),
              });
            return (
              <Stack gap="sm" key={note.id}>
                <Textarea
                  label="Note"
                  aria-label={`Movement note ${index + 1}`}
                  value={note.label}
                  onChange={(event) => update({ label: event.currentTarget.value })}
                />
                <BattleSourceControl
                  title={`Note ${index + 1} illustration`}
                  source={note.source}
                  references={references}
                  onChange={(source) => update({ source })}
                />
                <NumberInput
                  clampBehavior="strict"
                  allowLeadingZeros={false}
                  label="Count"
                  aria-label={`Note ${index + 1} count`}
                  min={0}
                  max={100}
                  allowDecimal={false}
                  value={note.count}
                  onChange={(count) => update({ count: typeof count === 'number' ? count : 0 })}
                />
              </Stack>
            );
          })}
        </Stack>
      }
    />
  );
}

function PieceTransferFields({
  value,
  onChange,
  references,
}: {
  value: Pick<RulebookPieceMovementValue, 'left' | 'right' | 'direction'>;
  references: RulebookEditorReferences;
  onChange: (value: Pick<RulebookPieceMovementValue, 'left' | 'right' | 'direction'>) => void;
}) {
  return (
    <Stack gap="md">
      {' '}
      <Select
        label="Movement"
        value={value.direction ?? 'none'}
        data={[
          { value: 'none', label: 'No arrow' },
          { value: 'right', label: 'Move right' },
          { value: 'exchange', label: 'Exchange' },
        ]}
        onChange={(direction) => {
          if (direction === 'none' || direction === 'right' || direction === 'exchange') {
            onChange({ ...value, direction });
          }
        }}
      />
      <Accordion multiple defaultValue={['left']}>
        {(['left', 'right'] as const).map((side) => (
          <Accordion.Item key={side} value={side}>
            <Accordion.Control>{side === 'left' ? 'Left group' : 'Right group'}</Accordion.Control>
            <Accordion.Panel>
              <MovementGroupEdit
                label={side}
                value={value[side]}
                references={references}
                onChange={(group) => onChange({ ...value, [side]: group })}
              />
            </Accordion.Panel>
          </Accordion.Item>
        ))}
      </Accordion>
    </Stack>
  );
}

export function PieceTransferEdit({
  value,
  onChange,
  references = emptyReferences,
}: RulebookBlockEditorProps<'piece-transfer'>) {
  return (
    <PieceTransferFields
      value={value}
      references={references}
      onChange={(fields) => onChange({ ...value, ...fields })}
    />
  );
}

function BoardRouteFields({ value, onChange }: BoardSceneFieldsProps) {
  const routes = value.routes ?? [];
  const parts = resolveRulebookBoardDefinition(value.boardId)?.geometry.parts ?? [];
  const territoryOptions = parts.map((part) => ({ value: part.key, label: part.label ?? part.key }));
  const update = (index: number, route: NonNullable<RulebookBoardSceneValue['routes']>[number]) =>
    onChange({ ...value, routes: routes.map((entry, i) => (i === index ? route : entry)) });
  return (
    <Accordion.Item value="routes">
      <Accordion.Control>Routes ({routes.length})</Accordion.Control>
      <Accordion.Panel>
        <Stack gap="md">
          <ListLengthActions
            addLabel="Add route"
            addDisabled={routes.length >= 64 || !parts.length}
            removeLabel="Remove last route"
            removeDisabled={!routes.length}
            onAdd={() =>
              onChange({
                ...value,
                routes: [
                  ...routes,
                  {
                    id: createRulebookLocalId(routes.map((route) => route.id)),
                    label: 'Route',
                    direction: 'forward',
                    waypoints: [{ territory: parts[0]!.key }, { territory: (parts[1] ?? parts[0])!.key }],
                  },
                ],
              })
            }
            onRemove={() => onChange({ ...value, routes: routes.slice(0, -1) })}
          />
          {routes.map((route, routeIndex) => (
            <Stack gap="sm" key={route.id}>
              <TextInput
                label={`Route ${routeIndex + 1} label`}
                value={route.label}
                onChange={(event) => update(routeIndex, { ...route, label: event.currentTarget.value })}
              />
              <ColorInput
                label="Route color"
                format="hex"
                value={route.color ?? '#215f89'}
                onChange={(color) => {
                  if (/^#[0-9a-fA-F]{6}$/.test(color)) {
                    update(routeIndex, { ...route, color });
                  }
                }}
              />
              <Select
                label="Arrows"
                value={route.direction}
                data={[
                  { value: 'forward', label: 'Forward' },
                  { value: 'both', label: 'Both directions' },
                  { value: 'none', label: 'No arrows' },
                ]}
                onChange={(direction) => {
                  if (direction === 'forward' || direction === 'both' || direction === 'none') {
                    update(routeIndex, { ...route, direction });
                  }
                }}
              />
              {route.waypoints.map((point, pointIndex) => (
                <Stack gap="xs" key={pointIndex}>
                  <Select
                    label={`Waypoint ${pointIndex + 1}`}
                    searchable
                    data={territoryOptions}
                    value={point.territory}
                    onChange={(territory) => {
                      if (territory) {
                        update(routeIndex, {
                          ...route,
                          waypoints: route.waypoints.map((entry, i) => (i === pointIndex ? { territory } : entry)),
                        });
                      }
                    }}
                  />
                  <Switch
                    label={`Position waypoint ${pointIndex + 1} manually`}
                    checked={Boolean(point.position)}
                    onChange={(event) => {
                      const part = parts.find((entry) => entry.key === point.territory);
                      const position = event.currentTarget.checked
                        ? { x: part ? part.x + part.width / 2 : 0.5, y: part ? part.y + part.height / 2 : 0.5 }
                        : undefined;
                      update(routeIndex, {
                        ...route,
                        waypoints: route.waypoints.map((entry, i) =>
                          i === pointIndex ? { ...entry, position } : entry
                        ),
                      });
                    }}
                  />
                  {point.position ? (
                    <PositionFields
                      label={`Waypoint ${pointIndex + 1}`}
                      {...point.position}
                      onChange={(position) =>
                        update(routeIndex, {
                          ...route,
                          waypoints: route.waypoints.map((entry, i) =>
                            i === pointIndex ? { ...entry, position: { ...point.position!, ...position } } : entry
                          ),
                        })
                      }
                    />
                  ) : null}
                </Stack>
              ))}
              <ListLengthActions
                addLabel="Add waypoint"
                addDisabled={route.waypoints.length >= 64 || !parts.length}
                removeLabel="Remove last waypoint"
                removeDisabled={route.waypoints.length <= 2}
                onAdd={() =>
                  update(routeIndex, { ...route, waypoints: [...route.waypoints, { territory: parts[0]!.key }] })
                }
                onRemove={() =>
                  update(routeIndex, {
                    ...route,
                    waypoints: route.waypoints.slice(0, -1),
                    blockedAfter:
                      route.blockedAfter !== undefined && route.blockedAfter >= route.waypoints.length - 2
                        ? undefined
                        : route.blockedAfter,
                  })
                }
              />
              <Select
                label="Blocked segment"
                clearable
                value={route.blockedAfter === undefined ? null : String(route.blockedAfter)}
                data={route.waypoints
                  .slice(0, -1)
                  .map((_, i) => ({ value: String(i), label: `Waypoint ${i + 1} to ${i + 2}` }))}
                onChange={(segment) =>
                  update(routeIndex, { ...route, blockedAfter: segment === null ? undefined : Number(segment) })
                }
              />
            </Stack>
          ))}
        </Stack>
      </Accordion.Panel>
    </Accordion.Item>
  );
}
