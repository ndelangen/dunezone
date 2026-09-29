import { VisuallyHidden } from '@mantine/core';
import type { AuthoringSaveState } from '@ui/content/assetPublishingStatus';
import { IconAction } from '@ui/control/IconAction';
import { SaveAction } from '@ui/control/SaveAction';
import type { SaveActionState } from '@ui/control/SaveAction';
import { Toolbar } from '@ui/surface/Toolbar';
import { ArrowLeft, Eye, RotateCcw } from 'lucide-react';
import { useId } from 'react';
import type { ReactNode } from 'react';

import styles from './AuthoringToolbar.module.css';

/* The words for where the work stands, which Save wears as its hover text and a screen reader hears as its description. */
function saveStateWords(saveState: AuthoringSaveState, isDirty: boolean): string {
  switch (true) {
    case saveState === 'saving':
      return 'Saving';
    case saveState === 'error':
      return 'Save failed. Your changes are still here; press to try again.';
    case isDirty:
      return 'Unsaved changes';
    case saveState === 'saved':
      return 'Saved';
    default:
      return 'No unsaved changes';
  }
}

export interface AuthoringStatus {
  isDirty: boolean;
  isNameBlank: boolean;
  saveState: AuthoringSaveState;
  /** Stated while the draft holds a value the shared schema refuses, such as an incomplete faction phase; it holds Save like a blank name. */
  invalid?: string;
}

/** The words only the page knows: what it saves, and why a blank name blocks it. */
export interface AuthoringCopy {
  /** The save button's label, e.g. "Save faction". */
  saveLabel: string;
  /** Stated while the name is blank; explain that the name determines the URL. */
  nameBlankMessage: string;
}

export interface AuthoringToolbarActions {
  onSave: () => void;
  onReset: () => void;
  onBack: () => void;
}

/**
 * The edit-page toolbar every authoring surface installs identically: Back on the left, and on the right the editor's own actions, then reset and delete, then Save last.
 * It follows the page toolbar rules `Toolbar` states, so an editor's bar reads like a detail page's (Norbert, 2026-09-29).
 *
 * It carries no status marks.
 * Save wears where the work stands: a dot while there are unsaved changes, a spinner while saving, a check once saved, red when a save failed, and disabled with the reason on hover while a blank name or a refused value blocks it.
 * Its hover text says the same in words, followed by the page's own `notes`, such as where a publication has got to.
 * Those words also sit in a live region, so a screen reader hears each change, such as Saving and then Saved, and they are Save's accessible description.
 *
 * It carries no warning count and no standing explanation of what saving does.
 * `ValidationHeader` is open whenever any warning exists and names the fields, so a count here repeated it less usefully, and a sentence that never changes is not status (Norbert, 2026-08-20).
 * The page owns all data and wording;
 * the toolbar owns the arrangement.
 */
export function AuthoringToolbar({
  status,
  copy,
  actions,
  review,
  auxiliaryActions,
  accessActions,
  notes,
  destructiveActions,
  centerIndicator,
}: {
  status: AuthoringStatus;
  copy: AuthoringCopy;
  actions: AuthoringToolbarActions;
  /** An optional artifact-review action (the eye); absent editors have no review. */
  review?: { label: string; onOpen: (trigger: HTMLButtonElement) => void };
  /** The editor's own actions on what it edits, such as loading a draft, before review. */
  auxiliaryActions?: ReactNode;
  /** Who may touch the thing: assigning or removing its Group. */
  accessActions?: ReactNode;
  /** Sentences Save states after its own state, such as where the publication has got to or why the server refused the last save. */
  notes?: readonly (string | null | undefined | false)[];
  destructiveActions?: ReactNode;
  centerIndicator?: ReactNode;
}) {
  const { isDirty, isNameBlank, saveState, invalid } = status;
  const { onSave, onReset, onBack } = actions;
  const stateWords = saveStateWords(saveState, isDirty);
  const blocker = isNameBlank ? copy.nameBlankMessage : (invalid ?? null);
  const lines = [stateWords, blocker, ...(notes ?? [])].filter((line): line is string => Boolean(line));
  const describedBy = useId();
  const saveShows: SaveActionState =
    saveState === 'saving'
      ? 'saving'
      : saveState === 'error'
        ? 'failed'
        : isDirty
          ? 'dirty'
          : saveState === 'saved'
            ? 'saved'
            : 'clean';

  return (
    <div className={styles.sticky}>
      {/* Save's state is a glyph, and a screen reader does not announce a glyph changing, so the words live here too. */}
      <VisuallyHidden id={describedBy} role="status">
        {lines.join(' ')}
      </VisuallyHidden>
      <Toolbar>
        <Toolbar.Left label="Navigation">
          <IconAction
            label="Back"
            emphasis="standard"
            intent="neutral"
            size="lg"
            onClick={onBack}
            icon={<ArrowLeft size={17} aria-hidden />}
          />
        </Toolbar.Left>

        <Toolbar.Center>{centerIndicator}</Toolbar.Center>

        <Toolbar.Right label="Editing actions">
          <Toolbar.Cluster kind="content">
            {auxiliaryActions}
            {review ? (
              <span className={styles.reviewAction}>
                <IconAction
                  label={review.label}
                  emphasis="standard"
                  intent="neutral"
                  size="lg"
                  onClick={(event) => review.onOpen(event.currentTarget)}
                  icon={<Eye size={17} aria-hidden />}
                />
              </span>
            ) : null}
          </Toolbar.Cluster>
          <Toolbar.Cluster kind="access">{accessActions}</Toolbar.Cluster>
          <Toolbar.Cluster kind="discard">
            <IconAction
              label="Reset unsaved edits"
              emphasis="standard"
              intent="neutral"
              size="lg"
              disabled={!isDirty || saveState === 'saving'}
              onClick={onReset}
              icon={<RotateCcw size={17} aria-hidden />}
            />
            {destructiveActions}
          </Toolbar.Cluster>
          <Toolbar.Cluster kind="commit">
            <SaveAction
              label={copy.saveLabel}
              state={saveShows}
              lines={lines}
              disabledReason={blocker}
              describedBy={describedBy}
              onSave={onSave}
            />
          </Toolbar.Cluster>
        </Toolbar.Right>
      </Toolbar>
    </div>
  );
}
