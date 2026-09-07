---
name: PDF processing grace
description: Why upload-complete watchdogs need a longer server-processing window for PDFs regardless of byte size.
---

Once browser upload progress reaches 100%, distinguish a stalled network response from legitimate server-side PDF analysis. Give PDF/AI/EPS uploads at least a two-minute post-upload processing window regardless of byte size; raster uploads can retain the shorter WAF-recovery timer.

**Why:** A valid 32.5 MB one-page A3 Corel/Illustrator PDF took about 45.7 seconds in Ghostscript/pdf2svg processing. Separately, a 1.7 MB A3 Illustrator PDF with 5,294 paths took about 69 seconds. A byte-size-only rule misclassified the smaller complex vector file, so the 45-second watchdog aborted successful processing and triggered a duplicate fallback.

**How to apply:** Keep the in-flight transmission stall detector short, but choose the post-upload response grace by file type/processing path rather than size alone, and keep the overall XHR timeout longer than that grace. Re-test with both a large CMYK raster-plus-mask PDF and a small path-heavy Illustrator PDF when changing upload timers.