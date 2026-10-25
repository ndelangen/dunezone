import { INITIAL_BACKGROUND_PRESETS } from '@shared/backgrounds/defaults';
import type { BackgroundData, SharedBackgroundPreset } from '@shared/backgrounds/schema';
import { customBackground, linkedBackground } from '@shared/backgrounds/schema';
import { AssetSelect } from '@ui/control/AssetSelect';

import { Background } from '@game/assets/utils/Background';

type Option = { value: string; label: string; collection: string };
function choiceKey(value: BackgroundData) {
  const source = value.source ?? { kind: 'custom' as const };
  return source.kind === 'preset' ? source.key : source.kind;
}
function fallbackLabel(key: string) {
  const stock = INITIAL_BACKGROUND_PRESETS.find((preset) => preset.key === key);
  if (stock) {
    return stock.name;
  }
  if (key.startsWith('custom/')) {
    return 'Shared background';
  }
  return key
    .split('/')
    .slice(1)
    .join(' ')
    .replace(/^./, (letter) => letter.toUpperCase());
}
function pickerOptions(presets: SharedBackgroundPreset[], key: string, family: boolean, faction: boolean): Option[] {
  const options: Option[] = [];
  if (family) {
    options.push({ value: 'family', label: 'Family standard', collection: 'Use' });
  }
  if (faction) {
    options.push({ value: 'faction', label: "Each card's faction", collection: 'Use' });
  }
  options.push(
    { value: 'custom', label: 'Custom', collection: 'Use' },
    ...presets.map((preset) => ({
      value: preset.key,
      label: preset.name,
      collection: backgroundGroup(preset.key),
    }))
  );
  if (!options.some((option) => option.value === key)) {
    options.push({ value: key, label: fallbackLabel(key), collection: backgroundGroup(key) });
  }
  return options;
}
function backgroundGroup(key: string) {
  const [kind, , region] = key.split('/');
  const group = kind === 'front' ? region : kind.split('-')[0];
  const labels: Record<string, string> = {
    header: 'Header backgrounds',
    icon: 'Icon backgrounds',
    back: 'Card-back backgrounds',
    discovery: 'Token backgrounds',
  };
  return labels[group] ?? 'Shared backgrounds';
}
function pickedValue(
  next: string | null,
  value: BackgroundData,
  presets: SharedBackgroundPreset[],
  familyValue?: BackgroundData
) {
  if (next === 'family') {
    return { ...(familyValue ?? value), source: { kind: 'family' as const } };
  }
  if (next === 'custom') {
    if (choiceKey(value) === 'custom') {
      return value;
    }
    return customBackground(familyValueFor(value, familyValue));
  }
  const preset = presets.find((candidate) => candidate.key === next);
  return preset ? linkedBackground(preset) : undefined;
}
function familyValueFor(value: BackgroundData, familyValue?: BackgroundData) {
  if (value.source?.kind === 'family') {
    return familyValue ?? value;
  }
  return value;
}
function currentBackground(
  value: BackgroundData | null,
  resolved: BackgroundData | undefined,
  saved: BackgroundData | undefined,
  faction: BackgroundData | undefined
) {
  if (!value) {
    return faction;
  }
  return { ...(resolved ?? saved ?? value), ...(value.source ? { source: value.source } : {}) };
}
function backgroundPreview(value: BackgroundData | null | undefined, size: number) {
  return value ? (
    <svg width={size} height={size} viewBox="0 0 600 600" aria-hidden>
      <Background {...customBackground(value)} />
    </svg>
  ) : null;
}

export function BackgroundPickerView({
  label,
  value,
  resolvedValue,
  onPick,
  familyValue,
  presets,
  factionValue,
  onDropdownChange,
}: Readonly<{
  label: string;
  value: BackgroundData | null;
  resolvedValue?: BackgroundData;
  onPick: (value: BackgroundData | null) => void;
  familyValue?: BackgroundData;
  factionValue?: BackgroundData;
  presets: SharedBackgroundPreset[];
  onDropdownChange?: (opened: boolean) => void;
}>) {
  const key = value ? choiceKey(value) : 'faction';
  const selected = presets.find((preset) => preset.key === key);
  const current = currentBackground(value, resolvedValue, selected?.value, factionValue);
  const currentPreview = current && familyValueFor(current, familyValue);
  const previews = new Map<string, BackgroundData | undefined>(presets.map((preset) => [preset.key, preset.value]));
  previews.set(key, currentPreview);
  previews.set('custom', currentPreview);
  previews.set('family', familyValue);
  previews.set('faction', factionValue);
  return (
    <AssetSelect
      aria-label={label}
      value={key}
      data={pickerOptions(presets, key, Boolean(familyValue) || key === 'family', Boolean(factionValue))}
      getPreviewSrc={() => null}
      renderPreview={(id, size) => backgroundPreview(previews.get(id) ?? (id === key ? current : null), size)}
      allowDeselect={false}
      onDropdownChange={onDropdownChange}
      onChange={(next) => {
        if (next === 'faction') {
          onPick(null);
        } else if (current) {
          const picked = pickedValue(next, current, presets, familyValue);
          if (picked) {
            onPick(picked);
          }
        }
      }}
    />
  );
}
