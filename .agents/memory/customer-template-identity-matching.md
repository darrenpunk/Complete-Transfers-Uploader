---
name: Customer-template identity matching
description: How to diagnose assigned templates that are missing for a logged-in Odoo customer.
---

Customer-exclusive template assignments must match the exact customer email reported by the live Odoo session, not merely the email or contact name supplied in a support request.

**Why:** A company user can browse under a shared or different Odoo partner identity. The assignment can look correct in admin but still not apply because the uploader receives another email from Odoo.

**How to apply:** Before changing assignments or template filtering, correlate the affected session with customer-feature/deployment logs, then test the template catalogue using that exact normalized email. Preserve existing assignments unless they are confirmed incorrect.