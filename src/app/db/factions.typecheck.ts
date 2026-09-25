import type { FactionCatalogueEntry } from '@app/db/factions';

/*
 * Reaching for a dropped field must fail to compile.
 * It typed as `unknown` while the catalogue data type came from the loose client schema, so this pins it to the strict one.
 * The alias is exported because an unused one raises its own error, which would satisfy the directive on its own.
 */
/* @ts-expect-error `rules` is not on a catalogue row. */
export type CatalogueDataRefusesDroppedFields = FactionCatalogueEntry['data']['rules'];
