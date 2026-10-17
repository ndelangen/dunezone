import { Button, Group, Stack } from '@mantine/core';
import { ASSET_TYPES } from '@shared/assets/types';
import type { AssetType } from '@shared/assets/types';
import { useRef } from 'react';
import type { z } from 'zod';

import { loadAssetPage } from '@db/assets';
import type { AssetPublicPage } from '@db/assets';
import type { LoadChoice, LoadSource } from '@app/widgets/authoring/LoadExisting';

import { AssetPicker } from './AssetPicker';

/**
 * A loaded Asset: its stored data, parsed against the editor's schema, and the page it was read from.
 * The page is there for what the data only points at, such as the token or deck a back references and a container's members, so an editor can show those without fetching them again.
 * A preset has no page.
 */
export type LoadedAsset<Data> = { data: Data; source: NonNullable<AssetPublicPage> | null };

/** A starting point that is not a saved Asset, such as a blank or stock board, offered as a button above the list. */
export type LoadPreset<Data> = { label: string; name: string; data: Data };

/**
 * The load source for every Asset editor: Assets of exactly one type, so a load never crosses the type boundary.
 *
 * A pick reads the Asset's own page rather than trusting the list row, because list rows are presented for display (a deck wearing another deck's cardback lists with that cardback copied in) and an editor that loaded presented data would save the copy as its own.
 */
export function assetLoadSource<Data>({
  type,
  schema,
  excludeId,
  presets,
}: {
  type: AssetType;
  schema: z.ZodType<Data>;
  /** The Asset being edited, on an edit page. */
  excludeId?: string;
  presets?: LoadPreset<Data>[];
}): LoadSource<LoadedAsset<Data>> {
  return (report) => (
    <AssetLoadChoices type={type} schema={schema} excludeId={excludeId} presets={presets} report={report} />
  );
}

function AssetLoadChoices<Data>({
  type,
  schema,
  excludeId,
  presets,
  report,
}: {
  type: AssetType;
  schema: z.ZodType<Data>;
  excludeId?: string;
  presets?: LoadPreset<Data>[];
  report: (choice: LoadChoice<LoadedAsset<Data>>) => void;
}) {
  /* Only the latest pick may report, so a slow read cannot overwrite a quicker later choice. */
  const latest = useRef(0);
  const unusable = { kind: 'error', message: 'This one could not be loaded. Choose another.' } as const;
  return (
    <Stack gap="sm">
      {presets?.length ? (
        <Group gap="xs">
          {presets.map((preset) => (
            <Button
              key={preset.label}
              type="button"
              variant="default"
              size="compact-sm"
              onClick={() => {
                latest.current += 1;
                report({ kind: 'chosen', name: preset.name, draft: { data: preset.data, source: null } });
              }}
            >
              {preset.label}
            </Button>
          ))}
        </Group>
      ) : null}
      <AssetPicker
        focusSearch
        types={[type]}
        excludeIds={excludeId ? [excludeId] : undefined}
        copy={{
          searchLabel: `Search ${ASSET_TYPES[type].label.toLowerCase()}`,
          searchPlaceholder: 'Name or creator',
          emptyMessage: `No ${ASSET_TYPES[type].label.toLowerCase()} are available to load yet.`,
        }}
        onPick={(picked) => {
          const ticket = ++latest.current;
          report({ kind: 'pending' });
          void loadAssetPage(type, picked.slug).then(
            (page) => {
              if (ticket !== latest.current) {
                return;
              }
              const parsed = page ? schema.safeParse(page.asset.data) : null;
              report(
                parsed?.success && page
                  ? { kind: 'chosen', name: page.asset.name, draft: { data: parsed.data, source: page } }
                  : unusable
              );
            },
            () => {
              if (ticket === latest.current) {
                report(unusable);
              }
            }
          );
        }}
      />
    </Stack>
  );
}

/**
 * The members a loaded deck or bundle brings with it.
 * They are relation rows rather than data, so the new container cannot hold them before its first save: the create page shows them and passes `id` as the create's `members_from`, and the server copies them in the same write.
 */
export type ClonedMembers = {
  id: NonNullable<AssetPublicPage>['asset']['id'];
  name: string;
  members: NonNullable<AssetPublicPage>['members'];
};

export function clonedMembersOf(loaded: LoadedAsset<unknown>): ClonedMembers | null {
  return loaded.source
    ? { id: loaded.source.asset.id, name: loaded.source.asset.name, members: loaded.source.members }
    : null;
}
