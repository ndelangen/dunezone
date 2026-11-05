// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:c7aecb17928c946fb5f7a8940b6a9bb88f6c9b9a9b542d383363a0a3f5d913e5',
  digest: 'c7aecb17928c946fb5f7a8940b6a9bb88f6c9b9a9b542d383363a0a3f5d913e5',
  components: {
    sources: 'fd3e6323b6cb2e674deefd355993f9d9db3e1177e3c0c5043285c67323fa8ead',
    toolchain: 'ee68c7d1edd23b07efa633f6c0b422fbcc5f4ad1006db6986d247b4c7eb9f68d',
    code: '74af3a3143cff8aa440300187d8e020013e1a814dccee3f2e794db06fb6d3186',
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
