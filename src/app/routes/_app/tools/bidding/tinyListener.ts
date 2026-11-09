import { useEffect, useRef, useState } from 'react';

import type { FromSpotter, ToSpotter } from './keywordSpotter.worker';

/*
 * The tiny listener (Norbert, 2026-11-09): instead of a whole speech recogniser (Vosk's smallest is 40 MB), a keyword
 * spotter that knows only the auction's phrases. It is sherpa-onnx's 3.3M-parameter English keyword model (5.2 MB) run
 * by sherpa-onnx's official WebAssembly build (15 MB, about 4 MB compressed), downloaded once and kept in the
 * browser's cache, so after that it hears with no network at all, in any browser.
 */

const ENGINE = 'https://cdn.jsdelivr.net/npm/sherpa-onnx@2.0.1/';
/* The model is served with the tools, from the sherpa-onnx `kws-models` release (Apache-2.0). */
const MODEL = '/tools/bidding-listener/';

/** Where each file comes from; stories and tests may point it elsewhere. */
export const LISTENER_FILES = {
  glue: `${ENGINE}sherpa-onnx-wasm-nodejs.js`,
  kws: `${ENGINE}sherpa-onnx-kws.js`,
  wasm: `${ENGINE}sherpa-onnx-wasm-nodejs.wasm`,
  encoder: `${MODEL}encoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx`,
  decoder: `${MODEL}decoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx`,
  joiner: `${MODEL}joiner-epoch-12-avg-2-chunk-16-left-64.int8.onnx`,
  tokens: `${MODEL}tokens.txt`,
};

/** About what the first download weighs. */
export const LISTENER_MB = 10;

/* The phrases, each as the model's word pieces (some in more than one spelling), and what each means. */
const KEYWORDS = `
▁BI D ▁ONE @BID_ONE
▁B ID ▁ONE @BID_ONE
▁B I D ▁ONE @BID_ONE
▁BI D ▁ON E @BID_ONE
▁BI D ▁TWO @BID_TWO
▁B ID ▁TWO @BID_TWO
▁B I D ▁TWO @BID_TWO
▁ B ID ▁TWO @BID_TWO
▁BI D ▁THREE @BID_THREE
▁B ID ▁THREE @BID_THREE
▁B I D ▁THREE @BID_THREE
▁ B ID ▁THREE @BID_THREE
▁BI D ▁FOUR @BID_FOUR
▁B ID ▁FOUR @BID_FOUR
▁B I D ▁FOUR @BID_FOUR
▁ B ID ▁FOUR @BID_FOUR
▁BI D ▁F IVE @BID_FIVE
▁BI D ▁FI VE @BID_FIVE
▁B ID ▁F IVE @BID_FIVE
▁B ID ▁FI VE @BID_FIVE
▁BI D ▁SIX @BID_SIX
▁B ID ▁SIX @BID_SIX
▁B I D ▁SIX @BID_SIX
▁ B ID ▁SIX @BID_SIX
▁BI D ▁SE VE N @BID_SEVEN
▁B ID ▁SE VE N @BID_SEVEN
▁BI D ▁SE V EN @BID_SEVEN
▁BI D ▁S E VE N @BID_SEVEN
▁BI D ▁E IGHT @BID_EIGHT
▁B ID ▁E IGHT @BID_EIGHT
▁BI D ▁ E IGHT @BID_EIGHT
▁B I D ▁E IGHT @BID_EIGHT
▁BI D ▁NINE @BID_NINE
▁B ID ▁NINE @BID_NINE
▁B I D ▁NINE @BID_NINE
▁ B ID ▁NINE @BID_NINE
▁BI D ▁T EN @BID_TEN
▁B ID ▁T EN @BID_TEN
▁BI D ▁ T EN @BID_TEN
▁BI D ▁T E N @BID_TEN
▁BI D ▁E LE VE N @BID_ELEVEN
▁B ID ▁E LE VE N @BID_ELEVEN
▁BI D ▁E LE V EN @BID_ELEVEN
▁B ID ▁E LE V EN @BID_ELEVEN
▁BI D ▁T W EL VE @BID_TWELVE
▁B ID ▁T W EL VE @BID_TWELVE
▁BI D ▁ T W EL VE @BID_TWELVE
▁BI D ▁T W E L VE @BID_TWELVE
▁BI D ▁TH IR TE EN @BID_THIRTEEN
▁B ID ▁TH IR TE EN @BID_THIRTEEN
▁BI D ▁TH IR T E EN @BID_THIRTEEN
▁BI D ▁TH IR TE E N @BID_THIRTEEN
▁BI D ▁FOUR TE EN @BID_FOURTEEN
▁B ID ▁FOUR TE EN @BID_FOURTEEN
▁BI D ▁FOUR T E EN @BID_FOURTEEN
▁BI D ▁FOUR TE E N @BID_FOURTEEN
▁BI D ▁FI F TE EN @BID_FIFTEEN
▁BI D ▁F IF TE EN @BID_FIFTEEN
▁B ID ▁FI F TE EN @BID_FIFTEEN
▁B ID ▁F IF TE EN @BID_FIFTEEN
▁BI D ▁SIX TE EN @BID_SIXTEEN
▁B ID ▁SIX TE EN @BID_SIXTEEN
▁BI D ▁SIX T E EN @BID_SIXTEEN
▁BI D ▁SIX TE E N @BID_SIXTEEN
▁BI D ▁SE VE N TE EN @BID_SEVENTEEN
▁BI D ▁SE V ENT E EN @BID_SEVENTEEN
▁B ID ▁SE VE N TE EN @BID_SEVENTEEN
▁B ID ▁SE V ENT E EN @BID_SEVENTEEN
▁BI D ▁E IGHT E EN @BID_EIGHTEEN
▁B ID ▁E IGHT E EN @BID_EIGHTEEN
▁BI D ▁E IGHT E E N @BID_EIGHTEEN
▁BI D ▁ E IGHT E EN @BID_EIGHTEEN
▁BI D ▁NINE TE EN @BID_NINETEEN
▁B ID ▁NINE TE EN @BID_NINETEEN
▁BI D ▁NINE T E EN @BID_NINETEEN
▁BI D ▁NINE TE E N @BID_NINETEEN
▁BI D ▁TWENTY @BID_TWENTY
▁B ID ▁TWENTY @BID_TWENTY
▁B I D ▁TWENTY @BID_TWENTY
▁ B ID ▁TWENTY @BID_TWENTY
▁BI D ▁P LU S ▁ONE @BID_PLUS_ONE
▁B ID ▁P LU S ▁ONE @BID_PLUS_ONE
▁BI D ▁P L US ▁ONE @BID_PLUS_ONE
▁B ID ▁P L US ▁ONE @BID_PLUS_ONE
▁PA S S @PASS
▁P AS S @PASS
▁P A S S @PASS
▁ P AS S @PASS
▁RE S ET @RESET
▁RE SE T @RESET
▁RE S E T @RESET
▁ RE S ET @RESET
`.trim();

/** A phrase the spotter heard, as the words `readSpoken` reads. */
export function keywordPhrase(keyword: string): string {
  return keyword.toLowerCase().replace(/_/g, ' ');
}

const CACHE = 'bidding-tiny-listener-v1';

/* Fetches a file once; after that it comes from the browser's cache, so it works offline. */
async function cached(url: string): Promise<Response> {
  try {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(url);
    if (hit) {
      return hit;
    }
    const response = await fetch(url);
    if (response.ok) {
      await cache.put(url, response.clone());
    }
    return response;
  } catch {
    return fetch(url);
  }
}

/** Whether the listener's files are already on this device. */
async function isStored(): Promise<boolean> {
  try {
    const cache = await caches.open(CACHE);
    const found = await Promise.all(Object.values(LISTENER_FILES).map((url) => cache.match(url)));
    return found.every(Boolean);
  } catch {
    return false;
  }
}

export type ListenerState = 'checking' | 'downloadable' | 'downloading' | 'ready' | 'failed';

/**
 * The tiny listener, when `enabled`: says whether it is on this device yet, downloads it on `install`, and while `on`, hears the microphone and hands each phrase to `onPhrase`.
 */
export function useTinyListener(enabled: boolean, on: boolean, onPhrase: (phrase: string) => void) {
  const [state, setState] = useState<ListenerState>('checking');
  const [refused, setRefused] = useState(false);
  const worker = useRef<Worker | undefined>(undefined);
  const handler = useRef(onPhrase);
  useEffect(() => {
    handler.current = onPhrase;
  }, [onPhrase]);

  function start() {
    if (worker.current) {
      return;
    }
    setState('downloading');
    const spotter = new Worker(new URL('./keywordSpotter.worker.ts', import.meta.url), { type: 'module' });
    worker.current = spotter;
    const fail = () => {
      spotter.terminate();
      worker.current = undefined;
      setState('failed');
    };
    spotter.onmessage = ({ data }: MessageEvent<FromSpotter>) => {
      if (data.type === 'ready') {
        setState('ready');
      } else if (data.type === 'heard') {
        handler.current(keywordPhrase(data.keyword));
      } else {
        fail();
      }
    };
    spotter.onerror = fail;
    void (async () => {
      try {
        const [glue, kws, wasm, encoder, decoder, joiner, tokens] = await Promise.all(
          [
            LISTENER_FILES.glue,
            LISTENER_FILES.kws,
            LISTENER_FILES.wasm,
            LISTENER_FILES.encoder,
            LISTENER_FILES.decoder,
            LISTENER_FILES.joiner,
            LISTENER_FILES.tokens,
          ].map(async (url) => {
            const response = await cached(url);
            if (!response.ok) {
              throw new Error(`${url}: ${response.status}`);
            }
            return response;
          })
        );
        const message: ToSpotter = {
          type: 'load',
          glue: await glue!.text(),
          kws: await kws!.text(),
          wasm: await wasm!.arrayBuffer(),
          model: {
            encoder: await encoder!.arrayBuffer(),
            decoder: await decoder!.arrayBuffer(),
            joiner: await joiner!.arrayBuffer(),
            tokens: await tokens!.arrayBuffer(),
          },
          keywords: KEYWORDS,
        };
        spotter.postMessage(message, [message.wasm, ...Object.values(message.model)]);
      } catch {
        fail();
      }
    })();
  }

  useEffect(() => {
    if (!enabled) {
      return;
    }
    let live = true;
    void isStored().then((stored) => {
      if (!live) {
        return;
      }
      if (stored) {
        start();
      } else {
        setState((now) => (now === 'checking' ? 'downloadable' : now));
      }
    });
    return () => {
      live = false;
      worker.current?.terminate();
      worker.current = undefined;
    };
  }, [enabled]);

  useEffect(() => {
    const spotter = worker.current;
    if (!on || state !== 'ready' || !spotter) {
      return;
    }
    let stopped = false;
    let stream: MediaStream | undefined;
    /* The model hears at 16 kHz; the browser resamples the microphone to it. */
    const context = new AudioContext({ sampleRate: 16_000 });
    const tap = context.createScriptProcessor(2048, 1, 1);
    const mute = context.createGain();
    mute.gain.value = 0;
    tap.connect(mute).connect(context.destination);
    tap.onaudioprocess = (event) => {
      const samples = new Float32Array(event.inputBuffer.getChannelData(0));
      const message: ToSpotter = { type: 'sound', rate: context.sampleRate, samples };
      spotter.postMessage(message, [samples.buffer]);
    };
    void navigator.mediaDevices
      ?.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      .then((granted) => {
        if (stopped) {
          granted.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = granted;
        context.createMediaStreamSource(granted).connect(tap);
        void context.resume();
      })
      .catch(() => setRefused(true));
    return () => {
      stopped = true;
      tap.onaudioprocess = null;
      stream?.getTracks().forEach((track) => track.stop());
      void context.close();
    };
  }, [on, state]);

  return { state, refused, install: start };
}
