// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity:
    'faction-sheet/sha256:04bc8af6467ecd48eeb00282f43e11d7c1577856c072e57099fddad426509039',
  digest: '04bc8af6467ecd48eeb00282f43e11d7c1577856c072e57099fddad426509039',
  components: {
    sources: '551dfdfd69a8a986f98be4e2edad9cd79cf03290845821d59986522d173fbd36',
    toolchain: 'a9d66c69040fffeadd0766d2a37756f785d33b1b7240d1bda5d6eeb081dd51ab',
    code: 'a83b7ec22d0f502a1b7adb0e9ebafe61b92b5fdbc09562416867f9b356219d40',
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
