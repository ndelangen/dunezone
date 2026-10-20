# Built-in local publisher binding research

Research for [Verify built-in local publisher bindings for GF9](https://github.com/ndelangen/dunezone/issues/2369), observed 20 October 2026 at repository commit `77c26fcfa1a5ff61ae36b087fb55150f4da99497`.

## Finding

Use the built-in local Browser and R2 bindings. They worked with the installed packages and need no replacement capture service or object store. The local Images binding has a measured encoding mismatch. It emits baseline JPEG and ignores output quality, so it cannot satisfy the current publisher and image-ingest contracts unchanged.

This is a binding smoke, not a complete Dune Zone publication proof. The final choice belongs to [Choose the isolated publishing runtime for local GF9 review](https://github.com/ndelangen/dunezone/issues/2367).

## Runtime and isolation

The smoke used Node 24.21.0, Wrangler 4.149.0, Miniflare 5.20261006.0-alpha and @cloudflare/playwright 1.3.6 installed in the root worktree. Wrangler launched local Chrome 126.0.6478.182. These package identities come from their installed package.json files. Miniflare's installed source sets `BROWSER_VERSION` to that exact Chrome version.

A temporary Worker at `/tmp/gf9-local-bindings-smoke` declared only Browser, Images and a fresh R2 bucket name. It had no account ID, routes, production variables, secrets, service bindings, schedules or remote resources. The process used an environment allowlist, a new XDG configuration directory and explicit `--local`. Its working directory was outside the repository, so no repository `.env` or `.dev.vars` loaded. Wrangler printed all three bindings as local. No production or shared-development application records, storage or publisher queues were accessed. Wrangler may perform public package update checks; local bindings do not imply a network air gap.

The temporary Worker ran twice against the same explicit local state directory, then stopped. No permanent service remains.

## Observed output

The Browser binding launched through `launch(env.BROWSER)` from the pinned Cloudflare Playwright package. A local HTML document used no external resources. Its 800 × 600 PNG was 18,738 bytes and was visually inspected. `page.pdf()` returned an 18,057-byte, one-page PDF. Poppler reported 720 × 720 points, exactly 254 × 254 mm.

A second capture exercised the publisher's CDP operations: `newCDPSession`, `Page.printToPDF` with `ReturnAsStream`, `IO.read`, `IO.close` and session detach. It produced a 19,543-byte PDF, one page at 254 × 254 mm, with `Tagged: yes`. This checks the transport used by the existing Rulebook PDF capture. It does not run the app's browser-side PDF optimizer or its fonts and page content.

Both captures returned HTTP 200. Closing each browser logged a WebSocket `Network connection lost` event after producing and storing its output. The smoke did not establish whether that cleanup diagnostic affects a full publisher job. Full application acceptance must include successful job completion and lease cleanup.

The R2 binding stored a marker and capture artifacts. After stopping Wrangler completely and starting it again with the same `--persist-to`, the marker still read `GF9 isolated local R2 persists`. The stored PDF retained SHA-256 `233022a9bfc5060a01aa339b1130698a7c336c54ec4a937888c4418c240a667c`. Persistence was observed across process restart, not just Worker reload.

The PNG was then passed through `env.IMAGES.input(stream).transform(...).output({ format: 'image/jpeg', quality })`:

| Request | Actual dimensions | JPEG marker | Bytes |
| --- | --- | --- | --- |
| No resize, quality 20 | 800 × 600 | SOF0, baseline | 15,661 |
| No resize, quality 82 | 800 × 600 | SOF0, baseline | 15,661 |
| No resize, quality 95 | 800 × 600 | SOF0, baseline | 15,661 |
| 1600 × 1600, scale-down | 800 × 600 | SOF0, baseline | 15,661 |
| 320 × 320, scale-down | 320 × 240 | SOF0, baseline | 5,002 |
| 320 × 320, cover | 320 × 320 | SOF0, baseline | 5,599 |

The quality 20, 82 and 95 files were byte-identical, with SHA-256 `a82af7262d08c18b23f38989595c8aad589c208b274635874e6abe28cff3b7ab`. A JPEG segment parser measured dimensions and start-of-frame markers. Fit behavior covers the application's current `scale-down` and `cover` requests. It does not establish parity for all Images operations or all source formats.

## Source explanation and contract impact

Miniflare's installed `dist/src/index.js` implements a local Browser session service at lines 116522 onward and launches Chrome at line 116606. At line 119240, `imagesLocalFetcher` delegates local image processing to Sharp. The transformation path reads `output_format`, applies dimensions and fit, then calls `transformer.jpeg()` without encoding options at line 119376. `resolveFit` at line 119426 maps `scale-down` to inside without enlargement and `cover` to cover. This matches the observed dimensions and unchanged quality bytes. A different hosted-image transformation path elsewhere in this file reads quality; that does not change this tested binding path.

The application's [JPEG publication assertion](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/workers/publisher/image-encode.ts#L31) rejects every measured output because it requires progressive JPEG, SOF2, as well as exact dimensions. The [image-ingest encoder](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/workers/publisher/user-images.ts#L190) uses scale-down for covers and cover for avatars. Full covers and avatars also require progressive JPEG. A Ruleset thumbnail can accept baseline in its special small-edge case, but its full rendition must pass first. The local binding therefore blocks normal cover/logo ingest and final published component images even though screenshot and fit operations work.

The [current Rulebook PDF stream](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/workers/publisher/rulebook-pdf-stream.ts#L14) adds browser-side compression, transfer bounds and result assertions beyond this smoke. The [production Worker configuration](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/workers/publisher/wrangler.jsonc) also combines live origins, buckets and service bindings. Do not reuse it as the local launcher configuration.

## Smallest correction to specify

Keep the actual publisher execution, Browser capture, R2 delivery and existing JPEG assertions. Make a development-only correction at the local Images binding encoder, with explicit progressive JPEG and requested quality. That correction must serve both publisher encoding and user-image ingest. An upstream fix or maintained local dependency patch is preferable to changing application renderers or building another publisher. A narrowly injected local Images implementation is a fallback if patching the installed local simulator is impractical.

The selected correction must preserve the measured scale-down and cover geometry, forward quality and encode progressive JPEG. It must apply only to the isolated local runtime. Production must retain the existing Cloudflare Images binding and assertion behavior. Do not weaken the progressive contract, silently accept baseline as equivalent or switch these bindings to hosted resources.

This local Chrome 126 smoke does not establish equivalence with the production browser service. Local review remains a content and layout check. The eventual implementation still needs ordinary CI and actual production artifact verification. A full local acceptance run must prove authenticated edit, ingest, scheduled publication, job completion, component image, cover, PDF, HTML delivery, restart persistence and no outgoing application writes to remote origins.

## Documentation reconciliation

[Cloudflare Browser Run's Wrangler reference](https://developers.cloudflare.com/browser-run/reference/wrangler/) explicitly permits local Puppeteer, Playwright and CDP. The same page still contains a conflicting trailing recommendation to enable remote mode for a real browser. [The Browser Run changelog](https://developers.cloudflare.com/browser-run/changelog/) records local development and Playwright support during July 2025, and [the July 2025 local-development announcement](https://developers.cloudflare.com/changelog/post/2025-07-22-br-local-dev/) describes Chrome running on the developer's machine. The installed source and successful local capture resolve that inconsistency for these exact package versions.

[The Images binding documentation](https://developers.cloudflare.com/images/optimization/binding/#interact-with-your-images-binding-locally) describes the local implementation as lower fidelity. Its listed transform subset is narrower than the installed source: fit works in this smoke. The measured baseline/quality differences are the useful constraint here. No claim of complete Cloudflare production parity follows from this test.

## Reproduction

Sanitized inputs, output artifacts, `results.json` and the temporary Worker source are preserved at `/Users/me/Projects/Dune/gf9-delivery/wayfinder/local-bindings-smoke`. No local bucket database or credential directory is included in that evidence copy. The Worker source below is also recorded here so the test can be reconstructed after the temporary directory is removed. Replace its absolute package import with the installed package path in the checkout being tested.

Use an isolated directory containing that source and this Wrangler JSON:

```json
{
  "name": "gf9-bindings-isolated-smoke",
  "main": "worker.ts",
  "compatibility_date": "2026-10-06",
  "compatibility_flags": ["nodejs_compat"],
  "browser": { "binding": "BROWSER" },
  "images": { "binding": "IMAGES" },
  "r2_buckets": [{ "binding": "BUCKET", "bucket_name": "gf9-bindings-smoke-local" }],
  "dev": { "ip": "127.0.0.1", "port": 8937 }
}
```

Run the pinned Wrangler with an environment allowlist, outside the repository:

```sh
env -i \
  PATH=/Users/me/.nvm/versions/node/v24.21.0/bin:/usr/bin:/bin:/opt/homebrew/bin \
  TMPDIR=/tmp \
  XDG_CONFIG_HOME=/tmp/gf9-local-bindings-smoke/config \
  WRANGLER_SEND_METRICS=false \
  CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV=false \
  /Users/me/.nvm/versions/node/v24.21.0/bin/node \
  /Users/me/.codex/worktrees/0ace/dunezone/node_modules/wrangler/bin/wrangler.js dev \
  --config /tmp/gf9-local-bindings-smoke/wrangler.jsonc \
  --local --persist-to /tmp/gf9-local-bindings-smoke/state \
  --show-interactive-dev-session=false
```

An initial attempt with `--no-interactive` was rejected by Wrangler before startup. The command above uses the supported flag and is the one that produced the observations.

Request `/browser` and `/cdp`; retrieve their stored artifacts through `/artifact?key=screenshot.png`, `/artifact?key=capture.pdf` and `/artifact?key=cdp-capture.pdf`. Request `/store`, stop Wrangler, restart with the same command and request `/read`. Submit the saved PNG with POST `/image?quality=20`, `82` and `95`, then POST `/image?width=320&height=320&fit=scale-down` and `fit=cover`. The 1600 scale-down case checks no enlargement. Inspect PDFs with `pdfinfo`, parse JPEG SOF markers and compare SHA-256 values. Stop the server when finished.

### Temporary Worker

```ts
import { launch } from "/Users/me/.codex/worktrees/0ace/dunezone/node_modules/@cloudflare/playwright/lib/index.js";
export default { async fetch(request, env) {
 const url = new URL(request.url);
 try {
 if (url.pathname === '/store') { await env.BUCKET.put('persistence-proof', 'GF9 isolated local R2 persists'); return new Response('stored'); }
 if (url.pathname === '/read') { const value = await env.BUCKET.get('persistence-proof'); return new Response(value ? await value.text() : 'missing'); }
 if (url.pathname === '/browser' || url.pathname === '/cdp') {
 const browser=await launch(env.BROWSER);
 try {
 const page=await browser.newPage({viewport:{width:800,height:600}});
 await page.setContent('<html><head><style>@page { size: 254mm 254mm; margin: 10mm; } body { font-family:sans-serif; background:#fdecc2; } h1 {color:#52301a}</style></head><body><h1>GF9 local binding smoke</h1><p>Browser, screenshot and PDF proof.</p><svg width="640" height="240"><rect width="640" height="240" fill="#c78024"/><circle cx="240" cy="120" r="95" fill="#663514"/></svg></body></html>');
 if(url.pathname==='/cdp') {
 const session=await page.context().newCDPSession(page);
 const printed=await session.send('Page.printToPDF',{transferMode:'ReturnAsStream',paperWidth:10,paperHeight:10,marginTop:0,marginBottom:0,marginLeft:0,marginRight:0,printBackground:true,preferCSSPageSize:true,generateTaggedPDF:true,generateDocumentOutline:true});
 let total=0; const parts=[];
 while(true) { const chunk=await session.send('IO.read',{handle:printed.stream,size:65536}); const part=Buffer.from(chunk.data,chunk.base64Encoded?'base64':'utf8');total+=part.length;parts.push(part);if(chunk.eof)break; }
 await session.send('IO.close',{handle:printed.stream});await session.detach();
 await env.BUCKET.put('cdp-capture.pdf',Buffer.concat(parts));
 return Response.json({browserVersion:browser.version(),pdfBytes:total,streamed:true});
 }
 const png=await page.screenshot({type:'png'}); const pdf=await page.pdf({preferCSSPageSize:true,printBackground:true});
 await env.BUCKET.put('screenshot.png',png,{httpMetadata:{contentType:'image/png'}}); await env.BUCKET.put('capture.pdf',pdf,{httpMetadata:{contentType:'application/pdf'}});
 return Response.json({browserVersion:browser.version(),pngBytes:png.length,pdfBytes:pdf.length});
 } finally { await browser.close(); }
 }
 if(url.pathname==='/artifact') {const v=await env.BUCKET.get(url.searchParams.get('key'));return new Response(v?.body??'missing');}
 if(url.pathname==='/image') {
 const body=await request.arrayBuffer(); const input=new Response(body).body; let chain=env.IMAGES.input(input);
 if(url.searchParams.has('width')) chain=chain.transform({width:Number(url.searchParams.get('width')),height:Number(url.searchParams.get('height')), ...(url.searchParams.has('fit')?{fit:url.searchParams.get('fit')}:{})});
 const output=await chain.output({format:'image/jpeg',quality:Number(url.searchParams.get('quality')??82)});
 return output.response();
 }
 return new Response('isolated local smoke');
 } catch(e){return Response.json({error:String(e),stack:e.stack},{status:500});}
}};
```
