// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity:
    'faction-sheet/sha256:317aed717871fbab8572583dfa283d95d65093267d59f8a31ce8c9df2cc50c5c',
  digest: '317aed717871fbab8572583dfa283d95d65093267d59f8a31ce8c9df2cc50c5c',
  components: {
    sources: 'f8e47bda9a5958b5cf26b40e8145a77ecfba864a9e617b3263132fa4ee2b9b0e',
    toolchain: '4282c8c8a920165074004673a21e9e8d04dac1bd51c5cb7f02676760c738ceab',
    code: 'd04edf8149b266746de799590c04deb8366130d54b3e8e9fab1d97fd2a864c41',
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
