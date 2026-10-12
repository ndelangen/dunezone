# Rulebook editor performance research

Research date: 12 October 2026. Source baseline: `3bc00a482a7e7014cc0c2719ee8e8f5c575757fc`.
This is a source audit. No editor optimization or performance benchmark was run.
The reader's published HTML delivery work is separate from this investigation.

An editor shows one Page, but the current editing contract uses the whole saved
Rulebook. There are useful improvements before changing that contract: avoid
reading the current Edition just to compare it, reuse the initial query arguments,
narrow reference joins, reduce whole-book copying, and schedule clipping checks.
Fetching only the active Page is feasible after adding a compact whole-book index
and redesigning saved revisions and reconciliation.

## What the editor does today

The [usage investigation](convex-usage-research.md) attributes 123.16 MB of monthly
database I/O to `rulebooks.editorPage` and 25.65 MB to `rulebooks.save`, respectively
13.6% and 2.8% of the observed team total. Its recent log sample contains one
uncached editor query reading 338,508 bytes across 11 documents. These figures
identify a worthwhile path; they do not say which document dominated that call or
predict savings. Even removing both functions' entire historical attribution would
be a 16.4% upper bound before replacement work. Static reader HTML does not itself
reduce these editor reads.

The editor's [backend query](../../convex/rulebooks.ts), `editorPage`, checks Ruleset
access before loading private draft contents. An editable response contains the
whole saved draft, current Edition publication status, an unpublished-change flag,
and resolved sources. `editionFor` loads the current Edition's contents to calculate
that flag. Draft contents are one field in one document. Edition contents already
have a separate table, but each Edition's contents remain one whole-book document.
See the [schema](../../convex/schema.ts) and
[Edition contents reader](../../convex/lib/rulebookEditionContents.ts).

The [client loader and live hook](../../src/app/db/rulebooks.ts),
`loadRulebookEditor` and `useRulebookEditor`, both call `editorPage`. The loader
omits requested source IDs. The route's first live hook sends empty arrays, then
sends IDs collected from the local draft. These are different arguments. Query
caching means distinct calls must not be counted as automatic duplicate database
reads. The [query retention module](../../src/app/routes/_app/rulesets/$rulesetSlug/rulebooks/$rulebookSlug/edit/rulebookEditorQueryState.ts)
already keeps the editing session mounted while a replacement request is pending.
Settled access denial or deletion still replaces it.

The [route](../../src/app/routes/_app/rulesets/$rulesetSlug/rulebooks/$rulebookSlug/edit/route.tsx)
holds a whole local draft in `RulebookEditorSession`. Every editor-state result
collects source IDs across that draft. A deep comparison prevents unchanged IDs
from changing the live query arguments. Ordinary typing therefore does not request
the backend on every keystroke. Selecting a different source can change arguments
and repeat the full editor query. Switching Pages changes the local URL hash and
uses the loaded local contents; there is no active-Page parameter in the backend
query.

The [reference resolver](../../convex/lib/rulebookReferences.ts) already loads
referenced Assets and Factions rather than the whole catalogue. It unions saved
references with requested local references. Each referenced Faction still loads
the full Faction, its token publication, and every ruler/leader publication. When a
Faction is present in requested IDs, it resolves all troop faces for that Faction,
rather than only cited troop sources. The editor requests all local Faction IDs,
so this branch deserves measurement. The
[Faction picker](../../src/app/pickers/FactionPicker.tsx) is mounted inside an open
popover in the editor; eagerly loading every picker option is not the primary
problem here.

Saving is explicit. `useSaveRulebook` parses and sends the whole book, rehosting
changed Cover image URLs first. The mutation reads the current whole draft, checks
its revision and invariants, writes the whole next draft, and returns it. A stale
save returns the latest whole saved draft for reconciliation. Local edits made
while a save is in flight are retained. These behaviors are covered by
[saving E2E tests](../../e2e/rulebook-saving.spec.ts). There is no editor autosave to
debounce or remove.

## Ranked opportunities

The order below combines likely benefit with implementation scope. Every benefit
is a hypothesis to measure.

| Priority | Candidate | Expected area of improvement | Scope |
| --- | --- | --- | --- |
| 1 | Reuse normalized initial query arguments | Cold editor entry and source-selection query churn | Small client change |
| 2 | Store a canonical contents comparison digest | Edition bytes read on editor executions | Backend/schema migration |
| 3 | Separate or narrow reference dependencies | Source-selection reads and source-driven invalidations | Query contract and resolver changes |
| 4 | Preserve structural sharing through editor state | Typing CPU, allocation and garbage collection | State manager change |
| 5 | Measure clipping incrementally | Initial DOM/layout work and broad source-update work | Rendering/measurement change |
| 6 | Compact successful Save acknowledgements | Network bytes and client parsing | Save protocol change |
| 7 | Store/fetch editable Pages separately | Large-book reads/writes and cross-Page invalidations | Major persistence and revision redesign |

**1. Reuse the initial request.** Normalize omitted and empty source requests to
one shape. Seed local reference state from loader data where available, and keep
request IDs sorted and unique. Avoid requesting saved IDs solely to repeat what
the server already derives, unless the editor needs extra selectable troop faces.
Keep requests for newly selected unsaved sources. Check actual uncached reads and
cache hits before treating a reduction in calls as a billing reduction. Preserve
the current live access check and session retention behavior.

**2. Compare digests instead of reading the Edition contents.** The editor needs
an equality answer, not a second complete book for `hasUnpublishedChanges`.
Maintain a digest using the exact existing canonical comparison semantics,
including Cover normalization. Store it on saved drafts and Edition metadata.
Use the existing comparison for missing/legacy digests while backfilling. Creation,
cloning, Save, Publish, and every other contents writer must maintain it. A slim
return projection alone cannot avoid reading the existing contents document.
The comparison authority is
[contentsMatch and comparableContents](../../convex/rulebooks.ts), using
[canonical JSON comparison](../../convex/lib/rulebookEditionContents.ts).

**3. Narrow references and stop coupling source picks to the whole saved draft.**
A stable draft/access query plus a source query can keep source-selection changes
from reloading the draft and current Edition. Both queries must enforce access;
loss of membership must still remove private editing data. This departs from the
current one-page-query subscription discipline and needs evidence that narrower
dependencies justify it. A single subscription over precomputed source summaries
is another option, with more write maintenance.

First measure whether all troop faces and all leader publications are needed.
Differentiate a Faction whose chooser needs its complete source menu from a
Faction merely referenced on a Page. For genuinely Page-scoped references, keep a
small index of cross-Page target labels and anchors. The
[render projection](../../src/shared/rulebooks/projectRenderDocument.ts) uses the
whole book for text-reference targets and Page numbers, and an anchored card's
label can depend on its source name. Active-Page sources alone cannot preserve all
those results. Hidden clipping measurements also currently use every Page's
sources.

**4. Reduce whole-book copying on local edits.** The
[state manager](../../src/app/routes/_app/rulesets/$rulesetSlug/rulebooks/$rulebookSlug/edit/rulebookEditorState.ts)
already caches normalized text, per-Page validation, saved-revision comparisons,
and placement indexes. `keepUnchangedPages` retains unchanged Page objects inside
the manager. `readyResult`, however, clones the draft, comparison draft, latest
saved state, Save candidate, patch, and optional Save request. Dispatch also clones
state for rollback, and `replace-draft` arrives as a fresh whole-book value.

Profile this before replacing it. A page/block edit action with immutable
copy-on-write updates could retain unchanged Pages through both the state manager
and its output. Preserve the existing guarantee that callers cannot mutate manager
state through a returned value, and preserve error rollback. Do not remove the
three-way merge or authoritative validation to make keystrokes cheaper.

**5. Schedule clipping and narrow its dependencies.** Only one visible preview is
rendered, but `ClippingMeasurementPage` mounts a hidden renderer for every Page.
Its [CSS](../../src/app/routes/_app/rulesets/$rulesetSlug/rulebooks/$rulebookSlug/edit/route.module.css)
uses `visibility: hidden`, allowing layout. Each Page installs measurement
observers and measures immediately. Existing structural memoization keeps
unchanged Pages' projection, DOM and observers across an ordinary text edit.
It would be incorrect to claim every Page rerenders on every keystroke.

The comparator still compares complete source maps for each hidden Page. A source
map change can invalidate unrelated Pages. Give each Page a dependency signature
or subset, including cross-Page target-label dependencies. Consider one active
measurement plus a bounded idle queue for changed/background Pages, caching
completed results. The header currently reports clipping anywhere in the book,
so deleting offscreen checks changes behavior. A queue needs explicit
pending results and eventual full coverage. Fonts, image dimensions, settings,
Page numbers and layout parity must invalidate cached measurements; reorder can
affect otherwise unchanged Pages. Block drag deliberately suspends measurement
to keep drop geometry stable and must retain that behavior.

**6. Return a compact successful Save acknowledgement.** A normal successful Save
could acknowledge the revision and canonical changes without echoing all contents.
Cover rehosting means the server-confirmed value may differ from the request, so
the acknowledgement must include those generated fields. Retain enough latest
contents on stale responses to rebase, and keep later local edits while applying
the acknowledgement. This targets transport and parsing. If the backend still
stores one whole-book field, it does not remove the whole-document database read
or write.

**7. Fetch and save individual Pages.** To reduce database bytes substantially,
move Page bodies into separate documents. A compact draft header can hold Page
order, settings/layout metadata, Page revisions/digests, and a cross-Page anchor
and target-label index. The active Page and imminent navigation targets can be
loaded lazily. Keep unsaved Page edits locally when navigating. Measure loading
latency and cache behavior: today's Page switch is immediate.

A patch mutation that merely reconstructs the existing whole contents field still
reads/writes the whole book. Genuine Page storage needs transactional validation
of the index plus changed Pages and a compatible revision model. During migration,
old bundles using the full-body Save/query protocol must remain supported. Plan an
expand/contract rollout and backfill, rather than replacing public functions in
one deployment.

## Whole-book behavior that must survive

The [contents schema](../../src/shared/rulebooks/contents.ts) checks unique Page IDs,
complete Page order, Page/map identity, Block placement and anchors unique across
the book. Backend Save also preserves fixed Page layouts and creation-only
orientation. Partial loading must retain authoritative global checks, including
when two authors change different Pages simultaneously.

The state manager reconciles baseline, latest saved book and local draft. It
handles concurrent field edits, reordered/deleted/restored Pages and Blocks,
anchor collisions, and explicit incompatibility review. Moving to Page revisions
must preserve safe outcomes for these cases, not silently overwrite unrelated
Pages. Cross-Page links need stable labels and correct Page numbers while the
target Page is unloaded.

Publish captures an entire saved revision atomically as an immutable Edition.
The [publication code](../../convex/rulebooks.ts) reads the saved draft, rejects
stale revisions, reserves derived artifacts, and advances the current Edition.
The [publication resolver](../../convex/lib/rulebookPublication.ts) intentionally
resolves a complete Edition for HTML/PDF jobs. Separate Page storage must still
produce one coherent saved book, retained Editions, and the same artifact identity.
First-Page capture could independently narrow source resolution, but its frequency
and contribution have not been measured.

## Measurements and focused verification

Use the same saved book and source set before and after each candidate. Record
Page/Block counts and serialized draft/Edition/source sizes; no production content
needs to be included in the report. Use local fixtures or the approved anonymized,
published-only snapshot for reproducible browser measurements.

- Database: cold entry, cached entry, first live subscription, switching Pages,
  selecting/removing a source, source publication update, another author's Save,
  successful Save and stale Save. Record function executions, cache hits, documents
  and bytes read/written, returned bytes, and latency. Separate database I/O from
  browser payload size.
- Browser: entry to usable editor, Page-switch latency, per-keystroke scripting and
  render/layout time, long tasks, allocation/heap, hidden Page DOM count, observer
  count and measurement invocations. Compare small and large books, including a
  book with many shared Faction references. Record source-update and reorder work
  separately from typing.
- Persistence: repeat measurements after partial-page storage on the same fixtures
  before estimating monthly savings. Production cache/invalidation frequency still
  determines realized attribution.

Extend the existing
[editor-state tests](../../src/app/routes/_app/rulesets/$rulesetSlug/rulebooks/$rulebookSlug/edit/rulebookEditorState.test.ts)
and [saving E2E suite](../../e2e/rulebook-saving.spec.ts) for changed behavior: edits
during Save, stale responses, explicit conflicts, rejected authoritative revisions,
Cover acknowledgement, denied/signed-out access, and two authors editing separate
Pages. Add digest equivalence/backfill coverage only if implementing digests.
For Page storage, test cross-Page duplicate anchors and reorder/delete/restore
transactions. For clipping changes, test offscreen warnings, late fonts/images,
source-label changes, stable focused fields and drag suspension alongside the
existing [route E2E suite](../../e2e/rulebook-editor-route.spec.ts).

Start with the request/digest/reference improvements and a reproducible browser
profile. Use those results to decide whether Page storage's migration cost is
justified. The single visible Page is a strong rendering boundary; making it the
persistence boundary requires preserving the rest of the editor's book-wide
contract.
