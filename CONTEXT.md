# Dune Zone

Dune Zone is a community catalogue for Dune board-game factions, rulesets, and the people and groups that maintain them.

## Language

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
The durable pointer to the latest successfully published object for one asset type and stable source-document identity. It stores only the application-facing cache token and publication time; the asset bytes remain in object storage and render data remains on Publication jobs.

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
