---
name: Odoo cart assets deploy separately
description: Cart claim changes span the Replit app and an Odoo-hosted browser asset bundle.
---

Publishing the Replit app does not update `odoo_artwork_uploader` JavaScript served by the external Odoo website. A cart-claim fix can be present in this workspace and pass a direct endpoint smoke test while customers still receive the previous Odoo iframe handler.

**Why:** The customer-facing handler runs from Odoo's `web.assets_frontend` bundle, not the Replit deployment.

**How to apply:** After changes to Odoo templates, controllers, or frontend assets, deploy/update the Odoo module through its own release path and inspect the live asset bundle for a unique fix marker. Do not treat a Replit publish as proof that this browser-side code is live.