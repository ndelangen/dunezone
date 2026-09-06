import { TargetRenderError } from './browser';
import { jpegProfile } from './image-inspection';

/*
 * Turns a captured PNG into the JPEG the outside world is promised.
 *
 * The Images binding does the encoding, which is why nothing here is a codec: it needs no dependency, no build change, and no place in the Renderer identity closure. It transforms at publish time so the bytes are stored and the existing delivery path can reuse its stable key, ETag, and Range handling.
 * Its only knob is quality (wayfinder #516).
 */
export type JpegEncoder = (png: Uint8Array, quality: number) => Promise<Uint8Array>;

export function imagesJpegEncoder(images: ImagesBinding): JpegEncoder {
  return async (png, quality) => {
    /* The binding speaks streams in both directions; `Response` is the shortest honest adapter in either direction. */
    const input = new Response(png).body;
    if (!input) {
      throw new Error('Captured PNG produced no readable stream');
    }
    const result = await images.input(input).output({ format: 'image/jpeg', quality });
    return new Uint8Array(await new Response(result.image()).arrayBuffer());
  };
}

/**
 * The published-JPEG contract, asserted rather than assumed.
 *
 * Progressive output through the binding is undocumented.
 * It was measured to hold across the quality range on a real account, and Cloudflare's encoders drop to baseline below 50 pixels on either axis, so an encoder change or a small face would lose it silently.
 * Failing the job is the honest outcome: an image that renders in one pass is not the thing the URL promises, and unlike the PDF path there is no untransformed fallback worth publishing.
 */
export function assertPublishedJpeg(bytes: Uint8Array, expected: { widthPx: number; heightPx: number }): void {
  const profile = jpegProfile(bytes);
  if (!profile.progressive) {
    throw new TargetRenderError(`Encoded JPEG is not progressive: start-of-frame ${profile.startOfFrame}`);
  }
  if (profile.widthPx !== expected.widthPx || profile.heightPx !== expected.heightPx) {
    throw new TargetRenderError(
      `Encoded JPEG must be ${expected.widthPx}x${expected.heightPx}, got ${profile.widthPx}x${profile.heightPx}`
    );
  }
}
