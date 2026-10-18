// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:6166b83a9761d3c3ebe91796b64f3e54747ed851480acb42f71ab7aace54ef26',
  digest: '6166b83a9761d3c3ebe91796b64f3e54747ed851480acb42f71ab7aace54ef26',
  components: {
    sources: '9095c8ac5cfbd9b6a4cb364f90932da6037e2438277ff6bf6502ec433fe9e148',
    toolchain: '526046ccc7156d11eecbb5e983c1e38a56e1c3cb022aac1a7483ecf849e5fec2',
    code: '698b0b26b13a4d64fbf04898421debb5ac968ea406ec1ac0e002c609cd435b1a',
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
