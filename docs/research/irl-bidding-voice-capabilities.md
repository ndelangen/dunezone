# IRL bidding voice capabilities

Research for [Bidding tool: establish offline voice capabilities](https://github.com/ndelangen/dunezone/issues/2844), checked on 2026-11-09. Voice is a supplement to phone remotes and tablet controls. The user accepts imperfect recognition; this report identifies what the specification can promise and what needs a physical trial.

## Answer

Local keyword spotting is a credible approach. The proposed English model has a traceable Apache-2.0 declaration, and sherpa-onnx supplies a browser WebAssembly implementation. The prototype does not yet establish dependable operation on iPhones, iPads or Android phones. Its engine loading conflicts with the current application content security policy, cached model files do not establish an offline page launch, and the auctioneer can select a network-backed synthesis voice. These are integration requirements for the later build, not reasons to require every player to use a phone. Evidence follows below.

No microphone, browser runtime, real speaker or physical device was tested in this research. I inspected the [recorded prototype revision](https://github.com/ndelangen/dunezone/tree/51bf76f09c07e849d8df3a0d0d9bb9677d92f50f/src/app/routes/_app/tools/bidding), the [application policy at the current base](https://github.com/ndelangen/dunezone/blob/0b5744643ab3c38df73d25f0e3dff065d7244d43/workers/publisher/application-security.ts), upstream source and browser specifications. I also downloaded the published model and npm archives to inspect their bytes and metadata.

## Model, engine and download size

The proposed model is `sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01`. Its author documents English-only training on GigaSpeech XL and configurable keyword phrases. Open-vocabulary keyword spotting recognizes a supplied phrase list; it does not identify which person spoke or whether they intended an auction command. [Model documentation](https://k2-fsa.github.io/sherpa/onnx/kws/pretrained_models/index.html#sherpa-onnx-kws-zipformer-gigaspeech-3-3m-2024-01-01-english), [keyword spotting design](https://k2-fsa.github.io/sherpa/onnx/kws/index.html).

I measured the four model files fetched by the prototype and the three files fetched from `sherpa-onnx@2.0.1`. Sizes below are decoded file bytes, not HTTP transfer size or runtime memory. Sources are the [official model archive](https://github.com/k2-fsa/sherpa-onnx/releases/download/kws-models/sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01.tar.bz2), [npm package archive](https://registry.npmjs.org/sherpa-onnx/-/sherpa-onnx-2.0.1.tgz), and [prototype file list](https://github.com/ndelangen/dunezone/blob/51bf76f09c07e849d8df3a0d0d9bb9677d92f50f/src/app/routes/_app/tools/bidding/tinyListener.ts).

| Downloaded component | Bytes |
| --- | ---: |
| Int8 encoder | 4,807,159 |
| Int8 decoder | 277,985 |
| Int8 joiner | 163,380 |
| Token vocabulary | 5,006 |
| Model subtotal | 5,253,530 |
| Node-targeted engine WASM | 15,203,446 |
| Engine JavaScript glue | 102,408 |
| Keyword-spotter JavaScript | 9,925 |
| Engine subtotal | 15,315,779 |
| Combined selected files | 20,569,309 |

The model archive itself is 17,626,723 bytes because it includes additional artifacts, including full-precision weights. The prototype downloads the selected files individually. Locally compressing the three engine files with gzip level 9 produced 4,245,620 bytes; this is a reproducible compression measurement, not a measured production download. Therefore, neither "5 MB" nor the prototype's "about 10 MB" is a verified total transfer budget. Measure the chosen self-hosted release after its encoding and caching policy is fixed.

The inspected model archive's SHA-256 is `f170013b4716e41b62b9bfd809687c207cef798ef9bc6534d524e17af9b6561a`. Its encoder SHA-256 is `1e721676515bcd42a186979733981213c66c80db680e1cc582dfedf3be76e678`, matching the encoder in the recorded prototype. The npm engine WASM SHA-256 is `9b2851acd37eee1a04207fdfcb70adaff99963b8fda55f6a9dd7bcabd0ecd1e3`.

The model archive's README declares `license: Apache License 2.0`. A maintainer also [confirmed Apache 2.0 for the named GigaSpeech and bilingual KWS models](https://github.com/k2-fsa/sherpa-onnx/issues/3802#issuecomment-6415898531) on 2026-10-26. The [npm package metadata](https://registry.npmjs.org/sherpa-onnx/2.0.1) declares Apache-2.0 for the engine. Preserve the relevant license and notices with the self-hosted artifacts; this evidence concerns these exact artifacts, not every model sherpa-onnx supports.

## Browser and device constraints

| Concern | Evidence and consequence for the specification |
| --- | --- |
| Microphone access | Safari requires HTTPS and user permission for capture. The app must work when permission is denied or a device is unavailable. This is separate from downloading the listener. [WebKit capture policy](https://webkit.org/blog/7763/a-closer-look-into-webrtc/), [media-capture specification](https://w3c.github.io/mediacapture-main/#dom-mediadevices-getusermedia). |
| Starting audio | Browsers may keep an AudioContext suspended until user activation. Provide an explicit listen action and inspect the running state; calling `resume()` alone is not proof of capture. [Web Audio start rules](https://webaudio.github.io/web-audio-api/#allowed-to-start), [Chrome autoplay policy](https://developer.chrome.com/blog/autoplay/#web-audio). |
| Mobile execution | Upstream supplies a [browser KWS build](https://github.com/k2-fsa/sherpa-onnx/blob/v2.0.1/build-wasm-simd-kws.sh). Safari added WebAssembly SIMD in 16.4, but that capability does not establish adequate CPU speed or memory for this application. The upstream browser KWS configuration starts with a 512 MB WASM memory allocation and allows growth; it is not a measured working-set size for this prototype. [WebKit release notes](https://webkit.org/blog/13966/webkit-features-in-safari-16-4/), [upstream memory configuration](https://github.com/k2-fsa/sherpa-onnx/blob/v2.0.1/wasm/kws/CMakeLists.txt). |
| Backgrounding and interruptions | A microphone track can become muted or end, including when another application takes audio priority. A phone call, screen lock and app switch need explicit recovery checks; uninterrupted background listening is not a documented application guarantee. [Capture lifecycle](https://w3c.github.io/mediacapture-main/#life-cycle). |
| Listening while speaking | Echo cancellation is a request to process the microphone signal, not an intent detector or a guarantee that the auctioneer cannot trigger commands. Test both missed interruptions and false commands while the tablet speaks. [Echo cancellation](https://w3c.github.io/mediacapture-main/#dom-mediatrackconstraintset-echocancellation). |
| Persistence | Safari's Cache API uses best-effort storage by default and can lose data through eviction. Persistence requests depend on browser policy. Recheck complete assets and expose a recoverable missing-download state. [WebKit storage policy](https://webkit.org/blog/14403/updates-to-storage-policy/). |
| Spoken output | Web Speech distinguishes local and remote synthesis voices through `localService`. If offline auctioneer speech is promised, choose an available local voice and verify it offline, or clearly allow silent output. [Speech synthesis voices](https://webaudio.github.io/web-speech-api/#speechsynthesisvoice). |

These constraints apply to the central device doing the listening. A phone used only as a remote does not need a microphone or speech engine. The exact supported iOS, iPadOS and Android versions remain a product and release decision, with device evidence still required.

## Prototype gaps that affect the plan

1. **Loading under the application policy.** The page fetches its engine from jsDelivr. The current `connect-src` allows the application's own origin, configured Convex origins and Cloudflare analytics, so that fetch conflicts with the policy. The worker also evaluates downloaded CommonJS with `new Function` before instantiating WASM. The [global static-asset header rule](https://github.com/ndelangen/dunezone/blob/0b5744643ab3c38df73d25f0e3dff065d7244d43/workers/publisher/_headers) applies the same application policy, which contains neither JavaScript nor WASM evaluation permission. Self-hosting alone does not fix the loader. Choose browser-compatible packaging and the narrow policy required by the resulting worker, then test actual release headers. This is source analysis, not a production reproduction. [Prototype loader](https://github.com/ndelangen/dunezone/blob/51bf76f09c07e849d8df3a0d0d9bb9677d92f50f/src/app/routes/_app/tools/bidding/keywordSpotter.worker.ts), [CSP execution rules](https://www.w3.org/TR/CSP3/#directive-script-src).

2. **Offline assets versus an offline application.** `tinyListener.ts` caches seven engine and model responses. It does not cache the page, application chunks or the worker module. A successful listener download therefore does not prove a cold offline launch or reload. Its model URLs and cache name are fixed rather than tied to an artifact hash, and a cache hit is accepted without an integrity check. Decide whether offline means continuing an already-open table or reopening it without internet. [Cache implementation](https://github.com/ndelangen/dunezone/blob/51bf76f09c07e849d8df3a0d0d9bb9677d92f50f/src/app/routes/_app/tools/bidding/tinyListener.ts).

3. **Capture health.** The prototype requests a 16 kHz AudioContext and uses `ScriptProcessorNode` on the page to send audio to its inference worker. ScriptProcessorNode is deprecated in favor of AudioWorkletNode. The code has no track mute/end handling or AudioContext state recovery. Its ready state describes an initialized model, not proof of live microphone frames. The later design needs a visible distinction between downloaded, listening and interrupted. [Prototype capture](https://github.com/ndelangen/dunezone/blob/51bf76f09c07e849d8df3a0d0d9bb9677d92f50f/src/app/routes/_app/tools/bidding/tinyListener.ts), [Web Audio specification](https://webaudio.github.io/web-audio-api/#ScriptProcessorNode).

4. **Speech output can use a network service.** The reused [speech helper](https://github.com/ndelangen/dunezone/blob/51bf76f09c07e849d8df3a0d0d9bb9677d92f50f/src/app/widgets/tutorial-guide/speech.ts) ranks natural voices, including online voices, ahead of local voices and retries locally after certain failures. Local keyword spotting therefore does not make every part of the voice feature offline.

5. **Recognition is immediately actionable.** The [voice prototype](https://github.com/ndelangen/dunezone/blob/51bf76f09c07e849d8df3a0d0d9bb9677d92f50f/src/app/routes/_app/tools/bidding/OfflineVoice.tsx) keeps listening during speech, cancels speech after recognizing a command, and applies it to the currently active faction. The keyword path recognizes bids one through twenty, plus one, pass and reset. It neither identifies a speaker nor establishes a command's original turn while recognition is pending. The mixed-input decision must cover confirmation, correction, stale recognition and simultaneous phone input.

## Accuracy evidence and required trials

The [preserved voice brief](https://github.com/ndelangen/dunezone/issues/2840) reported about 95% recognition in quiet and 75% with 10 dB chatter using generated voices. The worker comments mention tuning on ten generated voices. I found no tracked evaluation corpus, runner or per-command results in the inspected prototype source, scripts or docs that reproduce those figures. They are reported experiment results, not real-table accuracy estimates. "No wrong bids" does not establish a zero false-command rate.

The later prototype or build should run these bounded checks on an iPhone with Safari, an iPad with Safari, and an Android phone with Chrome, recording exact hardware and browser versions:

- Install on a cold cache, initialize under release CSP, grant and deny microphone access, then verify active capture and the tablet fallback.
- Cut internet while listening, stop and restart listening, reload offline, and remove cached assets. Report each result separately rather than one offline pass/fail.
- Try every supported command with several actual players at table distances. Record correct commands, missed commands, wrong amounts, unintended passes/resets and recognition delay. Include accents represented by the players.
- Include ordinary conversation with no intended command, repeated commands, overlapping speakers and the auctioneer at normal and loud volume. Measure false actions per period of conversation as well as success on intended commands.
- Combine a voice command with a nearly simultaneous phone bid and a timer expiry. A late recognition must obey the agreed turn and correction rules.
- Switch apps, lock and unlock, answer an interruption, and change audio devices. Confirm the listening indicator reflects capture and the user can resume without losing auction state.
- Run a full expected bidding session and measure responsiveness, memory and heat on the least capable supported device. Model file size alone cannot answer this.

These trials have not been run. The user, through [Bidding tool: agree mixed-input behavior](https://github.com/ndelangen/dunezone/issues/2840), should choose acceptable recognition behavior and correction friction. The final specification should assign the packaging, CSP, offline-start and device checks to implementation acceptance criteria. No additional product decision ticket is required by this research; those two existing decisions already own the open choices.
