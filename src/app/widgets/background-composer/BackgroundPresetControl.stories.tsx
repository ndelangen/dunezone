import preview from '@sb/preview';
import { fn } from 'storybook/test';

import { backgroundPresets } from '@game/data/backgrounds';

import { emptyBackgroundModeMemory } from './BackgroundComposer';
import { BackgroundPresetControl } from './BackgroundPresetControl';

/** The four a treachery card offers, the real set rather than a sample. */
const CARD_PRESETS = [
  { key: 'weapon', label: 'Weapon', background: backgroundPresets.weapon },
  { key: 'defense', label: 'Defense', background: backgroundPresets.defense },
  { key: 'special', label: 'Special', background: backgroundPresets.special },
  { key: 'worthless', label: 'Worthless', background: backgroundPresets.worthless },
];

const meta = preview.meta({
  title: 'Background Preset Control',
  component: BackgroundPresetControl,
  args: {
    title: 'Head background',
    description: 'The band behind the card name.',
    usedOn: 'card head',
    presets: CARD_PRESETS,
    value: backgroundPresets.weapon,
    onChange: fn(),
    /* Controlled now: the declared intent belongs to the page's reducer, so the stories state it as an arg like any other value. */
    declaredCustom: false,
    onDeclaredCustomChange: fn(),
    modeMemory: emptyBackgroundModeMemory(),
    onModeMemoryChange: fn(),
  },
});

/** A stored value matching a preset selects that preset's tile. */
export const OnAPreset = meta.story({});

/** Five tiles, the count that made the row wrap before it became a shared `1fr` grid. */
export const FiveTiles = meta.story({
  args: {
    presets: [...CARD_PRESETS, { key: 'fate', label: 'Fate', background: backgroundPresets.fate }],
  },
});

/** A value matching no preset selects Custom, which paints the value rather than the dashed spot. */
export const Custom = meta.story({
  args: {
    value: backgroundPresets.harkonnen,
  },
});

/**
 * A value that does match a preset, shown as Custom because the author said so.
 *
 * This is the half of the choice no value can express, and the story exists because it is the only way to see the two halves disagree: the derived match says Weapon, the declared intent says Custom, and Custom wins.
 */
export const DeclaredCustomOverAMatchingValue = meta.story({
  args: {
    value: backgroundPresets.weapon,
    declaredCustom: true,
  },
});

/** A gradient preset, the case reference equality used to miss and value equality now catches. */
export const GradientPreset = meta.story({
  args: {
    presets: [
      { key: 'weapon', label: 'Weapon', background: backgroundPresets.weapon },
      { key: 'stripedWeapon', label: 'Striped', background: backgroundPresets.stripedWeapon },
    ],
    value: backgroundPresets.stripedWeapon,
  },
});
