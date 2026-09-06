# Dune Zone

Dune Zone is a community catalogue for Dune board-game factions, rulesets, and the people and groups that maintain them.

## Language

The product vocabulary. [`AGENTS.md`](AGENTS.md#language) holds the technical vocabulary: kit,
membrane, organ, doorway, seam, chrome.

**Group**:
A collaboration boundary shared by factions, rulesets, and future community assets. Active members may maintain associated content and manage membership intake, while the Group owner alone may rename the Group or remove active members.

**Deleted Group**:
A Group its owner has deleted. It survives with its memberships and asset associations intact, but the product treats it as not found for everyone, owner included: it appears nowhere, grants no collaborative access, and accepts no changes, while its name and slug remain reserved. Recovery is an administrative act, not a product capability; restoring a Group never reclaims an asset whose owner reassigned it away.
_Avoid_: Archived group, removed group

**Group-associated asset**:
A faction, ruleset, or future community asset that its owner has assigned to a Group for collaborative maintenance. Active members may edit it, while its owner alone may rename it, delete it, or change its Group association. Renaming is the owner's for every kind because it recalculates the slug and moves the public URL with no redirect behind it, which makes it an identity change rather than an edit. An asset whose Group is deleted or no longer exists presents as ungrouped; the stored association survives until its owner changes it.

**FAQ question**:
A ruleset question owned by its author, who may edit or remove it and moderate its answers regardless of the ruleset's Group association.

**FAQ answer**:
A response owned and editable only by its author. Its question owner may accept, unaccept, or remove it, but may not rewrite it.

**Faction catalogue**:
The public collection of factions whose primary purpose is discovery. Ownership and creation are supporting workflows rather than the catalogue's organizing purpose.
_Avoid_: Faction overview, faction index

**Recently created faction**:
A faction surfaced because its catalogue entry was created recently, independently of later edits.

**Recently updated faction**:
A faction surfaced because its catalogue entry received a post-creation edit. Its update time is later than its creation time; creation itself does not count as an update.

**Faction catalogue spotlight**:
One of two distinct factions highlighted in the catalogue header: the newest arrival and a freshly updated faction. The freshly updated selection excludes the newest arrival.
_Avoid_: Featured faction

**Faction card**:
A reusable, identity-first summary of a faction shown in discovery grids, including the Faction catalogue and profile detail pages. It communicates faction identity and ruleset membership; stewardship and complete game content belong on the faction detail page.

**Rulebook**:
An ordered set of fixed-size pages belonging to a Ruleset, maintained collaboratively and intended for web reading and PDF export. Renaming one is its owner's alone, as for every other maintained entity.

**Rulebook Contents**:
The versioned authored substance of a Rulebook: its Rulebook Pages, Rulebook Blocks, Repeated text items, and their ordering and placement. Rulebook identity, ownership, name, and other metadata remain outside its Contents.

**Rulebook Page**:
One fixed-size unit of Rulebook Contents whose chosen layout defines common properties and named Page regions. A Page owns its Blocks; they may move among its compatible Block regions but never to another Page.

**Rulebook Page details**:
The default editor destination within a Rulebook Page. It exposes the Page's common controls and region summaries but owns no authored data separately from the Page.

**Rulebook Page region**:
One layout-defined grouping within a Rulebook Page, identified by a stable key but never authored or visited as an independent entity. Every Page region is either a Control region or a Block region.
_Avoid_: Slot, direct-field slot, field region

**Rulebook Control region**:
A navigable Page region that exposes one or more layout-specific controls for Page-owned values. It contains no Blocks.

**Rulebook Block region**:
A non-navigable Page region that orders the compatible Rulebook Blocks placed within it. It has no controls and acts as the boundary for adding, reordering, and moving Blocks on that Page.

**Rulebook Block**:
A stable, structured unit of authored content owned by one Rulebook Page and placed in exactly one of its compatible Block regions.

**Rulebook clipping**:
The valid condition where part of a Rulebook Block extends below its fixed Page region and is hidden. Authors receive a short, non-blocking Page-number warning for each clipped Block; selecting it opens the exact Block editor with the consequence and remedy. Readers and published artifacts show the clipped result without a warning. A link to clipped text still belongs to its Edition and opens the correct Page at its bottom edge, highlighting the visible part of the target Block when possible.

**Rulebook active path**:
The editor location addressed by the URL: a Page followed by Page details, a Control region, or a Block. A Page alone is context rather than an active target; the leaf determines the controls, previewed Page, and preview highlight.

**Repeated text Block**:
A Rulebook Block that owns an ordered collection of Repeated text items.

**Repeated text item**:
A stable text entry owned by one Repeated text Block.

**Rulebook placement**:
The ordered location of a Rulebook Page, Rulebook Block, or Repeated text item among its siblings. A placement is understood relative to stable sibling identities rather than as a numerical position.

**Rulebook edit patch**:
One editor's unsaved intended differences from a Rulebook reconciliation baseline.

**Rulebook edit operation**:
One intended creation, deletion, field change, placement, or restoration within a Rulebook edit patch.

**Rulebook reconciliation baseline**:
The saved Rulebook Contents state against which an editor's current edit patch is interpreted.

**Rulebook saved revision**:
One identified state of saved Rulebook Contents.

**Rulebook incompatibility**:
A saved change and a local intended change that produce different outcomes for the same Rulebook value or structure.

**Rulebook incompatibility resolution**:
An editor's chosen final outcome for one Rulebook incompatibility.

**Calculated complexity rating**:
The required estimate of how hard a faction is to play, derived from its rules. It remains distinct from an author's judgment so the estimate can be inspected and retuned without erasing that judgment.

**Manual complexity rating**:
An optional author-chosen assessment of how hard a faction is to play. When present, it overrides the Calculated complexity rating on reader-facing surfaces without replacing it.

**Effective complexity rating**:
The rating presented to readers: the Manual complexity rating when one exists, otherwise the Calculated complexity rating. It is a selection between the two ratings, not an independently maintained rating.

**Profile summary**:
The public identity chip for a person referenced by content they are shown on: profile identity, URL slug, display name, and avatar. It is one shape everywhere a contributor appears on content (FAQ askers and answerers, Group owners and rosters, ruleset owners), distinct from the full profile.

**Account lifecycle**:
An account is active, awaiting deletion, or deleted. The auth user owns authorization state; the Profile mirrors it for indexed public reads. Missing state is treated as active only during the compatible migration window. Awaiting-deletion and deleted accounts cannot use application reads or writes and do not appear as live public profiles. Stored authorship, memberships, and links remain historical data.

**Direct ownership**:
The narrow set of records an account alone owns and must dispose of before deletion: Groups through `created_by`, plus factions and rulesets through `owner_id`. Authorship, Group membership, collaboration, and edit capability are not direct ownership. `DIRECT_OWNERSHIP_KINDS` is the server contract; a new owned kind is incomplete until it adds an owner-and-deletion index and joins that registry.

**Discoverable profile**:
A profile eligible for public discovery because it has a non-placeholder display name and slug, an avatar, and a valid creation time. Discoverable profiles are ordered newest first. This ordered discovery concern is distinct from numerical Statistics.

**Faction slug**:
The faction's public URL identifier, derived from its name. It is distinct from the faction's durable internal identity and may change when the faction is renamed.

**Faction leader**:
The single required primary leader who represents a faction, distinct from its supporting leaders. Among rendered game assets, the Faction leader is used on the faction shield.
_Avoid_: Hero

**Supporting leader**:
One member of a faction's ordered supporting-leader roster. A faction may have zero to ten supporting leaders; five is conventional but not required.

**Troop count**:
The number of physical tokens supplied for one faction troop type. A reversible troop token has one Troop count shared by its front and back faces.

**Starting spice**:
The amount of spice a faction begins the game with. Starting spice is a structured setup value, distinct from the faction's free-form starting instructions.

**Background definition**:
How soft or crisp the selected pattern appears in a faction's composed background.

**Background influence**:
How subtly or strongly the pattern color participates in a faction's composed background.

**Background inversion**:
The choice to reverse which light and dark regions of a selected pattern reveal the pattern color.

**Asset type**:
The flat discriminator naming exactly what a community asset is: a treachery card, a disc token, a deck. There is no nested category-plus-subtype structure; each Asset type carries its own content schema, its own Renderer, its own editor, and its own route family. URLs use the discriminator verbatim (`/assets/card-treachery/{slug}`), and Asset slugs are unique within an Asset type, not globally. Decks are a single Asset type: a deck may hold any cards, deliberately unconstrained by the model.

**Card anatomy**:
A card is described with a fixed vocabulary: the **Head** (its name, its Type line, and the Background behind them), the **Icon** (the vector in the top-right disc, its own Background, and its scale), its **Decals**, and the **Body** (the text). "Kind", "corner", "artwork", and "rules" are not card-anatomy words.

**Asset category**:
The presentational grouping of Asset types that arranges the assets landing page: cards, decks, tokens, boards. It is always derived from the Asset type, never maintained independently, and it appears nowhere in URLs or uniqueness rules: routes and slugs are per Asset type.

**About**:
Entity-level prose explaining a thing, shown in an "About" section on its detail page; an empty one shows the section with a nothing-written-yet line rather than hiding it, so the field reads as present-but-blank instead of missing. Plain text, never markdown. An Asset carries one inside `data`, with no length floor, because an Asset with nothing to explain is the normal case; a Ruleset carries one with a 50-character floor, because a Ruleset without one is useless.

_Not_: **description**, which names a label on a sub-component inside `factions.data`: a troop's, a planet's, an extras link's. The two live at different levels, and only one of them is prose a reader chooses to read.

**Token backside**:
The reverse face every token has. It is either authored as part of the token itself, or it is another existing token serving as the back, a reference, never a copy. A token with a referenced backside publishes only its own front face; the back resolves to the referenced token's publication.

**Cardback**:
The shared back face of a deck, never a standalone asset. Every deck wears exactly one: chosen from the stock cardbacks the product defines, or authored as part of the deck. Publishing a deck publishes its Cardback image either way; the member cards' faces are published by the card assets themselves.

**Stock cardback**:
One of the product-defined Cardback compositions a deck may wear instead of authoring its own. Choosing one changes only where the render payload comes from; the deck still publishes its own Cardback image.

**Bundle**:
An Asset type inside the tokens category that holds tokens of any shape, with a count for each. It is the one Asset type that publishes nothing at all: its members publish their own faces, and a bundle has no image of its own to publish. Membership lives in `asset_relations` rather than inside the bundle's `data`, so adding a token or changing a count writes a row at once rather than waiting for a save. A member's count is the same word, and the same meaning, as a deck's copies of a card; the vocabulary does not fork, so there is no bundle-specific counting word beside Troop count.

**Band**:
The authored part of a Bundle's face: a Background plus a label, drawn across the middle of a container the product supplies. A bundle is the one Asset type with no artwork of its own, so the Band is what tells two bundles apart. A blank label falls back to the bundle's name, which is a real choice rather than a gap.

**Stock band**:
One of the product-defined Band compositions a bundle may wear instead of authoring its own. Which one was chosen is not stored: the editor recovers it by comparing the stored composition field by field, the way a Stock cardback is recovered.

**Ruleset asset slot**:
A named position on a ruleset. Three slots hold at most one asset each, a treachery deck, a spice deck and a tech-token bundle, and two hold any number, one for custom decks and one for custom token bundles. Slot names are curatorial labels rather than constraints. Any asset of the kind a slot expects may fill it, that kind is enforced by the link mutations rather than by the schema, and a slot may sit empty. An asset may occupy slots in many rulesets; its detail page shows the rulesets that link to it, while the links themselves are managed only from the ruleset's edit surface.
_Avoid_: Ruleset deck slot. The slots carry token bundles as well as decks.

**Renderer**:
The currently deployed implementation that produces one asset type. Exactly one Renderer is available at a time.

**Renderer revision**:
A monotonically increasing invalidation marker for one asset type. Increasing the Renderer revision makes every existing publication of that asset type stale and schedules regeneration by the currently deployed Renderer; it never identifies or selects a historical Renderer. It is the only mechanism that forces asset-type-wide recapture.
_Avoid_: Renderer version, desired Renderer version, supported Renderer version

**Renderer-revision activation**:
The asynchronous release action that advances one or more checked-in Renderer revisions in `admin_settings.renderer_revisions` and starts their Regeneration scans. CI deploys Convex, deploys and smokes the Worker, compares the checked-in and stored revision maps, then calls one atomic activation mutation only for higher checked-in revisions. Equal revisions are a no-op and a stored revision higher than the checked-in value fails the release. Successful scheduling completes the CI contract; CI does not wait for scans or captures.

**Publication job**:
An ephemeral, self-contained request for the Publisher to regenerate one asset. Its asset type and stable source-document identity provide deduplication, while its validated asset data is the exact render payload. A save creates a pending Publication job unless one is already pending. When the Publisher starts the job, it becomes in progress and receives an expiry for crash recovery. A save during that capture may create one pending successor; the in-progress job is allowed to finish its embedded payload, and the successor later renders the newest saved payload. Successful publication deletes only the completed job.
At most one pending successor exists for an asset, so rapid saves coalesce into one later capture.
A reported capture failure immediately increments the job's attempt counter and returns it to pending. If an in-progress job expires without reporting a result, recovery does the same. On the tenth failed attempt, the job enters error instead of returning to pending.
When a save coalesces into an existing pending job, it resets the attempt counter because the next capture will use new source data.
When an asset with an error job is saved, that terminal job is deleted and the save creates a fresh pending job with no attempts. `/__jobs` represents current operational work, not job history.
Soft-deleting a faction has no Publication-job semantics: it does not delete, cancel, replace, or otherwise change its jobs, and capture proceeds normally.
_Avoid_: Asset generation, desired Renderer version

**Regeneration scan**:
A temporary scan started by a Renderer-revision increase. It visits eligible non-soft-deleted assets and creates or reuses Publication jobs through exactly the same rules as a save. The scan itself is not stored as publication state; Publication jobs are the durable regeneration obligation. Restarting the scan is safe because pending work is deduplicated. Later creations and undeletes follow normal pending publication, while soft-deleting an asset does not cancel work already enqueued.
There is no durable rollout or rollout-item state machine, and neither the triggering Renderer revision nor a scan identity belongs on a Publication job.

**Asset publication state**:
Whether the last successfully published asset is current or awaiting replacement. This is separate from Publication-job status: an existing publication remains available while a replacement job is pending, in progress, or in error, and a successful job atomically replaces its publication metadata.

**Publication asset**:
The durable pointer to the latest successfully published object for one asset type and stable source-document identity. It stores only an application-facing cache buster and publication time; using that cache buster in the public URL is optional because delivery selects the current object by pathname and ignores query parameters. The asset bytes remain in object storage and render data remains on Publication jobs.

**Publication cutover**:
The one-time clean break from the legacy publication model to the current model. Legacy publication records and unfinished work are not imported or used as a compatibility read path. Temporary loss of public asset links is accepted; each link returns after a new Publication job successfully creates the current Publication asset. Legacy bytes that remain in object storage have no publication authority.
_Avoid_: Publication compatibility window, legacy publication fallback

**Publisher kill switch**:
A global boolean control read when a cron invocation begins. When off, that invocation does not pick up pending Publication jobs, but it still performs expired-job recovery. Toggling it has no effect on a cron invocation or capture already in progress and does not delete, reset, or otherwise mutate any job. Its current state and toggle are available on `/__jobs` only to Administrators. Deployments preserve its current value rather than temporarily changing it.
_Avoid_: Paused rollout, paused job

**Publisher recovery**:
The forward-only response to a defective Publisher deployment: turn off job pickup, deploy a new fix, verify that deployment, increase the Renderer revision when affected publications need replacement, and turn pickup back on. Recovery never creates regeneration jobs directly; the revision increase is the one bulk-recapture mechanism. The system never redeploys a historical Worker, decrements a Renderer revision, restores historical publication state, or creates rollback work.
_Avoid_: Worker rollback, Renderer rollback, rollback rollout

**Administrator**:
An authenticated user whose Convex Auth `users` document has `isAdmin: true`. The flag is assigned manually through the Convex dashboard. Administrative routes may use it for presentation, but every protected Convex query and mutation must independently require it. When an authenticated non-Administrator visits `/__jobs`, the route renders a visible `Not authorized` message instead of redirecting or exposing job data.

**Publisher operational evidence**:
The current proof that an asynchronous release is healthy: Worker health smoke confirms the deployed Git SHA and Renderer identity; Regeneration scans emit structured start and completion logs; and `/__jobs` shows no error jobs, no overdue in-progress jobs, and decreasing pending work while pickup is enabled. The queue need not reach absolute zero because ordinary saves can continuously add work. Automatic detection and notification integrations are deferred.
