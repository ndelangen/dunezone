import { Drawer, Stack, TextInput } from '@mantine/core';
import { Search, SlidersHorizontal } from 'lucide-react';
import { Children, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';

import { IconAction } from './IconAction';
import styles from './SearchRefine.module.css';

export interface SearchRefineProps {
  /** Names the whole field, as a group: "Faction catalogue filters". */
  label: string;
  search: {
    /** The draft in the box, which the caller holds so the URL can keep the committed value. */
    value: string;
    onChange: (value: string) => void;
    /** Commits the draft, on Enter and when the box loses focus. */
    onCommit: () => void;
    /** The box's accessible name: "Search factions". */
    label: string;
    placeholder: string;
  };
  refine: {
    /** The refine button's name and the drawer's title: "Refine factions". */
    label: string;
    /** Everything that narrows or orders the list, as labelled controls, stacked in the drawer. */
    content: ReactNode;
    /** How many refinements are set, so the button can say the list is narrowed. */
    active?: number;
  };
  /**
   * Segments joined to the right of the box when the page has room, such as a sort select.
   * They give way to the refine button below 48rem of page, so only the button's drawer offers them there.
   * Leave them out and the refine button is always the way in.
   */
  children?: ReactNode;
}

/**
 * The one control a browse page's toolbar centre holds: a search box with the way to refine the list joined to it.
 *
 * Callers own the search state and the refining controls.
 * This owns the shape Norbert asked to reuse (2026-09-29), first built for the faction catalogue: one bordered field, the box first and growing, the refine button joined at its end, opening every filter and the sort in a bottom drawer.
 * It keeps a toolbar one row high on a phone, where a search and a sort side by side had to stack.
 * Enter commits the search and leaves the box, and so does leaving it any other way.
 */
export function SearchRefine({ label, search, refine, children }: SearchRefineProps) {
  const [opened, setOpened] = useState(false);
  const segments = Children.toArray(children);
  const active = refine.active ?? 0;
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') {
      return;
    }
    search.onCommit();
    event.currentTarget.blur();
  };
  return (
    <>
      <fieldset className={styles.field} data-segmented={segments.length > 0 || undefined} aria-label={label}>
        <TextInput
          className={styles.search}
          variant="unstyled"
          value={search.value}
          onChange={(event) => search.onChange(event.currentTarget.value)}
          onBlur={search.onCommit}
          onKeyDown={handleKeyDown}
          placeholder={search.placeholder}
          aria-label={search.label}
          leftSection={<Search size={16} aria-hidden />}
        />
        {segments.map((segment, index) => (
          <div key={index} className={styles.segment}>
            {segment}
          </div>
        ))}
        <span className={styles.refine}>
          <IconAction
            label={active > 0 ? `${refine.label} (${active} set)` : refine.label}
            emphasis="quiet"
            intent="neutral"
            size="lg"
            onClick={() => setOpened(true)}
            icon={<SlidersHorizontal size={17} aria-hidden />}
          />
          {active > 0 ? <span className={styles.activeDot} aria-hidden /> : null}
        </span>
      </fieldset>
      <Drawer
        opened={opened}
        onClose={() => setOpened(false)}
        position="bottom"
        title={refine.label}
        size="26rem"
        padding="lg"
      >
        <Stack gap="md" pb="md">
          {refine.content}
        </Stack>
      </Drawer>
    </>
  );
}
