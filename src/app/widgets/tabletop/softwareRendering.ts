/*
 * Software WebGL: Chrome's SwiftShader, Mesa's llvmpipe and softpipe, and Windows' WARP ("Microsoft Basic Render Driver").
 * Firefox may hide the unmasked name; its plain renderer string still names llvmpipe and SwiftShader.
 */
const SOFTWARE = /swiftshader|llvmpipe|softpipe|basic render driver/iu;

let known: boolean | undefined;

/**
 * Whether this browser draws WebGL on the CPU, read once per page from a probe context released at once.
 * There, multisampling the table's first frame blocks the page for about 14 s (the hosted flows on Linux CI).
 */
export function rendersInSoftware(): boolean {
  if (known === undefined) {
    const context = document.createElement('canvas').getContext('webgl2');
    const debug = context?.getExtension('WEBGL_debug_renderer_info');
    const renderer = context?.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : context.RENDERER);
    known = SOFTWARE.test(String(renderer ?? ''));
    context?.getExtension('WEBGL_lose_context')?.loseContext();
  }
  return known;
}

/** For tests: forget the page's answer. */
export function resetSoftwareRendering() {
  known = undefined;
}
