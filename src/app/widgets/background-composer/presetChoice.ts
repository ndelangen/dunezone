import type { BackgroundData } from '@game/data/backgrounds';

/*
 * Object keys sort before stringifying, so a gradient clone the schema re-emits in shape key order
 * still equals the preset literal whatever order its author wrote.
 * Arrays keep their order: colour order and stop order are the contract.
 */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonical);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical((value as Record<string, unknown>)[key])])
    );
  }
  return value;
}

/**
 * Value equality for a background, since a preset is only "selected" while the stored value still matches it exactly.
 * Scalars compare field by field;
 * `colors` alone compares by canonical stringify, because a colour element may be a gradient object and a round-tripped clone never satisfies reference equality or, once the schema re-emits it, key order.
 * Every stock matcher that embeds a background (`sameCardback`, `sameBand`) delegates here rather than restating the split.
 */
export function sameBackground(a: BackgroundData, b: BackgroundData): boolean {
  return (
    a.image === b.image &&
    a.invert === b.invert &&
    a.definition === b.definition &&
    a.influence === b.influence &&
    JSON.stringify(canonical(a.colors)) === JSON.stringify(canonical(b.colors))
  );
}

/** The sentinel the picker uses for the composer's own option, named once so no call site spells it. */
export const CUSTOM_PRESET = 'custom';

export type BackgroundPreset = { key: string; label: string; background: BackgroundData };

/**
 * The half of stock-or-custom that derives: which preset this value currently equals, or null when it equals none.
 *
 * «The stock-or-custom picker state machine exists three times» defended a stored flag on the grounds that the choice "cannot be derived".
 * Only half of it cannot.
 * This half is a pure question about the value and was already being answered without a flag in four places;
 * the other half is `declaredCustom`, which is a fact about the author and lives in the session's memory.
 */
export function presetKeyFor(presets: readonly BackgroundPreset[], value: BackgroundData): string | null {
  return presets.find((preset) => sameBackground(preset.background, value))?.key ?? null;
}

/**
 * What the picker shows selected: a preset's key, or the composer.
 * A value matching no preset reads as Custom whether or not the author ever said so, which is why the derived half cannot be dropped in favour of the flag alone.
 */
export function presetSelection(presetKey: string | null, declaredCustom: boolean): string {
  return declaredCustom || presetKey === null ? CUSTOM_PRESET : presetKey;
}

/**
 * Whether replacing a background under the author would discard something they did.
 *
 * Value-diverged OR declared Custom, per D5 on «Work the editors wave».
 * The first half was the whole test before, and it cannot see an author who opened the composer and has not yet typed: the value still equals the preset it started from, so a sibling control would substitute it away with the composer sitting open.
 * Opening the composer is the declaration, so the intent bit is exactly what closes that window.
 */
export function hasWorkToLose({
  stillWearsExpected,
  declaredCustom,
}: {
  /** The value still equals the background the substituting control expects it to be wearing. */
  stillWearsExpected: boolean;
  declaredCustom: boolean;
}): boolean {
  return !stillWearsExpected || declaredCustom;
}
