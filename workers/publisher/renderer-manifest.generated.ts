// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity:
    'faction-sheet/sha256:d2eb83f6a6a572feb0b84cbc27450d500d49a7d9fae2a98be1bc34e876a6a802',
  digest: 'd2eb83f6a6a572feb0b84cbc27450d500d49a7d9fae2a98be1bc34e876a6a802',
  components: {
    sources: '551dfdfd69a8a986f98be4e2edad9cd79cf03290845821d59986522d173fbd36',
    toolchain: 'd50d78e5f4145a62d1fa4b8cfcca209791eeda9a55c0fbd2f5d60f0b4e2ef888',
    code: 'd04edf8149b266746de799590c04deb8366130d54b3e8e9fab1d97fd2a864c41',
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
