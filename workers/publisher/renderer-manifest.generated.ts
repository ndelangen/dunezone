// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:a66f5c410058eadbb567072ab5f9707ac048a502c6493b5c73213e8fab9dd06c',
  digest: 'a66f5c410058eadbb567072ab5f9707ac048a502c6493b5c73213e8fab9dd06c',
  components: {
    sources: 'a4b376ecd1012c31ac3eb4b66cdf8932bfddc412af0dd60565215a52cfef9501',
    toolchain: 'ee68c7d1edd23b07efa633f6c0b422fbcc5f4ad1006db6986d247b4c7eb9f68d',
    code: 'c862752dfd8609b6bbb4a9e1f64eb4706040b4dbaa26b0c9e9b21f7b77706c4e',
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
