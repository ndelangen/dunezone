import { usePaginatedQuery } from 'convex/react';
import type { FunctionArgs, FunctionReturnType } from 'convex/server';

import { api } from '../../../convex/_generated/api';
import { factionCatalogueRowsToEntries } from './factions';

type CatalogueRow = FunctionReturnType<typeof api.cataloguePicker.options>['page'][number]['choice'];
type CataloguePreview =
  | Exclude<CatalogueRow, { kind: 'faction' }>
  | {
      kind: 'faction';
      id: Extract<CatalogueRow, { kind: 'faction' }>['id'];
      faction: ReturnType<typeof factionCatalogueRowsToEntries>[number];
      /** The variant's name, when its Faction has several variants to tell apart. */
      variant?: string;
    };
export type CatalogueChoice = CataloguePreview & { selected: boolean | null };
export type CatalogueSelection = FunctionArgs<typeof api.cataloguePicker.options>['selection'];
export type CatalogueTarget =
  | Pick<Extract<CatalogueChoice, { kind: 'faction' }>, 'kind' | 'id'>
  | Pick<Extract<CatalogueChoice, { kind: 'asset' }>, 'kind' | 'id'>;

/** Only the chosen type mounts this read; leaving its results tears down the subscription. */
export function useCataloguePickerGroup(group: string, q: string, selection: CatalogueSelection) {
  const query = usePaginatedQuery(api.cataloguePicker.options, { group, q, selection }, { initialNumItems: 3 });
  const results: CatalogueChoice[] = query.results.map(({ choice, selected, variant }) => ({
    ...(choice.kind === 'faction'
      ? {
          ...choice,
          faction: factionCatalogueRowsToEntries([choice.faction])[0],
          ...(variant === null ? {} : { variant }),
        }
      : choice),
    selected,
  }));
  return { ...query, results };
}
