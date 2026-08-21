// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:e1db0a5a4db9844952158ee0641e0ac81cce4f1ecb4d66bd1f899771b57c2d92',
  digest: 'e1db0a5a4db9844952158ee0641e0ac81cce4f1ecb4d66bd1f899771b57c2d92',
  components: {
    sources: '5289b6254320530ee857ff2912681e9d6a30135dbb3a92239296365f53397813',
    toolchain: '027e3955ad0c9a9450a11937e69417290fd8ee9961eb49bd8485a349a65cb370',
    code: 'd68980b890f575e79188f09a7b8fe28a916da5c7b41d2c9118799b8b51fa1e4f',
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
