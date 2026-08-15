// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity:
    'faction-sheet/sha256:9a9c773e520feaaef7022ba40c4dd4d05b41c8ea336d6066a8a98bec724a43ff',
  digest: '9a9c773e520feaaef7022ba40c4dd4d05b41c8ea336d6066a8a98bec724a43ff',
  components: {
    sources: '150939512be6626ad589838f59f9e2a18d05e66532afce053af37d9e1a4249a5',
    toolchain: 'a9d66c69040fffeadd0766d2a37756f785d33b1b7240d1bda5d6eeb081dd51ab',
    code: '5d841461fa6caf855a0f5c223d608853e8a752f81da8407837da637fcd89574b',
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
