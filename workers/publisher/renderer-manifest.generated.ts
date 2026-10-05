// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:f3d82f76bb87f781ce2e43a0284bfb15daf4954605cbdbf58393ad1ad0e7aa96',
  digest: 'f3d82f76bb87f781ce2e43a0284bfb15daf4954605cbdbf58393ad1ad0e7aa96',
  components: {
    sources: '68bde6d093fc9c73f00e671d37c524f662388279009b7c539acccc01af66f0a5',
    toolchain: 'df38b3277de26c074c7b12763e5a5817e5c08c6940bd94f4e1e5c531dcf21b5b',
    code: 'dfd67906ce03fc2f59a4e39f4ee3a1a62422e6379f030f8463bb8a8217ce1e0c',
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
