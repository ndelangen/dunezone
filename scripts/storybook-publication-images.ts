import type { Locator } from 'playwright';

export async function decodeStoryImage(image: Locator) {
  const failure = await image.evaluate(async (element: HTMLImageElement) => {
    const requestedSource = element.currentSrc || element.src;
    try {
      await element.decode();
      return null;
    } catch (error) {
      const currentSource = element.currentSrc || element.src;
      const resource = performance
        .getEntriesByName(requestedSource, 'resource')
        .filter((entry): entry is PerformanceResourceTiming => entry instanceof PerformanceResourceTiming)
        .at(-1);
      return {
        reason: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
        requestedSource,
        currentSource,
        sourceChanged: currentSource !== requestedSource,
        srcset: element.srcset,
        complete: element.complete,
        naturalWidth: element.naturalWidth,
        naturalHeight: element.naturalHeight,
        responseStatus: resource?.responseStatus || null,
        responseDurationMs: resource ? Math.round(resource.duration) : null,
      };
    }
  });
  if (failure) {
    throw new Error(`Storybook publication image failed to decode: ${JSON.stringify(failure)}`);
  }
}
