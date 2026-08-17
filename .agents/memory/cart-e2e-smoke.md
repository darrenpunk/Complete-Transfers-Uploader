---
name: Cart round-trip e2e smoke
description: Durable lessons from building the live add-to-cart → claim-cart → /shop/cart smoke test.
---

**Rule:** the cart e2e smoke must send add-to-cart through the deployed Replit app proxy (not straight to Odoo) or it cannot catch deployed-proxy regressions, and its /shop/cart assertion must (a) fail unconditionally on the empty-cart state and (b) match row-scoped markers only — wrapper classes like `js_cart_lines` render even on an empty cart. Keep the negative control that asserts a fresh session reads as empty, so marker drift fails loudly.

**Why:** the first version passed reviewer reproduction with an empty cart because a wrapper-level marker satisfied the "has line" check; and testing Odoo directly bypassed the app path the real iframe uses.

**How to apply:** Odoo mints a sale-order `access_token` only on the partnerEmail add-to-cart path; the anonymous same-session path returns an empty token and the claim is authorized by session ownership — an empty token is only a failure when a portal login was used. The staging Odoo may lack the artwork module entirely (404 on /artwork/*), so verify routes exist before blaming the test.
