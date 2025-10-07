# Odoo.sh Support Request: Ghostscript Package Addition

## Support Ticket Draft

**Subject:** Request for Ghostscript Package in Odoo.sh Base Container Image

**Priority:** High - Production Blocker

---

### Summary
We are migrating a business-critical PDF processing application to Odoo.sh and require Ghostscript to be available in the container environment for precise PDF content bounds extraction. This is essential for accurate artwork positioning in production-ready PDF outputs for our custom apparel business.

### Business Context
- **Application:** Logo upload and design tool for custom apparel transfers
- **Current Scale:** 50-100 concurrent users
- **Migration Goal:** 1000+ concurrent users on Odoo.sh
- **Industry:** Custom apparel manufacturing (print production)

### Technical Requirement

**Package Needed:** `ghostscript` (apt package)

**Specific Use Case:**
We use Ghostscript's bbox device (`gs -sDEVICE=bbox`) to extract tight content bounding boxes from PDF files containing vector artwork. This provides millimeter-accurate dimensions critical for:
- Precise logo positioning on garment templates
- Safety margin validation (print production requirements)
- PDF imposition and final output generation

**Accuracy Requirements:**
- Tolerance: ±1mm for artwork positioning
- Current Ghostscript bbox: ✅ Meets requirements
- Attempted alternatives (PyMuPDF, pdfplumber): ❌ 30-50mm deviations observed

### Why Existing Python Libraries Cannot Replace Ghostscript

We have tested the following pure-Python PDF libraries available on Odoo.sh:

| Library | Method | Result |
|---------|--------|--------|
| **PyMuPDF** | `page.bound()` | Returns full page size, not content bounds |
| **PyMuPDF** | `get_drawings() + get_text()` | 30-50mm deviations from Ghostscript |
| **pdfplumber** | Text-based extraction | Cannot handle vector-only PDFs |
| **pypdf** | Page boxes only | No content-aware bounds |
| **pdfminer.six** | Text extraction focus | Inaccurate for vector graphics |

**Test Results:**
```
File: test-complete-logo.pdf
- Ghostscript bbox:  28.58mm × 10.58mm (actual artwork)
- PyMuPDF attempt:   80.97mm × 19.21mm (full page - 51mm error!)

File: rainbow_dog_test.pdf
- Ghostscript bbox:  278.60mm × 387.00mm
- PyMuPDF attempt:   297.00mm × 428.00mm (18-33mm errors)
```

These deviations are **unacceptable** for print production where precision is critical.

### Proposed Solutions

**Option 1 (Preferred):** Add Ghostscript to Odoo.sh Base Image
- Add `ghostscript` package to container base image
- Allows Python subprocess calls: `subprocess.run(['gs', '-sDEVICE=bbox', ...])`
- Minimal resource footprint (~15MB installed)
- Industry-standard tool for PDF processing

**Option 2 (Alternative):** Custom Container Image Support
- Allow custom Dockerfile for Odoo.sh projects
- We would add Ghostscript via `apt-get install ghostscript`
- Greater flexibility for specialized requirements

### Migration Timeline Impact

**Current Status:**
- ✅ Migration documentation complete
- ✅ Python controller architecture designed
- ✅ React frontend build pipeline documented
- ❌ **BLOCKED:** Cannot replicate Ghostscript bbox accuracy

**If Ghostscript Available:**
- Migration can proceed in 14 days (planned timeline)
- Full feature parity with current application
- Zero technical compromises

**If Ghostscript Unavailable:**
- Must build external microservice workaround
- Additional infrastructure complexity
- Delays migration by 2-3 weeks

### Business Impact

**With Ghostscript on Odoo.sh:**
- ✅ $240-$1,200 annual hosting cost savings (vs current Replit hosting)
- ✅ 1000+ concurrent user capacity
- ✅ Native Odoo e-commerce integration
- ✅ Simplified maintenance (single platform)

**Without Ghostscript:**
- ⚠️ Additional external service costs
- ⚠️ Increased system complexity
- ⚠️ Additional points of failure
- ⚠️ Slower processing (network latency)

### Security Considerations

**Ghostscript Security:**
- We will use latest stable version with security patches
- Sandboxed subprocess execution (Python `subprocess.run`)
- Input validation on all uploaded PDFs
- No user-facing shell access to Ghostscript

**Alternative (External Service):**
- Requires exposing PDF processing to external endpoint
- Additional authentication/authorization layer needed
- Data transfer over network (privacy considerations)

### Similar Use Cases

Ghostscript is widely used in professional PDF workflows:
- Print production systems (prepress, imposition)
- Document management systems (CMYK color preservation)
- Publishing platforms (PDF/A conversion)
- E-commerce (product customization tools)

Other businesses migrating similar applications to Odoo.sh would benefit from Ghostscript availability.

### Request

**Can Odoo.sh add Ghostscript to the base container image, or provide guidance on using custom containers that include Ghostscript?**

We are happy to:
- Provide additional technical details
- Test beta/staging environments
- Share our implementation approach
- Document best practices for other users

### Contact Information

**Project:** ProofDesigner Logo Upload Tool
**Migration Target:** Odoo.sh hosting
**Technical Contact:** [Your dev team contact]
**Timeline:** Migration planned for [your timeline]

---

## Additional Notes for Support Team

If Ghostscript cannot be added globally, we would appreciate guidance on:
1. Custom container image support for specific projects
2. Recommended alternatives we may have missed
3. Workaround approaches used by other customers

Thank you for considering this request. Ghostscript availability would enable us to complete our Odoo.sh migration with full feature parity and production-quality output.
