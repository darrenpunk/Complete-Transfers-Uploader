---
name: Template catalog loading
description: Customer-facing behavior when the product/template catalog cannot be fetched during uploader startup.
---

If the template catalog cannot be loaded, the uploader must show a clear recoverable error with a retry action rather than leaving the user on an indefinite setup spinner.

**Why:** The app shell and API can be healthy while a customer's browser, iframe, cache, or transient network path fails only the catalog request. An endless spinner is indistinguishable from a blank page and gives support no actionable signal.

**How to apply:** Treat empty, non-2xx, and network-failed catalog responses as a visible startup state. Keep the retry scoped to the catalog request and invalidate the corresponding client query before retrying.