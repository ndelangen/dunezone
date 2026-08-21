import { Box, Group, Radio, SegmentedControl, Stack, Switch, Text, UnstyledButton } from '@mantine/core';
import { ControlBlock } from '@ui/control/ControlBlock';
import { useState } from 'react';
import type { ReactNode } from 'react';

import { TokenProof } from './TokenEditor';
import type { TokenDraft } from './TokenEditor';

/*
 * PROTOTYPE — wayfinder #594, map #590. Throwaway.
 *
 * Three variants of the token editor's back section, switchable with ?variant= on the real edit
 * route, answering how three back modes present: an authored back, the same face front and back
 * (#588), and a reference to another token's back (#589).
 *
 * Mode lives in local state here and never patches the draft, so flipping modes cannot dirty or
 * save anything. The picker is the real one, so its own presentation can be judged beside the
 * control; only the mode choice is stubbed.
 */

export type BackMode = 'authored' | 'same' | 'reference';

export const BACK_MODE_VARIANTS = [
  { key: 'A', name: 'Toggle, then choose' },
  { key: 'B', name: 'One three-way control' },
  { key: 'C', name: 'Choose by looking' },
] as const;

const MODE_COPY: Record<BackMode, { label: string; hint: string }> = {
  authored: { label: 'Authored here', hint: 'Compose a back of its own, in the Back chapters.' },
  same: { label: 'Same as front', hint: 'One artwork, printed both sides.' },
  reference: { label: "Another token's back", hint: 'Point at a token whose back is authored.' },
};

type VariantProps = {
  draft: TokenDraft;
  type: string;
  backPicker: (disabled: boolean) => ReactNode;
  mode: BackMode;
  setMode: (mode: BackMode) => void;
};

/** The body under whichever control the variant used, so the three variants disagree only about the control. */
function ModeBody({ backPicker, mode }: Omit<VariantProps, 'setMode'>) {
  switch (mode) {
    case 'authored':
      return <Text size="sm">The Back face and Back rim chapters above edit it.</Text>;
    case 'same':
      return <Text size="sm">Nothing to edit. The front is the back.</Text>;
    case 'reference':
      return <>{backPicker(false)}</>;
  }
}

function VariantA({ draft, type, backPicker, mode, setMode }: VariantProps) {
  return (
    <ControlBlock
      title="Backside"
      description="Every token has one."
      input={
        <Stack gap="sm">
          <Switch
            label="Same front and back"
            checked={mode === 'same'}
            onChange={(event) => setMode(event.currentTarget.checked ? 'same' : 'authored')}
          />
          {mode !== 'same' ? (
            <Radio.Group value={mode} onChange={(next) => setMode(next as BackMode)}>
              <Stack gap={4}>
                <Radio value="authored" label={MODE_COPY.authored.label} />
                <Radio value="reference" label={MODE_COPY.reference.label} />
              </Stack>
            </Radio.Group>
          ) : null}
          <ModeBody draft={draft} type={type} backPicker={backPicker} mode={mode} />
        </Stack>
      }
    />
  );
}

function VariantB({ draft, type, backPicker, mode, setMode }: VariantProps) {
  return (
    <ControlBlock
      title="Backside"
      description={MODE_COPY[mode].hint}
      input={
        <Stack gap="sm">
          <SegmentedControl
            fullWidth
            value={mode}
            onChange={(next) => setMode(next as BackMode)}
            data={[
              { value: 'authored', label: 'Authored' },
              { value: 'same', label: 'Same as front' },
              { value: 'reference', label: 'Reference' },
            ]}
          />
          <ModeBody draft={draft} type={type} backPicker={backPicker} mode={mode} />
        </Stack>
      }
    />
  );
}

const TILE = 132;

/** A back drawn at tile size, or a caption where there is nothing to draw yet. */
function Tile({
  active,
  label,
  onSelect,
  children,
}: {
  active: boolean;
  label: string;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <UnstyledButton onClick={onSelect} aria-pressed={active} style={{ flex: '0 0 auto' }}>
      <Stack gap={6} align="center">
        <Box
          style={{
            width: TILE,
            height: TILE,
            display: 'grid',
            placeItems: 'center',
            borderRadius: 8,
            padding: 6,
            outline: active ? '2px solid var(--mantine-color-dune-6)' : '1px solid var(--mantine-color-gray-4)',
          }}
        >
          {children}
        </Box>
        <Text size="xs" fw={active ? 700 : 400}>
          {label}
        </Text>
      </Stack>
    </UnstyledButton>
  );
}

function VariantC({ draft, type, backPicker, mode, setMode }: VariantProps) {
  return (
    <ControlBlock
      title="Backside"
      description="Pick the one you want to see on the table."
      input={
        <Stack gap="sm">
          <Group gap="md" wrap="wrap" align="flex-start">
            <Tile active={mode === 'authored'} label="Authored here" onSelect={() => setMode('authored')}>
              {draft.back.mode === 'custom' ? (
                <TokenProof face={draft.back.face} type={type} width={TILE - 12} />
              ) : (
                <Text size="xs" c="dimmed" ta="center">
                  Not composed yet
                </Text>
              )}
            </Tile>
            <Tile active={mode === 'same'} label="Same as front" onSelect={() => setMode('same')}>
              <TokenProof face={draft.front} type={type} width={TILE - 12} />
            </Tile>
            <Tile active={mode === 'reference'} label="Another token's back" onSelect={() => setMode('reference')}>
              <Text size="xs" c="dimmed" ta="center">
                Choose a token
              </Text>
            </Tile>
          </Group>
          {mode === 'reference' ? backPicker(false) : null}
        </Stack>
      }
    />
  );
}

export function BackModesVariant({ variant, ...props }: VariantProps & { variant: string }) {
  switch (variant) {
    case 'B':
      return <VariantB {...props} />;
    case 'C':
      return <VariantC {...props} />;
    default:
      return <VariantA {...props} />;
  }
}

/** Local mode state, so the prototype never patches or saves. */
export function useBackModePrototype(draft: TokenDraft) {
  return useState<BackMode>(draft.back.mode === 'custom' ? 'authored' : 'reference');
}
