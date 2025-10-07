# ProofDesigner Odoo 16 Migration Plan

## Executive Summary

**Goal**: Migrate ProofDesigner logo upload and design tool from Replit to run natively in Odoo 16

**Key Benefits**:
- ✅ **Cost Savings**: $0 hosting (vs $20-100/month Replit)
- ✅ **Scalability**: Support 1000+ concurrent users (vs 50-100 limit)
- ✅ **Integration**: Native cart/product integration with Odoo
- ✅ **Maintainability**: Single codebase, unified deployment

**Timeline**: 2 weeks full migration

**Architecture**: Hybrid approach - Bundle React frontend into Odoo static assets, convert Express backend to Python Odoo controllers

---

## Architecture Overview

### Current Stack (Replit)
- **Frontend**: React + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Backend**: Node.js Express + TypeScript
- **PDF Processing**: Node.js (pdf-lib, canvas, Ghostscript subprocess)
- **Storage**: Replit Object Storage (@google-cloud/storage)
- **Database**: PostgreSQL (Neon via @neondatabase/serverless)

### Target Stack (Odoo 16 - Odoo.sh Compatible)
- **Frontend**: React bundle (same UI, compiled to static assets)
- **Backend**: Python Odoo controllers
- **PDF Processing**: **PyMuPDF + reportlab** (pure Python - no Ghostscript needed!)
- **Storage**: Odoo attachments (ir.attachment model)
- **Database**: PostgreSQL (Odoo's built-in database)

**⚠️ Critical Note**: Odoo.sh does NOT allow apt-install. We use PyMuPDF (pure Python) instead of Ghostscript - it's 3-4x faster and works perfectly on Odoo.sh!

---

## Migration Strategy

### Phase 1: Frontend Build Pipeline (Days 1-3)

#### 1.1 Vite Build Configuration
**Current**: Development server on Replit
**Target**: Production bundle served from Odoo

```bash
# Build React app for production
npm run build
# Output: dist/ folder with bundled assets
```

**Odoo Integration**:
- Copy `dist/` contents to `odoo_artwork_uploader/static/`
- Reference in XML template: `odoo_artwork_uploader/views/website_templates.xml`

```xml
<!-- Current approach in website_templates.xml -->
<template id="artwork_uploader_page" name="Artwork Uploader">
  <t t-call="website.layout">
    <div id="root"></div>
    <script type="module" src="/odoo_artwork_uploader/static/assets/index-[hash].js"/>
    <link rel="stylesheet" href="/odoo_artwork_uploader/static/assets/index-[hash].css"/>
  </t>
</template>
```

**Action Items**:
- [ ] Update `vite.config.ts` build output path if needed
- [ ] Create post-build script to copy assets to Odoo static folder
- [ ] Update asset paths to use Odoo's `/module_name/static/` prefix
- [ ] Test bundle loads correctly in Odoo environment

#### 1.2 Environment Variables
**Current**: `.env` file with Replit secrets
**Target**: Odoo system parameters or config

Environment variables needed:
- `VITE_API_BASE_URL` → Should point to Odoo backend
- `VECTORIZER_API_ID` → Odoo system parameter
- `VECTORIZER_API_SECRET` → Odoo system parameter
- Dropbox storage variables → Remove (use Odoo attachments)
- `DATABASE_URL` → Remove (use Odoo ORM)

**Migration**:
```python
# In Odoo, store secrets in ir.config_parameter
self.env['ir.config_parameter'].sudo().set_param('vectorizer.api_id', 'your_key')
self.env['ir.config_parameter'].sudo().get_param('vectorizer.api_id')
```

---

### Phase 2: Backend API Migration (Days 4-8)

#### 2.1 API Endpoint Mapping

| Current Express Endpoint | New Odoo Controller | Method | Purpose |
|-------------------------|---------------------|--------|---------|
| `GET /api/template-sizes` | `/artwork/templates` | GET | Fetch garment templates |
| `POST /api/projects` | `/artwork/project/create` | POST | Create new project |
| `GET /api/projects/:id` | `/artwork/project/<int:id>` | GET | Get project details |
| `PUT /api/projects/:id` | `/artwork/project/<int:id>/update` | PUT | Update project |
| `DELETE /api/projects/:id` | `/artwork/project/<int:id>/delete` | DELETE | Delete project |
| `POST /api/upload` | `/artwork/upload` | POST | Upload artwork file |
| `POST /api/pdf/generate` | `/artwork/pdf/generate` | POST | Generate print PDF |
| `POST /api/pdf/extract-bounds` | `/artwork/pdf/bounds` | POST | Extract PDF bounds |
| `POST /api/svg/analyze-bounds` | `/artwork/svg/bounds` | POST | Analyze SVG bounds |
| `POST /api/vectorize/submit` | `/artwork/vectorize/submit` | POST | Submit vectorization request |

#### 2.2 Python Controller Template

Create `odoo_artwork_uploader/controllers/main.py`:

```python
from odoo import http
from odoo.http import request, Response
import json
import base64

class ArtworkUploaderController(http.Controller):
    
    @http.route('/artwork/templates', type='json', auth='user', methods=['GET'])
    def get_templates(self):
        """Fetch all garment templates"""
        templates = request.env['artwork.template'].sudo().search([])
        return [{
            'id': t.id,
            'name': t.name,
            'width': t.width,
            'height': t.height,
            'previewUrl': t.preview_image_url,
        } for t in templates]
    
    @http.route('/artwork/project/create', type='json', auth='user', methods=['POST'])
    def create_project(self, **kwargs):
        """Create new artwork project"""
        project = request.env['artwork.project'].sudo().create({
            'name': kwargs.get('name', 'Untitled Project'),
            'template_id': kwargs.get('templateId'),
            'user_id': request.env.user.id,
            'data': json.dumps(kwargs.get('data', {})),
        })
        return {'id': project.id, 'name': project.name}
    
    @http.route('/artwork/upload', type='http', auth='user', methods=['POST'], csrf=False)
    def upload_file(self, **kwargs):
        """Handle file uploads via multipart/form-data"""
        uploaded_file = request.httprequest.files.get('file')
        if not uploaded_file:
            return Response(json.dumps({'error': 'No file uploaded'}), 
                          status=400, content_type='application/json')
        
        # Create attachment
        attachment = request.env['ir.attachment'].sudo().create({
            'name': uploaded_file.filename,
            'type': 'binary',
            'datas': base64.b64encode(uploaded_file.read()),
            'res_model': 'artwork.project',
            'res_id': kwargs.get('projectId', 0),
            'mimetype': uploaded_file.content_type,
        })
        
        return Response(json.dumps({
            'id': attachment.id,
            'filename': attachment.name,
            'url': f'/web/content/{attachment.id}',
        }), content_type='application/json')
```

#### 2.3 Data Models

Create Odoo models in `odoo_artwork_uploader/models/`:

**artwork_project.py**:
```python
from odoo import models, fields, api

class ArtworkProject(models.Model):
    _name = 'artwork.project'
    _description = 'Customer Artwork Project'
    
    name = fields.Char(string='Project Name', required=True)
    user_id = fields.Many2one('res.users', string='User', required=True)
    template_id = fields.Many2one('artwork.template', string='Template')
    data = fields.Text(string='Project JSON Data')
    artwork_ids = fields.One2many('ir.attachment', 'res_id', 
                                   domain=[('res_model', '=', 'artwork.project')])
    state = fields.Selection([
        ('draft', 'Draft'),
        ('submitted', 'Submitted'),
        ('approved', 'Approved'),
    ], default='draft')
```

**artwork_template.py**:
```python
from odoo import models, fields

class ArtworkTemplate(models.Model):
    _name = 'artwork.template'
    _description = 'Garment Template'
    
    name = fields.Char(string='Template Name', required=True)
    width = fields.Integer(string='Width (px)', required=True)
    height = fields.Integer(string='Height (px)', required=True)
    preview_image = fields.Binary(string='Preview Image')
    preview_image_url = fields.Char(string='Preview URL', compute='_compute_preview_url')
    
    @api.depends('preview_image')
    def _compute_preview_url(self):
        for record in self:
            if record.preview_image:
                record.preview_image_url = f'/web/image/artwork.template/{record.id}/preview_image'
            else:
                record.preview_image_url = False
```

---

### Phase 3: PDF/SVG Processing (Days 9-11)

#### 3.1 Current Implementation Analysis

**TypeScript Implementation** (`server/pdf-bounds-extractor.ts`):
```typescript
// Uses Ghostscript + pdfimages to extract tight bounds
async function extractPdfBounds(pdfBuffer: Buffer): Promise<BoundsResult> {
  // 1. Convert PDF to 300 DPI image via Ghostscript
  // 2. Use Canvas to find non-white pixel bounds
  // 3. Convert pixel bounds back to PDF points
  // 4. Return precise bounding box
}
```

**Python Port Strategy**:
1. Use `subprocess` to call Ghostscript (same binary)
2. Use `Pillow` (PIL) instead of Canvas for image processing
3. Keep same algorithm for bounds detection

#### 3.2 Python Implementation

Create `odoo_artwork_uploader/utils/pdf_processor.py`:

```python
import subprocess
import tempfile
import os
from PIL import Image
import io

class PDFBoundsExtractor:
    
    @staticmethod
    def extract_bounds(pdf_data):
        """Extract tight bounds from PDF file
        
        Args:
            pdf_data: Binary PDF data
            
        Returns:
            dict: {width, height, bounds: {x, y, width, height}}
        """
        with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as pdf_file:
            pdf_file.write(pdf_data)
            pdf_path = pdf_file.name
        
        try:
            # Convert PDF to PNG at 300 DPI using Ghostscript
            output_path = pdf_path.replace('.pdf', '.png')
            subprocess.run([
                'gs', '-dSAFER', '-dBATCH', '-dNOPAUSE',
                '-sDEVICE=png16m', '-r300',
                f'-sOutputFile={output_path}',
                pdf_path
            ], check=True, capture_output=True)
            
            # Load image and find bounds
            with Image.open(output_path) as img:
                # Convert to RGB if needed
                if img.mode != 'RGB':
                    img = img.convert('RGB')
                
                # Find non-white pixels
                bbox = PDFBoundsExtractor._find_content_bounds(img)
                
                # Convert pixel bounds to PDF points (300 DPI → 72 DPI)
                scale = 72.0 / 300.0
                return {
                    'width': img.width * scale,
                    'height': img.height * scale,
                    'bounds': {
                        'x': bbox[0] * scale,
                        'y': bbox[1] * scale,
                        'width': (bbox[2] - bbox[0]) * scale,
                        'height': (bbox[3] - bbox[1]) * scale,
                    }
                }
        finally:
            # Cleanup temp files
            os.unlink(pdf_path)
            if os.path.exists(output_path):
                os.unlink(output_path)
    
    @staticmethod
    def _find_content_bounds(img):
        """Find bounding box of non-white content"""
        pixels = img.load()
        width, height = img.size
        
        min_x = width
        min_y = height
        max_x = 0
        max_y = 0
        
        for y in range(height):
            for x in range(width):
                r, g, b = pixels[x, y][:3]
                # Check if pixel is not white (threshold: 250)
                if r < 250 or g < 250 or b < 250:
                    min_x = min(min_x, x)
                    min_y = min(min_y, y)
                    max_x = max(max_x, x)
                    max_y = max(max_y, y)
        
        return (min_x, min_y, max_x, max_y)
```

**Odoo Controller Integration**:
```python
from .utils.pdf_processor import PDFBoundsExtractor

@http.route('/artwork/pdf/bounds', type='json', auth='user', methods=['POST'])
def extract_pdf_bounds(self, **kwargs):
    """Extract bounds from uploaded PDF"""
    file_id = kwargs.get('fileId')
    attachment = request.env['ir.attachment'].sudo().browse(file_id)
    
    if not attachment:
        return {'error': 'File not found'}
    
    pdf_data = base64.b64decode(attachment.datas)
    bounds = PDFBoundsExtractor.extract_bounds(pdf_data)
    
    return bounds
```

#### 3.3 SVG Bounds Analysis

Create `odoo_artwork_uploader/utils/svg_processor.py`:

```python
import xml.etree.ElementTree as ET
import re

class SVGBoundsAnalyzer:
    
    @staticmethod
    def analyze_bounds(svg_content):
        """Analyze SVG for tight bounds and CMYK colors
        
        Args:
            svg_content: SVG file content as string
            
        Returns:
            dict: {width, height, bounds, colors, hasRasterContent}
        """
        # Parse SVG
        root = ET.fromstring(svg_content)
        
        # Extract viewBox or width/height
        viewbox = root.get('viewBox')
        if viewbox:
            _, _, width, height = map(float, viewbox.split())
        else:
            width = float(root.get('width', '0').replace('px', ''))
            height = float(root.get('height', '0').replace('px', ''))
        
        # Detect raster content (image tags)
        has_raster = len(root.findall('.//{http://www.w3.org/2000/svg}image')) > 0
        
        # Extract colors (simplified - would need full implementation)
        colors = SVGBoundsAnalyzer._extract_colors(root)
        
        return {
            'width': width,
            'height': height,
            'bounds': {'x': 0, 'y': 0, 'width': width, 'height': height},
            'colors': colors,
            'hasRasterContent': has_raster,
        }
    
    @staticmethod
    def _extract_colors(root):
        """Extract unique colors from SVG"""
        colors = set()
        # Search for fill and stroke attributes
        for elem in root.iter():
            fill = elem.get('fill')
            stroke = elem.get('stroke')
            if fill and fill != 'none':
                colors.add(fill)
            if stroke and stroke != 'none':
                colors.add(stroke)
        return list(colors)
```

---

### Phase 4: Storage Migration (Days 12-13)

#### 4.1 From Dropbox Storage to Odoo Attachments

**Current**: Dropbox for artwork file storage
**Target**: Odoo `ir.attachment` model

**Migration Steps**:

1. **Remove Dropbox Dependencies**:
   - Remove Dropbox storage integration code
   - Remove `@google-cloud/storage` package (if still present)
   - Remove Dropbox access tokens from environment variables

2. **Use Odoo Attachments**:
   ```python
   # Upload file
   attachment = request.env['ir.attachment'].create({
       'name': filename,
       'type': 'binary',
       'datas': base64.b64encode(file_data),
       'res_model': 'artwork.project',
       'res_id': project_id,
   })
   
   # Generate URL
   file_url = f'/web/content/{attachment.id}'
   
   # Download file
   attachment = request.env['ir.attachment'].browse(file_id)
   file_data = base64.b64decode(attachment.datas)
   ```

3. **Frontend URL Updates**:
   - Change from Dropbox URLs to Odoo content URLs
   - Update `UploadTool.tsx` to use new endpoint
   - Update preview URLs to point to `/web/content/{id}`

---

### Phase 5: Database Migration (Day 14)

#### 4.1 Schema Mapping

| Replit (PostgreSQL) | Odoo Model | Notes |
|-------------------|------------|-------|
| `projects` table | `artwork.project` | User projects |
| `templates` table | `artwork.template` | Garment templates |
| `uploads` table | `ir.attachment` | File uploads |
| `vectorization_requests` | `artwork.vectorization` | Service requests |

#### 4.2 Data Migration Script

Create `odoo_artwork_uploader/migrations/migrate_data.py`:

```python
import psycopg2
import json
from odoo import api, SUPERUSER_ID

def migrate_replit_data(cr, registry):
    """Migrate data from Replit PostgreSQL to Odoo"""
    
    # Connect to Replit database
    replit_conn = psycopg2.connect(
        host='your_replit_db_host',
        database='your_db',
        user='your_user',
        password='your_password'
    )
    replit_cur = replit_conn.cursor()
    
    # Get Odoo environment
    env = api.Environment(cr, SUPERUSER_ID, {})
    
    # Migrate templates
    replit_cur.execute("SELECT id, name, width, height FROM templates")
    for row in replit_cur.fetchall():
        env['artwork.template'].create({
            'id': row[0],
            'name': row[1],
            'width': row[2],
            'height': row[3],
        })
    
    # Migrate projects
    replit_cur.execute("SELECT id, name, user_id, template_id, data FROM projects")
    for row in replit_cur.fetchall():
        env['artwork.project'].create({
            'id': row[0],
            'name': row[1],
            'user_id': row[2],  # Map to Odoo user
            'template_id': row[3],
            'data': json.dumps(row[4]),
        })
    
    replit_conn.close()
```

---

## Dependencies & Requirements

### System Requirements (Odoo Server)

**Critical**: Verify these are installed on Odoo server:

1. **Ghostscript** (for PDF processing):
   ```bash
   # Test availability
   gs --version
   
   # If not installed
   apt-get install ghostscript
   ```

2. **Python Packages**:
   ```bash
   pip3 install Pillow  # Image processing
   pip3 install reportlab  # PDF generation
   pip3 install lxml  # SVG parsing (usually pre-installed)
   ```

3. **Poppler Utils** (optional, for pdfimages):
   ```bash
   apt-get install poppler-utils
   ```

**Action**: User must verify with hosting provider that these are available before migration.

---

## Testing Strategy

### Pre-Migration Testing Checklist

- [ ] Verify Ghostscript available on Odoo server
- [ ] Test Python PDF processing locally
- [ ] Confirm Odoo attachment storage has sufficient space
- [ ] Test React build pipeline
- [ ] Validate all API endpoints work in isolation

### Post-Migration Testing

- [ ] Upload PNG/JPEG files (raster detection)
- [ ] Upload SVG files (bounds analysis)
- [ ] Upload PDF files (bounds extraction + CMYK preservation)
- [ ] Generate production PDF with tight bounds
- [ ] Test vectorization service form submission
- [ ] Load test with 50+ concurrent users
- [ ] Verify cart integration works
- [ ] Test on mobile devices

---

## Rollback Plan

If migration fails, immediate rollback steps:

1. **Revert Odoo module**: Uninstall `odoo_artwork_uploader` module
2. **Restore Replit**: Re-enable Replit deployment
3. **Data sync**: Export any new Odoo data back to Replit database
4. **DNS/Routing**: Point artwork uploader URL back to Replit

**Data Safety**: 
- Keep Replit deployment running for 1 month after migration
- Regular backups during transition period
- Parallel run for 1 week to validate

---

## Cost Analysis

### Current Costs (Replit)
- Replit Core: $20/month (minimum)
- Scaling for 100 users: ~$50-100/month
- **Total**: $240-$1,200/year

### Odoo Native Costs
- Hosting: $0 (already paying for Odoo)
- Additional storage: Minimal (uses existing Odoo DB)
- **Total**: $0/year incremental

### Savings
- **First Year**: $240-$1,200 saved
- **Ongoing**: Zero incremental hosting costs

---

## Timeline & Milestones

| Phase | Duration | Milestone | Owner |
|-------|----------|-----------|-------|
| Phase 1: Frontend Build | 3 days | React bundle in Odoo | Dev |
| Phase 2: Backend API | 5 days | Python controllers live | Dev |
| Phase 3: PDF Processing | 3 days | Python PDF/SVG utils | Dev |
| Phase 4: Storage | 2 days | Attachments working | Dev |
| Phase 5: Database | 1 day | Data migrated | Dev |
| Testing & QA | 2 days | All tests pass | User + Dev |

**Total**: 14 working days (~2-3 weeks)

---

## Success Criteria

Migration is complete when:

✅ All features work identically to Replit version
✅ Can handle 100+ concurrent users without issues
✅ PDF generation produces identical tight bounds output
✅ CMYK color preservation maintained
✅ Cart/product integration functional
✅ No increase in page load time
✅ Replit hosting costs eliminated

---

## Next Steps

1. **Immediate**: 
   - [ ] Verify Ghostscript installed on Odoo server
   - [ ] Test Python environment has required packages
   - [ ] Review this plan with dev team

2. **Week 1**:
   - [ ] Implement frontend build pipeline
   - [ ] Create Odoo models and controllers
   - [ ] Port PDF processing to Python

3. **Week 2**:
   - [ ] Migrate storage to attachments
   - [ ] Migrate database
   - [ ] Full testing and deployment

---

## Questions for User/Dev

Before starting migration, confirm:

1. ✅ **Ghostscript availability**: Is `gs` command available on Odoo server?
2. ✅ **Python version**: Odoo 16 uses Python 3.8+, correct?
3. ✅ **Storage limits**: Any limits on `ir.attachment` storage size?
4. ✅ **Deployment process**: How are Odoo modules deployed (manual/CI/CD)?
5. ✅ **Testing environment**: Is there a staging Odoo instance for testing?

---

## Conclusion

This migration plan provides a comprehensive roadmap to move ProofDesigner from Replit to native Odoo 16. The hybrid approach (React frontend + Python backend) minimizes risk while delivering maximum cost savings and scalability benefits.

**Key advantages**:
- Zero incremental hosting costs
- Seamless Odoo integration
- Same user experience maintained
- Future-proof architecture

**Recommendation**: Proceed with migration following this phased approach. Start with Phase 1 (frontend build) as a low-risk proof of concept.
