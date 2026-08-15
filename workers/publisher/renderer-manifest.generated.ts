// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity:
    'faction-sheet/sha256:cb41b388cf83e53f6a3ff6ca2dcfc5d82b8f0685535147d663f66264012b6d57',
  digest: 'cb41b388cf83e53f6a3ff6ca2dcfc5d82b8f0685535147d663f66264012b6d57',
  components: {
    sources: '5289b6254320530ee857ff2912681e9d6a30135dbb3a92239296365f53397813',
    toolchain: 'a9d66c69040fffeadd0766d2a37756f785d33b1b7240d1bda5d6eeb081dd51ab',
    code: '4f0ba34361253bd1f095bb7c8bf566f054f31eb74c33e60bd130725acf61f7c3',
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
