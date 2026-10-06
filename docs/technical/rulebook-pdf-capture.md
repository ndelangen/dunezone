# Full Rulebook PDF capture

Rulebooks use one Chromium capture for up to 100 Pages. Capturing the whole document lets Chromium share fonts and images and keeps its tagged reading order and document links together. The private capture protocol retains its existing batch name for compatibility, but a new job contains exactly one complete document.

The Worker requests a CDP PDF stream and moves at most 512 KiB at a time into the capture browser. The browser owns the raw PDF, bounded at 96 MiB. It shares repeated unmarked vector drawings and translated filled outlines. Overlapping contours, including holes, stay together. Patterned fills, clipping paths, and stroked paths are excluded from translated sharing. Matching allows at most 0.0001 point of coordinate error at each printed occurrence. Text positioning and character data are unchanged.

Eligible RGB images are resized to at most 150 pixels per printed inch and encoded as JPEG quality 0.70 or lossless deflate, whichever is smaller. RGB images with an embedded ICC profile retain that profile. Transparency masks use lossless compression. Unsupported encodings stay unchanged.

The browser removes unreachable objects and emits a densely numbered classic cross-reference table. The Worker receives at most 16 MB of compressed output and strictly validates the capture's cross-reference table, page count, and physical size. It adds Edition metadata, saves with compressed object tables, and validates those exact final bytes. The final validator checks the complete file envelope, object offsets, cross-reference coverage, bounded object-stream decompression, each member's offset and index, the catalog, and the reachable Pages. A permissive PDF parser's ability to repair a damaged file is insufficient for publication.

Failure closes the CDP stream and browser context. Capture and browser compression share a 180-second budget, bounded by the remaining publication work window.

## Evidence from the 82-page Dream Rulebook

On 6 October 2026, Cloudflare Chromium captured the complete square Rulebook through the publisher capture bundle. The final capture and compression took 115.7 seconds and produced **4,494,704 bytes**. The run used the frozen manuscript, sequential image settlement, the CDP transfer function, and Edition finalization. No broken images were reported. This is a real Cloudflare browser run with assets delivered through a local route fixture, rather than evidence of a deployed publication job.

| File | Bytes |
| --- | ---: |
| User's browser print | 39,322,470 |
| User's iLovePDF result | 17,595,814 |
| Raw Cloudflare capture | 43,157,627 |
| Initial full publisher capture with conservative compression | 8,819,157 |
| Updated full publisher capture | 4,494,704 |

The gap between the initial 8.82 MB result and the earlier 3.79 MB desktop experiment had several causes. The initial optimizer skipped an ICC-profiled cover image, retaining about 1.2 MB of avoidable image data. Cloudflare's browser emitted many bold headings as outline coordinates plus invisible searchable text. Sharing translated outlines removed repeated geometry. Compressed object tables saved approximately another 0.9 MB. These measurements come from separate experiments and are not additive because later passes affect object identities and compression.

A 4.23 MB local experiment also rounded content-stream numbers and used stronger image compression. A 4.07 MB variant compressed transparency masks lossily. Neither is the production profile. The user approved the production profile's 4.42 MB local result before the full Cloudflare run produced 4.49 MB.

All 82 final Pages rendered with Poppler. Extracted text and page dimensions match the earlier full publisher capture. All 81 annotations remain, tagged reading order is present, and the PDF syntax checker reports no warnings. Card pages, headings, maps, and cover artwork were inspected visually. The exact Cloudflare output also passes the strict final-artifact validator.

Square, A4, and tall documents in both Rulebook designs run through the same optimizer in `publisher:capture-contract-regression`. The capture page loads the optimizer through its own bundle. The published HTML's content security policy remains unchanged.
