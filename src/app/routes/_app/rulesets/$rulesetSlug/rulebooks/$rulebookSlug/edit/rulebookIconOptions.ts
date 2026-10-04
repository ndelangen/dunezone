import { TABLE_PHASES } from '@shared/play/phases';
import { stockAssetOptions } from '@ui/content/stockAssetOptions';

/** Rulebook icon controls share phase names and searchable labels. */
export function rulebookIconOptions(values: readonly string[]) {
  return stockAssetOptions(values).map((option) => {
    const label =
      TABLE_PHASES.find((phase) => phase.symbol === option.value)?.label ??
      (option.value === '/vector/icon/alliance.svg' ? 'Nexus' : undefined);
    return label ? { ...option, label, collection: 'Phases', keywords: `${option.keywords} ${label}` } : option;
  });
}
