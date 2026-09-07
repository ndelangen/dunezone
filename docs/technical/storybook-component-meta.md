# Storybook component metadata experiment

Storybook 10.6.0 with React Component Meta builds this catalogue 16.3% faster than
PR #1069's Storybook 10.5.9 configuration. Aggregate compressed JavaScript falls
3.2%, but the complete output grows 2.8% because metadata moves into separate JSON
files. A fresh PageTitle visit downloads about 0.3% more compressed JavaScript and
metadata than the baseline. The measured benefit is build speed.

Measured on 7 September 2026, starting at PR #1069 commit
`9adc8b26882e5bf8293a8ffabd8ac297f112d34c`. The npm `latest` tag resolved to
10.6.0; `next` was 11.0.0-alpha.0. React Compiler remains enabled in every variant.

## Configuration

All four direct Storybook packages are pinned to 10.6.0. The router-link ref patch
still applies and remains necessary: the published 10.6.0 mock still calls
`_useLinkProps` without forwarding the ref.

The replacement configuration is:

```ts
features: {
  experimentalDocgenServer: true,
},
```

This uses React Component Meta for Controls and Docs, skips the Vite docgen
injection plugins, and writes metadata services into the static build. The older
`experimentalReactComponentMeta` flag only selects the manifest analyzer; it does
not replace preview docgen. No separate `react-component-meta` package is needed.
TypeScript 6 remains installed for the language-service API. The application's
TypeScript 7 compiler remains under its existing `@typescript/native` alias.

See the [docgen server documentation](https://storybook.js.org/docs/api/main-config/main-config-features#experimentaldocgenserver),
the [upstream design and implementation discussion](https://github.com/storybookjs/storybook/discussions/35333),
and the [10.6 release notes](https://storybook.js.org/blog/storybook-10-6/).

## Build measurements

These are medians of three full builds after one excluded warm-up per variant.
Sizes are bytes, summed across files rather than filesystem allocation.

| Measurement | 10.5.9, existing analyzer | 10.6.0, existing analyzer | 10.6.0, React Component Meta |
| --- | ---: | ---: | ---: |
| Wall time | 18.279 s | 17.977 s | 15.296 s |
| Uncompressed JavaScript | 12,059,640 | 12,084,016 | 11,525,131 |
| JavaScript gzip, level 9 | 3,249,531 | 3,260,372 | 3,144,879 |
| Complete static directory | 78,014,411 | 78,041,547 | 80,217,671 |
| Indexed stories | 590 | 590 | 590 |
| Files | 1,741 | 1,748 | 2,000 |

The upgrade alone changes build time by -1.7% and compressed JavaScript by +0.3%.
Those timing differences are small. Enabling React Component Meta on 10.6.0
reduces build time another 14.9% and compressed JavaScript another 3.5%.

React Component Meta adds 126 docgen JSON files totaling 2,417,182 bytes and
126 story-docs JSON files totaling 317,776 bytes. Their combined per-file gzip
size is 344,873 bytes. They are loaded as needed, so aggregate JavaScript savings
do not describe the download size of one visit.

## Browser measurements

A fresh headless Chromium context opened the manager at
`?path=/story/blocks-pagetitle--default`, opened Controls, and changed `title` to
`Metadata check`. The iframe rendered the changed value in every variant.

| Fetched files, gzip estimate | 10.5.9 | 10.6.0, existing analyzer | 10.6.0, React Component Meta |
| --- | ---: | ---: | ---: |
| JavaScript | 1,978,163 | 1,987,279 | 1,983,132 |
| Metadata JSON | 0 | 0 | 1,677 |
| Combined | 1,978,163 | 1,987,279 | 1,984,809 |

These include the manager and preview iframe. They sum unique fetched files,
compressed locally at gzip level 9, and exclude CSS, images, fonts, HTML and
headers. They are neither measured HTTP compression nor application route bytes.
The new configuration is 0.34% larger than baseline on this visit and 0.12%
smaller than the upgrade with the existing analyzer.

The new Controls table retains both props and marks `title` required. The browser
loads `services/core/docgen/blocks-pagetitle.json`, with no failed requests or
uncaught exceptions. Compound TriptychLayout and Mantine TextInput also have
inferred props in their generated JSON. Of 126 component entries, 106 have
component metadata and 105 have inferred props. Entries without props include
page compositions and components with no props; this is not a comparative
accuracy score.

There are no indexed Autodocs pages in this catalogue. Controls were exercised;
full Autodocs rendering and the accuracy of every generated source snippet were
not audited. The new static snippet for PageTitle references its story-local
`InHeader` function, so it is not a standalone copyable example.

## Method and validation

Machine: Apple M1 Pro, arm64 macOS. Node 22.16.0, Bun 1.3.9, Vite 8.2.0,
React Compiler 1.0.0. The local Bun version differs from the packageManager field's
1.3.14; it was held constant across all variants. Dependencies were installed
before timing. Generated public images were identical across builds.

Each sample starts a fresh process after deleting that variant's previous output
directory. The timer surrounds the build subprocess and excludes output deletion,
dependency installation, image generation, file inspection and compression:

```sh
CI=1 STORYBOOK_DISABLE_TELEMETRY=1 REACT_COMPILER=on \
  bun run build-storybook --output-dir /tmp/dunezone-storybook-meta-6768/upgrade-rcm \
  --disable-telemetry
```

The sample timer uses Python `time.perf_counter()` around `subprocess.run()`.
JavaScript means files ending in `.js` or `.mjs`. Each file is compressed
separately with `gzip.compress(bytes, compresslevel=9, mtime=0)`. The complete
directory includes generated metadata and copied public assets. Output deletion
makes these full builds, with warm filesystem and dependency caches; these are
not incremental edit timings or cold-machine measurements.

Variants ran in the table's order, with no other benchmark or test workloads
started during measured builds. The initial baseline warm-up overlapped image
preparation and was excluded. Run order was not randomized, and unrelated desktop
activity was not controlled. The results establish a local improvement, not a CI
performance guarantee. The [raw samples and browser observations](./storybook-component-meta-results.json)
include every warm-up and measured run.

All 590 browser story tests pass across 126 files, including the router-link
tooltip checks. Typecheck, lint, formatting and prose checks pass. Storybook
Doctor reports a healthy project, and the frozen dependency install passes.
`publisher:release:verify` passes without a renderer manifest change. Its first
attempt lacked `VITE_CONVEX_URL`; the successful run supplied the existing public
backend URL for prerendering. No backend was modified. Nothing was deployed.
