import { Anchor, Stack, Text, Title } from '@mantine/core';
import { ASSET_TYPES, isAssetType } from '@shared/assets/types';
import { Link } from '@tanstack/react-router';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import type { ReactNode } from 'react';

/**
 * The states an asset editor route reaches instead of an editor: no such asset, not signed in, not allowed, no editor built yet.
 * Shared by the create and edit routes because both reach most of them, and a message that differs between the two would read as a bug rather than a distinction.
 */
export function AssetEditorMessage({
  title,
  type,
  children,
}: {
  title: string;
  /** Where "back" goes. A known type returns to its browse page, anything else to the landing. */
  type: string;
  children: ReactNode;
}) {
  return (
    <PageLayout>
      <PageLayout.Header size="compact">
        <Stack gap={2} align="center">
          <Title order={1}>{title}</Title>
        </Stack>
      </PageLayout.Header>
      <PageLayout.Content>
        <Surface padding="xl">
          <Stack gap="sm">
            {children}
            {isAssetType(type) ? (
              <Anchor renderRoot={(rootProps) => <Link {...rootProps} to="/assets/$type" params={{ type }} />}>
                Back to {ASSET_TYPES[type].label.toLowerCase()}
              </Anchor>
            ) : (
              <Anchor renderRoot={(rootProps) => <Link {...rootProps} to="/assets" />}>Back to assets</Anchor>
            )}
          </Stack>
        </Surface>
      </PageLayout.Content>
    </PageLayout>
  );
}

/**
 * A type the registry knows but nothing can author yet.
 * The same honest shape the browse page already uses for planned types, rather than a 404 that would claim the type does not exist.
 */
export function NoEditorYet({ type }: { type: string }) {
  const label = isAssetType(type) ? ASSET_TYPES[type].label.toLowerCase() : 'assets of this type';
  return (
    <AssetEditorMessage title="No editor yet" type={type}>
      <Text>There is no editor for {label} yet. This type is on the roadmap and cannot hold assets so far.</Text>
    </AssetEditorMessage>
  );
}
