// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:11d65d65bfbd6829858d43ca6f5d84d6eee8f72b9b0d7c45ed85a6eca52d698d',
  digest: '11d65d65bfbd6829858d43ca6f5d84d6eee8f72b9b0d7c45ed85a6eca52d698d',
  components: {
    sources: 'c74b97075768cb03dcde6cfe97a14744ff8fdab210c5e424a6fa93dcf94d5c9d',
    toolchain: '4b1a8364fb23088a9ab4549586773825b88c6f66c2edf734bc7405ba5e72622b',
    code: '9c9270de2f98ea7ec003b9c77fed35164400e61c3d0816b86961f5c8597fc03f',
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
