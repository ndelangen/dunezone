// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:6f93a762ac0198062e9fc0b1930e9109083202e626b2c296b38895da9d977534',
  digest: '6f93a762ac0198062e9fc0b1930e9109083202e626b2c296b38895da9d977534',
  components: {
    sources: '8ebbff8465410bdc5b24e52a1f9cde0bc4e735e5ab47eda797ea0f23a6f5564f',
    toolchain: 'f4c69d90dcb347d91cc47266b21853233aee418d21bfd8804e654b9121022db4',
    code: 'f40254a158ff91b4460966e17892ef403146828f4ed3fbcbde9a129e8cc34aa9',
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
