/* oxlint-disable-next-line import/default -- Vite's worker URL query exports the built URL rather than the source module's exports. */
import captureUrl from './biddingCapture.worklet.ts?worker&url';
import type { FromVoiceWorker, ToVoiceWorker } from './biddingVoice.worker';
import { VoiceCapture, voiceCommand } from './voiceCommands';
import type { VoiceCommand } from './voiceCommands';

export type BiddingVoiceState = Readonly<{
  status: 'off' | 'loading' | 'listening' | 'interrupted' | 'failed' | 'unsupported';
  message: string | null;
}>;
export type BiddingVoice<Context> = {
  start(context: Context, key: string): Promise<void>;
  setContext(context: Context | null, key: string | null): void;
  stop(): void;
  setAnnouncements(enabled: boolean): void;
  announce(text: string): void;
  cancelAnnouncement(): void;
  dispose(): void;
};

/** The central device owns listening. Commands retain their capture context through asynchronous recognition. */
export function createBiddingVoice<Context>({
  onState,
  onCommand,
}: {
  onState: (state: BiddingVoiceState) => void;
  onCommand: (command: VoiceCommand, context: Context) => void;
}): BiddingVoice<Context> {
  const capture = new VoiceCapture<Context>();
  let worker: Worker | null = null;
  let context: AudioContext | null = null;
  let stream: MediaStream | null = null;
  let worklet: AudioWorkletNode | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let generation = 0;
  let listening = false;
  let announcements = false;
  let disposed = false;
  let pendingEpoch: number | null = null;
  let watchdog: ReturnType<typeof setInterval> | undefined;
  let loadTimer: ReturnType<typeof setTimeout> | undefined;
  let lastFrame = 0;
  let loadingReject: ((error: Error) => void) | null = null;
  const speech = typeof speechSynthesis === 'undefined' ? null : speechSynthesis;
  const state = (status: BiddingVoiceState['status'], message: string | null = null) => {
    if (!disposed) {
      onState({ status, message });
    }
  };
  const post = (message: ToVoiceWorker, transfer: Transferable[] = []) => worker?.postMessage(message, transfer);

  const release = () => {
    listening = false;
    generation += 1;
    capture.set(null, null);
    pendingEpoch = null;
    clearInterval(watchdog);
    clearTimeout(loadTimer);
    watchdog = undefined;
    loadTimer = undefined;
    loadingReject?.(new Error('Listening stopped.'));
    loadingReject = null;
    worker?.terminate();
    worker = null;
    worklet?.disconnect();
    worklet = null;
    source?.disconnect();
    source = null;
    const tracks = stream?.getTracks() ?? [];
    stream = null;
    for (const track of tracks) {
      track.onended = null;
      track.onmute = null;
      track.stop();
    }
    if (context) {
      context.onstatechange = null;
      void context.close().catch(() => undefined);
      context = null;
    }
  };
  const interrupt = (message: string) => {
    release();
    state('interrupted', message);
  };
  const setContext = (next: Context | null, key: string | null) => {
    const previous = capture.current();
    const epoch = capture.set(next, key);
    if (epoch === previous) {
      return;
    }
    pendingEpoch = null;
    post({ type: 'reset', epoch });
    worklet?.port.postMessage({ epoch });
  };
  const cancelAnnouncement = () => speech?.cancel();
  const stop = () => {
    release();
    state('off');
  };

  return {
    setContext,
    async start(next, key) {
      if (disposed) {
        return;
      }
      release();
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || typeof AudioWorkletNode === 'undefined') {
        state('unsupported', 'This browser cannot listen. Use the tablet or phone controls.');
        return;
      }
      const run = generation;
      state('loading', 'Starting the English listener. Its first download is about 20 MB before compression.');
      setContext(next, key);
      try {
        /* Create and resume during the tap, before downloads or microphone permission can delay activation. */
        context = new AudioContext({ sampleRate: 16_000 });
        const audio = context;
        const resume = audio.resume();
        void resume.catch(() => undefined);
        const microphone = navigator.mediaDevices
          .getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
          })
          .then((granted) => {
            if (generation !== run || disposed) {
              granted.getTracks().forEach((track) => track.stop());
              throw new Error('Listening stopped.');
            }
            stream = granted;
            for (const track of granted.getAudioTracks()) {
              track.onended = () => interrupt('The microphone stopped. Tap Listen to start again.');
              track.onmute = () => interrupt('The microphone was interrupted. Tap Listen to start again.');
            }
            return granted;
          });
        const [granted] = await Promise.all([microphone, resume]);
        if (generation !== run || disposed) {
          return;
        }
        worker = new Worker(new URL('./biddingVoice.worker.ts', import.meta.url), { type: 'module' });
        const openedWorker = worker;
        const ready = new Promise<void>((resolve, reject) => {
          loadingReject = reject;
          loadTimer = setTimeout(
            () => reject(new Error('The listener took too long to load. Try Listen again.')),
            60_000
          );
          openedWorker.onerror = () => {
            if (generation !== run) {
              return;
            }
            if (!listening) {
              reject(new Error('The listener could not load. Try Listen again.'));
            } else {
              interrupt('The listener stopped. Tap Listen to start again.');
            }
          };
          openedWorker.onmessage = ({ data }: MessageEvent<FromVoiceWorker>) => {
            if (generation !== run || disposed) {
              return;
            }
            if (data.type === 'ready') {
              clearTimeout(loadTimer);
              loadingReject = null;
              resolve();
            } else if (data.type === 'failed') {
              if (!listening) {
                reject(new Error(data.message));
              } else {
                interrupt(data.message);
              }
            } else if (data.type === 'processed') {
              if (pendingEpoch === data.epoch) {
                pendingEpoch = null;
              }
            } else if (data.type === 'heard' && listening) {
              const captured = capture.take(data.epoch);
              const command = voiceCommand(data.keyword);
              if (captured !== null && command !== null) {
                cancelAnnouncement();
                onCommand(command, captured);
              }
            }
          };
          post({ type: 'load' });
        });
        await ready;
        if (generation !== run || disposed) {
          return;
        }
        await audio.audioWorklet.addModule(captureUrl);
        if (generation !== run || disposed) {
          return;
        }
        if (
          audio.state !== 'running' ||
          granted.getAudioTracks().some((track) => track.readyState !== 'live' || track.muted)
        ) {
          throw new Error('The microphone is not running. Tap Listen to try again.');
        }
        worklet = new AudioWorkletNode(audio, 'bidding-capture');
        let receiving = false;
        worklet.port.onmessage = ({ data }: MessageEvent<{ epoch: number; rate: number; samples: Float32Array }>) => {
          if (generation !== run || disposed || !listening) {
            return;
          }
          lastFrame = performance.now();
          if (!receiving) {
            receiving = true;
            state('listening');
          }
          if (data.epoch !== capture.current() || pendingEpoch !== null || capture.take(data.epoch) === null) {
            return;
          }
          pendingEpoch = data.epoch;
          post({ type: 'audio', ...data }, [data.samples.buffer]);
        };
        source = audio.createMediaStreamSource(granted);
        const mute = audio.createGain();
        mute.gain.value = 0;
        source.connect(worklet).connect(mute).connect(audio.destination);
        const epoch = capture.current();
        post({ type: 'reset', epoch });
        worklet.port.postMessage({ epoch });
        listening = true;
        lastFrame = performance.now();
        audio.onstatechange = () => {
          if (generation === run && listening && audio.state !== 'running') {
            interrupt('Audio was interrupted. Tap Listen to start again.');
          }
        };
        watchdog = setInterval(() => {
          if (listening && performance.now() - lastFrame > 3000) {
            interrupt('No microphone audio is arriving. Tap Listen to try again.');
          }
        }, 1500);
        state('loading', 'Waiting for microphone audio.');
      } catch (error) {
        if (generation !== run || disposed) {
          return;
        }
        release();
        const permission =
          error instanceof DOMException && ['NotAllowedError', 'PermissionDeniedError'].includes(error.name);
        state(
          'failed',
          permission
            ? 'Microphone access was refused. You can keep using the tablet and phone controls.'
            : error instanceof Error
              ? error.message
              : 'The listener could not start. Try Listen again.'
        );
      }
    },
    stop,
    setAnnouncements(enabled) {
      announcements = enabled;
      if (!enabled) {
        cancelAnnouncement();
      }
    },
    announce(text) {
      if (!announcements || disposed || !speech) {
        return;
      }
      cancelAnnouncement();
      /* Command-like phrases must never be generated by the auctioneer. */
      if (/\b(?:pass|reset|bid\s+(?:\w+|\d+))\b/i.test(text)) {
        return;
      }
      const voice = speech.getVoices().find((candidate) => candidate.localService && /^en\b/i.test(candidate.lang));
      if (!voice) {
        return;
      }
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.voice = voice;
      utterance.lang = voice.lang;
      speech.speak(utterance);
    },
    cancelAnnouncement,
    dispose() {
      release();
      cancelAnnouncement();
      disposed = true;
    },
  };
}
