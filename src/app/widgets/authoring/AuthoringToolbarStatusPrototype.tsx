/*
 * PROTOTYPE, #1423. Throwaway, on prototype/1423-toolbar-status-icons, which never merges.
 *
 * Three arrangements of the authoring toolbar in which every status is a glyph with a tooltip that carries the full wording.
 * The faction edit route mounts one of them when `?variant=a|b|c` is set; `PrototypeVariantBar` flips between them and back to the current toolbar.
 * The page, its data and its actions are unchanged: only where and how the statuses are drawn differs.
 */
import {
  Box,
  Button,
  Group,
  Indicator,
  Loader,
  SegmentedControl,
  Stack,
  Text,
  Tooltip,
  VisuallyHidden,
} from '@mantine/core';
import { factionAssetPublishingCopy } from '@ui/content/assetPublishingStatus';
import type { AuthoringSaveState } from '@ui/content/assetPublishingStatus';
import { TopicIcon } from '@ui/content/TopicIcon';
import { IconAction } from '@ui/control/IconAction';
import { Toolbar } from '@ui/surface/Toolbar';
import clsx from 'clsx';
import {
  ArrowLeft,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  Eye,
  FileText,
  History,
  ImageOff,
  RefreshCw,
  RotateCcw,
  Save,
} from 'lucide-react';
import { useId } from 'react';
import type { ReactNode } from 'react';

import type { PublicAssetPublishingStatusProjection } from '@db/factions';

import type { AuthoringCopy, AuthoringStatus, AuthoringToolbarActions } from './AuthoringToolbar';
import toolbarStyles from './AuthoringToolbar.module.css';
import styles from './AuthoringToolbarStatusPrototype.module.css';

export const TOOLBAR_STATUS_VARIANTS = [
  { key: 'a', name: 'A: a status cluster beside Back' },
  { key: 'b', name: 'B: one combined status glyph' },
  { key: 'c', name: 'C: status badges on their actions' },
] as const;

export type ToolbarStatusVariant = (typeof TOOLBAR_STATUS_VARIANTS)[number]['key'];

export function isToolbarStatusVariant(value: unknown): value is ToolbarStatusVariant {
  return TOOLBAR_STATUS_VARIANTS.some((variant) => variant.key === value);
}

/* The words the status vocabulary already has (docs/technical/ui-design-decisions.md, "Variants, not colours"). */
type StatusTone = 'neutral' | 'positive' | 'negative' | 'caution' | 'pending' | 'progress';

/* What an Indicator badge is painted with, per tone. */
const BADGE_COLOR: Record<StatusTone, string> = {
  neutral: 'gray',
  positive: 'green',
  negative: 'red',
  caution: 'var(--color-caution)',
  pending: 'yellow',
  progress: 'blue',
};

interface StatusEntry {
  key: 'save' | 'name' | 'publication' | 'access';
  tone: StatusTone;
  /* Lower is more urgent. Variant B draws the most urgent entry's glyph. */
  rank: number;
  glyph: (size: number) => ReactNode;
  /* The full wording, one sentence per line, taken from what the toolbar prints today. */
  words: string[];
}

function formatPublishedAt(timestamp: number): string {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(timestamp));
}

function saveEntry(saveState: AuthoringSaveState, isDirty: boolean): StatusEntry {
  switch (true) {
    case saveState === 'saving':
      return {
        key: 'save',
        tone: 'progress',
        rank: 2,
        glyph: (size) => <Loader size={size - 2} color="currentColor" />,
        words: ['Saving changes…'],
      };
    case saveState === 'error':
      return {
        key: 'save',
        tone: 'negative',
        rank: 0,
        glyph: (size) => <CircleAlert size={size} aria-hidden />,
        words: ['Save failed.', 'Changes were not saved.'],
      };
    case isDirty:
      return {
        key: 'save',
        tone: 'caution',
        rank: 3,
        glyph: (size) => <CircleDashed size={size} aria-hidden />,
        words: ['Unsaved changes'],
      };
    case saveState === 'saved':
      return {
        key: 'save',
        tone: 'positive',
        rank: 6,
        glyph: (size) => <CircleCheck size={size} aria-hidden />,
        words: ['Saved'],
      };
    default:
      return {
        key: 'save',
        tone: 'neutral',
        rank: 7,
        glyph: (size) => <CircleCheck size={size} aria-hidden />,
        words: ['No unsaved changes'],
      };
  }
}

function nameEntry(message: string): StatusEntry {
  return {
    key: 'name',
    tone: 'negative',
    rank: 1,
    glyph: (size) => <TopicIcon topic="identity" size={size} />,
    words: [message],
  };
}

function publicationEntry(publication: PublicAssetPublishingStatusProjection): StatusEntry {
  /* A failed replacement reads as no capture (CONTEXT.md, Asset publication state), as the copy does. */
  const capture = publication.captureStatus === 'error' ? null : publication.captureStatus;
  const sentence = factionAssetPublishingCopy(publication.status, 'idle', publication.captureStatus);
  const words =
    publication.lastPublishedAt == null
      ? [sentence]
      : [sentence, `Last published ${formatPublishedAt(publication.lastPublishedAt)}`];
  switch (true) {
    case capture === 'in_progress':
      return {
        key: 'publication',
        tone: 'progress',
        rank: 4,
        glyph: (size) => <RefreshCw size={size} aria-hidden />,
        words,
      };
    case capture === 'scheduled':
      return {
        key: 'publication',
        tone: 'pending',
        rank: 5,
        glyph: (size) => <History size={size} aria-hidden />,
        words,
      };
    case publication.status === 'current':
      return {
        key: 'publication',
        tone: 'neutral',
        rank: 8,
        glyph: (size) => <FileText size={size} aria-hidden />,
        words,
      };
    default:
      return {
        key: 'publication',
        tone: 'neutral',
        rank: 8,
        glyph: (size) => <ImageOff size={size} aria-hidden />,
        words,
      };
  }
}

function accessEntry(groupName: string): StatusEntry {
  return {
    key: 'access',
    tone: 'neutral',
    rank: 9,
    glyph: (size) => <TopicIcon topic="groups" size={size} />,
    words: [`Group access: ${groupName}`],
  };
}

function StatusWords({ words }: { words: string[] }) {
  return (
    <Stack gap={2}>
      {words.map((line) => (
        <Text key={line} size="xs" inherit>
          {line}
        </Text>
      ))}
    </Stack>
  );
}

/**
 * One status as a glyph: not an action, so no button.
 * The shape is the ControlBlock help glyph's: a tooltip that opens on hover, focus and touch, around a focusable image named with the full wording.
 */
function StatusMark({
  tone,
  glyph,
  label,
  tooltip,
  describedBy,
  onBadge = false,
}: {
  tone: StatusTone;
  glyph: ReactNode;
  label: string;
  tooltip: ReactNode;
  describedBy?: string;
  onBadge?: boolean;
}) {
  return (
    <Tooltip
      label={tooltip}
      /* A badge sits on its action's top edge, so its tooltip opens upward rather than over the action row. */
      position={onBadge ? 'top' : 'bottom'}
      multiline
      maw={320}
      withArrow
      events={{ hover: true, focus: true, touch: true }}
    >
      <Box
        component="span"
        role="img"
        aria-label={label}
        aria-describedby={describedBy}
        tabIndex={0}
        className={clsx(styles.mark, onBadge ? styles.onBadge : styles[tone])}
      >
        {glyph}
      </Box>
    </Tooltip>
  );
}

function EntryMark({ entry, size = 16 }: { entry: StatusEntry; size?: number }) {
  return (
    <StatusMark
      tone={entry.tone}
      glyph={entry.glyph(size)}
      label={entry.words.join(' ')}
      tooltip={<StatusWords words={entry.words} />}
    />
  );
}

/* Variant A: each status keeps its own glyph and its own tooltip, in a fixed order so nothing jumps. */
function StatusCluster({ entries }: { entries: StatusEntry[] }) {
  return (
    <Group gap={6} wrap="nowrap" role="group" aria-label="Status">
      {entries.map((entry) => (
        <EntryMark key={entry.key} entry={entry} />
      ))}
    </Group>
  );
}

/* Variant B: one glyph, the most urgent status's; the tooltip lists every status. */
function StatusSummary({ entries, size = 18 }: { entries: StatusEntry[]; size?: number }) {
  const listId = useId();
  const ranked = [...entries].sort((left, right) => left.rank - right.rank);
  const top = ranked[0];
  if (!top) {
    return null;
  }
  return (
    <>
      <StatusMark
        tone={top.tone}
        glyph={top.glyph(size)}
        label={`Status: ${top.words.join(' ')}`}
        describedBy={listId}
        tooltip={
          <Stack gap={8}>
            {ranked.map((entry) => (
              <Group key={entry.key} gap={8} wrap="nowrap" align="flex-start">
                <Box component="span" className={styles.listGlyph} aria-hidden>
                  {entry.glyph(14)}
                </Box>
                <StatusWords words={entry.words} />
              </Group>
            ))}
          </Stack>
        }
      />
      <VisuallyHidden id={listId}>{ranked.map((entry) => entry.words.join(' ')).join(' ')}</VisuallyHidden>
    </>
  );
}

/* Variant C: a status rides on the action it belongs to, as a corner badge that is its own tab stop. */
function BadgedAction({ entry, children }: { entry: StatusEntry | null; children: ReactNode }) {
  if (!entry) {
    return <>{children}</>;
  }
  return (
    <Indicator
      inline
      size={18}
      offset={3}
      color={BADGE_COLOR[entry.tone]}
      autoContrast
      withBorder
      processing={entry.tone === 'progress'}
      label={
        <StatusMark
          tone={entry.tone}
          onBadge
          glyph={entry.glyph(11)}
          label={entry.words.join(' ')}
          tooltip={<StatusWords words={entry.words} />}
        />
      }
    >
      {children}
    </Indicator>
  );
}

/* The full Save button, or the same action as a glyph when the toolbar is narrower than 30rem. */
function SaveAction({
  label,
  disabled,
  loading,
  onSave,
}: {
  label: string;
  disabled: boolean;
  loading: boolean;
  onSave: () => void;
}) {
  return (
    <>
      <span className={styles.saveFull}>
        <Button
          type="button"
          color="confirm"
          leftSection={<Save size={17} aria-hidden />}
          disabled={disabled}
          loading={loading}
          onClick={onSave}
        >
          {label}
        </Button>
      </span>
      <span className={styles.saveCompact}>
        <IconAction
          label={label}
          intent="positive"
          emphasis="strong"
          size="lg"
          disabled={disabled}
          loading={loading}
          onClick={onSave}
          icon={<Save size={17} aria-hidden />}
        />
      </span>
    </>
  );
}

export interface AuthoringToolbarStatusPrototypeProps {
  variant: ToolbarStatusVariant;
  status: AuthoringStatus;
  copy: AuthoringCopy;
  actions: AuthoringToolbarActions;
  review?: { label: string; onOpen: (trigger: HTMLButtonElement) => void };
  centerIndicator?: ReactNode;
  /* The page's actions, split so variant C can badge the group action. */
  loadAction?: ReactNode;
  groupAction?: ReactNode;
  destructiveActions?: ReactNode;
  /* Structured status the current toolbar only receives as prose. */
  publication?: PublicAssetPublishingStatusProjection | null;
  groupName?: string | null;
}

/** PROTOTYPE, #1423: the authoring toolbar with its statuses drawn as glyphs, in three arrangements. */
export function AuthoringToolbarStatusPrototype({
  variant,
  status,
  copy,
  actions,
  review,
  centerIndicator,
  loadAction,
  groupAction,
  destructiveActions,
  publication,
  groupName,
}: AuthoringToolbarStatusPrototypeProps) {
  const { isDirty, isNameBlank, saveState } = status;
  const { onSave, onReset, onBack } = actions;

  const save = saveEntry(saveState, isDirty);
  const name = isNameBlank ? nameEntry(copy.nameBlankMessage) : null;
  const published = publication ? publicationEntry(publication) : null;
  const access = groupName ? accessEntry(groupName) : null;
  const entries = [save, name, published, access].filter((entry): entry is StatusEntry => entry !== null);

  const back = (
    <IconAction
      label="Back"
      emphasis="standard"
      intent="neutral"
      size="lg"
      onClick={onBack}
      icon={<ArrowLeft size={17} aria-hidden />}
    />
  );
  const reset = (
    <IconAction
      label="Reset unsaved edits"
      emphasis="standard"
      intent="neutral"
      size="lg"
      disabled={!isDirty || saveState === 'saving'}
      onClick={onReset}
      icon={<RotateCcw size={17} aria-hidden />}
    />
  );
  const reviewAction = review ? (
    <IconAction
      label={review.label}
      emphasis="standard"
      intent="neutral"
      size="lg"
      onClick={(event) => review.onOpen(event.currentTarget)}
      icon={<Eye size={17} aria-hidden />}
    />
  ) : null;
  const saveAction = (
    <SaveAction
      label={copy.saveLabel}
      disabled={isNameBlank || saveState === 'saving'}
      loading={saveState === 'saving'}
      onSave={onSave}
    />
  );

  switch (variant) {
    case 'a':
      return (
        <div className={toolbarStyles.sticky}>
          <div className={styles.frame}>
            <Toolbar>
              <Toolbar.Left>
                <Group gap="sm" wrap="nowrap">
                  {back}
                  {/* Below 30rem the cluster no longer fits beside the actions and folds into variant B's single glyph. */}
                  <span className={styles.wide}>
                    <StatusCluster entries={entries} />
                  </span>
                  <span className={styles.narrow}>
                    <StatusSummary entries={entries} size={16} />
                  </span>
                </Group>
              </Toolbar.Left>
              <Toolbar.Center>{centerIndicator}</Toolbar.Center>
              <Toolbar.Right>
                <Group gap="xs" wrap="nowrap" className={toolbarStyles.actions}>
                  {loadAction}
                  {groupAction}
                  {reset}
                  {reviewAction ? <span className={toolbarStyles.reviewAction}>{reviewAction}</span> : null}
                  {destructiveActions}
                  {saveAction}
                </Group>
              </Toolbar.Right>
            </Toolbar>
          </div>
        </div>
      );
    case 'b':
      return (
        <div className={toolbarStyles.sticky}>
          <div className={styles.frame}>
            <Toolbar>
              <Toolbar.Left>
                <Group gap="sm" wrap="nowrap">
                  {back}
                  <StatusSummary entries={entries} />
                </Group>
              </Toolbar.Left>
              <Toolbar.Center>{centerIndicator}</Toolbar.Center>
              <Toolbar.Right>
                <Group gap="xs" wrap="nowrap" className={toolbarStyles.actions}>
                  {loadAction}
                  {groupAction}
                  {reset}
                  {reviewAction ? <span className={toolbarStyles.reviewAction}>{reviewAction}</span> : null}
                  {destructiveActions}
                  {saveAction}
                </Group>
              </Toolbar.Right>
            </Toolbar>
          </div>
        </div>
      );
    case 'c': {
      /* The save badge reports the blank name first, since that is what keeps Save disabled. */
      const saveBadge = name ? { ...name, words: [...name.words, ...save.words] } : save;
      return (
        <div className={toolbarStyles.sticky}>
          <div className={styles.frame}>
            <Toolbar>
              <Toolbar.Left>{back}</Toolbar.Left>
              <Toolbar.Center>{centerIndicator}</Toolbar.Center>
              <Toolbar.Right>
                <Group gap="xs" wrap="nowrap" className={toolbarStyles.actions}>
                  {loadAction}
                  {groupAction ? <BadgedAction entry={access}>{groupAction}</BadgedAction> : null}
                  {reset}
                  {reviewAction ? (
                    <span className={toolbarStyles.reviewAction}>
                      <BadgedAction entry={published}>{reviewAction}</BadgedAction>
                    </span>
                  ) : null}
                  {/* The review eye is hidden below 48em, so its badge stands alone where the eye would be. */}
                  {published ? (
                    <span className={styles.reviewFallback}>
                      <EntryMark entry={published} />
                    </span>
                  ) : null}
                  {destructiveActions}
                  <BadgedAction entry={saveBadge}>{saveAction}</BadgedAction>
                </Group>
              </Toolbar.Right>
            </Toolbar>
          </div>
        </div>
      );
    }
  }
}

/**
 * PROTOTYPE, #1423: the floating switch between the current toolbar and the three variants.
 * Deliberately unlike the app's own chrome so nobody mistakes it for part of the design;
 * never rendered in production.
 */
export function PrototypeVariantBar({
  current,
  onChange,
}: {
  current: ToolbarStatusVariant | undefined;
  onChange: (variant: ToolbarStatusVariant | undefined) => void;
}) {
  if (import.meta.env.PROD) {
    return null;
  }
  const active = TOOLBAR_STATUS_VARIANTS.find((variant) => variant.key === current);
  return (
    <Box component="nav" aria-label="Prototype variants for #1423" className={styles.variantBar}>
      <Text size="xs" fw={700} className={styles.variantBarTitle}>
        #1423 toolbar
      </Text>
      <SegmentedControl
        size="xs"
        value={current ?? 'current'}
        onChange={(value) => onChange(isToolbarStatusVariant(value) ? value : undefined)}
        data={[
          { value: 'current', label: 'Now' },
          ...TOOLBAR_STATUS_VARIANTS.map((variant) => ({
            value: variant.key,
            label: variant.key.toUpperCase(),
          })),
        ]}
      />
      <Text size="xs" className={styles.variantBarName}>
        {active ? active.name : 'The toolbar on main'}
      </Text>
    </Box>
  );
}
