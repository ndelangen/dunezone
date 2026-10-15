// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:932c4b3cc5f40c75b4917f2cba10cbeea1328068d718e1c84cb242409d3f9cfe',
  digest: '932c4b3cc5f40c75b4917f2cba10cbeea1328068d718e1c84cb242409d3f9cfe',
  components: {
    sources: '09bc32261c63cfee6c125c9839a48c8ebabb08b9c0fab8b156a0e4e6eee7a084',
    toolchain: 'f4c69d90dcb347d91cc47266b21853233aee418d21bfd8804e654b9121022db4',
    code: 'e6bf28de01cfd20c7a4bb20b31996b784efa771482de30e8fcc6873a49548619',
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
