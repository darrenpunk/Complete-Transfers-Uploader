---
name: Duplicate cart claim handlers
description: The Odoo iframe parent had competing claim-cart listeners with incompatible request shapes.
---

The cart claim flow must have exactly one active parent message handler. The Odoo page previously combined an inline `claim-cart` listener that POSTed JSON to an `http` route expecting query/form parameters with the global iframe handler that used the valid query-string redirect. The inline listener navigated to `/shop/cart` even when its claim failed, racing the valid handler and making a populated API cart appear empty.

**Why:** A customer’s four additions all succeeded on one draft order, but the final cart view was empty because session claiming—not add-to-cart—was the failing boundary.

**How to apply:** When changing iframe cart navigation, remove or disable the legacy inline handler, keep the server-side redirect claim path, and make any fallback navigation conditional on a successful claim.