import { Button, Group, Stack } from '@mantine/core';
import { ASSET_TYPES } from '@shared/assets/types';
import type { AssetType } from '@shared/assets/types';
import { useRef } from 'react';
import type { z } from 'zod';

import { loadAssetPage } from '@db/assets';
import type { AssetPublicPage } from '@db/assets';
import { prepareRawAsset } from '@db/authoring';
import type { LoadChoice, LoadExistingProps, LoadSource } from '@app/widgets/authoring/LoadExisting';

import { AssetPicker } from './AssetPicker';

/**
 * A loaded Asset: its stored data, parsed against the editor's schema, and the page it was read from.
 * The page is there for what the data only points at, such as the token or deck a back references and a container's members, so an editor can show those without fetching them again.
 * A preset has no page.
 */
export type LoadedAsset<Data> = {
  data: Data;
  source: NonNullable<AssetPublicPage> | null;
  referencedBack?: Awaited<ReturnType<typeof prepareRawAsset>>['referencedBack'];
  raw?: true;
};

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

/**
 * The toolbar's `load` for an Asset page, create or edit alike.
 * On an edit page, `editing` leaves the edited Asset out of the choices, and the loaded data keeps its name, so loading never moves it to another address.
 */
export function assetLoad<Data extends { name: string }>({
  noun,
  type,
  schema,
  editing,
  disabled,
  canRename = false,
  onLoaded,
}: {
  noun: string;
  type: AssetType;
  schema: z.ZodType<Data>;
  editing?: { id: string; name: string };
  disabled: boolean;
  canRename?: boolean;
  onLoaded: (loaded: LoadedAsset<NoInfer<Data>>) => void;
}): Omit<LoadExistingProps<LoadedAsset<Data>>, 'children'> {
  return {
    noun,
    scopeKey: editing?.id ?? `create:${type}`,
    mode: editing ? 'replace' : 'create',
    disabled,
    source: assetLoadSource({ type, schema, excludeId: editing?.id }),
    raw: {
      validate: async (text) => {
        const parsed = await prepareRawAsset({ type, text, ...(editing ? { targetId: editing.id } : {}) });
        const data = schema.parse(parsed.data);
        const referencedBack = parsed.referencedBack;
        return {
          name: parsed.name,
          draft: { data, source: null, raw: true, ...(referencedBack ? { referencedBack } : {}) },
        };
      },
      ...(editing
        ? {
            rename: {
              currentName: editing.name,
              allowed: canRename,
              apply: (draft: LoadedAsset<Data>, name: string) => ({ ...draft, data: { ...draft.data, name } }),
            },
          }
        : {}),
    },
    onLoaded: (loaded) =>
      onLoaded(editing && !loaded.raw ? { ...loaded, data: { ...loaded.data, name: editing.name } } : loaded),
  };
}

const UNUSABLE = { kind: 'error', message: 'This one could not be loaded. Choose another.' } as const;

/** Reads a picked Asset's own page and parses its stored data; anything missing or unparsable is one unusable choice. */
/** Whether a page's token back or deck cardback is worn from the Asset `id`. */
function wearsBackOf(page: NonNullable<AssetPublicPage>, id: string) {
  return page.backToken?.id === id || page.backDeck?.id === id;
}

async function readChoice<Data>(
  type: AssetType,
  slug: string,
  schema: z.ZodType<Data>,
  excludeId: string | undefined
): Promise<LoadChoice<LoadedAsset<Data>>> {
  const page = await loadAssetPage(type, slug).catch(() => null);
  if (!page) {
    return UNUSABLE;
  }
  const parsed = schema.safeParse(page.asset.data);
  if (!parsed.success) {
    return UNUSABLE;
  }
  /*
   * A choice that wears the edited Asset's back would leave the draft pointing at itself, which the save refuses.
   * Leaving the edited Asset out of the list does not catch this, so the choice says why before it can replace the draft.
   */
  if (excludeId && wearsBackOf(page, excludeId)) {
    return {
      kind: 'error',
      message: `${page.asset.name} wears the back of the one you are editing, so loading it would point this one at itself.`,
    };
  }
  return { kind: 'chosen', name: page.asset.name, draft: { data: parsed.data, source: page } };
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
          void readChoice(type, picked.slug, schema, excludeId).then((choice) => {
            if (ticket === latest.current) {
              report(choice);
            }
          });
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
