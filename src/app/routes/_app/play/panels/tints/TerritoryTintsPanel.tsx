import { ActionIcon, Button, Group, Stack, Text, Tooltip } from '@mantine/core';
import type { TerritoryTint, TerritoryTintAction } from '@shared/play/territoryTints';
import { Section } from '@ui/block/Section';
import { ConfirmDeleteAction } from '@ui/control/ConfirmDeleteAction';
import { Eye, EyeOff } from 'lucide-react';

import { NewTints, TintRow } from '../../../../../widgets/tabletop/TintControls';
import { TINTS_HELP } from '../../multiplayer/panelGuidance';

export type TintDraft = Omit<TerritoryTint, 'id'>;
export type TintSetting = Extract<TerritoryTintAction, { kind: 'tint-set' }>['setting'];

/** One tint as its row shows it: what it says under its name, whether its paintbrush is on, and which try at removing it this is. */
export type TintRowView = Readonly<{
  tint: TerritoryTint;
  summary: string;
  painting: boolean;
  /** Counts the removals the table refused, so the hold to remove can be tried again. */
  removalAttempt: number;
}>;

export type TerritoryTintsPanelProps = Readonly<{
  rows: readonly TintRowView[];
  /** Whether the viewer may change the tints. */
  canEdit: boolean;
  /** Whether a new tint fits: the viewer may change the tints and the table holds fewer than its most. */
  canCreate: boolean;
  presets: readonly TintDraft[];
  /** Makes a tint; `paint` switches its paintbrush on straight away. */
  onCreate: (tint: TintDraft, paint: boolean) => void;
  onBrush: (tintId: string) => void;
  onSet: (tintId: string, setting: TintSetting) => void;
  onColor: (tintId: string, color: string) => void;
  onRemove: (tintId: string) => void;
}>;

function Presets({
  presets,
  enabled,
  onCreate,
}: Readonly<{ presets: readonly TintDraft[]; enabled: boolean; onCreate: (tint: TintDraft) => void }>) {
  if (!presets.length) {
    return null;
  }
  return (
    <Stack gap={4}>
      <Text size="xs" c="dimmed">
        Presets
      </Text>
      <Group gap="xs">
        {presets.map((preset) => (
          <Button
            key={preset.name}
            size="compact-sm"
            variant="default"
            disabled={!enabled}
            onClick={() => onCreate(preset)}
          >
            {preset.name}
          </Button>
        ))}
      </Group>
    </Stack>
  );
}

/** Shared tints over territories: make one, then switch on its paintbrush and click territories on the board to add or remove them. */
export function TerritoryTintsPanel({
  rows,
  canEdit,
  canCreate,
  presets,
  onCreate,
  onBrush,
  onSet,
  onColor,
  onRemove,
}: TerritoryTintsPanelProps) {
  return (
    <Section hiddenHeading title="Territory tints" description={TINTS_HELP}>
      <Stack gap="xs">
        {rows.map(({ tint, summary, painting, removalAttempt }) => (
          <TintRow
            key={tint.id}
            tint={tint}
            summary={summary}
            painting={painting}
            enabled={canEdit}
            onBrush={() => onBrush(tint.id)}
            onOutline={() => onSet(tint.id, 'outline')}
            onStamp={(stamp) => onSet(tint.id, stamp)}
            onColor={(color) => onColor(tint.id, color)}
            before={
              <Tooltip label={tint.hidden ? `Show ${tint.name}` : `Hide ${tint.name}`}>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  aria-label={`Show ${tint.name}`}
                  aria-pressed={!tint.hidden}
                  disabled={!canEdit}
                  onClick={() => onSet(tint.id, 'hidden')}
                >
                  {tint.hidden ? <EyeOff size={18} /> : <Eye size={18} />}
                </ActionIcon>
              </Tooltip>
            }
            after={
              <ConfirmDeleteAction
                key={removalAttempt}
                label={`Remove ${tint.name}`}
                verb="remove"
                size="sm"
                pending={false}
                disabled={!canEdit}
                onConfirm={() => onRemove(tint.id)}
              />
            }
          />
        ))}
        <NewTints
          tints={rows.map((row) => row.tint)}
          enabled={canCreate}
          onCreate={(tint) => onCreate({ ...tint, territories: [] }, true)}
        />
        <Presets presets={presets} enabled={canCreate} onCreate={(tint) => onCreate(tint, false)} />
      </Stack>
    </Section>
  );
}
