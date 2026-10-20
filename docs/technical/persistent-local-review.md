# Persistent local review

Use a directory outside a disposable worktree. The first launch downloads the newest trusted anonymised published-only snapshot, verifies it and imports it before the first application schema push. It then seeds missing Rulebook drafts, checks the rebuild contract, runs required migrations and provisions the two local reviewer accounts from your ignored `.env.e2e.local` file.

```sh
bun run worktree:setup
bun install --frozen-lockfile
bun run generate:images
bun run app:dev --local --data=snapshot --persist-dir=/Users/me/Projects/Dune/gf9-review
```

The generated launcher manifest records the snapshot artifact/run/time/hash, code commit, stable loopback origins and Docker project. State lives in `.dunezone-runtime/` within the selected directory. The separate `secrets.json`, JWT material and Worker `.dev.vars` have private file permissions. Keep this directory private. Authored payloads and review evidence belong alongside the runtime directory or elsewhere, never inside it.

Python 3 provides the standard-library OS lock on macOS and Linux. A second launcher, including an attempted reset, refuses while the first supervisor owns that lock. The supervisor retains the lock until its process group and local backend stop. The OS releases it after a crash or reboot.

Stop with Ctrl+C. Resume with the same command, from the same or a newer checkout. Resume starts the same Docker volume, auth configuration and local object stores, deploys the selected code and runs normal migration guards. It never imports another snapshot, seeds drafts, rotates identity keys or provisions users after the first complete bootstrap. Missing volumes or an interrupted first import refuse with a recovery message. Bootstrap checkpoints retain completed import, auth and draft stages, so a later migration/build failure resumes without repeating them. Required migrations have a bounded fifteen-minute local review budget.

The existing publisher runs with local Browser, Images and persistent R2 bindings. Each environment owns a copied capture/SSR build, including maintained vector sources. A separate OS lock serializes generation and copying within a checkout. Its generated configuration contains no hosted service bindings, production buckets, routes or Cloudflare credentials. Vite proxies publishing, capture, media and user-image paths to that local Worker. Missing media/artifacts return an error or 404; local static assets do not use SPA fallback. Play is unavailable in this runtime. Source-image acquisition still follows the normal explicit public HTTPS ingest contract.

A serial local scheduler invokes the publisher's existing lease/job lifecycle every five seconds after each completed cycle. Jobs, artifact identities and completed objects remain in the same local database and stores after restart. The scheduler never enqueues a catalogue rebuild. Publication work, capture timeouts and artifact byte limits remain the production limits. Startup and every scheduler cycle refuse runtime state above 2 GiB. Existing bytes remain available for inspection and recovery.

Wrangler 4.149.0 resolves Miniflare 5.20261006.1-alpha. Its maintained dependency patch forwards `output_quality` to the JPEG encoder and enables progressive JPEG output. Production encoding and byte/geometry assertions stay intact. The regression test uses the Wrangler-resolved simulator and actual image bytes.

To discard this runtime and rebuild from a fresh trusted snapshot, stop it first, then run:

```sh
bun run app:dev --local --data=snapshot --persist-dir=/Users/me/Projects/Dune/gf9-review --reset
```

Reset prints the exact Docker project and runtime directory before replacing them. It deletes only that project's containers/volume and that runtime directory. Files beside the runtime directory survive. A snapshot download is deleted after import; local output is not a database backup. Collect reviewed authoring payloads separately before a reset.

Without `--persist-dir`, `app:dev --local` keeps its existing disposable behavior and deletes its owned volume on shutdown.
