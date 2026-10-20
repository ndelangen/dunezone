import { Alert, Button, Center, Checkbox, Group, Loader, Popover, Stack, Text, Textarea } from '@mantine/core';
import { rawAuthoringError } from '@shared/authoring/raw';
import { IconAction } from '@ui/control/IconAction';
import { Surface } from '@ui/surface/Surface';
import { useDismissToolbarOverflow } from '@ui/surface/Toolbar';
import { Import } from 'lucide-react';
import { useEffect, useId, useReducer, useRef, useState } from 'react';
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
  source?: LoadSource<Draft>;
  onLoaded: (draft: NoInfer<Draft>) => void;
  raw?: RawLoadSource<Draft>;
  /** Changes with the route or signed-in account, invalidating pending choices. */
  scopeKey?: string;
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
export function overflowMenuButton(toolbar: HTMLElement | null) {
  return toolbar?.querySelector<HTMLButtonElement>(OVERFLOW_MENU_BUTTON) ?? null;
}

/** Whether a click landed on a toolbar button other than the one that controls this popover. */
function isOtherButton(target: EventTarget, dropdownId: string) {
  const button = target instanceof Element ? target.closest('button') : null;
  return button != null && button.getAttribute('aria-controls') !== dropdownId;
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

export interface RawLoadSource<Draft> {
  validate: (text: string) => Promise<{ name: string; draft: Draft }>;
  rename?: { currentName: string; allowed: boolean; apply: (draft: Draft, name: string) => Draft };
}

export function LoadExisting<Draft>({
  noun,
  mode,
  disabled,
  source,
  raw,
  scopeKey,
  onLoaded,
  children,
}: LoadExistingProps<Draft>) {
  const [phase, setPhase] = useState<'closed' | 'catalogue' | 'json'>('closed');
  const loadId = useId();
  const dropdownId = `${loadId}-dropdown`;
  const returnTarget = useRef<HTMLButtonElement | null>(null);
  const toolbarTarget = useRef<HTMLDivElement | null>(null);
  const label = `Load existing ${noun}`;
  const close = () => {
    setPhase('closed');
    requestAnimationFrame(() => {
      const trigger = returnTarget.current;
      (trigger?.isConnected ? trigger : overflowMenuButton(toolbarTarget.current))?.focus();
    });
  };
  return (
    <>
      <Popover
        id={loadId}
        opened={phase === 'catalogue' && !disabled}
        onChange={(opened) => (opened ? setPhase('catalogue') : close())}
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
              if (isOtherButton(event.target, dropdownId)) {
                setPhase('closed');
              }
            }}
          >
            {children(
              <LoadTrigger
                hasPopup={Boolean(source) && phase !== 'json'}
                label={label}
                disabled={disabled}
                opened={phase !== 'closed'}
                dropdownId={dropdownId}
                onOpen={(trigger) => {
                  const inOverflow = trigger.closest('[role="group"][aria-label="More actions"]');
                  returnTarget.current = inOverflow ? overflowMenuButton(toolbarTarget.current) : trigger;
                  setPhase((was) => (was === 'closed' ? (source ? 'catalogue' : 'json') : 'closed'));
                }}
              />
            )}
          </div>
        </Popover.Target>
        <Popover.Dropdown id={dropdownId} role="dialog" aria-label={label} tabIndex={-1}>
          {phase === 'catalogue' && !disabled ? (
            <LoadConfirm
              key={scopeKey}
              noun={noun}
              mode={mode}
              disabled={disabled}
              source={source}
              onRaw={raw ? () => setPhase('json') : undefined}
              onLoaded={onLoaded}
              onClose={close}
            />
          ) : null}
        </Popover.Dropdown>
      </Popover>
      {phase === 'json' && raw && !disabled ? (
        <div id={dropdownId}>
          <Surface padding="md" as="section" aria-label={`Load ${noun} JSON`}>
            <RawLoadInput key={scopeKey} raw={raw} noun={noun} onLoaded={onLoaded} onClose={close} />
          </Surface>
        </div>
      ) : null}
    </>
  );
}

/** A trigger may move into overflow; the frame owns the popover so that handoff never unmounts it. */
function LoadTrigger({
  label,
  hasPopup,
  disabled,
  opened,
  dropdownId,
  onOpen,
}: {
  label: string;
  hasPopup: boolean;
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
      aria-haspopup={hasPopup ? 'dialog' : undefined}
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
  onRaw,
  onLoaded,
  onClose,
}: {
  noun: string;
  mode: 'create' | 'replace';
  disabled: boolean;
  source?: LoadSource<Draft>;
  onRaw?: () => void;
  onLoaded: (draft: Draft) => void;
  onClose: () => void;
}) {
  const [choice, report] = useReducer((_: LoadChoice<Draft> | null, next: LoadChoice<Draft>) => next, null);
  const copy = loadCopy(noun, mode);
  const loadable = choice?.kind === 'chosen' && !disabled ? choice : null;
  return (
    <Stack gap="md">
      <Text size="sm">{copy.intro}</Text>
      {source?.(report)}
      {onRaw ? (
        <Button variant="default" onClick={onRaw}>
          Paste JSON
        </Button>
      ) : null}
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

/** Text and validation belong to this open input session, never to the editor draft. */
function RawLoadInput<Draft>({
  raw,
  noun,
  onLoaded,
  onClose,
}: {
  raw: RawLoadSource<Draft>;
  noun: string;
  onLoaded: (draft: Draft) => void;
  onClose: () => void;
}) {
  const [state, patch] = useReducer(
    (
      state: {
        text: string;
        busy: boolean;
        error: string | null;
        choice: { name: string; draft: Draft } | null;
        rename: boolean;
      },
      update: Partial<typeof state>
    ) => ({ ...state, ...update }),
    { text: '', busy: false, error: null, choice: null, rename: false }
  );
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', closeOnEscape, true);
    return () => document.removeEventListener('keydown', closeOnEscape, true);
  }, [onClose]);
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    input.current?.focus();
  }, []);
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current += 1;
    },
    []
  );
  const validate = async () => {
    const ticket = ++generation.current;
    patch({ busy: true, error: null, choice: null });
    try {
      const choice = await raw.validate(state.text);
      if (ticket === generation.current) {
        patch({ choice, busy: false });
      }
    } catch (error) {
      if (ticket === generation.current) {
        patch({ error: rawAuthoringError(error), busy: false });
      }
    }
  };
  const rename = raw.rename && state.choice && raw.rename.currentName !== state.choice.name ? raw.rename : null;
  return (
    <Stack gap="sm">
      <Textarea
        ref={input}
        label="Writable JSON"
        description="Paste one complete data value. Load changes this draft; Save remains separate."
        minRows={12}
        maxRows={20}
        autosize
        value={state.text}
        onChange={(event) => {
          generation.current += 1;
          patch({ text: event.currentTarget.value, choice: null, busy: false, error: null, rename: false });
        }}
      />
      {state.error ? (
        <Alert color="red" role="alert">
          {state.error}
        </Alert>
      ) : null}
      {state.choice ? (
        <Text size="sm">
          Ready to load {state.choice.name}. Loading replaces unsaved changes. Reset still returns to the last saved
          value.
        </Text>
      ) : null}
      {rename ? (
        <Checkbox
          label="Also rename"
          description={`${rename.currentName} → ${state.choice!.name}`}
          disabled={!rename.allowed}
          checked={state.rename && rename.allowed}
          onChange={(event) => patch({ rename: event.currentTarget.checked })}
        />
      ) : null}
      <Group justify="flex-end">
        <Button variant="default" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="default" loading={state.busy} disabled={!state.text.trim()} onClick={() => void validate()}>
          Validate JSON
        </Button>
        <Button
          disabled={!state.choice || state.busy}
          onClick={() => {
            if (!state.choice) {
              return;
            }
            const draft = rename
              ? rename.apply(
                  state.choice.draft,
                  state.rename && rename.allowed ? state.choice.name : rename.currentName
                )
              : state.choice.draft;
            onLoaded(structuredClone(draft));
            onClose();
          }}
        >
          Load {noun}
        </Button>
      </Group>
    </Stack>
  );
}
