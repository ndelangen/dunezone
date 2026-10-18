// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:d6ae344f9af8a1a391387d45e41dae69bfba3a0b84d9e17a6c1dfe280d69f436',
  digest: 'd6ae344f9af8a1a391387d45e41dae69bfba3a0b84d9e17a6c1dfe280d69f436',
  components: {
    sources: '84cef58ef00aedc1f2586420823f0b372db2c707ba20fb48b6d9d0abda717baf',
    toolchain: '526046ccc7156d11eecbb5e983c1e38a56e1c3cb022aac1a7483ecf849e5fec2',
    code: '5fe5df7db56d049aa2e5a2306b937c5b317711758c1fcd1476cc20446ce64f88',
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
