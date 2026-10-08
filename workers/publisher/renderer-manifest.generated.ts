// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:53db3692ffc0998bb56cf6c90c12136957120ba27f9a0206a58b8f7344d6fb3c',
  digest: '53db3692ffc0998bb56cf6c90c12136957120ba27f9a0206a58b8f7344d6fb3c',
  components: {
    sources: '8c30fdf4e11eb35176398ae7d30aef68bc3eca41373f6ef995a8a77ac3c1fd64',
    toolchain: '1b72a569d46b93089ef2ec6218a686ee27fda18c0e09e1396ad0aced9d2c8df3',
    code: '2c144d38a0ed4c93a6e8e9924cddf78bcabc60e53f3e61ccfb3ea03118f3d562',
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
