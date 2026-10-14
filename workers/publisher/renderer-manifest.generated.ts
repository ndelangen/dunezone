// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:47d74f7a3d7d674d820550bdbf6924e70e5586fe9beb0ecf35eb1fada2e57ca5',
  digest: '47d74f7a3d7d674d820550bdbf6924e70e5586fe9beb0ecf35eb1fada2e57ca5',
  components: {
    sources: 'b788bdda5e608fd998acfcbde790674fa0b4bd8f77aaccf92cc41e122b29da86',
    toolchain: 'f4c69d90dcb347d91cc47266b21853233aee418d21bfd8804e654b9121022db4',
    code: 'd4857625cb8d8ea5a5e5c2786b4ae7536e9b26c62dd6e359674864314f8e6e5a',
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
