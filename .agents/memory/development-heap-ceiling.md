---
name: Development heap ceiling
description: Memory constraint for the local PDF/Vite development workflow
---

The development server must have a heap ceiling above 384MB. Vite startup, the PDF pipeline, and normal preview activity can exhaust that limit even when the PDF regression validation is not running.

**Why:** Repeated local preview failures reached the V8 heap limit during ordinary app activity; a fresh process with a 512MB ceiling remained healthy through the same startup and preview checks.

**How to apply:** Keep the development workflow above the 384MB cap, and always restart the process after changing `NODE_OPTIONS` so the new V8 limit is actually active.