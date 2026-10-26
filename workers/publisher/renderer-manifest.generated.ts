// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:ff77e02e1ba1506f3b1dbdd3c4beceb6a287748ac80eb7146271b3ee4c498710',
  digest: 'ff77e02e1ba1506f3b1dbdd3c4beceb6a287748ac80eb7146271b3ee4c498710',
  components: {
    sources: '3869ef44ce392801dec0d7a2de91e6adfd56665f05ff0fca935c93a6d99a0780',
    toolchain: '16c805c7c848647a49cede4b962435ec093b4d311f7d7e57baaf6adc7efad6a5',
    code: '8985bb14f0ff233bbb67b100b4619e1901b61cf7470d22814eb9e5ccac0cf60c',
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
