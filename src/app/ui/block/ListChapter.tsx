import { Group, Stack } from '@mantine/core';
import type { ReactNode } from 'react';

import { ControlBlock } from '../control/ControlBlock';
import { Notice } from './Notice';

/** The note a list shows above its items: why it is empty, or why its length is unusual. */
interface ListNote {
  tone?: 'neutral' | 'caution';
  title?: string;
  text: string;
}

export interface ListChapterProps {
  /** What the list is, shown as its heading. */
  title: string;
  /** Keeps the heading for assistive tech only, when the list sits under a heading that already names it, such as an accordion's. */
  titleHidden?: boolean;
  /** What the list is for, behind a (?) beside the heading; editors carry no description paragraph. */
  help?: string;
  /** The list controls on the heading's row: `ListLengthActions`, an `AddAction`, a count. */
  actions: ReactNode;
  /** Shown above the items, typically while the list is empty. */
  note?: ListNote | null;
  /** The items, or the selected item's editor. */
  children?: ReactNode;
}

/**
 * An editable list in an editor: its name with a (?) explanation and its add and remove controls on one row, a note when it is empty, then the items.
 * It is a `ControlBlock` whose input is the list, so a list and a single field share one heading size and one place for their controls.
 * Every editable list in an editor (faction, asset and rulebook block editors) renders through this, so they cannot drift apart again.
 */
export function ListChapter({ title, titleHidden, help, actions, note, children }: ListChapterProps) {
  return (
    <ControlBlock
      title={title}
      titleHidden={titleHidden}
      description={help}
      tool={
        <Group gap={6} wrap="nowrap">
          {actions}
        </Group>
      }
      input={
        <Stack gap="md">
          {note ? (
            <Notice tone={note.tone} title={note.title}>
              {note.text}
            </Notice>
          ) : null}
          {children}
        </Stack>
      }
    />
  );
}
