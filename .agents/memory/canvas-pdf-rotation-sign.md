---
name: Canvas-to-PDF rotation sign
description: Coordinate-system rule for making generated PDF element rotation match the browser canvas.
---

Convert canvas rotation to PDF rotation by negating the normalized angle before calling pdf-lib. Keep center-based placement calculations in the resulting PDF angle.

**Why:** CSS uses a downward-growing screen Y axis, so positive rotation appears clockwise. PDF uses an upward-growing Y axis, so the same positive angle appears counter-clockwise. Passing the stored angle through unchanged rotates asymmetric artwork the opposite way and can move its footprint into neighbouring elements.

**How to apply:** Any PDF path that renders browser-positioned artwork with pdf-lib must convert the angle at the coordinate-system boundary. Direction-specific tests must use asymmetric geometry; bounding-box-only assertions cannot distinguish +90° from -90°.