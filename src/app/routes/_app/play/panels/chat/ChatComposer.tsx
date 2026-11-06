import { Combobox, Group, Text, Textarea, useCombobox } from '@mantine/core';
import { LabeledAction } from '@ui/control/LabeledAction';
import { Send } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

import { focusTable } from '../../../../../widgets/tabletop/focusTable';
import { WINDOW_FOCUS_ATTRIBUTE } from '../../compass/windowFocus';
import { FactionTokenFace } from '../../multiplayer/FactionTokenFace';
import styles from './ChatComposer.module.css';
import { completeMention, matchMentions, mentionQuery } from './mentions';
import type { Mention, MentionQuery } from './mentions';

const MENTION_TOKEN_SIZE = 20;

/* The longest message the table saves. */
const MESSAGE_LIMIT = 2000;

/* The highlighted suggestion scrolls into the list's view as the arrows reach it. */
function keepInView(option: HTMLDivElement | null) {
  option?.scrollIntoView({ block: 'nearest' });
}

type ChatComposerProps = Readonly<{
  drafts: Map<string, string>;
  draftKey: string;
  submit: (text: string) => boolean;
  /** Who an @ can name here; empty where there is nobody to suggest, as in a chat with one player. */
  mentions: readonly Mention[];
}>;

/*
 * The composer: Enter sends, Shift+Enter starts a new line, and Escape hands the keyboard back to the table.
 * At the table an @ suggests the seats; Tab, Enter or a click writes the chosen faction's name with a space after it.
 * While the suggestions are open, Escape closes them first, so a second Escape hands the keyboard to the table.
 */
export function ChatComposer({ drafts, draftKey, submit, mentions }: ChatComposerProps) {
  const [draft, setDraft] = useState(() => drafts.get(draftKey) ?? '');
  const field = useRef<HTMLTextAreaElement>(null);
  const mention = useMentionState(
    draft,
    mentions.filter((entry) => !entry.own)
  );
  const write = (text: string) => {
    mention.edited(text);
    setDraft(text);
    if (text) {
      drafts.set(draftKey, text);
    } else {
      drafts.delete(draftKey);
    }
  };
  /* The caret goes after a completed name once the field holds it. */
  const caretAfter = useRef<number | null>(null);
  useLayoutEffect(() => {
    const element = field.current;
    if (element && caretAfter.current !== null) {
      element.setSelectionRange(caretAfter.current, caretAfter.current);
      mention.setCaret(caretAfter.current);
      caretAfter.current = null;
    }
  });
  const complete = (chosen: Mention) => {
    if (!mention.query) {
      return;
    }
    const caret = field.current?.selectionStart ?? mention.caret;
    const next = completeMention(draft, mention.query, caret, chosen.label);
    /* A name that would carry the message past its limit is not written; the query stays as typed. */
    if (next.text.length > MESSAGE_LIMIT) {
      return;
    }
    write(next.text);
    caretAfter.current = next.caret;
    mention.completed(mention.query, next.caret);
  };
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (mention.keyDown(event, complete)) {
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      focusTable();
      return;
    }
    /* Enter sends, as chats do; Shift+Enter starts a new line. */
    if (plainEnter(event)) {
      event.preventDefault();
      if (draft.trim()) {
        event.currentTarget.form?.requestSubmit();
      }
    }
  };
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (submit(draft)) {
          write('');
        }
      }}
    >
      <Combobox
        store={mention.store}
        position="top-start"
        offset={4}
        onOptionSubmit={(id) => {
          const chosen = mention.matches.find((entry) => entry.id === id);
          if (chosen) {
            complete(chosen);
          }
        }}
      >
        <Combobox.Target withKeyboardNavigation={false} withAriaAttributes>
          <Textarea
            ref={field}
            aria-label="Message"
            placeholder="Message"
            value={draft}
            onChange={(event) => {
              write(event.currentTarget.value);
              mention.setCaret(event.currentTarget.selectionStart);
            }}
            onSelect={(event) => mention.setCaret(event.currentTarget.selectionStart)}
            onKeyDown={keyDown}
            onFocus={() => mention.focus(true)}
            onBlur={() => mention.focus(false)}
            /* Escape here hands the keyboard to the table rather than closing the window; a second Escape closes it. */
            data-takes-escape
            {...{ [WINDOW_FOCUS_ATTRIBUTE]: '' }}
            maxLength={MESSAGE_LIMIT}
            minRows={2}
            maxRows={5}
            rightSection={<ComposerSubmit disabled={!draft.trim()} />}
            rightSectionWidth={68}
            rightSectionPointerEvents="auto"
          />
        </Combobox.Target>
        <Combobox.Dropdown>
          <Combobox.Options aria-label="Mention a player or faction" className={styles.mentions}>
            {mention.matches.map((entry, index) => (
              <Combobox.Option
                value={entry.id}
                key={entry.id}
                selected={index === mention.active}
                aria-selected={index === mention.active}
                ref={index === mention.active ? keepInView : undefined}
              >
                <MentionOption mention={entry} />
              </Combobox.Option>
            ))}
          </Combobox.Options>
        </Combobox.Dropdown>
      </Combobox>
    </form>
  );
}

function MentionOption({ mention }: Readonly<{ mention: Mention }>) {
  return (
    <Group gap="xs" wrap="nowrap">
      <FactionTokenFace token={mention.token} size={MENTION_TOKEN_SIZE} style={{ flexShrink: 0 }} aria-hidden />
      <Text size="sm" truncate>
        {mention.label}
      </Text>
      {mention.detail && (
        <Text size="sm" c="dimmed" truncate>
          {mention.detail}
        </Text>
      )}
    </Group>
  );
}

/*
 * What the @ before the caret suggests, and the keys that answer while it does.
 * A completed or dismissed @ suggests nothing more until it is typed again; the space a completion wrote takes no second one typed straight after.
 */
function useMentionState(draft: string, mentions: readonly Mention[]) {
  const [caret, setCaret] = useState(draft.length);
  const [dismissed, setDismissed] = useState<number | null>(null);
  /* The highlighted suggestion, by the query it was picked for: typing on starts again at the first. */
  const [active, setActive] = useState<{ query: string; index: number } | null>(null);
  const [focused, setFocused] = useState(false);
  const spaceAt = useRef<number | null>(null);
  const typed = mentions.length ? mentionQuery(draft, caret) : null;
  /* A dismissed @ that was deleted, or typed again, is no longer dismissed. */
  const live = dismissed !== null && draft[dismissed] === '@' && typed?.at === dismissed;
  const query = typed && !live ? typed : null;
  const matches = query ? matchMentions(mentions, query.query) : [];
  const open = focused && matches.length > 0;
  const store = useCombobox({ opened: open });
  const highlighted = active && active.query === query?.query ? Math.min(active.index, matches.length - 1) : 0;
  /* The store follows the highlight, so the field names the highlighted option to a screen reader (aria-activedescendant). */
  useEffect(() => {
    if (open) {
      store.selectOption(highlighted);
    }
  }, [store, open, highlighted, matches.length]);
  /* The space a completion wrote takes no second one typed straight after it. */
  const swallowsSpace = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const { selectionStart, selectionEnd } = event.currentTarget;
    const swallowed = event.key === ' ' && selectionStart === selectionEnd && spaceAt.current === selectionStart;
    spaceAt.current = null;
    return swallowed && !composing(event);
  };
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>, complete: (chosen: Mention) => void) => {
    if (swallowsSpace(event)) {
      event.preventDefault();
      return true;
    }
    const key = open ? suggestionKey(event) : null;
    if (!key) {
      return false;
    }
    event.preventDefault();
    if (key === 'complete') {
      complete(matches[highlighted]!);
    } else if (key === 'dismiss') {
      setDismissed(query!.at);
    } else {
      setActive({ query: query!.query, index: (highlighted + key + matches.length) % matches.length });
    }
    return true;
  };
  return {
    store,
    query,
    caret,
    matches,
    open,
    active: highlighted,
    keyDown,
    setCaret,
    focus: setFocused,
    /* An edit that takes away the dismissed @, or changes what comes before it, ends the dismissal: a message sent, an @ deleted and typed again. */
    edited: (next: string) => {
      if (dismissed !== null && (next[dismissed] !== '@' || next.slice(0, dismissed) !== draft.slice(0, dismissed))) {
        setDismissed(null);
      }
    },
    completed: (completedQuery: MentionQuery, after: number) => {
      setDismissed(completedQuery.at);
      spaceAt.current = after;
    },
  };
}

/* An Enter that ends a composed character stays the input method's; Safari can end one with an Enter that reads as not composing but keeps the composing key code. */
function composing(event: KeyboardEvent) {
  return event.nativeEvent.isComposing || event.keyCode === 229;
}

/* Enter on its own, not ending a composed character. */
function plainEnter(event: KeyboardEvent) {
  return event.key === 'Enter' && !event.shiftKey && !composing(event);
}

/* What a key does while the suggestions are open: a step through them, taking the highlighted one, or closing them; null leaves the key to the composer. */
function suggestionKey(event: KeyboardEvent): 1 | -1 | 'complete' | 'dismiss' | null {
  /* While a character is being composed, its keys (the arrows pick a candidate) are the input method's. */
  if (event.metaKey || event.ctrlKey || event.altKey || composing(event)) {
    return null;
  }
  const keys: Partial<Record<string, 1 | -1 | 'complete' | 'dismiss'>> = {
    ArrowDown: 1,
    ArrowUp: -1,
    Escape: 'dismiss',
  };
  if (event.key === 'Tab' && !event.shiftKey) {
    return 'complete';
  }
  return plainEnter(event) ? 'complete' : (keys[event.key] ?? null);
}

function ComposerSubmit({ disabled }: Readonly<{ disabled: boolean }>) {
  return (
    <LabeledAction
      type="submit"
      size="compact-sm"
      emphasis="strong"
      icon={<Send size={14} />}
      disabledReason={disabled ? 'Write a message first.' : undefined}
    >
      Send
    </LabeledAction>
  );
}
