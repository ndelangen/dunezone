# Stock artwork collections

The artwork controls show the complete catalogue in preview grids. The filter button at the right
of the field opens collection choices in the same dropdown. Choosing a collection returns to its
artwork grid without changing the selected artwork. Choose All collections to clear the filter. Search matches names, collection names, and
keywords. The filter stays selected while editing another supporting leader, so a matching roster
can be assembled without finding the collection again.

`src/shared/stockAssetCollections.json` owns the curated portrait and emblem sets. The labels describe
faction membership or a matching visual set. They do not grant access or refer to collaboration
Groups. `src/app/ui/content/stockAssetOptions.ts` turns these records into picker options and groups
other vectors by their purpose and subject.

## Adding portraits or emblems

1. Put the source artwork in `media/image/leader/<source>/` or `media/vector/logo/`.
2. Add its complete `/image/leader/...` or `/vector/logo/...` key to one collection in
   `stockAssetCollections.json`. Reuse the collection for matching artwork; create one for a new set.
3. Give a new set a descriptive label and useful search keywords. A source name and a matching set
   answer different questions, so faction sets collect related portraits across source folders. Visual sets use labels such as
   `Custom portraits / Sand uniforms`. Source names remain searchable through their saved paths.
4. Run `bun run generate`, then `bun run generate:images` for portraits or `bun run generate:vectors`
   for SVGs. `bun run generate` is the step that rejects missing collection membership, duplicate
   membership, and stale paths; the image and vector generators never read the collections.
5. Browse the real picker in Storybook. Check the whole set together, narrow to it, and select an
   image. Run the AssetSelect and Leaders and Alliance stories, then the required release checks.

Existing asset paths are saved in faction and asset documents. Organize them through this catalogue;
keep those paths stable. SVG repairs can replace artwork at its existing path without touching
collection membership. New sources not yet assigned a set remain discoverable through fallback
categories at runtime; generation requires curated sets for portraits and emblems before delivery.

## Classification evidence

The initial classification reviewed all 246 portraits and 83 emblems together in contact sheets.

- `/Users/me/Projects/Dune/asset-generator/public/image/leader/` preserves the source collections
  `official`, `brainfood`, `ilya`, `custom`, and `alien`.
- `/Users/me/Projects/Dune/dune-assets/leaders/` preserves faction membership, including Ginaz,
  Hagal, Iduali, Smugglers, and Water Peddlers. Matching names and artwork informed the assignments.
  `asset-generator/src/faction-new/atreides.ts` also records the Atreides portrait references.
- The [Dune board-game leader list](https://www.jetpunk.com/user-quizzes/2179369/dune-board-game-leaders)
  corroborates the twelve board-game faction rosters. The
  [publisher's Atreides overview](https://www.levelinfinite.com/news/spotlight-meeting-house-atreides-of-dune-spice-wars/)
  corroborates Jessica, Thufir, Gurney, and Duncan. The local archive takes precedence over spelling
  mistakes in the external list; saved filenames are never corrected by renaming them.
- Alien and custom subdivisions describe visible clothing, colours, helmets, and creature designs.
  They are visual classifications, not claims that the invented portraits belong to canonical Dune
  factions. Unresolved identities remain in their source collection's other-portraits set.
- The existing emblem galleries from PR #1560 supply the custom categories. Board-game faction
  emblems, community-faction emblems, and original custom marks are separate. These labels describe
  what the marks represent, not whether the artwork is licensed or officially published.

The `official` portrait directory includes community-faction portraits. The picker groups these
by faction alongside matching portraits from other source folders. Artist provenance is preserved
in the saved paths and searchable source names; this classification does not infer authorship from visual similarity.
