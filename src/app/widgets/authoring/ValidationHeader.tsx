import { Tooltip, UnstyledButton } from '@mantine/core';
import { TriangleAlert } from 'lucide-react';

import styles from './ValidationHeader.module.css';

/**
 * The one shape every editor's warnings must project for the header to group and word them.
 * Two kinds share the chip: a missing field, worded as "missing X", and a complaint that is not a missing field at all, carried verbatim.
 * «How a dangling back reference presents» widened this shape rather than seating a second banner beside the header, so routing rides the chips either way.
 */
export type ValidationHeaderWarning = { source: string; help?: string } & (
  | {
      /** What the source is missing, e.g. "name" or "back description". */
      missing: string;
    }
  | {
      /** A whole complaint about the source, e.g. "its referenced token is gone". */
      complaint: string;
    }
);

function formatMissingList(missing: string[]): string {
  if (missing.length <= 1) {
    return missing[0] ?? '';
  }
  return `${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}`;
}

/**
 * A lower-third caption strip on an edit page's masthead band: one chip per warning source, each a focus jump into the editor.
 * It positions absolutely to the band's bottom edge, and `useEditPageHeader` is what mounts it there;
 * reach for that hook rather than this component.
 *
 * With no warnings it renders nothing at all.
 * The latch deliberately holds the band open past the moment the last warning clears, so that the band does not pump mid-keystroke, and for that window the strip has nothing true to say: a bare "Needs attention" over no chips claims attention is needed when none is (#897).
 */
export function ValidationHeader<W extends ValidationHeaderWarning>({
  warnings,
  onFocusWarning,
}: {
  warnings: W[];
  onFocusWarning: (warning: W) => void;
}) {
  if (warnings.length === 0) {
    return null;
  }

  const groups = new Map<string, W[]>();
  warnings.forEach((warning) => {
    const group = groups.get(warning.source);
    if (group) {
      group.push(warning);
    } else {
      groups.set(warning.source, [warning]);
    }
  });

  return (
    <div className={styles.strip}>
      <span className={styles.title}>
        <TriangleAlert size={15} aria-hidden />
        Needs attention
      </span>
      {[...groups.entries()].map(([source, sourceWarnings]) => {
        const missing = sourceWarnings.flatMap((warning) => ('missing' in warning ? [warning.missing] : []));
        const complaints = sourceWarnings.flatMap((warning) => ('complaint' in warning ? [warning.complaint] : []));
        const parts = [...(missing.length > 0 ? [`missing ${formatMissingList(missing)}`] : []), ...complaints];
        const help = [...new Set(sourceWarnings.flatMap((warning) => (warning.help ? [warning.help] : [])))].join(' ');
        const chip = (
          <UnstyledButton key={source} className={styles.chip} onClick={() => onFocusWarning(sourceWarnings[0] as W)}>
            <span className={styles.chipSource}>{source}</span>: {parts.join('; ')}
          </UnstyledButton>
        );
        return help ? (
          <Tooltip label={help} multiline maw={360} withArrow key={source}>
            {chip}
          </Tooltip>
        ) : (
          chip
        );
      })}
    </div>
  );
}
