---
name: Canvas save ordering
description: Why rapid canvas updates must be coalesced and flushed before generating production output.
---

Rapid drag, resize, and rotation updates for one canvas element must be serialized and coalesced so the latest state is always the final database state. Screenshot capture and PDF generation must wait for every element update queue to drain.

**Why:** Sending one independent PATCH per animation frame allows network completion order to differ from gesture order. The preview can show the final layout while an older request finishes last and leaves production generation with stale positions or rotations.

**How to apply:** Any new continuous canvas interaction should use the shared ordered update path rather than firing independent requests. Any export path that reads server state must flush pending canvas updates first.