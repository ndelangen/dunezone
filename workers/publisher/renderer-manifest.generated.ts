// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:67afc28f0e515e2539b6280bc4798b35cb0038d01641adc3ea50bfd360932145',
  digest: '67afc28f0e515e2539b6280bc4798b35cb0038d01641adc3ea50bfd360932145',
  components: {
    sources: 'eaa718a268df921f852db5d3cf37afb21c0fd8ae5c0bd87b7e42a62a6421ad73',
    toolchain: '500ae6945bd2172157069a70a88b1f7f4f0ed4cb8081056fab0dbd976c7e6ddb',
    code: '71ac2587cdf4d8ae9120862a9115ca09f51e712eb45194185e57ee2bf572fc0d',
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
