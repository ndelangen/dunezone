# Sharing application static assets with the published Storybook

Research date: 2026-08-03
Repository versions inspected: Storybook 10.4.6, Vite 8.1.0, Wrangler 4.111.0

## Conclusion

The clean solution is to make the existing Storybook `staticDirs` setting conditional on
Storybook's own `configType`:

- In `DEVELOPMENT`, include `../public`, so `storybook dev` continues to serve the application
  artwork, vectors, and fonts from same-origin root URLs.
- In `PRODUCTION`, do not include `../public`. The publisher already puts the application's
  public assets at the deployment root, while Storybook is mounted at `/__storybook/`.

This uses a public Storybook configuration hook and prevents the duplicate files at their source.
Keep Vite's `publicDir: false`; do not add release-time deletion, `.assetsignore` rules, symlinks,
or a second Storybook configuration.

The release assembler should additionally enforce the intended ownership boundary: no path from
the source `public/` tree may also occur beneath the assembled `__storybook/` tree. That invariant
will catch a future configuration regression before deployment.

## Current repository behavior

The relevant build chain is:

1. [`package.json`](../../package.json) runs the application build, `storybook build`, the
   publisher capture build, and then release assembly.
2. [`.storybook/main.ts`](../../.storybook/main.ts) declares `staticDirs: ['../public']`.
3. [`.storybook/vite.config.ts`](../../.storybook/vite.config.ts) already sets `publicDir: false`.
4. [`scripts/lib/publisher-assets.ts`](../../scripts/lib/publisher-assets.ts) copies all of
   `storybook-static/` into `workers/publisher/dist/__storybook/`.
5. [`workers/publisher/wrangler.jsonc`](../../workers/publisher/wrangler.jsonc) publishes the
   entire assembled `workers/publisher/dist/` directory as one Workers Static Assets collection.

Measured against the existing assembled output:

- `__storybook/` contains 1,104 files.
- 898 of those paths also exist at the publisher root.
- 897 are byte-for-byte identical, totalling 117,260,929 bytes.
- The only same-path, non-identical pair is `index.html`, which is expected: the publisher root
  contains the application shell and `__storybook/index.html` contains the Storybook manager.

The 897 identical files are the `public/` tree copied once by the application build and again by
Storybook. This is packaging duplication. It is not currently a duplicate-request problem: the
component assets use root-absolute URLs such as `/font/...` and `/image/...`, so production
Storybook requests the publisher's root copy.

## What Storybook actually does

### `staticDirs` has separate development and build implementations

Storybook documents `staticDirs` as the configuration for directories of static files and shows
that a directory such as `../public` makes a file available as a root URL such as `/image.png`.
It also warns that Vite may independently copy its own public directory unless `publicDir` is
disabled. ([Storybook staticDirs reference](https://storybook.js.org/docs/api/main-config/main-config-static-dirs),
[Storybook assets guide](https://storybook.js.org/docs/configure/integration/images-and-assets))

In Storybook 10.4.6 source, development applies `staticDirs` as server middleware. Every configured
directory is mounted at its target endpoint and served by `sirv`; it is not first copied into a
project artifact. ([10.4.6 development static server](https://github.com/storybookjs/storybook/blob/v10.4.6/code/core/src/core-server/utils/server-statics.ts#L775-L900))

The static build does something different. It resolves every configured `staticDirs` entry and
recursively copies it into the Storybook output directory, excluding only Storybook's own
`index.html` and `iframe.html` paths. ([10.4.6 static copy implementation](https://github.com/storybookjs/storybook/blob/v10.4.6/code/core/src/core-server/utils/copy-all-static-files.ts#L477-L533))
The build invokes that copy whenever the resolved `staticDirs` value is present.
([10.4.6 static build](https://github.com/storybookjs/storybook/blob/v10.4.6/code/core/src/core-server/build-static.ts#L876-L936))

Therefore `publicDir: false` is already doing its intended job—preventing Vite's own public-folder
copy—but it cannot disable Storybook's separate `staticDirs` copy.

### Storybook exposes the required build-mode discriminator

Storybook's public configuration type declares `staticDirs` as a `PresetValue`, and a
`PresetValue` may be a function receiving the existing value and Storybook `Options`.
([Storybook 10.4.6 config types](https://github.com/storybookjs/storybook/blob/v10.4.6/code/core/src/types/modules/core-common.ts#L2935-L3102))
Those options expose `configType` as `DEVELOPMENT | PRODUCTION`.
([Storybook 10.4.6 builder options](https://github.com/storybookjs/storybook/blob/v10.4.6/code/core/src/types/modules/core-common.ts#L2182-L2305))

Storybook itself assigns `DEVELOPMENT` before loading and applying the development configuration
([development source](https://github.com/storybookjs/storybook/blob/v10.4.6/code/core/src/core-server/build-dev.ts#L1176-L1239))
and assigns `PRODUCTION` before loading and applying a static build configuration
([static-build source](https://github.com/storybookjs/storybook/blob/v10.4.6/code/core/src/core-server/build-static.ts#L751-L783)).
This makes `configType` the supported distinction needed here; a custom shell environment variable
is not required for the current two modes.

The intended configuration shape is:

```ts
staticDirs: (existing = [], { configType }) =>
  configType === 'DEVELOPMENT' ? [...existing, '../public'] : existing,
```

Returning `existing` preserves any static directories contributed by Storybook or addons. The
project's `public/` directory is added only to the development server.

### Subpath and root URL behavior

Storybook's asset guide generally recommends relative asset paths when a standalone Storybook is
deployed below a subpath; root-absolute URLs otherwise resolve against the site's origin rather
than the Storybook directory.
([Storybook absolute-versus-relative paths](https://storybook.js.org/docs/configure/integration/images-and-assets#absolute-versus-relative-paths))
Vite likewise defines `base` as the public base for generated assets and supports `./` for embedded
deployments; `publicDir` files, by contrast, are served at `/` in development and copied to the
build output root.
([Vite shared options](https://vite.dev/config/shared-options))

This repository intentionally uses the same-origin root behavior for application artwork and
fonts: `/font/...`, `/image/...`, `/vector/...`, and similar URLs should be shared by the app and
Storybook. Storybook's own generated manager and preview files already use relative URLs in the
observed 10.4.6 build, allowing those files to remain under `/__storybook/`.

Consequences:

- Do not rewrite application asset URLs to `/__storybook/...`; that would create separate URLs and
  defeat sharing.
- Do not set Vite `base` merely to remove the duplicate. `base` controls generated URL resolution,
  not Storybook's `staticDirs` copy.
- A production `storybook-static/` built this way is intentionally an embedded artifact, not a
  self-contained site. It becomes complete when assembled with the application root assets.

If a future workflow genuinely needs a self-contained static Storybook build, introduce an
explicit `SELF_CONTAINED_STORYBOOK=1` build profile in addition to `configType`. There is no such
consumer in the current workflows: the standalone CI job only checks that Storybook builds, while
deployment assembles it with the application.

## Cloudflare implications

Cloudflare supports one configured Static Assets collection per Worker, so the current composite
directory is the appropriate deployment shape.
([Workers assets binding](https://developers.cloudflare.com/workers/static-assets/binding/))
Serving a nested application by placing its files in a matching directory such as
`dist/__storybook/` is also the documented subdirectory model.
([Workers serving a subdirectory](https://developers.cloudflare.com/workers/static-assets/routing/advanced/serving-a-subdirectory/))

Cloudflare's upload manifest has one key per file pathname, with a content hash and byte size as
metadata. Hashes let the service avoid re-uploading unchanged content, but the paths remain
separate files in the version manifest.
([Workers Direct Upload manifest](https://developers.cloudflare.com/workers/static-assets/direct-upload/#upload-manifest))
It follows that identical bytes at `/font/example.woff2` and
`/__storybook/font/example.woff2` may benefit from content-addressed upload reuse, but they still
consume two pathname entries. Cloudflare's current limits are 20,000 static files per Worker
version on Free and 100,000 on Paid, with a 25 MiB limit per individual file.
([Workers limits](https://developers.cloudflare.com/workers/platform/limits/#static-assets))

At request time, Workers Static Assets automatically cache requested assets across Cloudflare's
network and add browser-facing `Cache-Control`, `ETag`, and `CF-Cache-Status` headers by default.
([Workers Static Assets caching](https://developers.cloudflare.com/workers/static-assets/#caching-behavior),
[Workers Static Assets headers](https://developers.cloudflare.com/workers/static-assets/headers/#default-headers))
Keeping both consumers on the same root URL therefore gives the desired shared browser and edge
cache identity. Retaining an unused duplicate URL under `/__storybook/` provides no cache benefit.

## Alternatives assessed

### 1. Conditional `staticDirs` — recommended

Advantages:

- Uses Storybook's public `PresetValue` and `configType` APIs.
- Preserves standalone local development exactly where the files are needed.
- Prevents the 117 MB copy during the static build rather than cleaning it up later.
- Keeps a single Storybook definition and a single source asset tree.
- Leaves the production URL and cache behavior unchanged.

Trade-off: a bare production `storybook-static/` directory is no longer self-contained. That is
consistent with the current deployment contract, where it is an embedded part of the publisher.

### 2. Deduplicate during release assembly — viable but second choice

The assembler could omit a Storybook file when its relative path is present in `public/`, present
at the assembled root, and byte-identical. This preserves a self-contained `storybook-static/`
artifact.

It is safe only with all three checks; path-only deletion could remove a Storybook-owned file, and
hash-only deletion could remove a file that is still referenced through its nested URL. Even when
implemented safely, Storybook still performs the 117 MB copy on every build and the repository
must maintain custom provenance/deduplication logic. Use this only if an independent static
Storybook artifact becomes a real requirement.

### 3. `.assetsignore` — supported but addresses only upload

Cloudflare officially supports `.assetsignore` in the asset directory.
([Workers ignoring assets](https://developers.cloudflare.com/workers/static-assets/binding/#ignoring-assets))
Generated ignore rules could prevent nested public copies from being uploaded, but the duplicates
would still exist in `storybook-static/` and the assembled output. The repository's inspection and
file-limit checks would also need to duplicate Wrangler's ignore semantics. This fixes the latest
stage rather than the source of the duplication.

### 4. A separate Storybook config directory — supported but unnecessary

The Storybook CLI supports `--config-dir`, so a production-only configuration could omit
`staticDirs` while a development configuration retained it.
([Storybook CLI options](https://storybook.js.org/docs/api/cli-options#build))
That creates two configuration entry points and forces their story globs, addons, framework, mocks,
and branding to remain synchronized. The functional `staticDirs` hook provides the same distinction
inside the existing single definition.

### 5. Vite `publicDir`, `base`, asset imports, or symlinks — reject

- Enabling Vite `publicDir` would serve/copy the same files again; Vite explicitly documents that
  behavior. ([Vite `publicDir`](https://vite.dev/config/shared-options#publicdir))
- `base` changes generated URLs, not whether `staticDirs` is copied.
- Importing every public asset would move selected files into Storybook's generated bundle and stop
  them from being a shared root resource.
- Storybook's static copier dereferences links, and the publisher deliberately rejects symbolic
  links. Links therefore do not represent a deployable ownership boundary.

## Recommended change boundary

Implementation should be deliberately small:

1. Replace the literal `staticDirs` array in `.storybook/main.ts` with the `configType` function
   shown above.
2. Keep `.storybook/vite.config.ts` at `publicDir: false`.
3. Add an assembly assertion that no source-`public/` relative path occurs below
   `__storybook/`. This is an invariant, not a deletion pass.
4. Update tests that currently model a fully self-contained Storybook build so they model the
   composite publisher: Storybook owns its manager/preview assets; the application owns shared
   static resources.

No Worker routing change is required. The exact `/__storybook` redirect and
`/__storybook/` index rewrite remain valid, while nested Storybook bundles and root application
assets continue through the existing Static Assets binding.

## Verification plan

Before deployment:

1. Run `storybook dev` and verify at least one representative file from each required root tree
   (`/font`, `/image`, `/vector`, and `/web`) returns `200`, then load representative image-,
   vector-, and font-heavy stories.
2. Run `bun run build-storybook` and assert that the intersection between source `public/`
   relative paths and `storybook-static/` paths is empty. `index.html`, `iframe.html`,
   `index.json`, and Storybook's generated asset directories must still exist.
3. Run `bun run publisher:assets`. The current baseline should fall from 2,181 to approximately
   1,284 assets and from 247,320,625 to approximately 130,059,696 bytes—the exact reduction is the
   measured 897 files and 117,260,929 bytes. Treat those totals as evidence, not permanent golden
   constants; assert ownership and limits instead.
4. Run the full `bun run publisher:release:verify` gate. Confirm the generated renderer identity
   remains unchanged, because Storybook is intentionally outside that identity.
5. Serve the assembled Worker locally and verify:
   - `/__storybook` preserves the query string and redirects to `/__storybook/`;
   - `/__storybook/`, `/__storybook/index.json`, a manager bundle, and a representative story
     iframe return `200`;
   - representative root artwork/font URLs return `200`;
   - the browser network panel shows story assets requested from root URLs, with no requests for
     duplicated `/__storybook/font`, `/__storybook/image`, `/__storybook/vector`, or
     `/__storybook/web` paths.

After deployment, run the existing live deployment contract and repeat one representative story
in a browser. Inspect `ETag`/`CF-Cache-Status` on a root asset to confirm that the app and Storybook
are using the same deployed URL, not merely byte-identical resources under different paths.
