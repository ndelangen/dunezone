// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:36ed142df23b7c8fd437764caf7cd5f9f39f4bee57a3013cae03ffbe31244c92',
  digest: '36ed142df23b7c8fd437764caf7cd5f9f39f4bee57a3013cae03ffbe31244c92',
  components: {
    sources: 'ab88c045cbf366af4309af7e210320c9536c12f4a5dc63df2ff2e3df6bf24a54',
    toolchain: 'df737e1fef2f6e7574f2e8d81c31309df02e170b51ab18e8c5ef6498d23f17b1',
    code: '7ae59b5e2ce70c6e4f15e5bfa91e8711a012b5a89ba72edee375d2db1d422f28',
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
