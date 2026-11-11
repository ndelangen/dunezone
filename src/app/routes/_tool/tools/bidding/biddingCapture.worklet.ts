declare const sampleRate: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void;

/* Audio is tagged where it is captured, before the page or recognizer can queue it. */
class BiddingCapture extends AudioWorkletProcessor {
  private epoch = 0;
  private buffer = new Float32Array(2048);
  private offset = 0;

  constructor() {
    super();
    this.port.onmessage = ({ data }: MessageEvent<{ epoch: number }>) => {
      this.epoch = data.epoch;
      this.offset = 0;
    };
  }

  process(inputs: Float32Array[][]): boolean {
    const input = inputs[0]?.[0];
    if (!input || this.epoch === 0) {
      return true;
    }
    for (const sample of input) {
      this.buffer[this.offset++] = sample;
      if (this.offset === this.buffer.length) {
        this.port.postMessage({ epoch: this.epoch, rate: sampleRate, samples: this.buffer }, [this.buffer.buffer]);
        this.buffer = new Float32Array(2048);
        this.offset = 0;
      }
    }
    return true;
  }
}
registerProcessor('bidding-capture', BiddingCapture);
export {};
