# GF9 raw JSON loading and authenticated update research

Research for [Establish raw JSON Load and authenticated update constraints](https://github.com/ndelangen/dunezone/issues/2359), under [GF9 correction: local review and two production content batches](https://github.com/ndelangen/dunezone/issues/2357).

Inspected on 20 October 2026 at `77c26fcfa1a5ff61ae36b087fb55150f4da99497`. `bun run worktree:setup` fetched `real-origin` and confirmed this base before the research branch was created. This report changes no application code or production data. Findings below describe this source revision, not a fresh authenticated production inspection. Recommendations are inputs to the map's human decisions, not approval of an implementation.

## Answer

Extend the existing Load action to accept raw JSON and replace an unsaved editor draft. Keep the target, account, ownership and Group outside that JSON. The normal editor Save must still authorize and validate every write. Rulebooks then use a separate Publish action.

Raw JSON input itself is a small addition. Safe replacement exposes three existing constraints that the implementation must address explicitly:

- Assets and factions currently save without an expected revision or state hash. Reading the latest page before clicking Save does not prevent another editor from saving between the read and the write.
- Deck and bundle membership is separate from `data`. Existing membership controls write immediately; a pasted data object must not silently clear or copy membership.
- Rulebook Save cannot change size/design or a surviving Page's layout. Publish immediately changes the default Edition while its artifacts are preparing. Those behaviors need deliberate contracts before the corrected books can retain their identity and replace ready public output safely.

The existing multi-record importer supplies useful binding and state-hash code, but it is not the requested authoring interaction. Do not route raw Load through its automatic apply/publish behavior. A general portable export platform is unnecessary.

## Existing loading behavior

| Concern | Verified behavior | Primary source |
| --- | --- | --- |
| Shared interaction | Load opens a 440 px toolbar-anchored popover. A source reports pending, error or chosen. Only the explicit Load button clones the choice into the draft. The pane warns that unsaved changes will be replaced and Save is separate. | [LoadExisting.tsx, lines 11-36 and 72-240](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/src/app/widgets/authoring/LoadExisting.tsx#L11) |
| Asset selection | Reads the selected asset's own public page, then parses its stored data against the current editor schema. Presented catalogue rows can contain inherited cardback data, so the loader deliberately does not trust them as authored data. | [assetLoadSource.tsx, lines 22-145](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/src/app/pickers/assetLoadSource.tsx#L22) |
| Asset update name | On an edit page, Load keeps the target's current name and excludes the current asset from source choices. This prevents an ordinary copy Load from accidentally renaming the target. | [assetLoadSource.tsx, lines 46-78](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/src/app/pickers/assetLoadSource.tsx#L46) |
| Pending choice race | Asset choice reads use a monotonically increasing ticket. A later choice or preset invalidates an earlier asynchronous read. The selected source also refuses a back reference that would point the edited asset at itself. | [assetLoadSource.tsx, lines 88-185](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/src/app/pickers/assetLoadSource.tsx#L88) |
| Faction copying | The faction source strips row identity and calls `renewFactionComponentIds`. This renews supporting/faction leader `memberId` and troop `troopId`, even when loading into an existing faction. It means copy, not same-entity round trip. | [factionLoadSource.tsx, lines 8-31](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/src/app/widgets/faction-editor/factionLoadSource.tsx#L8), [componentIdentity.ts](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/src/shared/factions/componentIdentity.ts) |
| Faction draft replacement | `loadDraft` preserves the saved Reset baseline, marks the draft dirty and resets prior mutation errors. Normal Save validates `FactionWriteSchema` and replaces the baseline with the canonical server result. | [factionAuthoringSession.ts, lines 48-105](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/src/app/widgets/faction-editor/factionAuthoringSession.ts#L48) |
| Draft-only memory | Token/deck Load adapters reconstruct editor memory separately from stored data. `postedPayload` filters session memory to the stored schema's keys before Save. Raw input must validate first rather than rely on this filter to hide invalid or privileged keys. | [loadedDrafts.ts](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/src/app/routes/_app/assets/loadedDrafts.ts), [authoringEnvelope.ts](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/src/app/widgets/authoring/authoringEnvelope.ts) |

A large raw JSON editor cannot become another full editor inside that popover. Repository instructions say complex editors expand inline, floating UI stays small and single-layer, widgets take data/callbacks, and connected reads go through the page or lazy read-only Picker. Keep the existing Load entry point, but make its raw-input mode an inline authoring region. Its exact interaction needs the map's prototype review. See [AGENTS.md, component taxonomy and floating UI rules](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/AGENTS.md#component-taxonomy).

## Normal writes and what they preserve

### Assets and factions

`assets.update` takes only `{id, data}`. The stored asset type selects the write schema. It validates references, checks edit/rename permission, patches `data`, `slug` and `updated_at`, queues publication and refreshes dependent cards. It does not patch owner, Group or Ruleset links. It has no stale-baseline argument. See [assets.ts, lines 662-694](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/convex/assets.ts#L662).

`factions.update` likewise takes `{id, data}` without a revision. It checks edit/rename permission, preserves row identity and ownership/Group fields, validates newly added Extras, and queues the sheet and derived faces. `factionInputForWrite` refuses an update missing persistent member/troop IDs once the stored faction has adopted them. Existing IDs are not recovered by matching names. See [factions.ts, lines 389-488](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/convex/factions.ts#L389) and [factionInput.ts, lines 40-54](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/convex/lib/factionInput.ts#L40).

Content edit permission and rename permission differ. Active Group maintainers can edit; a changed name additionally requires the rename capability. Removing the twelve `GF9 ` prefixes is a rename and must use the verified owner's normal authenticated session. JSON must not enable a disabled name field or bypass that server check. See [collaborativeAccess.ts, lines 373-418](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/convex/lib/collaborativeAccess.ts#L373).

For same-entity faction correction, preserve all reviewed `memberId` and `troopId` values. Editing a leader name must not create a different leader publication identity. A deliberately added component gets a fresh ID; a deliberately removed component is an explicit reviewed deletion. Copying another faction must continue to renew IDs. Never infer copy/update semantics from matching faction names.

### Decks and bundles

Membership lives in `asset_relations`. `assets.create` can atomically copy members from a chosen live same-type container via `members_from`; a truncated membership read refuses the whole copy. That option does not exist on `assets.update`. The edit pages' `setMemberCount` controls write immediately. Counts are integers from 0 to 99; zero removes a relation. Decks hold card types; bundles hold token types. See [assets.ts, lines 609-660 and 785-907](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/convex/assets.ts#L609), [deckEdit.tsx](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/src/app/routes/_app/assets/$type/$slug/edit/deckEdit.tsx) and [CONTEXT.md, Bundle](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/CONTEXT.md#language).

`replaceAssetMembers` already validates a complete list, rejects duplicates and more than 500 entries, checks each live member and its type, and updates only the container's relation rows. It is a helper used by the importer, not a normal editor draft Save operation. See [assets.ts, lines 909-951](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/convex/assets.ts#L909).

Recommended initial raw data Load leaves all membership alone. If the local-to-production workflow needs membership replacement, add an explicit membership draft and atomically save it with container data through the ordinary authenticated writer. Do not call immediate membership mutations while merely parsing, validating or loading text. Omitted membership means preserve; an explicit empty replacement means remove every member and requires visible review. Treat this as a separate scope choice, not an invisible consequence of a raw `data` object.

Ruleset asset slots, faction links and unrelated stock links live outside these authored payloads. A correction should retain them by updating existing row IDs. Moving an asset between Groups is a separate capability and is not part of Load.

### Renames and former addresses

The current source contradicts the glossary's sentence that renaming has no redirect. `factions.update` and `assets.update` record the former slug in the same mutation. Route loaders call `redirectFromFormerAddress` when their normal lookup misses; that helper throws a 301 and preserves query and fragment. Tests cover multiple renames, deleted records, and an old address taken by another record. A live current holder wins over a former address, and deleted holders continue to decide their reserved address. See [formerAddresses.ts, lines 24-102](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/convex/formerAddresses.ts#L24), [formerAddress.ts](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/src/app/routes/formerAddress.ts), and [formerAddresses.redirects.test.ts, lines 29-136](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/convex/formerAddresses.redirects.test.ts#L29).

Do not promise a specific clean new slug such as `atreides`: allocation can suffix it if another current or deleted faction already holds it. Record the actual returned slug against the unchanged internal ID and verify both old/new public routes after delivery. Slug-based data references such as faction Extras still need deliberate binding; route redirects do not rewrite stored reference fields. Correct the obsolete glossary sentence in implementation documentation, with tests retaining the current redirect behavior.

## Whole-book authoring constraints

### Settings, layouts, identities and links

The current settings catalogue is `square` at 255 x 254 mm, `a4` at 210 x 297 mm, and `tall` at 105 x 297 mm, with `illustrated` and `restrained` designs. The original GF9 formats need their own measured result from the source-format research, not an assumption that one of these is exact. See [settings.ts](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/src/shared/rulebooks/settings.ts).

Creation accepts a starter, same-Ruleset clone or JSON contents/settings source. Cloning renews local identities; JSON creation parses the supplied IDs. Existing editor Save takes only `rulebook_id`, `expected_revision` and `contents`. It checks Ruleset maintenance permission and returns `stale` plus the latest draft when the revision differs. Surviving Page IDs must retain `layoutId`, wide-column position and band position. The client state manager enforces the same issued-layout rule, including region shape, before replacing a draft. See [rulebooks.ts, lines 334-364 and 900-978](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/convex/rulebooks.ts#L334), and [rulebookEditorState.ts, lines 600-683 and 3563-3570](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/src/app/routes/_app/rulesets/$rulesetSlug/rulebooks/$rulebookSlug/edit/rulebookEditorState.ts#L600).

The ordinary book editor currently has no whole-book Load interaction. It does have `replace-draft` in its state manager. This produces an intended patch against a saved baseline, while normal Save reconciles subscription changes and exposes incompatible edits. Reusing it is preferable to posting around the editor, but a structural book replacement needs a defined policy for settings and issued layouts. See [edit/route.tsx, lines 2748-2850](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/src/app/routes/_app/rulesets/$rulesetSlug/rulebooks/$rulebookSlug/edit/route.tsx#L2748).

Pages own Blocks. A Block placement only accepts a region on its own `pageId`; repeated items also remain within their owning Block. Moving a paragraph into a different Page during repagination therefore creates a Block at a new owner, even if its prose is unchanged. Do not describe that operation as preserving the original Block's identity. New layouts can use new Page IDs without violating the creation-only rule, provided the replacement draft deliberately deletes/replaces the old Pages. Four-character local IDs use the unambiguous alphabet in the schema; anchors are unique across all Pages and anchored Blocks. See [CONTEXT.md, Rulebook Page/Block](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/CONTEXT.md#language), [rulebookEditorState.ts, lines 908-916](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/src/app/routes/_app/rulesets/$rulesetSlug/rulebooks/$rulebookSlug/edit/rulebookEditorState.ts#L908), and [contents.ts, lines 32-40 and 704-820](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/src/shared/rulebooks/contents.ts#L704).

Internal text references store `{pageId, blockId?}`. Rendered reference labels and destination anchors follow that target. A missing target remains visible without a stale link. For a complete repagination, author a reviewed old-target to new-target mapping, rewrite every internal reference, and preserve meaningful public anchors at the corresponding new section wherever possible. One old anchor cannot name two new targets; record split/merge decisions. Explicit historical Edition links continue to refer to historical Contents. Bare current-book links use the new Edition, so stable anchors need acceptance tests. See [textReferences.test.ts](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/src/shared/rulebooks/textReferences.test.ts).

Recommended settings extension: revision the authored pair `{settings, contents}` together. A size/design-only change must mark the draft unpublished and create a new Edition on Publish. Current contents hashes and `publish` equality compare Contents alone, so merely allowing a settings field on Save is insufficient. Historical Edition settings already exist and must remain unchanged. Decide whether whole replacement always replaces affected Pages with new IDs or also permits a deliberate same-ID layout conversion. The first option fits current ownership rules and avoids changing the general editor's immutable-layout guarantee. See [rulebookEditionContents.ts, lines 16-92](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/convex/lib/rulebookEditionContents.ts#L16) and [rulebooks.ts, lines 983-1053](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/convex/rulebooks.ts#L983).

### Covers

Normal Save clones/parses Contents, walks cover Pages, and rehosts each changed external source URL before calling the revision-checked Save mutation. A per-save source map avoids rehosting an identical source twice. The rehost action checks current book edit access, mints an image-ingest capability and returns stored image metadata; it does not write the book draft. Save rejects an unstored or mismatched cover rendition. A stale Save may leave an unused stored image, but must not overwrite the newer book. See [db/rulebooks.ts, lines 295-360](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/src/app/db/rulebooks.ts#L295), [rulebookCoverImages.ts](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/convex/rulebookCoverImages.ts), and [rulebooks.ts, lines 930-944](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/convex/rulebooks.ts#L930).

Stored covers use content-addressed Dune Zone delivery URLs and retain `sourceUrl`, width and height. External source syntax requires HTTPS without embedded credentials; local stored-image delivery can use the configured isolated Worker origin. The shared ingest contract limits source bytes to 10 MiB and image output to a 1600 px maximum edge. Full original cover quality must be checked against that rendition policy, especially narrow printed books. JSON must not fabricate `backgroundImage` metadata to evade ingestion. Reuse a verified same-environment stored image or provide an approved source and let normal Save ingest it. Local Worker URLs must never be pasted into production Contents. See [coverImage.ts](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/src/shared/rulebooks/coverImage.ts), [user-images/contract.ts, lines 37-140](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/src/shared/user-images/contract.ts#L37), and [lib/rulebookCoverImage.ts](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/convex/lib/rulebookCoverImage.ts).

## Publication and public selectors

Current Publish snapshots Contents and settings as the next immutable Edition, reserves HTML/PDF artifacts, queues the first-page image, and immediately updates `current_edition_number`. It does not wait for any derived artifact. A concurrent second Publish of the same saved draft returns unchanged rather than minting another Edition. This is observable current behavior, not a ready-before-switch mechanism. See [rulebooks.ts, lines 982-1053](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/convex/rulebooks.ts#L982).

| Consumer | Current selection | Consequence while a new Edition prepares |
| --- | --- | --- |
| Default reader and SSR | `selectedReaderEdition` chooses explicit number or `current_edition_number`. `readerDelivery` uses ready HTML for that exact Edition, otherwise live rendering of its saved Contents and live source resolution. | The new Edition is visible before its HTML/PDF/cover are ready. It does not fall back to the old ready Edition. |
| Edition history and chooser | Enumerate every Edition row descending. | A preparing Edition appears in public history immediately. There is no confidential candidate concept. |
| Ruleset book listing/catalogue | Joins the row's current Edition for dates, artifact states and first-page preview. | Tiles can show preparing artifact links or no first-page image while the older Edition remains ready. |
| Social metadata | Reader route uses the selected Edition's first-page image and number; explicit historical requests have an Edition-specific canonical query. | Default social metadata moves with the current pointer, independently of artifact readiness. |
| Stable latest HTML artifact | `/published/rulebooks/<id>/rulebook.html` selects the highest ready HTML Edition, regardless of completion order. | It can disagree with default reader/current/history, and can select a prepared future Edition if candidate creation is added without changing this resolver. |
| Explicit Edition HTML/PDF | Permanent per-Edition paths; only ready artifacts get public links. | They can remain available as older immutable outputs; new failed/preparing artifacts must not replace their bytes. |

Sources: [rulebooks.ts, lines 600-799](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/convex/rulebooks.ts#L600), [lib/rulebookList.ts, lines 38-77](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/convex/lib/rulebookList.ts#L38), [reader route, lines 52-92](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/src/app/routes/_app/rulesets/$rulesetSlug/rulebooks/$rulebookSlug/index.tsx#L52), [rulebookEditionArtifactWork.ts, lines 151-194](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/convex/rulebookEditionArtifactWork.ts#L151), and [rulebooks.latestHtml.test.ts](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/convex/rulebooks.latestHtml.test.ts).

The smallest proposed ready-before-switch contract is per book, not all four books or the entire catalogue in one transaction:

1. Save the reviewed replacement into the private authored draft with CAS, retaining Rulebook/Ruleset identity. It is still separate from Publish.
2. A normal authenticated Publish preparation freezes one candidate from the exact saved revision plus settings and queues its HTML, PDF and first-page capture. Preserve the current public Edition pointer.
3. Exclude that candidate from default reader, public history, catalogue, social metadata and stable latest HTML until activation. A hidden default is not confidentiality: explicitly decide whether a guessed candidate Edition URL is publicly readable or requires maintenance access. Do not call it private merely because the normal UI does not link it.
4. After all required candidate artifacts and dependencies match the reviewed content and are ready, activate that same candidate with an authenticated action and an expected current-public pointer. One atomic mutation updates public authority. A newer saved draft must not silently substitute itself. Choose whether a changed draft invalidates activation or whether the explicitly reviewed frozen candidate remains publishable.
5. Keep ready old Edition outputs intact if capture fails. Surface failure and offer a normal retry for the same immutable candidate. Concurrent preparation/activation and network retries must not allocate duplicate Editions or publish an older candidate over a newer current pointer.

This requires an explicit candidate/publication authority state, or an equivalently precise representation. Merely postponing the current pointer is inadequate because latest-ready HTML and public history currently select other Edition rows independently. It also requires care with first-book creation, which currently creates public Edition 1 immediately. The map should decide whether this contract changes only replacement publishing or the general Publish action. No implementation is approved by this report.

### What is immutable and what remains live

Edition Contents and settings are stored separately from draft metadata and remain immutable. Artifact storage uses a permanent Edition key, a conditional first-write, and metadata containing artifact identity, Edition identity and byte hash. Existing bytes are reused only when their metadata matches; they are not overwritten with a new render. Completed HTML bytes and PDF bytes are therefore stable outputs. See [rulebookEditionContents.ts, lines 95-120](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/convex/lib/rulebookEditionContents.ts#L95) and [rulebook-artifact-r2.ts, lines 36-91](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/workers/publisher/rulebook-artifact-r2.ts#L36).

That does not make every historical web image immutable. Ordinary published asset paths serve one current object; `?v=` is a cache buster and the delivery cache removes query parameters. A historical HTML file can contain an older-looking `?v=` URL whose bytes change after an asset save. Rendering an Edition from Contents resolves live assets/factions at read time. The annotated asset-explainer endpoint preserves the Edition's annotation choices but resolves its source live. See [publicationTargets.ts, lines 285-307](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/src/shared/asset-publishing/publicationTargets.ts#L285), [delivery.ts, lines 425-430 and 654-710](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/workers/publisher/delivery.ts#L425), [rulebookReferences.ts, lines 67-210](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/convex/lib/rulebookReferences.ts#L67), and [rulebookAnnotatedIllustration.ts, lines 23-165](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/convex/rulebookAnnotatedIllustration.ts#L23).

There is a narrower exception: component delivery accepts an explicit UUID `componentRevision` and reads the corresponding retained image-and-geometry envelope. Faction leaders always use the component delivery branch; other component types do so when that explicit query is present. An ordinary leader `?v=` alone still resolves the current revision. `RulebookAssetExplainer` adds `componentRevision` when its source supports it. This is not a general historical-byte guarantee for every referenced illustration. See [component-delivery.ts, lines 17-70](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/workers/publisher/component-delivery.ts#L17), [delivery.ts, lines 662-682](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/workers/publisher/delivery.ts#L662), and [RulebookAssetExplainer.tsx, lines 51-61](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/src/game/rulebook/RulebookAssetExplainer.tsx#L51).

The two accepted content batches intentionally allow corrected asset publications to become visible before the replacement books. This includes their appearance inside old web books through live references. Waiting for batch one's reviewed dependencies before preparing batch two prevents new PDF/HTML captures from embedding stale asset faces. It does not promise an all-at-once public change or byte-frozen historical web artwork. Add broad immutable asset snapshots only if the user makes that a requirement.

## Proposed supported raw-data contract

These are recommended boundaries for the later implementation specification.

| Editor | Raw value | Same-entity update semantics |
| --- | --- | --- |
| One Asset type | That type's existing writable `data` object, validated through `parseAssetDataForWrite` and the editor's stored-to-draft adapter. | Route owns target ID/type. Preserve target name under existing copy-Load semantics; an explicit reviewed rename option may use raw `name` only with rename capability. Preserve relation membership and associations. |
| Faction | Full `FactionWriteSchema` data, including existing component UUIDs for same-entity replacement. | Raw same-entity Load preserves component IDs. Existing picker copy keeps renewing them. Show a clear error if an identified update omits IDs, rather than generating new components. Renames obey the normal owner-only capability. |
| Rulebook | Strict `{settings, contents}` object, using the existing settings schema plus `rulebookContentsV1Schema`. | Preserve Rulebook ID, name, slug, Ruleset, ownership and Edition history. Save both authored settings and Contents with CAS after the required extension. Deliberate Page replacement and anchor mapping govern structural changes. Normal separate Publish remains required. |
| Ruleset logo | Normal existing Ruleset cover/image editor and rehost path. | The GF9 logo change needs no generic JSON control for ownership or Ruleset metadata. Preserve `gf9` identity and Group. |

For Assets and factions, use exact existing data shapes without another duplicate schema or an importer package envelope. The route already determines what kind is being edited. For books, `schemaVersion` stays inside Contents; add a new outer format version only if a later compatibility requirement justifies it. Expose an accurate copyable shape/example in the raw-input UI or linked authoring docs. Never accept partial objects as a full replacement while silently keeping arbitrary missing fields.

Reject row metadata such as `_id`, `_creationTime`, `owner_id`, `group_id`, `created_at`, `updated_at`, `is_deleted`, `slug`, publication/jobs/renderer state, import receipts, current Edition pointers and manufactured identity credentials. Faction component IDs and Rulebook local IDs are authored identity and are allowed where specified. Unknown fields should produce a path-specific error, not disappear during projection. JSON objects must never be executed as code or injected as trusted HTML.

The pending raw choice owns its input string, parse result, validation errors and load generation. Editing the string, changing source tab, changing route/account, closing the editor or beginning Save invalidates an earlier parse/reference-resolution result. An old async completion cannot re-enable Load or replace a newer draft. Parse errors identify line/column where available; schema errors identify field paths. Preserve the pasted text on error. Nothing reaches the draft until validation and explicit Load; nothing reaches persisted content until separate Save. Cancel preserves both the current draft and its saved Reset baseline.

Set an explicit UTF-8 input byte limit and structural/page/member limits before parsing or fetching dependencies. The current book PDF limit is 100 Pages and its raw PDF output cap is 96 MiB. Those are output guards, not a suitable JSON input limit. Measure the actual corrected largest book and production mutation budget before choosing the input ceiling. Reject over-limit text with its size and allowed maximum. See [pdfOptimization.ts](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/src/shared/rulebooks/pdfOptimization.ts).

### Example book value

This is a minimal schema-shaped existing-format example, not the corrected GF9 manuscript or an approved physical size:

```json
{
  "settings": { "size": "a4", "design": "illustrated" },
  "contents": {
    "schemaVersion": 1,
    "pageOrder": ["2345"],
    "pagesById": {
      "2345": {
        "id": "2345",
        "anchor": "battle",
        "title": "Battle",
        "layoutId": "single-column",
        "showHeading": true,
        "controlValues": {},
        "blockOrderByRegion": { "content": ["6789"] },
        "blocksById": {
          "6789": {
            "id": "6789",
            "kind": "text",
            "anchor": "battle-sequence",
            "text": "Read the battle sequence before resolving a battle."
          }
        }
      }
    }
  }
}
```

The editor target and expected saved revision are taken from the authenticated editor session, not this pasted value. A rename is a separately reviewed normal operation. Book replacement needs a warning with affected Page/Block counts, settings changes, removed anchors and unresolved references; it need not ask the user to approve every paragraph.

## Local-to-production references

Local database IDs do not automatically identify production records. Current authored references include Asset IDs for cardbacks, token backs, tokens embedded in custom cards and boards; faction IDs and component UUIDs in book sources; faction Extras using asset type plus slug; stock artwork paths and stock board IDs; Page/Block pairs inside book references. Typed reference collectors cover many book source locations, including covers, footer factions, inventories, battles and placed board tokens. Use those contracts rather than search-and-replace over all strings. See [rulebooks/references.ts, lines 39-170](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/src/shared/rulebooks/references.ts#L39) and [rulebooks/sources.ts, lines 13-39](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/src/shared/rulebooks/sources.ts#L13).

Recommend a narrow checked-in GF9 authoring manifest outside the pasted data:

- Stable semantic keys name each GF9 record; a reviewed binding file maps each key to the local and production ID/type/current slug. Record canonical source hashes and the exact target state reviewed for the batch. Bind by known durable production ID once adopted, not by a mutable display name.
- A deterministic preparation step produces fully resolved per-entity writable JSON for the chosen environment. It rewrites only declared typed reference paths and verifies every destination's kind, identity and availability. It never rewrites prose, anchors or every UUID indiscriminately.
- Preserve known production faction component UUIDs in the local corrected counterpart where they are the same component. If local copying renewed them, require an explicit semantic component mapping before producing production data.
- Do not carry local stored-image delivery origins, local IDs, production import receipts or fabricated owners into a payload. Use stock keys unchanged; rehost cover sources through the target environment's normal action.
- Process dependency entities before their consumers, record returned actual identities/slugs, and update the binding file before preparing consumers. Verify Extras and self/circular back references in the target environment.

The existing importer already demonstrates explicit path bindings, rejects unsafe path segments, validates every bound value with its domain schema, and orders dependencies before consumers. Its export warns that database references remain deployment-specific and membership is separate. Reuse these rules where useful, without keeping a second bulk publishing interface as the central correction workflow. See [contentImports/package.ts, lines 14-162](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/src/shared/contentImports/package.ts#L14), and [contentImports.ts, lines 364-420 and 521-560](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/convex/contentImports.ts#L364).

This manifest and preparation step are authored-file tooling. They do not mutate production. The prepared JSON still passes through raw Load and the normal authenticated editor Save/Publish. A user-facing binding editor or general Ruleset export is not required by this research.

## Stale state, retries and recovery

Use one opaque baseline token for the exact normal editable state and its related membership where relevant. The server must compare it in the same authenticated mutation as Save. For existing asset/faction writers this is a missing concurrency contract; a browser-only hash comparison is insufficient. Prefer extending the existing writers and page payloads, rather than adding an administrative replacement endpoint. An opaque digest is a concurrency token, not authorization. Preserve existing auth, ownership, Group and rename checks.

The whole-book baseline should include settings and Contents and use the editor's saved revision. For complete book replacement, automatic reconciliation must not silently blend an older full manuscript with a concurrent edited book. Expose a stale state with retained raw text/draft and require review of the new baseline. Keep ordinary fine-grained editor reconciliation intact; decide the whole-replacement mode explicitly.

Retries should first read the target. If it already equals the reviewed desired state, record success without creating another Edition or scheduling unnecessary publications. If it equals the reviewed baseline, retry with the same expected token. If neither is true, stop for reconciliation. An uncertain network result is not proof of failure. Use canonical domain normalization for equality, not byte equality of pretty-printed JSON or timestamps.

A content batch is a sequence of entity saves, not a transaction across all entities. Store a run manifest containing baseline hashes, desired hashes, resolved target identity, successful saves, artifact identity/readiness and failures. After a partial failure, leave successful records intact, stop consumers of the failed dependency, and resume only after re-reading state. Roll forward with a new reviewed normal save when correction is needed. Do not restore a production database, redeploy a historical Worker, override jobs or fabricate the original user. Previous immutable book PDFs remain available; live asset images may already have changed.

## Acceptance evidence for implementation

1. Raw text opens inline from the existing Load interaction. Valid data updates the preview and marks the draft dirty; Cancel changes nothing. Parsing, typing and Load create no entity writes, membership writes, book Editions or publication jobs.
2. A valid raw asset uses its exact type schema and draft adapter. Wrong types, extra row keys, broken references, self-reference, malformed JSON, invalid formatting and over-limit values produce actionable errors while preserving text. Browser validation and server validation agree.
3. A same-entity faction rename changes only reviewed content/name/slug and queued derived publications. Its internal ID, all surviving component UUIDs, owner, Group, Ruleset links and quantities remain equal. Copy Load still renews component UUIDs. An ID-stripped update is refused rather than recast as a copy.
4. Deck/bundle data Load preserves every existing relation/count. If explicit membership replacement is approved, omitted versus empty membership have distinct tested outcomes, duplicate/wrong-type/deleted members are refused atomically, and stale member edits cannot be overwritten by the same baseline token.
5. Delayed source A cannot replace later raw choice B, a later catalogue choice, a cancelled pane or a different route/account. Cover ingest failure and stale Save retain the authored draft without persisting partial book content.
6. Two maintainers saving from the same baseline cannot both overwrite silently. An auth/session or Group-permission change between Load and Save is refused on the server. Rename remains owner-only and raw fields cannot override row metadata.
7. Whole-book Save can persist each approved original GF9 size/design through the shared renderer, actual HTML, PDF MediaBox and first-page capture. A settings-only change is detected and publishable. A surviving Page cannot accidentally change an issued layout; deliberate replacement follows the chosen identity policy.
8. Repagination checks every Page/Block/item placement, anchor uniqueness, rewritten internal references, reader contents links and old meaningful public anchors. No FAQ Blocks or repeated Sources prose reappear. The accepted board remains unchanged.
9. A replacement's pending/failed HTML, PDF or cover leaves all current public selectors on the old ready Edition under the approved release contract. History, default reader/SSR, catalogue, social cover, stable latest HTML and explicit Edition routes are checked together. Test out-of-order completion, repeated preparation/activation, changed drafts and competing publishers.
10. Historical Edition Contents/settings and already ready PDF/HTML object hashes stay equal. Test and document the accepted live-reference behavior separately from explicit `componentRevision` pins. Never label `?v=` as archival versioning.
11. Batch one verifies the twelve faction identities, corrected display names, selected assets, Group, Ruleset logo, dependency faces and unchanged unrelated stock links. Batch two begins only after required dependency publications match the reviewed payloads. Download and inspect actual final production PDF/image bytes, not only successful Save notices or non-null old publication URLs.
12. Every implementation PR receives separate Astra High code and architecture reviews at its exact final head, incoming AI findings are judged, required CI/audits pass, normal merge/deployment completes, and actual public output is checked. No research branch is merged as implementation.

## Decisions still needed

The research question is answered. These product/architecture choices remain for the map's later human-in-the-loop tickets:

- Approve the inline raw-input prototype, supported per-editor object shapes and whether raw names preserve current copy-Load behavior or expose an explicit capability-checked rename.
- Decide whether any GF9 container membership actually changes. Preserve it by default; require a separate explicit membership draft contract if replacement is needed.
- Approve revisioned book settings and the Page replacement/anchor mapping policy. Do not promise stable Block ownership across Page moves.
- Choose the per-book prepare/activate interaction, required readiness set, visibility/access for candidates and changed-draft activation rule. Define how latest HTML and public history follow the selected public authority.
- Set a measured JSON size ceiling and confirm the rendition quality of full original covers. Add a narrow missing capability only if the existing image pipeline cannot produce the approved print proof.
- Accept the existing live historical web artwork semantics, or explicitly expand scope to byte-pinned asset references. The accepted two batches do not themselves require general immutable asset snapshots.

The source investigation used no privileged production operation and did not verify a currently signed-in maintainer. That verification belongs at the reviewed production execution boundary.

## Research validation

The example above passed the current `rulebookSettingsSchema` and `rulebookContentsV1Schema` through a read-only `bun --no-env-file` invocation. The report passed `bun run check:prose` using the repository's Node 24.21.0 runtime and `git diff --check`. No application tests were rerun because the research changes only this report. Existing test files cited above were read as primary evidence, not presented as fresh execution results.
