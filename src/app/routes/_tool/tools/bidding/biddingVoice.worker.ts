/// <reference lib="webworker" />
import { VOICE_ASSET_ROOT, VOICE_ASSETS } from './voiceAssets.generated';
import { voiceEngineAdapters } from './voiceEngineAdapters';
import { KEYWORDS } from './voiceKeywords';

export type ToVoiceWorker =
  | { type: 'load' }
  | { type: 'reset'; epoch: number }
  | { type: 'audio'; epoch: number; rate: number; samples: Float32Array };
export type FromVoiceWorker =
  | { type: 'ready' }
  | { type: 'failed'; message: string }
  | { type: 'heard'; epoch: number; keyword: string }
  | { type: 'processed'; epoch: number };

type Stream = { acceptWaveform(rate: number, samples: Float32Array): void; free(): void };
type Spotter = {
  createStream(): Stream;
  isReady(stream: Stream): boolean;
  decode(stream: Stream): void;
  getResult(stream: Stream): { keyword: string };
  free(): void;
};
const scope = self as DedicatedWorkerGlobalScope;
const post = (message: FromVoiceWorker) => scope.postMessage(message);
const cacheName = 'dune-bidding-voice-v1';
let spotter: Spotter | undefined;
let stream: Stream | undefined;
let epoch = 0;
let loading = false;

function verifiedBytes(asset: (typeof VOICE_ASSETS)[keyof typeof VOICE_ASSETS]): Promise<ArrayBuffer> {
  const url = new URL(`${VOICE_ASSET_ROOT}${asset.file}`, scope.location.origin).href;
  const valid = (candidate: Response) =>
    candidate.arrayBuffer().then((bytes) =>
      crypto.subtle.digest('SHA-256', bytes).then((digest) => {
        const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
        return bytes.byteLength === asset.bytes && hex === asset.sha256 ? bytes : null;
      })
    );
  const opening = 'caches' in scope ? caches.open(cacheName).catch(() => null) : Promise.resolve(null);
  return opening.then((cache) => {
    const download = () =>
      fetch(url, { credentials: 'omit' }).then((response) => {
        if (!response.ok) {
          throw new Error('The listener files could not be downloaded.');
        }
        return valid(response).then((bytes) => {
          if (!bytes) {
            throw new Error('The listener download failed its integrity check.');
          }
          return Promise.resolve(cache?.put(url, new Response(bytes)))
            .catch(() => undefined)
            .then(() => bytes);
        });
      });
    return Promise.resolve(cache?.match(url)).then((response) => {
      if (!response) {
        return download();
      }
      return valid(response).then((bytes) => bytes ?? Promise.resolve(cache?.delete(url)).then(download));
    });
  });
}

/* The repository's worker bundle contract uses promises rather than native async functions. */
function load(): Promise<void> {
  const engineUrl = `${VOICE_ASSET_ROOT}${VOICE_ASSETS.glue.file}`;
  const spotterUrl = `${VOICE_ASSET_ROOT}${VOICE_ASSETS.spotter.file}`;
  return Promise.all([
    import(/* @vite-ignore */ engineUrl) as Promise<{
      makeEngine: (adapters: unknown) => (config: unknown) => Promise<unknown>;
    }>,
    import(/* @vite-ignore */ spotterUrl) as Promise<{ createKws: (engine: unknown, config: unknown) => Spotter }>,
    verifiedBytes(VOICE_ASSETS.engine),
    verifiedBytes(VOICE_ASSETS.encoder),
    verifiedBytes(VOICE_ASSETS.decoder),
    verifiedBytes(VOICE_ASSETS.joiner),
    verifiedBytes(VOICE_ASSETS.tokens),
  ]).then(([engineModule, kwsModule, wasm, encoder, decoder, joiner, tokens]) =>
    engineModule
      .makeEngine(voiceEngineAdapters({ encoder, decoder, joiner, tokens }))({
        wasmBinary: wasm,
        print: () => undefined,
        printErr: () => undefined,
      })
      .then((engine) => {
        spotter = kwsModule.createKws(engine, {
          featConfig: { samplingRate: 16_000, featureDim: 80 },
          modelConfig: {
            transducer: { encoder: '/encoder', decoder: '/decoder', joiner: '/joiner' },
            tokens: '/tokens',
            provider: 'cpu',
            modelType: '',
            numThreads: 1,
            debug: 0,
            modelingUnit: 'bpe',
            bpeVocab: '',
          },
          maxActivePaths: 4,
          numTrailingBlanks: 1,
          keywordsScore: 1.5,
          keywordsThreshold: 0.12,
          keywords: KEYWORDS,
        });
        stream = spotter.createStream();
        post({ type: 'ready' });
      })
  );
}

function startLoading(): void {
  if (loading) {
    return;
  }
  loading = true;
  void load().catch(() => post({ type: 'failed', message: 'The listener could not start. Try Listen again.' }));
}

function resetStream(nextEpoch: number): void {
  epoch = nextEpoch;
  stream?.free();
  stream = spotter?.createStream();
}

function processAudio(data: Extract<ToVoiceWorker, { type: 'audio' }>): void {
  if (data.epoch !== epoch || !spotter || !stream) {
    post({ type: 'processed', epoch: data.epoch });
    return;
  }
  try {
    stream.acceptWaveform(data.rate, data.samples);
    while (spotter.isReady(stream)) {
      spotter.decode(stream);
      const { keyword } = spotter.getResult(stream);
      if (keyword) {
        post({ type: 'heard', epoch, keyword });
        resetStream(epoch);
        break;
      }
    }
    post({ type: 'processed', epoch: data.epoch });
  } catch {
    post({ type: 'failed', message: 'Listening stopped. Try Listen again.' });
  }
}

scope.onmessage = ({ data }: MessageEvent<ToVoiceWorker>) => {
  switch (data.type) {
    case 'load':
      startLoading();
      break;
    case 'reset':
      resetStream(data.epoch);
      break;
    case 'audio':
      processAudio(data);
      break;
  }
};
