import { Box, Grid, Stack, TextInput } from '@mantine/core';
import { LEADERS } from '@shared/assetIds';
import { Eyebrow } from '@ui/content/Eyebrow';
import { stockAssetOptions } from '@ui/content/stockAssetOptions';
import { AssetSelect } from '@ui/control/AssetSelect';
import { ControlBlock } from '@ui/control/ControlBlock';
import type { ComponentProps, ReactNode } from 'react';

import type { Faction } from '@db/factions';
import { LeaderToken } from '@game/assets/faction/leader/Leader';

import { assetOptionToPreviewSrc } from './factionFormAssetUtils';

/*
 * The parts the faction leader and each supporting leader share: the row that puts the fields beside the token,
 * the name and portrait fields, and the token preview. The two editors differ only in which form fields they bind and whether a strength sits between.
 */

const leaderImageOptions = stockAssetOptions(LEADERS.options);

type LeaderImage = Faction['factionLeader']['image'];

/** The fields on the left and, from the small step, the token they make on the right. */
export function LeaderRow({
  showPreview,
  fields,
  preview,
}: {
  showPreview: boolean;
  fields: ReactNode;
  preview: ReactNode;
}) {
  return (
    <Grid gap="xl" align="center">
      <Grid.Col span={{ base: 12, sm: showPreview ? 8 : 12 }}>
        <Stack gap="md">{fields}</Stack>
      </Grid.Col>
      {showPreview ? (
        <Grid.Col span={4} visibleFrom="sm">
          {preview}
        </Grid.Col>
      ) : null}
    </Grid>
  );
}

/** A leader's name, printed around its token. Blank is allowed and warned about, never refused. */
export function LeaderNameField({
  title,
  description,
  inputId,
  blankWarning,
  value,
  onBlur,
  onChange,
}: {
  title: string;
  description: string;
  inputId: string;
  /** What the field says while the name is blank. */
  blankWarning: string;
  value: string;
  onBlur: () => void;
  onChange: (value: string) => void;
}) {
  return (
    <ControlBlock
      title={title}
      description={description}
      inputId={inputId}
      warning={value.trim().length === 0 ? blankWarning : undefined}
      input={(control) => (
        <TextInput
          {...control}
          value={value}
          onBlur={onBlur}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      )}
    />
  );
}

/** A leader's portrait, from the stock leader art. */
export function LeaderPortraitField({
  title,
  inputId,
  value,
  onChange,
}: {
  title: string;
  inputId: string;
  value: LeaderImage;
  onChange: (value: LeaderImage) => void;
}) {
  return (
    <ControlBlock
      title={title}
      inputId={inputId}
      input={(fieldProps) => (
        <AssetSelect
          {...fieldProps}
          allowDeselect={false}
          data={leaderImageOptions}
          previewShape="disc"
          getPreviewSrc={assetOptionToPreviewSrc}
          value={value}
          onChange={(next) => {
            if (next) {
              onChange(next as LeaderImage);
            }
          }}
        />
      )}
    />
  );
}

/** The token a leader's fields make, captioned with where it is used. */
export function LeaderTokenPreview({
  caption,
  width,
  label,
  ...token
}: {
  caption: string;
  width: number;
  label: string;
} & ComponentProps<typeof LeaderToken>) {
  return (
    <Stack align="center" gap="sm">
      <Eyebrow align="center">{caption}</Eyebrow>
      <Box w={width} aria-label={label}>
        <LeaderToken {...token} />
      </Box>
    </Stack>
  );
}
