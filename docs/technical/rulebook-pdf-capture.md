# Full Rulebook PDF capture

Rulebooks use one Chromium capture for up to 100 Pages. Capturing the whole document lets Chromium share fonts and images and keeps its tagged reading order and document links together. The private capture protocol retains its existing batch name for compatibility, but a new job contains exactly one complete document.

The Worker requests a CDP PDF stream and moves at most 512 KiB at a time into the capture browser. The browser owns the raw PDF, bounded at 96 MiB. It shares repeated unmarked vector drawings, resizes eligible RGB images to 150 pixels per printed inch, and chooses the smaller of JPEG quality 0.78 and lossless deflate. Transparency masks stay lossless. Unsupported image encodings stay unchanged. Text, font outlines, and vector coordinates are preserved.

The browser removes unreachable objects and emits a densely numbered classic cross-reference table. This lets the existing strict PDF validator check the result without accepting repaired cross-reference tables. The Worker receives at most 16 MB of compressed output, checks page count and physical size, adds Edition metadata, and validates again before immutable storage. Failure closes the CDP stream and browser context. Capture and compression share a 180-second budget, bounded by the remaining publication work window.

## Evidence from the 82-page Dream Rulebook

On 6 October 2026, Cloudflare Chromium captured and compressed the complete published HTML in approximately 83 seconds. The original capture was 43,157,627 bytes; the conservative optimizer produced 8,778,213 bytes. The strict Worker PDF validator accepted all 82 square Pages. A subsequent local geometry hardening changed the output by 442 bytes.

All 82 optimized Pages rendered successfully with Poppler. Text extraction, page dimensions, and 27 annotations survived the initial comparison. The cover, dense card pages, and map illustrations were inspected visually. Smaller experimental files reached 7.25 MB by rounding vector numbers and using compressed object tables; those changes are excluded from this implementation.

A further Cloudflare run used the complete publisher capture bundle, the frozen 82-page manuscript, sequential image settlement, the CDP transfer function, and Edition finalization. It produced 8,819,157 bytes in 169 seconds, including asset delivery through a local route fixture. No broken images were reported. This exercises the production capture path, but is not evidence of a deployed publication job. The production release still needs its normal CI, deployment, and published-artifact verification.

Square, A4, and tall documents in both Rulebook designs run through the same optimizer in `publisher:capture-contract-regression`. The capture page loads the optimizer through its own bundle. The published HTML's content security policy remains unchanged.
