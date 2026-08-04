export const PUBLISHER_RENDERER_CONTRACT = {
  viewport: { width: 2100, height: 2970, deviceScaleFactor: 1 },
  pdf: {
    pageCount: 2,
    pageWidthMm: 210,
    pageHeightMm: 297,
    pageSizeToleranceMm: 0.5,
    displayHeaderFooter: false,
    marginMm: { top: 0, right: 0, bottom: 0, left: 0 },
    preferCssPageSize: true,
    printBackground: true,
  },
} as const;
