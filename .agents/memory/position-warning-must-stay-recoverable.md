---
name: Position (clipping) warning must stay recoverable before checkout
description: Why the "artwork will be clipped" warning is a re-poppable modal + persistent pill, not a one-time dismiss.
---

# Clipping "Position Warning" UX safety rule

The canvas "Position Warning" (shown when a logo extends beyond the template
bounds and will be clipped in the final print) lives in
`client/src/components/canvas-workspace.tsx`. It used to be a banner pinned to the
BOTTOM of the workspace, which customers could not see on large DTF templates, so
it was changed to a centered floating modal.

**Rule — a clipping warning must NEVER be silently hidden before checkout.**
The modal is dismissible, but dismissal must not make the danger disappear:
- While artwork is still clipping after dismissal, a compact persistent red pill
  stays visible (top-center) and re-opens the full modal on tap.
- An effect clears the dismissal once `hasElementsOutsideCanvas` becomes false, so
  a NEW clipping episode re-pops the full centered modal.

**Why:** a plain one-time dismiss is *worse* than the old always-visible banner —
the customer could dismiss it once and then submit clipped artwork with no warning.
This app has a large, deliberate "clipping safety net" investment (see the other
clip/bounds memories); do not regress it by simplifying the warning to a single
dismissible toast/modal with no persistent fallback.

**How to apply:** if you touch this warning, keep three behaviours intact:
(1) prominent first surfacing, (2) a persistent indicator while still clipping,
(3) auto-reset so a fresh clip re-alerts. Also: the clip computation and its reset
`useEffect` must stay ABOVE the `if (!template) return` early return so the hook
order is unconditional (rules-of-hooks). Both modal and pill are suppressed during
active drag/resize to avoid flicker — do not re-add dismissal resets on
drag/resize-start (they caused annoying re-pops mid-reposition).
