// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:af46bd389acb687765bb3d9a8022218a1ca8fc67fce1f7c48b83515688e6b646',
  digest: 'af46bd389acb687765bb3d9a8022218a1ca8fc67fce1f7c48b83515688e6b646',
  components: {
    sources: '1e65c5717fc30742cb0fa143568f582ec5e160ad3fa29d5db7c1b90bb36e999a',
    toolchain: '16c805c7c848647a49cede4b962435ec093b4d311f7d7e57baaf6adc7efad6a5',
    code: '50876e39ae0e5365754c7fa3d011b7a1e4b6250efc96b2ceef9ef60dbbcf222a',
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
