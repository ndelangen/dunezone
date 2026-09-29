import { VisuallyHidden } from '@mantine/core';
import type { AuthoringSaveState } from '@ui/content/assetPublishingStatus';
import { TopicIcon } from '@ui/content/TopicIcon';
import { IconAction } from '@ui/control/IconAction';
import { SaveAction } from '@ui/control/SaveAction';
import type { SaveActionState } from '@ui/control/SaveAction';
import { StatusInfo } from '@ui/control/StatusInfo';
import type { StatusInfoItem } from '@ui/control/StatusInfo';
import { Toolbar } from '@ui/surface/Toolbar';
import { ArrowLeft, Check, CircleAlert, Eye, PencilLine, RotateCcw, Save } from 'lucide-react';
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

/* The same state as a status in the page's list, with a glyph that matches what Save wears. */
function saveStateStatus(saveState: AuthoringSaveState, isDirty: boolean): StatusInfoItem {
  const label = saveStateWords(saveState, isDirty);
  switch (true) {
    case saveState === 'saving':
      return { tone: 'progress', icon: <Save size={16} aria-hidden />, label };
    case saveState === 'error':
      return { tone: 'negative', icon: <CircleAlert size={16} aria-hidden />, label };
    case isDirty:
      return { tone: 'caution', icon: <PencilLine size={16} aria-hidden />, label };
    default:
      return { tone: 'positive', icon: <Check size={16} aria-hidden />, label };
  }
}

/** Which Group may edit the thing, as a status every editor with group access states the same way. */
export function groupAccessStatus(groupName: string | null): StatusInfoItem {
  return {
    icon: <TopicIcon topic="groups" size={16} />,
    label: groupName == null ? 'No group has access.' : `Group access: ${groupName}`,
  };
}

/** Why a request failed, as a status; Save states it too. */
export function failureStatus(message: string | null | undefined): StatusInfoItem | null {
  return message ? { tone: 'negative', icon: <CircleAlert size={16} aria-hidden />, label: message } : null;
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
 * Its row carries no status marks.
 * The statuses sit behind one info action first on the right: the save state, what blocks a save, and the page's own `statuses`, such as where a publication has got to or which Group has access.
 * Save also wears where the work stands: a dot while there are unsaved changes, a spinner while saving, a check once saved, red when a save failed, and disabled with the reason on hover while a blank name or a refused value blocks it.
 * Its hover text says the same in words, followed by any failing status of the page's, such as why the server refused the last save.
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
  statuses,
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
  /** The page's own statuses, listed after the save state: where the publication has got to, which Group has access, why the server refused the last save. A failing one is also stated on Save. */
  statuses?: readonly (StatusInfoItem | null | undefined | false)[];
  destructiveActions?: ReactNode;
  centerIndicator?: ReactNode;
}) {
  const { isDirty, isNameBlank, saveState, invalid } = status;
  const { onSave, onReset, onBack } = actions;
  const stateWords = saveStateWords(saveState, isDirty);
  const blocker = isNameBlank ? copy.nameBlankMessage : (invalid ?? null);
  const pageStatuses = (statuses ?? []).filter((item): item is StatusInfoItem => Boolean(item));
  const failures = pageStatuses.filter((item) => item.tone === 'negative').map((item) => item.label);
  const lines = [stateWords, blocker, ...failures].filter((line): line is string => Boolean(line));
  const blockerStatus: StatusInfoItem | null = blocker
    ? { tone: 'negative', icon: <CircleAlert size={16} aria-hidden />, label: blocker }
    : null;
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
          <Toolbar.Cluster kind="about">
            <StatusInfo
              label="Status"
              statuses={[saveStateStatus(saveState, isDirty), blockerStatus, ...pageStatuses]}
            />
          </Toolbar.Cluster>
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
              intent="negative"
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
