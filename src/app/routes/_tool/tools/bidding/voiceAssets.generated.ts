/* Pinned local voice bytes. Regenerate with scripts/bidding-voice-assets.ts. */
export const VOICE_ASSET_ROOT = '/tools/bidding-listener/v1/';
export const VOICE_ASSETS = {
  "engine": {
    "file": "engine-9b2851acd37e.wasm",
    "sha256": "9b2851acd37eee1a04207fdfcb70adaff99963b8fda55f6a9dd7bcabd0ecd1e3",
    "bytes": 15203446
  },
  "encoder": {
    "file": "encoder-1e721676515b.onnx",
    "sha256": "1e721676515bcd42a186979733981213c66c80db680e1cc582dfedf3be76e678",
    "bytes": 4807159
  },
  "decoder": {
    "file": "decoder-e40ff43297ab.onnx",
    "sha256": "e40ff43297abe815e8898494c17e71bba2152d9d40fa3eb803f75d0f7533329a",
    "bytes": 277985
  },
  "joiner": {
    "file": "joiner-eae9da0c7e1e.onnx",
    "sha256": "eae9da0c7e1e6c6a3f4cc42d167899c388f6c6701b94cb96320e4f55df79624c",
    "bytes": 163380
  },
  "tokens": {
    "file": "tokens-fd2ded4050a5.txt",
    "sha256": "fd2ded4050a55d2b1578870ba8697d02371980217806b7558bd0a5cc60f3ba53",
    "bytes": 5006
  },
  "glue": {
    "file": "glue-673e8757bbb7.mjs",
    "sha256": "673e8757bbb7caf176f4103e661aee7ebe355df744ee881a8490424301b0a522",
    "bytes": 102567
  },
  "spotter": {
    "file": "spotter-a0fdf220dcdd.mjs",
    "sha256": "a0fdf220dcdd6310197afdc37909734c3f6385d07a54fda167ee624c49dca295",
    "bytes": 9867
  }
} as const;
