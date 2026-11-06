import { TextInput } from '@mantine/core';
import { Search } from 'lucide-react';
import { useState } from 'react';

import styles from './FindShortcuts.module.css';
import { Keys } from './Keys';
import { GROUPS, SHORTCUT_ENTRIES, capsOf } from './shortcutCatalogue';
import type { ShortcutEntry } from './shortcutCatalogue';

/* What the sheet offers before anything is typed: the keys a new player reaches for first. */
const FIRST = ['compass', 'hand', 'battle', 'table', 'flip', 'take', 'raise', 'pass'];

const GROUP_SHORT = Object.fromEntries(GROUPS.map((group) => [group.id, group.short]));

/* One letter typed is a key to look up; more is a word to find in what the keys do. */
function find(query: string): readonly ShortcutEntry[] {
  const typed = query.trim().toLowerCase();
  if (!typed) {
    return FIRST.flatMap((id) => SHORTCUT_ENTRIES.filter((entry) => entry.id === id));
  }
  const byKey = SHORTCUT_ENTRIES.filter((entry) => capsOf(entry).some((key) => key.toLowerCase() === typed));
  const byWords = SHORTCUT_ENTRIES.filter((entry) =>
    [entry.action, entry.detail, entry.word, entry.hook, GROUP_SHORT[entry.group], ...entry.keys]
      .filter(Boolean)
      .some((text) => text!.toLowerCase().includes(typed))
  );
  return [...new Set([...byKey, ...byWords])];
}

/* The part of a line the search matched, marked. */
function Marked({ text, query }: Readonly<{ text: string; query: string }>) {
  const typed = query.trim().toLowerCase();
  const at = typed.length > 1 ? text.toLowerCase().indexOf(typed) : -1;
  if (at < 0) {
    return <>{text}</>;
  }
  return (
    <>
      {text.slice(0, at)}
      <mark className={styles.mark}>{text.slice(at, at + typed.length)}</mark>
      {text.slice(at + typed.length)}
    </>
  );
}

/**
 * Variant B, find: one search field over every key.
 * Type a word ("flip", "zoom", "bid") to find the key for it, or a single letter to see everything that key does.
 * Before typing, the eight keys a new player needs first.
 */
export function FindShortcuts() {
  const [query, setQuery] = useState('');
  const results = find(query);
  const single = query.trim().length === 1;

  return (
    <div className={styles.root}>
      <TextInput
        aria-label="Find a shortcut"
        placeholder="What do you want to do? Or type a key"
        leftSection={<Search size={16} aria-hidden />}
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
        data-autofocus
      />
      <p className={styles.caption}>
        {query.trim() === ''
          ? 'Start here'
          : single
            ? `What ${query.trim().toUpperCase()} does`
            : `${results.length} ${results.length === 1 ? 'key' : 'keys'}`}
      </p>
      {results.length === 0 ? (
        <p className={styles.none}>No key does that yet. Space opens the compass, whose search finds every window.</p>
      ) : (
        <ul className={styles.results}>
          {results.map((entry, index) => (
            <li
              key={entry.id}
              className={styles.result}
              data-group={entry.group}
              style={{ animationDelay: `${Math.min(index, 8) * 25}ms` }}
            >
              <span className={styles.caps}>
                <Keys entry={entry} />
              </span>
              <span className={styles.text}>
                <span className={styles.action}>
                  <Marked text={entry.action} query={query} />
                </span>
                {entry.detail && (
                  <span className={styles.detail}>
                    <Marked text={entry.detail} query={query} />
                  </span>
                )}
              </span>
              <span className={styles.tag}>{GROUP_SHORT[entry.group]}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
