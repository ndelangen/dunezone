// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:d759721ab329f576b6f9afcb711c89f1c076de0f9fc6e6fb9b52579aa34452ff',
  digest: 'd759721ab329f576b6f9afcb711c89f1c076de0f9fc6e6fb9b52579aa34452ff',
  components: {
    sources: '348936b5a74f6903087cb8117eb8ff360936f109d8c146a259380d257d12e817',
    toolchain: '37e64dd78013476fba4712e5dbf6a6e31c8fa627934770eb0f63ef984336c3c4',
    code: 'f25e3ab918521a8f0c2ab19ea7e2606fec53c0d5dcafa012bced1229792997da',
    contract: '2920714c87493d104342355dda2b956202259513c78ce6195670034f31a656a6',
  },
  contract: {
    viewport: {
      width: 2100,
      height: 2970,
      deviceScaleFactor: 1,
    },
    pdf: {
      pageCount: 2,
      pageWidthMm: 210,
      pageHeightMm: 297,
      pageSizeToleranceMm: 0.5,
      displayHeaderFooter: false,
      marginMm: {
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
      },
      preferCssPageSize: true,
      printBackground: true,
    },
  },
} as const;
