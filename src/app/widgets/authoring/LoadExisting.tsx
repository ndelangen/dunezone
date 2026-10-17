import { Alert, Button, Center, Group, Loader, Popover, Stack, Text } from '@mantine/core';
import { IconAction } from '@ui/control/IconAction';
import { useDismissToolbarOverflow } from '@ui/surface/Toolbar';
import { Import } from 'lucide-react';
import { useId, useReducer, useRef, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * What a load source reports back to the frame.
 * `pending` while it is still fetching what the choice needs, an error when the choice cannot be used, and otherwise the named draft to load.
 */
export type LoadChoice<Draft> =
  | { kind: 'chosen'; name: string; draft: Draft }
  | { kind: 'pending' }
  | { kind: 'error'; message: string };

/**
 * Where the choices come from: a render function handed the frame's `report` callback.
 * The source owns the list (an Asset picker, the faction picker, preset buttons) and never the confirmation, which is the frame's.
 * It renders only while the popover is open, so a picker inside it subscribes only that long.
 */
export type LoadSource<Draft> = (report: (choice: LoadChoice<Draft>) => void) => ReactNode;

export interface LoadExistingProps<Draft> {
  /** One of the edited thing, lower case, as in "card" or "board": every label is phrased around it. */
  noun: string;
  /**
   * `create` when the loaded draft becomes a new, separate thing on save.
   * `replace` on an edit page, where saving writes the loaded content over the thing being edited.
   */
  mode: 'create' | 'replace';
  disabled: boolean;
  source: LoadSource<Draft>;
  onLoaded: (draft: NoInfer<Draft>) => void;
  /** Renders the toolbar, placing `loadAction` wherever the page keeps its load action. */
  children: (loadAction: ReactNode) => ReactNode;
}

/**
 * Loading an existing thing of the same kind into the draft, as the starting point for derived work.
 * One frame for every editor that has it: the trigger, the popover, and the confirmation before an unsaved draft is replaced.
 * What may be chosen is the `source`'s business, so each editor states only which kind it loads and what to do with the result.
 *
 * The popover wraps the whole toolbar rather than the trigger, because a trigger may move into the toolbar's overflow menu and the popover must survive that handoff.
 */
const OVERFLOW_MENU_BUTTON = 'button[aria-label="More actions"]';

/** The toolbar's overflow menu button, where focus returns when the trigger that opened the popover lived in that menu. */
function overflowMenuButton(toolbar: HTMLElement | null) {
  return toolbar?.querySelector<HTMLButtonElement>(OVERFLOW_MENU_BUTTON) ?? null;
}

/** The words for each mode, so the confirmation reads the same in every editor. */
function loadCopy(noun: string, mode: 'create' | 'replace') {
  return mode === 'create'
    ? {
        intro: `Choose a ${noun} to use as the starting point for this new ${noun}.`,
        note: `Loading replaces every unsaved change. Saving creates a separate ${noun}.`,
      }
    : {
        intro: `Choose a ${noun} to load into this draft.`,
        note: 'Loading replaces every unsaved change. Saving is still a separate action.',
      };
}

export function LoadExisting<Draft>({ noun, mode, disabled, source, onLoaded, children }: LoadExistingProps<Draft>) {
  const [opened, setOpened] = useState(false);
  const loadId = useId();
  const dropdownId = `${loadId}-dropdown`;
  const returnTarget = useRef<HTMLButtonElement | null>(null);
  const toolbarTarget = useRef<HTMLDivElement | null>(null);
  const label = `Load existing ${noun}`;
  const close = () => {
    setOpened(false);
    requestAnimationFrame(() => {
      const trigger = returnTarget.current;
      (trigger?.isConnected ? trigger : overflowMenuButton(toolbarTarget.current))?.focus();
    });
  };

  return (
    <Popover
      id={loadId}
      opened={opened}
      onChange={(next) => (next ? setOpened(true) : close())}
      position="bottom-end"
      width={440}
      styles={{ dropdown: { maxWidth: 'calc(100vw - 16px)' } }}
      shadow="md"
      withArrow
      withRoles={false}
      trapFocus
      returnFocus={false}
    >
      <Popover.Target>
        <div
          ref={toolbarTarget}
          onClickCapture={(event) => {
            /* Any other toolbar button closes the popover, so two of the toolbar's layers are never open at once. */
            const button = event.target instanceof Element ? event.target.closest('button') : null;
            if (button && button.getAttribute('aria-controls') !== dropdownId) {
              setOpened(false);
            }
          }}
        >
          {children(
            <LoadTrigger
              label={label}
              disabled={disabled}
              opened={opened}
              dropdownId={dropdownId}
              onOpen={(trigger) => {
                const inOverflow = trigger.closest('[role="group"][aria-label="More actions"]');
                returnTarget.current = inOverflow ? overflowMenuButton(toolbarTarget.current) : trigger;
                setOpened((was) => !was);
              }}
            />
          )}
        </div>
      </Popover.Target>
      <Popover.Dropdown id={dropdownId} role="dialog" aria-label={label} tabIndex={-1}>
        {opened ? (
          <LoadConfirm
            noun={noun}
            mode={mode}
            disabled={disabled}
            source={source}
            onLoaded={onLoaded}
            onClose={close}
          />
        ) : null}
      </Popover.Dropdown>
    </Popover>
  );
}

/** A trigger may move into overflow; the frame owns the popover so that handoff never unmounts it. */
function LoadTrigger({
  label,
  disabled,
  opened,
  dropdownId,
  onOpen,
}: {
  label: string;
  disabled: boolean;
  opened: boolean;
  dropdownId: string;
  onOpen: (trigger: HTMLButtonElement) => void;
}) {
  const dismissOverflow = useDismissToolbarOverflow();
  return (
    <IconAction
      label={label}
      emphasis="standard"
      intent="neutral"
      size="lg"
      disabled={disabled}
      aria-haspopup="dialog"
      aria-expanded={opened}
      aria-controls={dropdownId}
      onClick={(event) => {
        dismissOverflow?.();
        onOpen(event.currentTarget);
      }}
      icon={<Import size={17} aria-hidden />}
    />
  );
}

/** The source's choices, then the frame's confirmation; nothing reaches the draft until Load is pressed. */
function LoadConfirm<Draft>({
  noun,
  mode,
  disabled,
  source,
  onLoaded,
  onClose,
}: {
  noun: string;
  mode: 'create' | 'replace';
  disabled: boolean;
  source: LoadSource<Draft>;
  onLoaded: (draft: Draft) => void;
  onClose: () => void;
}) {
  const [choice, report] = useReducer((_: LoadChoice<Draft> | null, next: LoadChoice<Draft>) => next, null);
  const copy = loadCopy(noun, mode);
  const loadable = choice?.kind === 'chosen' && !disabled ? choice : null;
  return (
    <Stack gap="md">
      <Text size="sm">{copy.intro}</Text>
      {source(report)}
      {choice ? <ChoiceState choice={choice} noun={noun} note={copy.note} /> : null}
      <Group justify="flex-end">
        <Button type="button" variant="default" size="compact-sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          color="orange"
          size="compact-sm"
          disabled={!loadable}
          onClick={() => {
            if (loadable) {
              onLoaded(structuredClone(loadable.draft));
              onClose();
            }
          }}
        >
          Load {noun}
        </Button>
      </Group>
    </Stack>
  );
}

/** What the latest choice amounts to: still being read, unusable, or ready to confirm. */
function ChoiceState<Draft>({ choice, noun, note }: { choice: LoadChoice<Draft>; noun: string; note: string }) {
  switch (choice.kind) {
    case 'pending':
      return (
        <Center>
          <Loader size="sm" aria-label={`Loading the chosen ${noun}`} />
        </Center>
      );
    case 'error':
      return (
        <Alert color="red" role="alert">
          {choice.message}
        </Alert>
      );
    case 'chosen':
      return (
        <Stack gap="xs">
          <Text size="sm" fw={700}>
            Load {choice.name || `this ${noun}`}?
          </Text>
          <Text size="sm" c="dimmed">
            {note}
          </Text>
        </Stack>
      );
  }
}
