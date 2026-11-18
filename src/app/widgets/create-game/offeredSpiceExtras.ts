import type { CreatableRulesetPreview } from '@db/play';

/** The ticked extra spice decks the ruleset still offers; a deck unslotted while the page is open has no switch to untick, so it is left out. */
export function offeredSpiceExtras(ticked: readonly string[], preview: CreatableRulesetPreview | null) {
  const offered = new Set<string>(preview?.spiceExtras?.map((deck) => deck.id) ?? []);
  return ticked.filter((id) => offered.has(id));
}
