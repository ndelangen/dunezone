/*
 * SPIKE (i18n option C, Lingui): the catalogs, the active language, and what the macros don't cover.
 * English text in the code is the message; `lingui extract` collects it into `src/locales/{locale}/messages.po`.
 */
import { i18n } from '@lingui/core';
import type { MessageDescriptor } from '@lingui/core';
import { msg, t } from '@lingui/core/macro';
import type { TablePhaseId } from '@shared/play/phases';
import type { RelativeDateWords } from '@ui/content/dates';

import { messages as en } from '../../locales/en/messages.po';
import { messages as nl } from '../../locales/nl/messages.po';

export const LOCALES = ['en', 'nl'] as const;
export type Locale = (typeof LOCALES)[number];

i18n.load({ en, nl });
i18n.activate('en');

/** Switches every message to `locale`; the root re-mounts under its key, so memoised output is rendered afresh. */
export function activate(locale: Locale) {
  i18n.activate(locale);
}

/* The site writes British English: "A, B and C", with no serial comma. */
const TAGS: Record<string, string> = { en: 'en-GB', nl: 'nl' };

/** Names as one phrase in the current language: "A, B and C", "A, B en C". */
export function list(items: readonly string[]): string {
  return new Intl.ListFormat(TAGS[i18n.locale] ?? i18n.locale, { type: 'conjunction' }).format(items);
}

/** Each standard phase's name, as a descriptor the caller translates when it renders. */
export const PHASES: Record<TablePhaseId, MessageDescriptor> = {
  storm: msg`Storm`,
  'spice-blow': msg`Spice Blow`,
  'choam-charity': msg`CHOAM Charity`,
  bidding: msg`Bidding`,
  revival: msg`Revival`,
  'shipment-and-movement': msg`Shipment and Movement`,
  battle: msg`Battle`,
  'spice-collection': msg`Spice Collection`,
  'mentat-pause': msg`Mentat Pause`,
};

/** The relative-date words in the current language. */
export function dateWords(): RelativeDateWords {
  return {
    justNow: t`Just now`,
    minutesAgo: (minutes) => t`${minutes} min ago`,
    hoursAgo: (hours) => (hours === 1 ? t`1 hour ago` : t`${hours} hours ago`),
    yesterday: t`Yesterday`,
    daysAgo: (days) => t`${days} days ago`,
  };
}

export { i18n };
