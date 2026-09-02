---
name: Large-PDF processing grace
description: Why upload-complete watchdogs need a longer server-processing window for large or complex PDFs.
---

Once browser upload progress reaches 100%, distinguish a stalled network response from legitimate server-side PDF analysis. Files over roughly 20 MB need at least a two-minute post-upload processing window, while small uploads can retain the shorter WAF-recovery timer.

**Why:** A valid 32.5 MB one-page A3 Corel/Illustrator PDF took about 45.7 seconds in Ghostscript/pdf2svg processing. A 45-second post-upload watchdog aborted the successful request just before its response and started a duplicate fallback upload.

**How to apply:** Keep the in-flight transmission stall detector short, but scale the post-upload response grace by file size and keep the overall XHR timeout longer than that grace. Re-test with a large CMYK raster-plus-mask PDF when changing upload timers.