import { Alert, Button, Group, Popover, Select, Stack, Text } from '@mantine/core';
import { IconAction } from '@ui/control/IconAction';
import { Check } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

interface AssignPopoverOption {
  value: string;
  /** How this choice reads, including any context the reader needs to tell two apart. */
  label: string;
}

export interface AssignPopoverProps {
  /**
   * What is being picked, singular and lowercase — `group`, `faction`.
   * Every label in the popover is derived from it, so a caller supplies one word instead of eight strings.
   */
  noun: string;
  /** The choices, already labelled: how a thing reads is the caller's knowledge, not this one's. */
  options: AssignPopoverOption[];
  /**
   * Commits the pick.
   * Rejecting shows the error's message inside the popover and leaves it open so the reader can try another choice; resolving closes it.
   * Anything the commit should ask first — a confirmation, a consequence the reader must accept — belongs here, in the caller: resolve `false` when the reader backs out, and the popover stays open with the pick intact.
   */
  onAssign: (value: string) => Promise<boolean | void>;
  disabled: boolean;
  /** True while the caller is still fetching the choices. */
  loading?: boolean;
  /** The trigger's glyph. */
  icon: ReactNode;
  /** Names the dropdown. Defaults to `Assign <noun>`. */
  title?: string;
  /**
   * The trigger's accessible name, when it differs from the dropdown's title — the trigger says what the reader is about to do ("Add a faction you own"), the dropdown says where they now are.
   */
  triggerLabel?: string;
  /** Overrides `Search <noun>s` on the field, where the product says it differently. */
  searchLabel?: string;
  /** Overrides `Assign selected <noun>` on the commit button. */
  submitLabel?: string;
  /** Lines under the title — why this exists, or what the pick costs. */
  descriptionLines?: string[];
  /** Replaces `No <noun>s are available yet.` when the caller knows a better reason. */
  emptyMessage?: string;
  size?: 'sm' | 'lg';
}

/** The dropdown's own name and any lines under it. Not a heading — see the note at the call site. */
function AssignPopoverHeading({
  labelId,
  title,
  descriptionLines,
}: {
  labelId: string;
  title: string;
  descriptionLines?: string[];
}) {
  return (
    <Stack gap={4}>
      {/* Not a heading: a popover is not part of the page outline, and the level it would have to
          claim depends on a caller this component cannot see. It names the dropdown through
          `aria-labelledby` instead. */}
      <Text id={labelId} fw={700} fz="h4">
        {title}
      </Text>
      {descriptionLines?.map((line) => (
        <Text key={line} size="sm" c="dimmed">
          {line}
        </Text>
      ))}
    </Stack>
  );
}

/** The pick itself, mounted only once there is something to choose from. */
function AssignPopoverPicker({
  noun,
  options,
  searchLabel,
  submitLabel,
  selected,
  onSelect,
  disabled,
  isAssigning,
  onCommit,
}: {
  noun: string;
  options: AssignPopoverOption[];
  searchLabel?: string;
  submitLabel?: string;
  selected: string;
  onSelect: (value: string) => void;
  disabled: boolean;
  isAssigning: boolean;
  onCommit: () => void;
}) {
  return (
    <Stack gap="md">
      <Select
        label={searchLabel ?? `Search ${noun}s`}
        value={selected || null}
        onChange={(value) => onSelect(value ?? '')}
        data={options}
        searchable
        clearable
        placeholder={`Type ${noun} name…`}
        nothingFoundMessage={`No matching ${noun}s`}
        comboboxProps={{ withinPortal: false }}
        disabled={disabled || isAssigning}
      />
      <Group justify="flex-end">
        <Button
          type="button"
          leftSection={<Check size={16} aria-hidden />}
          onClick={onCommit}
          disabled={disabled || !selected}
          loading={isAssigning}
        >
          {submitLabel ?? `Assign selected ${noun}`}
        </Button>
      </Group>
    </Stack>
  );
}

/** One line standing in for the picker while there is nothing to pick, or nothing yet loaded. */
function AssignPopoverPlaceholder({ children }: { children: string }) {
  return (
    <Text size="sm" c="dimmed">
      {children}
    </Text>
  );
}

/**
 * The pick and its commit: what is selected, whether a commit is in flight, and what went wrong.
 * 
 * Separate from the rendering because it is the only imperative part — the guard against a stale selection, the latch, and the two ways a commit can end without closing (a rejection, or a caller that resolved `false` because the reader backed out).
 */
function useAssignCommit({
  noun,
  options,
  onAssign,
  onAssigned,
}: Pick<AssignPopoverProps, 'noun' | 'options' | 'onAssign'> & { onAssigned: () => void }) {
  const [selected, setSelected] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isAssigning, setIsAssigning] = useState(false);
  const available = useMemo(() => new Set(options.map((option) => option.value)), [options]);

  const commit = async () => {
    if (!selected || !available.has(selected)) {
      setError(`That ${noun} is no longer available. Pick another.`);
      return;
    }

    setIsAssigning(true);
    setError(null);
    try {
      const committed = await onAssign(selected);
      if (committed !== false) {
        onAssigned();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not assign the ${noun}. Try again.`);
    } finally {
      setIsAssigning(false);
    }
  };

  return { selected, setSelected, error, isAssigning, commit };
}

function AssignPopoverBody({
  noun,
  options,
  onAssign,
  disabled,
  loading = false,
  title,
  searchLabel,
  submitLabel,
  descriptionLines,
  emptyMessage,
  labelId,
  onAssigned,
}: Omit<AssignPopoverProps, 'icon' | 'size' | 'triggerLabel'> & {
  labelId: string;
  onAssigned: () => void;
}) {
  const { selected, setSelected, error, isAssigning, commit } = useAssignCommit({
    noun,
    options,
    onAssign,
    onAssigned,
  });
  const hasOptions = !loading && options.length > 0;
  const isEmpty = !loading && options.length === 0;

  return (
    <Stack gap="md">
      <AssignPopoverHeading labelId={labelId} title={title ?? `Assign ${noun}`} descriptionLines={descriptionLines} />

      {error ? (
        <Alert color="red" title={`Could not assign this ${noun}`} role="alert">
          {error}
        </Alert>
      ) : null}

      {loading ? <AssignPopoverPlaceholder>{`Loading ${noun}s…`}</AssignPopoverPlaceholder> : null}

      {isEmpty ? (
        <AssignPopoverPlaceholder>{emptyMessage ?? `No ${noun}s are available yet.`}</AssignPopoverPlaceholder>
      ) : null}

      {hasOptions ? (
        <AssignPopoverPicker
          noun={noun}
          options={options}
          searchLabel={searchLabel}
          submitLabel={submitLabel}
          selected={selected}
          onSelect={setSelected}
          disabled={disabled}
          isAssigning={isAssigning}
          onCommit={() => void commit()}
        />
      ) : null}
    </Stack>
  );
}

/**
 * Picks one of a set and commits it, in a popover hung off an icon.
 * 
 * Callers own the choices and their labels, what committing means, and anything the reader must agree to first.
 * This owns the machine around that pick: the trigger, the dropdown that names itself for assistive tech, the searchable select, the in-flight latch, and the failure message shown in place rather than swallowed.
 * 
 * It replaced two components that asked the same question from opposite ends — one picked a group for an asset, one picked an asset for a group — and had drifted apart in their labels, their empty states, and whether a failure was announced at all.
 * Every label defaults from `noun`, so the two directions cannot drift apart by accident — a page overrides the words only where it means something different by them.
 */
export function AssignPopover({ icon, size = 'lg', ...body }: AssignPopoverProps) {
  const [opened, setOpened] = useState(false);
  const labelId = useId();

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-start"
      width={340}
      shadow="md"
      withArrow
      trapFocus
      returnFocus
    >
      <Popover.Target>
        <IconAction
          label={body.triggerLabel ?? body.title ?? `Assign ${body.noun}`}
          variant="light"
          size={size}
          disabled={body.disabled}
          onClick={() => setOpened((current) => !current)}
          icon={icon}
        />
      </Popover.Target>
      <Popover.Dropdown aria-labelledby={labelId}>
        {/* Remounted per opening, so a cancelled pick never reappears the next time. */}
        {opened ? <AssignPopoverBody {...body} labelId={labelId} onAssigned={() => setOpened(false)} /> : null}
      </Popover.Dropdown>
    </Popover>
  );
}
