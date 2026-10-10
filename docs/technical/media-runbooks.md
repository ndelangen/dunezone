# Media runbooks

What to do when the raster pipeline (#1888) stops a deploy, ships a bad release, or loses its one
writer. The pipeline itself is described in [`workers/publisher/README.md`](../../workers/publisher/README.md)
and [`docs/README.md`](../README.md#game-assets-srcgame-media). Three facts make every step below safe:

- R2 objects are create-only. The Worker never overwrites an original, a variant or a ledger record,
  and nothing deletes them (the GC workflow only reports).
- Every name is content-addressed. `/m/<src20>.<recipe10>.<ext>` always means the same bytes, so an
  issued `/m` URL keeps working through any later release.
- The deploy publishes before it goes live. Anything that fails before "Deploy exact Worker release"
  leaves the previous release serving traffic.

## A deploy stops while publishing raster variants

**Symptom.** The "Publish raster variants" step fails with `HEAD answered 200 with integrity that disagrees with the record`, or
`publishing answered 409`, whose body says `A stored variant with this name has different bytes`. The previous release is still
live, and nothing was overwritten.

**What it means.** R2 already holds a variant under that name, and its bytes differ from the ones this
job encoded. The name hashes the recipe, the tier rule, `ENCODER_REVISION` and the exact sharp, libvips
and mozjpeg versions, but not the runner image, so two encodes under one name can still differ. CI
normally avoids this: `generate:images` downloads any variant `/m` already serves before it encodes,
so a deploy encodes only names R2 lacks. A conflict therefore means the job's variant store already
held bytes encoded somewhere else, almost always an Actions cache entry (`media-variants-*`) saved by a
run whose encoder output differs from production's.

**Fix, in this order.**

1. Read the failing names from the log, then compare the two encodes:
   `curl -sI https://dune.zone/m/<name>` shows the stored `X-Media-SHA256` and `X-Media-Bytes`. If
   R2's copy looks right, it wins, and you only need to stop the job from encoding its own.
2. Delete every variant store cache and run the deploy again. `gh cache list` shows 30 entries by
   default, so raise the limit:

   ```sh
   gh cache list --repo ndelangen/dunezone --key media-variants- --limit 1000 --json id --jq '.[].id' \
     | xargs -n1 gh cache delete --repo ndelangen/dunezone
   ```

   The next run restores nothing, fills every published name from `/m`, encodes only names R2
   lacks, and publishes cleanly. Dispatching "Deploy production" on main reruns it
   ([deployment](../deployment.md)).
3. Only if R2's copy itself is wrong (a broken encode reached production), bump `ENCODER_REVISION` in
   `scripts/media-variants.ts`. Every variant then gets a new name, so this re-encodes all of them
   (about 2.6k, minutes of CI) and publishes them as new objects; the old ones stay in R2. The change
   also moves the renderer identity, because `scripts/media-variants.ts` is a renderer manifest input:
   commit the regenerated `workers/publisher/renderer-manifest.generated.ts`
   (`bun run publisher:release:verify` shows the diff) and expect a recapture of published assets
   after the deploy.

**Confirm.** The deploy's verify step logs `"failed":0`, and `curl -sI https://dune.zone/m/<name>`
answers 200 for a name from the failing list (or for its renamed successor after step 3).

Local Storybook pixels can differ from CI's for the same reason: a Mac encodes with its own libvips.
That is expected and is not a deploy problem.

## Forward recovery after a bad release

There is no rollback ([deployment](../deployment.md)): fixes ship as new forward deployments, and the
release gate refuses to put an older commit back. Media make that cheap, because every variant any
release ever served is still in R2.

**Wrong art went live** (the lock pointed a key at the wrong original). Revert the commit that changed
`media/raster.lock.json` and `src/shared/media/map.generated.ts`, from any machine, and merge it like
any PR. The previous original and its variants are already in R2, so the revert needs no upload and
no token: `media:gate` finds the original at its public URL, the deploy finds every variant present,
and the verify step proves them. `/m` URLs change with the lock, so pages pick up the old art as soon
as the release is live. Legacy `/image/...` and `/web/...` URLs are cached for an hour and follow
within that hour. On the Mac, delete the reverted files under `media/image/` before the next
`bun run media:sync`: sync never replaces a file that is already there, and it would otherwise upload
the wrong art again and rewrite the lock. With the files gone, it downloads the lock's originals.

**The release serves media wrongly** (a handler bug: `/m` or legacy URLs answer errors or the wrong
bytes). The deploy's verify step fails after go-live, and the release is never marked `deployed` in
the ledger. Ship the fix as a new commit. Before merging, run the publisher locally and check one
`/m` URL and one legacy URL; after the deploy, its verify step proves the sample again.

**The verify step's record is suspect** (for example, after objects were changed outside the Worker).
The deploy keeps the variant entries it has proved in the Actions cache (`media-verified-*`) and
downloads only new entries plus a random sample of 128. Delete those caches the same way (`--key media-verified-`) or run
`bun run media:publish --verify --all` against production to download every entry again.

## The machine with the upload token is unavailable

Every new original enters R2 through `MEDIA_UPLOAD_TOKEN`, which only Norbert's Mac holds
(`~/.config/dunezone/media-upload-token`). Losing that machine stops new art, nothing else: deploys,
CI and existing art keep working, because none of them need the token.

1. On any machine with Cloudflare access to the account, mint a new token and install it on the
   publisher Worker. This replaces the old one, so the lost machine's copy stops working at once:

   ```sh
   umask 077
   mkdir -p ~/.config/dunezone
   openssl rand -hex 32 > ~/.config/dunezone/media-upload-token
   wrangler secret put MEDIA_UPLOAD_TOKEN --config workers/publisher/wrangler.jsonc \
     < ~/.config/dunezone/media-upload-token
   ```

2. Push the pending art from that machine:
   `MEDIA_UPLOAD_TOKEN="$(cat ~/.config/dunezone/media-upload-token)" bun run media:sync`, then commit
   the lock and map it writes.

A branch with art from a cloud agent waits until then: `media:gate` names the originals R2 lacks, and
`media:sync` on the new machine uploads them.
