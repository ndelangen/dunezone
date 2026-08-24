import { Alert, Combobox, Popover, ScrollArea, Stack, Text, TextInput, useCombobox } from '@mantine/core';
import { IconAction } from '@ui/control/IconAction';
import { createContext, useContext, useEffect, useId, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

interface AssignPopoverOption {
  value: string;
  /** How this choice reads, including any context the reader needs to tell two apart. */
  label: string;
}

/**
 * What the pane owns and its content has to be told: the words every label derives from, the id the dropdown is named by, whether the caller has the control disabled, and how to close after a commit.
 * Through context rather than props because the content is whatever the caller mounts, which may be a
 * Picker that fetches its own choices and knows none of this.
 */
type AssignPaneValue = {
  noun: string;
  title: string;
  labelId: string;
  disabled: boolean;
  close: () => void;
};

const AssignPaneContext = createContext<AssignPaneValue | null>(null);

/** What the pane can tell its content. Exported so a Picker mounted inside names things the same way. */
export function useAssignPane(): AssignPaneValue {
  const pane = useContext(AssignPaneContext);
  if (!pane) {
    throw new Error('AssignOptions renders inside an AssignPopover, which owns the pane it names and closes.');
  }
  return pane;
}

export interface AssignPopoverProps {
  /**
   * What is being picked, singular and lowercase: `group`, `faction`.
   * Every label in the popover is derived from it, so a caller supplies one word instead of eight strings.
   */
  noun: string;
  disabled: boolean;
  /** The trigger's glyph. */
  icon: ReactNode;
  /** Names the dropdown. Defaults to `Assign <noun>`. */
  title?: string;
  /**
   * The trigger's accessible name, when it differs from the dropdown's title.
   * The trigger says what the reader is about to do ("Add a faction you own");
   * the dropdown says where they now are.
   */
  triggerLabel?: string;
  size?: 'sm' | 'lg';
  /**
   * What fills the pane, mounted only while it is open and torn down when it closes.
   * Usually `AssignOptions` with choices the caller already holds;
   * a caller whose choices have to be fetched mounts a Picker here instead, whose read then lives no longer than the opening.
   */
  children: ReactNode;
}

export interface AssignOptionsProps {
  /** The choices, already labelled: how a thing reads is the caller's knowledge, not this one's. */
  options: AssignPopoverOption[];
  /**
   * Commits the pick.
   * Rejecting shows the error's message inside the popover and leaves it open so the reader can try another choice;
   * resolving closes it.
   * Anything the commit should ask first (a confirmation, a consequence the reader must accept) belongs here, in the caller: resolve `false` when the reader backs out, and the popover stays open.
   */
  onAssign: (value: string) => Promise<boolean | void>;
  /** True while the caller is still fetching the choices. */
  loading?: boolean;
  /** Overrides `Search <noun>s` on the field, where the product says it differently. */
  searchLabel?: string;
  /** Replaces `No <noun>s are available yet.` when the caller knows a better reason. */
  emptyMessage?: string;
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
 * The commit: whether one is in flight, and what went wrong.
 *
 * Separate from the rendering because it is the only imperative part: the guard against a stale option, the latch, and the two ways a commit can end without closing (a rejection, or a caller that resolved `false` because the reader backed out).
 */
function useAssignCommit({
  noun,
  options,
  onAssign,
  onAssigned,
}: Pick<AssignOptionsProps, 'options' | 'onAssign'> & { noun: string; onAssigned: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [isAssigning, setIsAssigning] = useState(false);
  const available = useMemo(() => new Set(options.map((option) => option.value)), [options]);

  const commit = async (value: string) => {
    if (isAssigning) {
      return;
    }
    if (!available.has(value)) {
      setError(`That ${noun} is no longer available. Pick another.`);
      return;
    }

    setIsAssigning(true);
    setError(null);
    try {
      const committed = await onAssign(value);
      if (committed !== false) {
        onAssigned();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not assign the ${noun}. Try again.`);
    } finally {
      setIsAssigning(false);
    }
  };

  return { error, isAssigning, commit };
}

/**
 * The pane's contents for a caller that already holds the choices: the title, the search, the inline suggestions, the in-flight latch, and the failure shown in place rather than swallowed.
 *
 * Its own component rather than the popover's insides, so that a Picker fetching its own choices renders exactly this and the two directions cannot drift apart in their labels, their empty states, or whether a failure is announced at all, which is what happened to the two components `AssignPopover` replaced.
 */
export function AssignOptions({ options, onAssign, loading = false, searchLabel, emptyMessage }: AssignOptionsProps) {
  const { noun, title, labelId, disabled, close } = useAssignPane();
  const { error, isAssigning, commit } = useAssignCommit({ noun, options, onAssign, onAssigned: close });
  const [search, setSearch] = useState('');
  /* No Dropdown is mounted, so "opened" changes nothing visually; it is what lets Enter submit the highlighted option, which Mantine gates on the dropdown state. */
  const combobox = useCombobox({ defaultOpened: true });
  /* After the filtered list re-renders, not in onChange: selecting synchronously would highlight against the stale options still in the DOM. */
  useEffect(() => {
    combobox.selectFirstOption();
  }, [combobox, search]);
  const needle = search.trim().toLowerCase();
  const matching = needle ? options.filter((option) => option.label.toLowerCase().includes(needle)) : options;
  const hasOptions = !loading && options.length > 0;
  const isEmpty = !loading && options.length === 0;

  return (
    <Stack gap="sm">
      {/* Not a heading: a popover is not part of the page outline, and the level it would have to
          claim depends on a caller this component cannot see. It names the dropdown through
          `aria-labelledby` instead. The title is all the prose there is; the pick explains itself
          by being pickable (Norbert, 2026-08-21). */}
      <Text id={labelId} fw={700} fz="h4">
        {title}
      </Text>

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
        /* One floating layer only, the pickers' rule: the options render inline in the pane
           (Combobox without dropdown), never as a second popover. Choosing one IS the commit,
           because the pick is the whole reason the reader opened this (Norbert, 2026-08-21). */
        <Combobox store={combobox} onOptionSubmit={(value) => void commit(value)}>
          <Combobox.EventsTarget>
            <TextInput
              aria-label={searchLabel ?? `Search ${noun}s`}
              placeholder={`Type ${noun} name…`}
              value={search}
              // Safari and password-manager extensions ignore autoComplete="off"
              // alone; the search type, neutral name, and vendor opt-outs keep
              // credential autofill prompts off this field.
              type="search"
              name={`${noun}-search`}
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
              data-bwignore
              data-form-type="other"
              disabled={disabled || isAssigning}
              onChange={(event) => {
                setSearch(event.currentTarget.value);
              }}
            />
          </Combobox.EventsTarget>
          <ScrollArea.Autosize mah={260} type="auto">
            <Combobox.Options>
              {matching.length === 0 ? (
                <Combobox.Empty>{`No matching ${noun}s`}</Combobox.Empty>
              ) : (
                matching.map((option) => (
                  <Combobox.Option value={option.value} key={option.value} disabled={disabled || isAssigning}>
                    {option.label}
                  </Combobox.Option>
                ))
              )}
            </Combobox.Options>
          </ScrollArea.Autosize>
        </Combobox>
      ) : null}
    </Stack>
  );
}

/**
 * The pane a pick happens in, hung off an icon: the trigger, the dropdown that names itself for assistive tech, and nothing about the choices.
 *
 * It mounts its content only while open, which is what makes a Picker inside it lazy: the read starts when the reader signals intent and is torn down when they leave.
 * Callers who already hold their choices mount `AssignOptions`;
 * callers whose choices must be fetched mount a Picker, which renders `AssignOptions` in turn.
 *
 * It replaced two components that asked the same question from opposite ends (one picked a group for an asset, one picked an asset for a group) and had drifted apart in their labels, their empty states, and whether a failure was announced at all.
 * Every label defaults from `noun`, so the two directions cannot drift apart by accident;
 * a page overrides the words only where it means something different by them.
 */
export function AssignPopover({
  noun,
  disabled,
  icon,
  title,
  triggerLabel,
  size = 'lg',
  children,
}: AssignPopoverProps) {
  const [opened, setOpened] = useState(false);
  const labelId = useId();
  const paneTitle = title ?? `Assign ${noun}`;

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
          label={triggerLabel ?? paneTitle}
          variant="light"
          /* Neutral, not the primary colour: red on a toolbar means destructive and nothing else, and this sits beside a delete. */
          color="gray"
          size={size}
          disabled={disabled}
          onClick={() => setOpened((current) => !current)}
          icon={icon}
        />
      </Popover.Target>
      <Popover.Dropdown aria-labelledby={labelId}>
        {/* Remounted per opening, so a cancelled pick never reappears the next time, and a read inside
            lives exactly as long as the opening. Mantine's dropdown happens to do this too, but a
            Picker's read now depends on it, and that is worth one explicit line rather than an
            undocumented behaviour of a dependency. */}
        {opened ? (
          <AssignPaneContext.Provider
            value={{ noun, title: paneTitle, labelId, disabled, close: () => setOpened(false) }}
          >
            {children}
          </AssignPaneContext.Provider>
        ) : null}
      </Popover.Dropdown>
    </Popover>
  );
}
