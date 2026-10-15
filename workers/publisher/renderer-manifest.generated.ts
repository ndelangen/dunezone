// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:3d52ae90119f4dbaa1b330812fb3abe7d80a2600152c947637d3641fc31578b8',
  digest: '3d52ae90119f4dbaa1b330812fb3abe7d80a2600152c947637d3641fc31578b8',
  components: {
    sources: 'aff48aba83e55e72293b53c42c471129966a43041765cc76b6a922071da97158',
    toolchain: 'f4c69d90dcb347d91cc47266b21853233aee418d21bfd8804e654b9121022db4',
    code: '1656d2b5f61c72290028d842d29d77476505bcc413dc8740674165ada31b2500',
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
