/*
 * Diagnostic (#1343, not for merge): times the Play table's WebGL frames per rendering setting.
 * These functions run inside the page through `page.evaluate`, against the hook TabletopScene publishes on this branch.
 * `installBench` defines the variants; `benchInPage` applies each one, warms it up (new shader variants compile then),
 * times it, and undoes it before the next; `applyVariant` and `undoVariant` hold one for screenshots.
 */
export function installBench() {
  const hook = window.__duneBench;
  if (!hook) {
    throw new Error('The bench hook is missing.');
  }
  const T = hook.three;
  const state = () => hook.get();
  const renderer = () => state().renderer;
  const scene = () => state().scene;
  const meshes = () => {
    const list = [];
    scene().traverse((object) => {
      if (object.isMesh || object.isLineSegments) {
        list.push(object);
      }
    });
    return list;
  };
  const disposeFrameBufferTargets = () => {
    for (const target of renderer()._frameBufferTargets.values()) {
      target.dispose();
    }
    renderer()._frameBufferTargets.clear();
  };
  const swapMaterials = (make) => {
    const swapped = [];
    for (const mesh of meshes()) {
      const material = mesh.material;
      if (Array.isArray(material) || material.type !== 'MeshStandardMaterial') {
        continue;
      }
      const replacement = make();
      for (const key of ['map', 'transparent', 'opacity', 'side', 'depthWrite', 'depthTest', 'fog', 'alphaTest']) {
        if (key in replacement && material[key] !== undefined) {
          replacement[key] = material[key];
        }
      }
      replacement.color.copy(material.color);
      if ('emissive' in replacement && material.emissive) {
        replacement.emissive.copy(material.emissive);
        replacement.emissiveIntensity = material.emissiveIntensity;
      }
      mesh.material = replacement;
      swapped.push([mesh, material, replacement]);
    }
    return () => {
      for (const [mesh, material, replacement] of swapped) {
        mesh.material = material;
        replacement.dispose();
      }
    };
  };
  const setAnisotropy = (value) => {
    const previous = [];
    for (const mesh of meshes()) {
      for (const material of [mesh.material].flat()) {
        if (material.map && material.map.anisotropy !== value) {
          previous.push([material.map, material.map.anisotropy]);
          material.map.anisotropy = value;
          material.map.needsUpdate = true;
        }
      }
    }
    return () => {
      for (const [texture, anisotropy] of previous) {
        texture.anisotropy = anisotropy;
        texture.needsUpdate = true;
      }
    };
  };
  const hide = (predicate) => {
    const hidden = meshes().filter((mesh) => mesh.visible && predicate(mesh));
    for (const mesh of hidden) {
      mesh.visible = false;
    }
    return () => {
      for (const mesh of hidden) {
        mesh.visible = true;
      }
    };
  };
  const isContactShadow = (mesh) =>
    mesh.material?.type === 'MeshBasicMaterial' &&
    mesh.material.map?.isCanvasTexture &&
    mesh.material.map.image?.width === 128;
  const setPixelRatio = (value) => {
    const previous = renderer().getPixelRatio();
    renderer().setPixelRatio(value);
    return () => renderer().setPixelRatio(previous);
  };
  const setSamples = (value) => {
    const previous = renderer()._samples;
    renderer()._samples = value;
    disposeFrameBufferTargets();
    return () => {
      renderer()._samples = previous;
      disposeFrameBufferTargets();
    };
  };
  const setOutputBufferType = (value) => {
    const previous = renderer()._outputBufferType;
    renderer()._outputBufferType = value;
    disposeFrameBufferTargets();
    return () => {
      renderer()._outputBufferType = previous;
      disposeFrameBufferTargets();
    };
  };
  const setOutput = (toneMapping, colorSpace) => {
    const previous = [renderer().toneMapping, renderer().outputColorSpace];
    renderer().toneMapping = toneMapping;
    renderer().outputColorSpace = colorSpace;
    return () => {
      [renderer().toneMapping, renderer().outputColorSpace] = previous;
    };
  };
  const setLight = (type) => {
    const lights = [];
    scene().traverse((object) => object.type === type && object.visible && lights.push(object));
    for (const light of lights) {
      light.visible = false;
    }
    return () => {
      for (const light of lights) {
        light.visible = true;
      }
    };
  };
  const setFog = () => {
    const previous = scene().fog;
    scene().fog = null;
    return () => {
      scene().fog = previous;
    };
  };
  const combine =
    (...steps) =>
    () => {
      const undo = steps.map((step) => step());
      return () => undo.reverse().forEach((restore) => restore());
    };
  window.__benchVariants = {
    baseline: () => () => {},
    'samples 0': () => setSamples(0),
    'output target RGBA8': () => setOutputBufferType(T.UnsignedByteType),
    'no tone mapping (sRGB pass kept)': () => setOutput(T.NoToneMapping, T.SRGBColorSpace),
    'no output pass (linear, straight to canvas)': () => setOutput(T.NoToneMapping, T.LinearSRGBColorSpace),
    'pixel ratio 0.75': () => setPixelRatio(0.75),
    'pixel ratio 0.5': () => setPixelRatio(0.5),
    'anisotropy 1': () => setAnisotropy(1),
    'Lambert for Standard': () => swapMaterials(() => new T.MeshLambertMaterial()),
    'Basic for Standard': () => swapMaterials(() => new T.MeshBasicMaterial()),
    'no point light': () => setLight('PointLight'),
    'no fog': () => setFog(),
    'no contact shadows': () => hide(isContactShadow),
    'samples 0 + anisotropy 1': combine(
      () => setSamples(0),
      () => setAnisotropy(1)
    ),
    'samples 0 + RGBA8 + anisotropy 1': combine(
      () => setSamples(0),
      () => setOutputBufferType(T.UnsignedByteType),
      () => setAnisotropy(1)
    ),
    'samples 0 + pixel ratio 0.75': combine(
      () => setSamples(0),
      () => setPixelRatio(0.75)
    ),
    'samples 0 + pixel ratio 0.5': combine(
      () => setSamples(0),
      () => setPixelRatio(0.5)
    ),
    'floor: linear, pixel ratio 0.5, Basic': combine(
      () => setOutput(T.NoToneMapping, T.LinearSRGBColorSpace),
      () => setPixelRatio(0.5),
      () => swapMaterials(() => new T.MeshBasicMaterial())
    ),
  };
  window.__benchUndo = null;
  return Object.keys(window.__benchVariants);
}

export function applyVariant(name) {
  if (window.__benchUndo) {
    window.__benchUndo();
  }
  window.__benchUndo = window.__benchVariants[name]();
  window.__duneBench.get().invalidate();
}

export function undoVariant() {
  if (window.__benchUndo) {
    window.__benchUndo();
    window.__benchUndo = null;
  }
  window.__duneBench.get().invalidate();
}

export function describeScene() {
  const state = window.__duneBench.get();
  const { renderer, scene } = state;
  const gl = renderer.backend.gl;
  const meshes = [];
  scene.traverse((object) => {
    if (object.isMesh || object.isLineSegments) {
      meshes.push(object);
    }
  });
  const shown = (object) => {
    let visible = object.visible;
    object.traverseAncestors((ancestor) => {
      visible &&= ancestor.visible;
    });
    return visible;
  };
  const materialCounts = {};
  const textures = new Map();
  for (const mesh of meshes.filter(shown)) {
    for (const material of [mesh.material].flat()) {
      const name = `${material.type}${material.transparent ? ' transparent' : ''}`;
      materialCounts[name] = (materialCounts[name] ?? 0) + 1;
      if (material.map) {
        const image = material.map.image;
        textures.set(material.map.uuid, {
          width: image?.width,
          height: image?.height,
          anisotropy: material.map.anisotropy,
          canvas: !!material.map.isCanvasTexture,
          uses: (textures.get(material.map.uuid)?.uses ?? 0) + 1,
        });
      }
    }
  }
  const lights = [];
  scene.traverse((object) => object.isLight && lights.push(object.type));
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  return {
    canvasCss: { width: renderer.domElement.clientWidth, height: renderer.domElement.clientHeight },
    drawingBuffer: { width: gl.drawingBufferWidth, height: gl.drawingBufferHeight },
    devicePixelRatio: window.devicePixelRatio,
    pixelRatio: renderer.getPixelRatio(),
    samples: renderer.samples,
    currentSamples: renderer.currentSamples,
    needsFrameBufferTarget: renderer.needsFrameBufferTarget,
    outputBufferType: renderer._outputBufferType,
    toneMapping: renderer.toneMapping,
    outputColorSpace: renderer.outputColorSpace,
    contextAttributes: gl.getContextAttributes(),
    multisampledRenderToTexture: !!gl.getExtension('WEBGL_multisampled_render_to_texture'),
    glRenderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    meshes: meshes.length,
    visibleMeshes: meshes.filter(shown).length,
    materialCounts,
    textures: [...textures.values()],
    lights,
    fog: !!scene.fog,
    htmlOverlays: document.querySelectorAll('.dune-play-shell canvas ~ div, [data-piece-id]').length,
  };
}

export async function benchInPage({ frames = 6, warmup = 2, presented = 10, variants = null } = {}) {
  const state = window.__duneBench.get();
  const { renderer, scene, camera } = state;
  const gl = renderer.backend.gl;
  const now = () => performance.now();
  const median = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  };
  const round = (value) => Math.round(value * 10) / 10;
  const pixel = new Uint8Array(4);
  const finish = () => {
    gl.finish();
    const afterFinish = now();
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    return afterFinish;
  };
  const idle = [];
  for (let index = 0; index < 5; index++) {
    const start = now();
    finish();
    idle.push(now() - start);
  }
  const measure = (count) => {
    const total = [];
    const submit = [];
    const tail = [];
    let drawCalls = 0;
    let triangles = 0;
    for (let index = 0; index < count; index++) {
      renderer.info.reset();
      const start = now();
      renderer.render(scene, camera);
      const submitted = now();
      const finished = finish();
      const read = now();
      drawCalls = renderer.info.render.drawCalls;
      triangles = renderer.info.render.triangles;
      total.push(read - start);
      submit.push(submitted - start);
      tail.push(read - finished);
    }
    return {
      frameMs: round(median(total)),
      minMs: round(Math.min(...total)),
      maxMs: round(Math.max(...total)),
      jsSubmitMs: round(median(submit)),
      readbackAfterFinishMs: round(median(tail)),
      drawCalls,
      triangles,
    };
  };
  const warm = () => {
    const start = now();
    renderer.render(scene, camera);
    finish();
    return round(now() - start);
  };
  const timings = [];
  for (const name of Object.keys(window.__benchVariants)) {
    if (name === 'baseline' || (variants && !variants.includes(name))) {
      continue;
    }
    /* Each variant is timed right after its own baseline, so drift over the run cancels in the ratio. */
    for (let index = 0; index < warmup; index++) {
      warm();
    }
    const baseline = measure(frames);
    const undo = window.__benchVariants[name]();
    try {
      const firstWarmupMs = warm();
      for (let index = 1; index < warmup; index++) {
        warm();
      }
      const variant = measure(frames);
      timings.push({
        name,
        baselineMs: baseline.frameMs,
        frameMs: variant.frameMs,
        ratio: Math.round((100 * variant.frameMs) / baseline.frameMs) / 100,
        minMs: variant.minMs,
        maxMs: variant.maxMs,
        baselineMinMs: baseline.minMs,
        jsSubmitMs: variant.jsSubmitMs,
        readbackAfterFinishMs: variant.readbackAfterFinishMs,
        firstWarmupMs,
        drawCalls: variant.drawCalls,
        baselineDrawCalls: baseline.drawCalls,
        triangles: variant.triangles,
        drawingBuffer: `${gl.drawingBufferWidth}x${gl.drawingBufferHeight}`,
      });
    } finally {
      undo();
    }
  }
  /* The canvas returns to the frame the flows see before anything else reads it. */
  renderer.render(scene, camera);
  finish();

  /*
   * Presented frames: R3F's own demand loop draws once per invalidate, and the next-but-one animation frame
   * comes after the display has drawn and swapped, so each interval includes the compositor's share.
   */
  const presentedTimings = [];
  if (presented > 0) {
    const presentedFrames = async (name, change) => {
      const intervals = [];
      for (let index = 0; index < presented + 2; index++) {
        const start = now();
        change(index);
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        intervals.push(now() - start);
      }
      const kept = intervals.slice(2);
      return { name, frameMs: round(median(kept)), maxMs: round(Math.max(...kept)) };
    };
    const header = document.querySelector('.seated-header');
    const probe = document.createElement('div');
    Object.assign(probe.style, { position: 'fixed', left: '0', bottom: '0', width: '2px', height: '2px', zIndex: '99' });
    document.body.append(probe);
    const invalidate = () => state.invalidate();
    const flipProbe = (index) => {
      probe.style.background = index % 2 ? '#010101' : '#020202';
    };
    presentedTimings.push(await presentedFrames('scene frame', invalidate));
    presentedTimings.push(await presentedFrames('DOM-only frame (2 px element)', flipProbe));
    if (header) {
      const previous = header.style.backdropFilter;
      header.style.backdropFilter = 'none';
      presentedTimings.push(await presentedFrames('scene frame, header backdrop-filter none', invalidate));
      presentedTimings.push(await presentedFrames('DOM-only frame, header backdrop-filter none', flipProbe));
      header.style.backdropFilter = previous;
    }
    for (const name of ['samples 0', 'pixel ratio 0.5', 'samples 0 + pixel ratio 0.75']) {
      const undo = window.__benchVariants[name]();
      presentedTimings.push(await presentedFrames(`scene frame, ${name}`, invalidate));
      undo();
    }
    probe.remove();
    state.invalidate();
  }
  return { idleFinishMs: round(median(idle)), timings, presented: presentedTimings };
}
