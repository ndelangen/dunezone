import {
  Accordion,
  Button,
  Group,
  Loader,
  NumberInput,
  Select,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import type { RulebookBattleSideValue } from '@shared/rulebooks/battleStep';
import { createRulebookLocalId } from '@shared/rulebooks/contents';
import { projectRulebookSource } from '@shared/rulebooks/projectRenderDocument';
import type { RulebookSourceReference } from '@shared/rulebooks/sources';
import { ControlBlock } from '@ui/control/ControlBlock';
import { ListLengthActions } from '@ui/control/ListLengthActions';
import { lazy, Suspense, useState } from 'react';

import type { RulebookBlockEditorProps } from './rulebookBlockEditors';
import type { RulebookEditorReferences } from './rulebookVisualBlockEditors';

const FactionPicker = lazy(() =>
  import('@app/pickers/FactionPicker').then((module) => ({ default: module.FactionPicker }))
);
const RulebookSourcePicker = lazy(() =>
  import('@app/pickers/RulebookSourcePicker').then((module) => ({ default: module.RulebookSourcePicker }))
);
const emptyReferences = { assetsById: {}, factionsById: {} };

export function BattleSourceControl({
  title,
  source,
  references,
  card = false,
  onChange,
}: {
  title: string;
  source?: RulebookSourceReference;
  references: RulebookEditorReferences;
  card?: boolean;
  onChange: (source: RulebookSourceReference | undefined) => void;
}) {
  const [opened, setOpened] = useState(false);
  const resolved = projectRulebookSource(source, references.assetsById, references.factionsById);
  return (
    <ControlBlock
      title={title}
      input={
        <Stack gap="sm">
          <Group gap="sm">
            <Button variant="default" aria-label={`Choose ${title.toLowerCase()}`} onClick={() => setOpened(!opened)}>
              {resolved.status === 'ready'
                ? resolved.name
                : source
                  ? 'Unavailable source'
                  : `Choose ${title.toLowerCase()}`}
            </Button>
            {source ? (
              <Button variant="subtle" aria-label={`Clear ${title.toLowerCase()}`} onClick={() => onChange(undefined)}>
                Clear
              </Button>
            ) : null}
          </Group>
          {opened ? (
            <Suspense fallback={<Loader size="sm" aria-label="Loading sources" />}>
              <RulebookSourcePicker
                purpose={card ? 'card' : 'illustration'}
                initialKind={source?.kind ?? (card ? 'asset' : 'faction-member')}
                onPick={(next) => {
                  onChange(next);
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

type BattleSideFieldsProps = {
  label: string;
  value: RulebookBattleSideValue;
  references: RulebookEditorReferences;
  onChange: (next: RulebookBattleSideValue) => void;
};
type BattlePickerProps = {
  openPicker: 'faction' | 'card' | null;
  setOpenPicker: (picker: 'faction' | 'card' | null) => void;
};

function BattleFactionFields({
  label,
  value,
  references,
  onChange,
  openPicker,
  setOpenPicker,
}: BattleSideFieldsProps & BattlePickerProps) {
  const faction = value.factionId ? references.factionsById[value.factionId] : undefined;
  const update = (fields: Partial<RulebookBattleSideValue>) => onChange({ ...value, ...fields });
  return (
    <>
      <ControlBlock
        title="Faction"
        input={
          <Stack gap="sm">
            <Group gap="sm">
              <Button
                variant="default"
                aria-label={`Choose ${label.toLowerCase()} faction`}
                onClick={() => setOpenPicker(openPicker === 'faction' ? null : 'faction')}
              >
                {faction?.name ?? (value.factionId ? 'Unavailable faction' : 'Choose faction')}
              </Button>
              {value.factionId ? (
                <Button variant="subtle" onClick={() => update({ factionId: undefined, troops: [] })}>
                  Clear faction
                </Button>
              ) : null}
            </Group>
            {openPicker === 'faction' ? (
              <Suspense fallback={<Loader size="sm" aria-label="Loading factions" />}>
                <FactionPicker
                  copy={{
                    title: 'Choose faction',
                    intro: 'Use this faction and its troop artwork in the battle plan.',
                    errorTitle: 'Factions could not be loaded',
                    emptyMessage: 'No factions are available.',
                    confirmTitle: 'Selected faction',
                    confirmLabel: 'Use faction',
                    confirmIntent: 'positive',
                  }}
                  onPick={(picked) => {
                    update({ factionId: picked.id, troops: picked.id === value.factionId ? value.troops : [] });
                    setOpenPicker(null);
                  }}
                  onCancel={() => setOpenPicker(null)}
                />
              </Suspense>
            ) : null}
          </Stack>
        }
      />
    </>
  );
}

function BattleStrengthFields({ label, value, onChange }: BattleSideFieldsProps) {
  const update = (fields: Partial<RulebookBattleSideValue>) => onChange({ ...value, ...fields });
  return (
    <>
      <Group grow align="start">
        <NumberInput
          clampBehavior="strict"
          allowLeadingZeros={false}
          label="Dial"
          aria-label={`${label} dial`}
          min={0}
          max={200}
          step={0.5}
          decimalScale={1}
          value={value.dial}
          onChange={(dial) => {
            if (typeof dial === 'number') {
              update({ dial: Math.round(dial * 2) / 2 });
            } else if (dial === '') {
              update({ dial: 0 });
            }
          }}
        />
        <NumberInput
          clampBehavior="strict"
          allowLeadingZeros={false}
          label="Spice"
          aria-label={`${label} spice`}
          min={0}
          max={200}
          allowDecimal={false}
          value={value.spice}
          onChange={(spice) => update({ spice: typeof spice === 'number' ? spice : 0 })}
        />
        <NumberInput
          clampBehavior="strict"
          allowLeadingZeros={false}
          label="Adjustment"
          aria-label={`${label} adjustment`}
          min={-200}
          max={200}
          step={0.5}
          decimalScale={1}
          value={value.adjustment ?? ''}
          onChange={(adjustment) => {
            if (typeof adjustment === 'number') {
              update({ adjustment: Math.round(adjustment * 2) / 2 });
            } else if (adjustment === '') {
              update({ adjustment: undefined });
            }
          }}
        />
      </Group>
      <Text size="sm" c="dimmed">
        The dial is the troop strength shown in this step, including any adjustment. Hidden plans keep these values
        private.
      </Text>
    </>
  );
}

function BattleLeaderFields({ label, value, references, onChange }: BattleSideFieldsProps) {
  const update = (fields: Partial<RulebookBattleSideValue>) => onChange({ ...value, ...fields });
  return (
    <>
      <BattleSourceControl
        title={`${label} leader`}
        source={value.leader}
        references={references}
        onChange={(leader) => update({ leader, leaderKilled: leader ? value.leaderKilled : undefined })}
      />
      {value.leader ? (
        <Switch
          label="Leader killed"
          aria-label={`${label} leader killed`}
          checked={value.leaderKilled ?? false}
          onChange={(event) => update({ leaderKilled: event.currentTarget.checked })}
        />
      ) : null}
    </>
  );
}

function BattleCardFields({
  label,
  value,
  references,
  onChange,
  openPicker,
  setOpenPicker,
}: BattleSideFieldsProps & BattlePickerProps) {
  const update = (fields: Partial<RulebookBattleSideValue>) => onChange({ ...value, ...fields });
  return (
    <>
      <ControlBlock
        title="Played cards"
        description="These appear when the plan is revealed."
        tool={
          <ListLengthActions
            addLabel={`Add ${label.toLowerCase()} card`}
            removeLabel={`Remove last ${label.toLowerCase()} card`}
            removeDisabled={value.cards.length === 0}
            addDisabled={value.cards.length >= 4}
            onAdd={() => setOpenPicker(openPicker === 'card' ? null : 'card')}
            onRemove={() => update({ cards: value.cards.slice(0, -1) })}
          />
        }
        input={
          <Stack gap="sm">
            {openPicker === 'card' ? (
              <Suspense fallback={<Loader size="sm" aria-label="Loading cards" />}>
                <RulebookSourcePicker
                  purpose="card"
                  onPick={(source) => {
                    if (source.kind === 'asset') {
                      update({ cards: [...value.cards, source] });
                    }
                    setOpenPicker(null);
                  }}
                  onCancel={() => setOpenPicker(null)}
                />
              </Suspense>
            ) : null}
            {value.cards.map((source, index) => (
              <BattleSourceControl
                key={index}
                title={`${label} card ${index + 1}`}
                card
                source={source.assetId ? source : undefined}
                references={references}
                onChange={(next) =>
                  update({
                    cards:
                      next?.kind === 'asset'
                        ? value.cards.map((existing, position) => (position === index ? next : existing))
                        : value.cards.filter((_, position) => position !== index),
                  })
                }
              />
            ))}
          </Stack>
        }
      />
      {!value.revealed ? (
        <BattleSourceControl
          title={`${label} known card`}
          card
          source={value.knownCard}
          references={references}
          onChange={(next) => update({ knownCard: next?.kind === 'asset' ? next : undefined })}
        />
      ) : null}
    </>
  );
}

function BattleTroopRow({
  label,
  group,
  index,
  faction,
  troopOptions,
  onChange,
}: {
  label: string;
  group: RulebookBattleSideValue['troops'][number];
  index: number;
  faction: RulebookEditorReferences['factionsById'][string] | undefined;
  troopOptions: { value: string; label: string }[];
  onChange: (fields: Partial<RulebookBattleSideValue['troops'][number]>) => void;
}) {
  const selected = faction?.troops?.find((troop) => troop.troopId === group.troopId);
  const options = troopOptions.some((option) => option.value === group.troopId)
    ? troopOptions
    : [...troopOptions, { value: group.troopId, label: 'Unavailable troop' }];
  return (
    <Stack gap="sm">
      <Group grow>
        <Select
          label="Troop"
          aria-label={`${label} troop ${index + 1}`}
          data={options}
          value={group.troopId}
          onChange={(troopId) => {
            if (troopId) {
              onChange({ troopId, face: 'front' });
            }
          }}
        />
        <Select
          label="Face"
          aria-label={`${label} troop ${index + 1} face`}
          data={[
            { value: 'front', label: selected?.name || 'Front' },
            ...(selected?.back || group.face === 'back'
              ? [{ value: 'back', label: selected?.back?.name || 'Back' }]
              : []),
          ]}
          value={group.face}
          onChange={(face) => {
            if (face === 'front' || face === 'back') {
              onChange({ face });
            }
          }}
        />
      </Group>
      <Group grow>
        {(['supported', 'unsupported', 'uncommitted'] as const).map((field) => (
          <NumberInput
            clampBehavior="strict"
            allowLeadingZeros={false}
            key={field}
            label={field === 'supported' ? 'Supported' : field === 'unsupported' ? 'Unsupported' : 'Uncommitted'}
            aria-label={`${label} troop ${index + 1} ${field}`}
            min={0}
            max={100}
            allowDecimal={false}
            value={group[field]}
            onChange={(count) => onChange({ [field]: typeof count === 'number' ? count : 0 })}
          />
        ))}
      </Group>
    </Stack>
  );
}

function BattleTroopFields({ label, value, references, onChange }: BattleSideFieldsProps) {
  const faction = value.factionId ? references.factionsById[value.factionId] : undefined;
  const troopOptions = (faction?.troops ?? []).flatMap((troop) =>
    troop.troopId ? [{ value: troop.troopId, label: troop.name || 'Unnamed troop' }] : []
  );
  const update = (fields: Partial<RulebookBattleSideValue>) => onChange({ ...value, ...fields });
  return (
    <>
      <ControlBlock
        title="Troops"
        description="Choose troop faces and the counts visible at this point in the example."
        tool={
          <ListLengthActions
            addLabel={`Add ${label.toLowerCase()} troop group`}
            removeLabel={`Remove last ${label.toLowerCase()} troop group`}
            addDisabled={troopOptions.length === 0 || value.troops.length >= 16}
            removeDisabled={value.troops.length === 0}
            onAdd={() => {
              const troopId = troopOptions[0]?.value;
              if (troopId) {
                update({
                  troops: [
                    ...value.troops,
                    {
                      id: createRulebookLocalId(value.troops.map((troop) => troop.id)),
                      troopId,
                      face: 'front',
                      supported: 0,
                      unsupported: 0,
                      uncommitted: 0,
                    },
                  ],
                });
              }
            }}
            onRemove={() => update({ troops: value.troops.slice(0, -1) })}
          />
        }
        input={
          <Stack gap="md">
            {!faction ? <Text size="sm">Choose a faction to add its troops.</Text> : null}
            {value.troops.map((group, index) => (
              <BattleTroopRow
                key={group.id}
                label={label}
                group={group}
                index={index}
                faction={faction}
                troopOptions={troopOptions}
                onChange={(fields) =>
                  update({
                    troops: value.troops.map((troop) => (troop.id === group.id ? { ...troop, ...fields } : troop)),
                  })
                }
              />
            ))}
          </Stack>
        }
      />
    </>
  );
}

function BattleSideEdit({ label, value, references, onChange }: BattleSideFieldsProps) {
  const [openPicker, setOpenPicker] = useState<'faction' | 'card' | null>(null);
  const update = (fields: Partial<RulebookBattleSideValue>) => onChange({ ...value, ...fields });
  return (
    <Stack gap="md">
      <BattleFactionFields
        label={label}
        value={value}
        references={references}
        onChange={onChange}
        openPicker={openPicker}
        setOpenPicker={setOpenPicker}
      />
      <TextInput
        label="Role"
        aria-label={`${label} role`}
        placeholder="Aggressor or defender"
        value={value.role}
        onChange={(event) => update({ role: event.currentTarget.value })}
      />
      <Switch
        label="Reveal this battle plan"
        aria-label={`Reveal ${label.toLowerCase()} battle plan`}
        checked={value.revealed}
        onChange={(event) => update({ revealed: event.currentTarget.checked })}
      />
      <BattleStrengthFields label={label} value={value} references={references} onChange={onChange} />
      <BattleLeaderFields label={label} value={value} references={references} onChange={onChange} />
      <BattleCardFields
        label={label}
        value={value}
        references={references}
        onChange={onChange}
        openPicker={openPicker}
        setOpenPicker={setOpenPicker}
      />
      <BattleTroopFields label={label} value={value} references={references} onChange={onChange} />
      <TextInput
        label="Result"
        aria-label={`${label} result`}
        placeholder="Optional result beside this plan"
        value={value.result ?? ''}
        onChange={(event) => update({ result: event.currentTarget.value || undefined })}
      />
    </Stack>
  );
}

export function BattlePlansEdit({
  value,
  references = emptyReferences,
  onChange,
}: RulebookBlockEditorProps<'battle-plans'>) {
  return (
    <Stack gap="md">
      <Switch
        label="Show faction names and roles"
        checked={value.showSideLabels ?? true}
        onChange={(event) => onChange({ ...value, showSideLabels: event.currentTarget.checked })}
      />
      <Accordion multiple defaultValue={['left']}>
        {(['left', 'right'] as const).map((side) => (
          <Accordion.Item key={side} value={side}>
            <Accordion.Control>{side === 'left' ? 'Left battle plan' : 'Right battle plan'}</Accordion.Control>
            <Accordion.Panel>
              <BattleSideEdit
                label={side === 'left' ? 'Left' : 'Right'}
                value={value[side]}
                references={references}
                onChange={(next) => onChange({ ...value, [side]: next })}
              />
            </Accordion.Panel>
          </Accordion.Item>
        ))}
      </Accordion>
    </Stack>
  );
}

export function BattleStepEdit({
  value,
  references = emptyReferences,
  onChange,
  hideStep = false,
  labelPrefix = '',
}: RulebookBlockEditorProps<'battle-step'> & { hideStep?: boolean; labelPrefix?: string }) {
  return (
    <Stack gap="md">
      <Group grow align="start">
        {hideStep ? null : (
          <TextInput
            label="Step"
            aria-label={`${labelPrefix}Step`}
            value={value.step}
            onChange={(event) => onChange({ ...value, step: event.currentTarget.value })}
          />
        )}
        <TextInput
          label="Title"
          aria-label={`${labelPrefix}Title`}
          value={value.title}
          onChange={(event) => onChange({ ...value, title: event.currentTarget.value })}
        />
      </Group>
      <Textarea
        label="Explanation"
        aria-label={`${labelPrefix}Explanation`}
        autosize
        minRows={2}
        value={value.caption}
        onChange={(event) => onChange({ ...value, caption: event.currentTarget.value })}
      />
      <TextInput
        label="Outcome"
        aria-label={`${labelPrefix}Outcome`}
        value={value.outcome ?? ''}
        onChange={(event) => onChange({ ...value, outcome: event.currentTarget.value || undefined })}
      />
      <Switch
        label="Show faction names and roles"
        aria-label={`${labelPrefix}Show faction names and roles`}
        checked={value.showSideLabels ?? true}
        onChange={(event) => onChange({ ...value, showSideLabels: event.currentTarget.checked })}
      />
      <Accordion multiple defaultValue={['left']}>
        {(['left', 'right'] as const).map((side) => (
          <Accordion.Item key={side} value={side}>
            <Accordion.Control>{`${labelPrefix}${side === 'left' ? 'Left battle plan' : 'Right battle plan'}`}</Accordion.Control>
            <Accordion.Panel>
              <BattleSideEdit
                label={`${labelPrefix}${side === 'left' ? 'Left' : 'Right'}`}
                value={value[side]}
                references={references}
                onChange={(next) => onChange({ ...value, [side]: next })}
              />
            </Accordion.Panel>
          </Accordion.Item>
        ))}
      </Accordion>
      <BattleDialogueFields
        labelPrefix={labelPrefix}
        value={value.dialogue}
        onChange={(dialogue) => onChange({ ...value, dialogue })}
      />
    </Stack>
  );
}

function BattleDialogueFields({
  labelPrefix,
  value,
  onChange,
}: {
  labelPrefix: string;
  value: RulebookBlockEditorProps<'battle-step'>['value']['dialogue'];
  onChange: (value: RulebookBlockEditorProps<'battle-step'>['value']['dialogue']) => void;
}) {
  return (
    <ControlBlock
      title="Dialogue"
      tool={
        <ListLengthActions
          addLabel={`${labelPrefix}Add dialogue`}
          addDisabled={(value?.length ?? 0) >= 8}
          removeLabel={`${labelPrefix}Remove last dialogue`}
          removeDisabled={!value?.length}
          onAdd={() => onChange([...(value ?? []), { speaker: 'left', text: '' }])}
          onRemove={() => onChange(value?.slice(0, -1))}
        />
      }
      input={
        <Stack gap="sm">
          {value?.map((line, index) => (
            <Group key={index} grow align="start">
              <Select
                label="Speaker"
                aria-label={`${labelPrefix}Dialogue ${index + 1} speaker`}
                data={[
                  { value: 'left', label: 'Left faction' },
                  { value: 'right', label: 'Right faction' },
                ]}
                value={line.speaker}
                onChange={(speaker) => {
                  if (speaker === 'left' || speaker === 'right') {
                    onChange(value?.map((entry, position) => (position === index ? { ...entry, speaker } : entry)));
                  }
                }}
              />
              <Textarea
                label="Speech"
                aria-label={`${labelPrefix}Dialogue ${index + 1} speech`}
                autosize
                minRows={2}
                value={line.text}
                onChange={(event) =>
                  onChange(
                    value?.map((entry, position) =>
                      position === index ? { ...entry, text: event.currentTarget.value } : entry
                    )
                  )
                }
              />
            </Group>
          ))}
        </Stack>
      }
    />
  );
}
