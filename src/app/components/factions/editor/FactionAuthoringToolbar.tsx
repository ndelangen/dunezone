import { ActionIcon, Badge, Button, Group, Paper, Stack, Text, Tooltip } from '@mantine/core';
import { RotateCcw, Save, X } from 'lucide-react';
import type { ReactNode } from 'react';

import {
  type FactionSaveState,
  factionAssetPublishingCopy,
} from '@app/factions/assetPublishingStatus';

import type { PublicAssetPublishingStatusProjection } from '../../../../../convex/assetPublishingStatus';
import styles from './FactionAuthoringToolbar.module.css';

function formatPublishedAt(timestamp: number): string {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(timestamp));
}

export function FactionAuthoringToolbar({
  isDirty,
  isNameBlank,
  warningCount,
  saveState,
  assetPublishing,
  onSave,
  onReviewWarnings,
  onReset,
  onClose,
  auxiliaryActions,
  context,
  destructiveActions,
}: {
  isDirty: boolean;
  isNameBlank: boolean;
  warningCount: number;
  saveState: FactionSaveState;
  assetPublishing?: PublicAssetPublishingStatusProjection;
  onSave: () => void;
  onReviewWarnings: () => void;
  onReset: () => void;
  onClose: () => void;
  auxiliaryActions?: ReactNode;
  context?: ReactNode;
  destructiveActions?: ReactNode;
}) {
  const statusLabel =
    saveState === 'saving'
      ? 'Saving'
      : saveState === 'error'
        ? 'Save failed'
        : isDirty
          ? 'Unsaved changes'
          : saveState === 'saved'
            ? 'Saved'
            : 'No unsaved changes';
  const statusColor =
    saveState === 'error'
      ? 'red'
      : saveState === 'saving'
        ? 'blue'
        : isDirty
          ? 'orange'
          : saveState === 'saved'
            ? 'green'
            : 'gray';
  const publishingCopy = assetPublishing
    ? factionAssetPublishingCopy(assetPublishing.status, saveState)
    : saveState === 'saved'
      ? 'Saved. Publication scheduled.'
      : 'Saving this faction schedules its public assets.';

  return (
    <Paper withBorder p="sm" radius="md" className={styles.toolbar}>
      <Group justify="space-between" gap="sm" wrap="wrap">
        <Stack gap={3} className={styles.status}>
          <Group gap="xs" wrap="wrap">
            <Badge color={statusColor} variant="light">
              {statusLabel}
            </Badge>
            {warningCount > 0 ? (
              <Button
                type="button"
                variant="subtle"
                color="yellow"
                size="compact-xs"
                onClick={onReviewWarnings}
              >
                {warningCount} {warningCount === 1 ? 'field may' : 'fields may'} be incomplete
              </Button>
            ) : null}
            {assetPublishing?.lastPublishedAt != null ? (
              <Text
                component="time"
                dateTime={new Date(assetPublishing.lastPublishedAt).toISOString()}
                size="xs"
                c="dimmed"
              >
                Last published {formatPublishedAt(assetPublishing.lastPublishedAt)}
              </Text>
            ) : null}
          </Group>
          <Text size="xs" c={saveState === 'error' ? 'red' : 'dimmed'} role="status">
            {isNameBlank
              ? 'Add a faction name before saving; it determines the faction URL.'
              : publishingCopy}
          </Text>
          {context}
        </Stack>

        <Group gap="xs" wrap="wrap">
          {auxiliaryActions}
          <Tooltip label="Reset unsaved edits">
            <ActionIcon
              type="button"
              variant="light"
              color="gray"
              size="lg"
              aria-label="Reset unsaved edits"
              disabled={!isDirty || saveState === 'saving'}
              onClick={onReset}
            >
              <RotateCcw size={17} aria-hidden />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Close editor">
            <ActionIcon
              type="button"
              variant="light"
              color="gray"
              size="lg"
              aria-label="Close editor"
              onClick={onClose}
            >
              <X size={17} aria-hidden />
            </ActionIcon>
          </Tooltip>
          {destructiveActions}
          <Button
            type="button"
            color="confirm"
            leftSection={<Save size={17} aria-hidden />}
            disabled={isNameBlank || saveState === 'saving'}
            loading={saveState === 'saving'}
            onClick={onSave}
          >
            Save faction
          </Button>
        </Group>
      </Group>
    </Paper>
  );
}
