# Stock artwork collections

The artwork controls show the complete catalogue in preview grids. The filter button at the right
of the field opens collection choices in the same dropdown. Choosing a collection returns to its
artwork grid without changing the selected artwork. Choose All collections to clear the filter. Search matches names, collection names, and
keywords. The filter stays selected while editing another supporting leader, so a matching roster
can be assembled without finding the collection again.

`src/shared/stockAssetCollections.json` owns the curated portrait, emblem, planet and decal collections. The labels describe
faction membership, a matching visual set, or the depicted subject. They do not grant access or refer to collaboration
Groups. `src/app/ui/content/stockAssetOptions.ts` turns these records into picker options and groups
uncurated vectors by their purpose and subject.

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
categories at runtime; generation requires curated collections for portraits, emblems, planets and decals before delivery.

## Decal subjects

Decals share one catalogue across existing artwork and approved custom illustrations. Each decal
has one primary collection, chosen by what the image depicts. Collection keywords and the original
filename remain searchable for related uses. The collections do not prescribe card effects or rules.

- A standalone sword belongs with blades; a duel belongs with fighting and training. Guards and
  formations cover standing watch, escorts and assembled troops.
- Animals and desert fauna share one collection. Plants and fungi are separate, as are microorganisms
  such as Flagella and Zenobia. Mechanical creatures belong with personal machinery.
- Medical care and rescue depicts caregivers and rescue scenes. Needles and injectors are weapons;
  personal medical devices stay with tools. Bodies and protective fields have a separate collection.
- Portable mechanisms belong with tools and personal machinery; harvesters and industrial equipment
  belong with large machines. Guns and explosives have more specific collections. Aircraft, spacecraft and ground vehicles
  share Long-distance travel; freight sleds, hoists and industrial carriers stay with large machines. Cisterns, ecological stations and processing buildings belong with buildings.
- Secret passages covers entrances. Intrigue covers people in covert encounters. Portable access and disguise devices stay with tools.
- A visible building, hand or diagram takes precedence over an abstract card-effect name. For example,
  `choam-share.svg` depicts a building and `extortion.svg` depicts a dagger.
- Fluids and containers collects vessels, chemical preparations and water-storage objects. Standalone plants and portable collection mechanisms stay in their own subject groups.
- Alternate drawings and colour variants of the same named illustration stay together. Existing
  paths and spellings stay unchanged because saved documents refer to them.

Add each new decal to one collection before running `bun run generate`. Monochrome SVGs inherit
the caller's colour; artwork with a fixed palette uses the `-multicolor.svg` suffix. Generate the
public vectors with `bun run generate:vectors`, then run `bun run verify:vectors`. Every multicolor decal must also have a monochrome partner at the same basename without `-multicolor`. Monochrome variants use transparent cutouts for pale contours and black shapes for essential colored props; recoloring every layer black would hide those details. The vector verification checks pair coverage. Review both
existing and new artwork together through the Asset Select picker, including collection filtering
and selecting a result. Individual images do not need individual stories.

## Media catalogue

`/media` is a visual directory with eight galleries and 1,525 publicly browsable files. Each category
opens a separate gallery. The index has no search toolbar; search and filters belong inside a gallery.
The selected collection wall gives leaders and decals larger tiles, with smaller groups below.
Artwork varies in size and angle while keeping its original proportions; leader masks stay circular.
The design comparison is archived on `norbert/media-index-prototypes`, with the chosen direction
recorded in `mediaIndex.prototype.md` on that branch. Prototype controls do not ship.
Leaders never share a results grid with decals or other artwork.

The underlying metadata covers all 1,617 source images and vectors. Troop modifiers, patterns,
textures, card layers, shield layers and website artwork are excluded from the public galleries and
search. Fonts, provenance records and generated size variants are not separate artwork entries.
These counts describe the initial index and grow with the source tree.

Libraries and media types have shareable paths, such as `/media/game/leaders`, `/media/game/decals`,
`/media/game/covers`, `/media/topics` and `/media/lucide`. Search, subject, collection and focused
artwork stay in the query string. Old `__media` and `__icons` links redirect. The footer links to the
catalogue with a teal Images glyph.

The toolbar uses SearchRefine, as the faction catalogue does. Its refinement drawer contains the
library, media type, subject, collection and browse grouping. Search ranks matches by relevance. Leaders and decals always remain within their collections;
other files can be browsed by subject or collection. Each gallery shows every matching file, with images loading lazily as the reader scrolls. The header
cycles a sample card and leader token every six seconds, preloads their artwork, pauses when the
browser tab is hidden and offers a pause control. Reduced-motion preferences keep the samples still.

### Search metadata and taxonomy

`src/app/routes/_app/media/media-index.json` owns one record per source path. Each record contains a
visual description, per-file keywords, one or more subject IDs and a SHA-256 hash of the reviewed
source. `mediaSubjects.ts` defines the controlled subject vocabulary. The first subject is the default
browse group; other subjects make a file discoverable through more than one relevant filter.

Media type describes the file's role, subject describes its contents, and collection keeps related
artwork together. A portrait can therefore be a leader image, depict an alien and belong to a named
house. Collections remain in `stockAssetCollections.json`; search does not copy their broad keyword
lists onto every member.

The initial descriptions were AI-assisted and checked against contact sheets. Portrait descriptions
are conservative and often describe the shared appearance of a set. They do not assert character
biographies, canon, species identities or rules that the image cannot establish. Monochrome partners
share visible subject descriptions where appropriate, with corrections for omitted scene details.
The existing empty CHOAM logo is explicitly described as a placeholder.

Search runs locally without a model call or external service. Every query word must match; word
order, accents, common singular/plural forms and a small synonym vocabulary are normalized. Exact
names rank first, then visual descriptions and tags, then file paths. Close spellings match alongside
exact results but rank below them. Search allows one typo for words of four or more letters, two for
words of eight or more, and treats adjacent transpositions as one typo. Searches with only approximate
results are labelled. Collection names stay in the collection filter so a wire does not match
"blade" merely because both belong to the same set. This is a word index, not semantic image search.

When adding or changing artwork:

1. Generate the normal image/vector outputs and inspect the actual artwork, including color and
   monochrome variants separately when their contents differ.
2. Add or update its index record. Describe visible shapes, actions, clothing, materials and colors
   that help distinguish it. Add useful alternative names as tags, without guessing lore from a filename.
3. Choose subjects from `mediaSubjects.ts`, with the strongest browsing subject first. Preserve the
   source path and existing collection unless a separate collection change is intended.
4. Update `sourceHash` from the reviewed source bytes. Do not refresh hashes without checking the
   changed artwork. The index coverage test rejects missing files, removed files and stale hashes.
5. Run `bunx vitest run src/app/routes/_app/media`, then check real searches and the focused preview.
   Run the Media page stories and the required release verification before updating the PR.

### Public galleries

Leaders use circular portrait previews; decals use larger vector previews. Both keep their collection
headings during search, even for a single match. Each collection has one surface; individual images
have no pane or outline. A partial collection links to its complete gallery,
clearing the search and subject filter. Descriptions, keywords and file paths appear in tooltips and
in the focused preview's details control. Collection reorganization is not available on the public page.

## Classification evidence

### Hivers

The Hivers collection adapts five author-supplied insect characters with the built-in imagegen tool.
Their ceremonial clothing reflects the author's premise: aliens with unfamiliar psychologies trying
to fit into the empire by copying its dress and rituals. The style references are the original GF9
portraits `official/aramsham.png`, `official/caid.png`, and `official/dryeuh.png`. Loose pen strokes
and uneven colour washes retain a hand-drawn finish. The framing includes the thorax and arm poses.

| Supplied drawing | Portrait in `media/image/leader/hivers/` |
| --- | --- |
| `IMG_1467.png` | `hiver-amber-pendant.png` |
| `IMG_1464.png` | `hiver-fur-mantle.png` |
| `IMG_1466.png` | `hiver-high-crown.png` |
| `IMG_1463.png` | `hiver-horned-mask.png` |
| `IMG_1468.png` | `hiver-black-ruff.png` |

The descriptive filenames identify the artwork, not character names or game roles. The Storybook
leader tokens use sample names, strengths, and the existing Obsidian Mantis emblem for crop review.
These values are not Hiver faction rules. Each portrait has a square PNG source with a tan background
matching the supplied GF9 references, plus generated 128 px and native-size WebP variants.

### Initial catalogue

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
