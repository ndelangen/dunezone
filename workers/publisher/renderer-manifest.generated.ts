// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity:
    'faction-sheet/sha256:2479a96d86388a86d34452fb3c3d36c09ffa25c45898e7c8858c8500045d6051',
  digest: '2479a96d86388a86d34452fb3c3d36c09ffa25c45898e7c8858c8500045d6051',
  components: {
    sources: '551dfdfd69a8a986f98be4e2edad9cd79cf03290845821d59986522d173fbd36',
    toolchain: 'a9d66c69040fffeadd0766d2a37756f785d33b1b7240d1bda5d6eeb081dd51ab',
    code: '8f7c061d890acd7dcd75be3748fcdbbb74ebe395bfee6489e2c7838cf29b6030',
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
