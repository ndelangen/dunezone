// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:44a74ed48c4a0bbdbe97336ef8dbb5f479cc8d83b4471dd8d53a566e906ecac4',
  digest: '44a74ed48c4a0bbdbe97336ef8dbb5f479cc8d83b4471dd8d53a566e906ecac4',
  components: {
    sources: '5037739a6910bb2c2533006db8e4fcc6a4d29a0618693ec05c39980a6b5d0a85',
    toolchain: '16c805c7c848647a49cede4b962435ec093b4d311f7d7e57baaf6adc7efad6a5',
    code: '30589ddc6401ca8ac320a835b2ceb8409de5fd3e23b76d124281ccdc6f5d30bb',
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
