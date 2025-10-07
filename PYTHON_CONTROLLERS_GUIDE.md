# Python Controllers Guide: Express to Odoo

## Overview

This guide provides Python Odoo controller templates to replace the current Express.js backend.

---

## Current Express Routes Analysis

### Route Inventory (`server/routes.ts`)

| Endpoint | Method | Purpose | Request | Response |
|----------|--------|---------|---------|----------|
| `/api/template-sizes` | GET | Get garment templates | - | Template[] |
| `/api/projects` | POST | Create project | {name, templateId, data} | Project |
| `/api/projects` | GET | List user projects | - | Project[] |
| `/api/projects/:id` | GET | Get project | - | Project |
| `/api/projects/:id` | PUT | Update project | {name, data} | Project |
| `/api/projects/:id` | DELETE | Delete project | - | {success} |
| `/api/upload` | POST | Upload file | multipart/form-data | {id, filename, url} |
| `/api/pdf/generate` | POST | Generate print PDF | {projectData, artworks} | {pdfUrl} |
| `/api/pdf/extract-bounds` | POST | Extract PDF bounds | {pdfBuffer} | BoundsResult |
| `/api/svg/analyze-bounds` | POST | Analyze SVG | {svgContent} | BoundsResult |
| `/api/vectorize/submit` | POST | Submit vectorization | {formData} | {id, status} |

---

## Odoo Controller Structure

### File: `odoo_artwork_uploader/controllers/main.py`

```python
from odoo import http
from odoo.http import request, Response
import json
import base64
import logging

_logger = logging.getLogger(__name__)


class ArtworkUploaderController(http.Controller):
    """Main controller for artwork uploader functionality"""
    
    # ============================================================================
    # TEMPLATE ENDPOINTS
    # ============================================================================
    
    @http.route('/artwork/templates', type='json', auth='user', methods=['GET'])
    def get_templates(self):
        """Get all available garment templates
        
        Returns:
            list: Array of template objects with id, name, size, preview
        """
        try:
            templates = request.env['artwork.template'].sudo().search([])
            return [{
                'id': template.id,
                'name': template.name,
                'label': template.label,
                'width': template.width,
                'height': template.height,
                'previewUrl': f'/web/image/artwork.template/{template.id}/preview_image' if template.preview_image else None,
                'unit': template.unit or 'px',
            } for template in templates]
        except Exception as e:
            _logger.error(f"Error fetching templates: {str(e)}")
            return {'error': str(e)}
    
    # ============================================================================
    # PROJECT ENDPOINTS
    # ============================================================================
    
    @http.route('/artwork/project/create', type='json', auth='user', methods=['POST'])
    def create_project(self, **kwargs):
        """Create new artwork project
        
        Args:
            name (str): Project name
            templateId (int): Template ID
            data (dict): Project data (canvas state)
            
        Returns:
            dict: Created project with id, name, etc.
        """
        try:
            project = request.env['artwork.project'].sudo().create({
                'name': kwargs.get('name', 'Untitled Project'),
                'template_id': kwargs.get('templateId'),
                'user_id': request.env.user.id,
                'data': json.dumps(kwargs.get('data', {})),
                'state': 'draft',
            })
            
            return {
                'id': project.id,
                'name': project.name,
                'templateId': project.template_id.id if project.template_id else None,
                'data': json.loads(project.data) if project.data else {},
                'state': project.state,
            }
        except Exception as e:
            _logger.error(f"Error creating project: {str(e)}")
            return {'error': str(e)}
    
    @http.route('/artwork/projects', type='json', auth='user', methods=['GET'])
    def get_user_projects(self):
        """Get all projects for current user
        
        Returns:
            list: Array of user's projects
        """
        try:
            projects = request.env['artwork.project'].sudo().search([
                ('user_id', '=', request.env.user.id)
            ], order='write_date desc')
            
            return [{
                'id': p.id,
                'name': p.name,
                'templateId': p.template_id.id if p.template_id else None,
                'data': json.loads(p.data) if p.data else {},
                'state': p.state,
                'createdAt': p.create_date.isoformat() if p.create_date else None,
                'updatedAt': p.write_date.isoformat() if p.write_date else None,
            } for p in projects]
        except Exception as e:
            _logger.error(f"Error fetching projects: {str(e)}")
            return {'error': str(e)}
    
    @http.route('/artwork/project/<int:project_id>', type='json', auth='user', methods=['GET'])
    def get_project(self, project_id):
        """Get specific project by ID
        
        Args:
            project_id (int): Project ID
            
        Returns:
            dict: Project data
        """
        try:
            project = request.env['artwork.project'].sudo().browse(project_id)
            
            if not project.exists():
                return {'error': 'Project not found'}
            
            # Verify ownership
            if project.user_id.id != request.env.user.id:
                return {'error': 'Access denied'}
            
            return {
                'id': project.id,
                'name': project.name,
                'templateId': project.template_id.id if project.template_id else None,
                'data': json.loads(project.data) if project.data else {},
                'state': project.state,
                'artworks': [{
                    'id': a.id,
                    'name': a.name,
                    'url': f'/web/content/{a.id}',
                    'mimetype': a.mimetype,
                } for a in project.artwork_ids],
            }
        except Exception as e:
            _logger.error(f"Error fetching project {project_id}: {str(e)}")
            return {'error': str(e)}
    
    @http.route('/artwork/project/<int:project_id>/update', type='json', auth='user', methods=['PUT', 'POST'])
    def update_project(self, project_id, **kwargs):
        """Update project
        
        Args:
            project_id (int): Project ID
            name (str): New project name (optional)
            data (dict): New project data (optional)
            
        Returns:
            dict: Updated project
        """
        try:
            project = request.env['artwork.project'].sudo().browse(project_id)
            
            if not project.exists():
                return {'error': 'Project not found'}
            
            if project.user_id.id != request.env.user.id:
                return {'error': 'Access denied'}
            
            update_vals = {}
            if 'name' in kwargs:
                update_vals['name'] = kwargs['name']
            if 'data' in kwargs:
                update_vals['data'] = json.dumps(kwargs['data'])
            
            if update_vals:
                project.write(update_vals)
            
            return {
                'id': project.id,
                'name': project.name,
                'data': json.loads(project.data) if project.data else {},
            }
        except Exception as e:
            _logger.error(f"Error updating project {project_id}: {str(e)}")
            return {'error': str(e)}
    
    @http.route('/artwork/project/<int:project_id>/delete', type='json', auth='user', methods=['DELETE', 'POST'])
    def delete_project(self, project_id):
        """Delete project
        
        Args:
            project_id (int): Project ID
            
        Returns:
            dict: Success message
        """
        try:
            project = request.env['artwork.project'].sudo().browse(project_id)
            
            if not project.exists():
                return {'error': 'Project not found'}
            
            if project.user_id.id != request.env.user.id:
                return {'error': 'Access denied'}
            
            project.unlink()
            
            return {'success': True, 'message': 'Project deleted'}
        except Exception as e:
            _logger.error(f"Error deleting project {project_id}: {str(e)}")
            return {'error': str(e)}
    
    # ============================================================================
    # FILE UPLOAD ENDPOINT
    # ============================================================================
    
    @http.route('/artwork/upload', type='http', auth='user', methods=['POST'], csrf=False)
    def upload_file(self, **kwargs):
        """Handle file uploads
        
        Expects multipart/form-data with 'file' field
        
        Returns:
            JSON response with file details
        """
        try:
            uploaded_file = request.httprequest.files.get('file')
            if not uploaded_file:
                return Response(
                    json.dumps({'error': 'No file uploaded'}),
                    status=400,
                    content_type='application/json'
                )
            
            # Get optional project ID
            project_id = kwargs.get('projectId', 0)
            if project_id:
                project_id = int(project_id)
            
            # Create attachment
            attachment = request.env['ir.attachment'].sudo().create({
                'name': uploaded_file.filename,
                'type': 'binary',
                'datas': base64.b64encode(uploaded_file.read()),
                'res_model': 'artwork.project',
                'res_id': project_id,
                'mimetype': uploaded_file.content_type,
                'public': False,  # Private to user
            })
            
            return Response(
                json.dumps({
                    'id': attachment.id,
                    'filename': attachment.name,
                    'url': f'/web/content/{attachment.id}',
                    'mimetype': attachment.mimetype,
                }),
                content_type='application/json'
            )
        except Exception as e:
            _logger.error(f"Error uploading file: {str(e)}")
            return Response(
                json.dumps({'error': str(e)}),
                status=500,
                content_type='application/json'
            )
    
    # ============================================================================
    # PDF/SVG PROCESSING ENDPOINTS
    # ============================================================================
    
    @http.route('/artwork/pdf/generate', type='json', auth='user', methods=['POST'])
    def generate_pdf(self, **kwargs):
        """Generate production-ready PDF
        
        Args:
            projectData (dict): Project canvas data
            artworks (list): List of artwork objects
            
        Returns:
            dict: {pdfUrl, bounds}
        """
        try:
            from ..utils.pdf_generator import PDFGenerator
            
            project_data = kwargs.get('projectData', {})
            artworks = kwargs.get('artworks', [])
            
            # Generate PDF
            pdf_bytes = PDFGenerator.generate(project_data, artworks)
            
            # Save as attachment
            attachment = request.env['ir.attachment'].sudo().create({
                'name': f"print_{project_data.get('name', 'artwork')}.pdf",
                'type': 'binary',
                'datas': base64.b64encode(pdf_bytes),
                'mimetype': 'application/pdf',
                'public': False,
            })
            
            return {
                'pdfUrl': f'/web/content/{attachment.id}',
                'pdfId': attachment.id,
            }
        except Exception as e:
            _logger.error(f"Error generating PDF: {str(e)}")
            return {'error': str(e)}
    
    @http.route('/artwork/pdf/bounds', type='json', auth='user', methods=['POST'])
    def extract_pdf_bounds(self, **kwargs):
        """Extract tight bounds from PDF
        
        Args:
            fileId (int): Attachment ID of PDF file
            
        Returns:
            dict: {width, height, bounds: {x, y, width, height}}
        """
        try:
            from ..utils.pdf_processor import PDFBoundsExtractor
            
            file_id = kwargs.get('fileId')
            if not file_id:
                return {'error': 'fileId is required'}
            
            attachment = request.env['ir.attachment'].sudo().browse(int(file_id))
            if not attachment.exists():
                return {'error': 'File not found'}
            
            # Decode PDF data
            pdf_data = base64.b64decode(attachment.datas)
            
            # Extract bounds
            bounds_result = PDFBoundsExtractor.extract_bounds(pdf_data)
            
            return bounds_result
        except Exception as e:
            _logger.error(f"Error extracting PDF bounds: {str(e)}")
            return {'error': str(e)}
    
    @http.route('/artwork/svg/bounds', type='json', auth='user', methods=['POST'])
    def analyze_svg_bounds(self, **kwargs):
        """Analyze SVG for bounds and colors
        
        Args:
            svgContent (str): SVG file content
            
        Returns:
            dict: {width, height, bounds, colors, hasRasterContent}
        """
        try:
            from ..utils.svg_processor import SVGBoundsAnalyzer
            
            svg_content = kwargs.get('svgContent')
            if not svg_content:
                return {'error': 'svgContent is required'}
            
            bounds_result = SVGBoundsAnalyzer.analyze_bounds(svg_content)
            
            return bounds_result
        except Exception as e:
            _logger.error(f"Error analyzing SVG: {str(e)}")
            return {'error': str(e)}
    
    # ============================================================================
    # VECTORIZATION SERVICE ENDPOINT
    # ============================================================================
    
    @http.route('/artwork/vectorize/submit', type='json', auth='user', methods=['POST'])
    def submit_vectorization(self, **kwargs):
        """Submit vectorization service request
        
        Args:
            fileId (int): Attachment ID of raster file
            projectId (int): Project ID
            customerName (str): Customer name
            email (str): Customer email
            notes (str): Additional notes
            
        Returns:
            dict: {id, status, estimatedCompletion}
        """
        try:
            vectorization = request.env['artwork.vectorization'].sudo().create({
                'project_id': kwargs.get('projectId'),
                'file_id': kwargs.get('fileId'),
                'customer_name': kwargs.get('customerName'),
                'email': kwargs.get('email'),
                'notes': kwargs.get('notes', ''),
                'user_id': request.env.user.id,
                'state': 'pending',
            })
            
            # Send notification to design team (optional)
            # self._notify_design_team(vectorization)
            
            return {
                'id': vectorization.id,
                'status': vectorization.state,
                'estimatedCompletion': '2-3 business days',
            }
        except Exception as e:
            _logger.error(f"Error submitting vectorization: {str(e)}")
            return {'error': str(e)}
```

---

## Odoo Models

### File: `odoo_artwork_uploader/models/artwork_project.py`

```python
from odoo import models, fields, api
import json


class ArtworkProject(models.Model):
    _name = 'artwork.project'
    _description = 'Customer Artwork Project'
    _order = 'write_date desc'
    
    name = fields.Char(string='Project Name', required=True, default='Untitled Project')
    user_id = fields.Many2one('res.users', string='User', required=True, ondelete='cascade')
    template_id = fields.Many2one('artwork.template', string='Template', ondelete='set null')
    data = fields.Text(string='Project JSON Data', help='Canvas state stored as JSON')
    artwork_ids = fields.One2many(
        'ir.attachment', 'res_id',
        domain=[('res_model', '=', 'artwork.project')],
        string='Uploaded Artworks'
    )
    state = fields.Selection([
        ('draft', 'Draft'),
        ('submitted', 'Submitted'),
        ('approved', 'Approved'),
        ('production', 'In Production'),
    ], default='draft', string='Status')
    
    # Timestamps
    create_date = fields.Datetime(string='Created', readonly=True)
    write_date = fields.Datetime(string='Last Updated', readonly=True)
    
    @api.model
    def create(self, vals):
        """Override to ensure user_id is set"""
        if 'user_id' not in vals:
            vals['user_id'] = self.env.user.id
        return super().create(vals)
```

### File: `odoo_artwork_uploader/models/artwork_template.py`

```python
from odoo import models, fields, api


class ArtworkTemplate(models.Model):
    _name = 'artwork.template'
    _description = 'Garment Template for Artwork Design'
    _order = 'sequence, name'
    
    name = fields.Char(string='Template Name', required=True)
    label = fields.Char(string='Display Label', required=True)
    width = fields.Integer(string='Width (px)', required=True)
    height = fields.Integer(string='Height (px)', required=True)
    unit = fields.Char(string='Unit', default='px')
    preview_image = fields.Binary(string='Preview Image')
    preview_image_url = fields.Char(string='Preview URL', compute='_compute_preview_url')
    sequence = fields.Integer(string='Display Order', default=10)
    active = fields.Boolean(string='Active', default=True)
    
    @api.depends('preview_image')
    def _compute_preview_url(self):
        for record in self:
            if record.preview_image:
                record.preview_image_url = f'/web/image/artwork.template/{record.id}/preview_image'
            else:
                record.preview_image_url = False
```

### File: `odoo_artwork_uploader/models/artwork_vectorization.py`

```python
from odoo import models, fields, api


class ArtworkVectorization(models.Model):
    _name = 'artwork.vectorization'
    _description = 'Vectorization Service Request'
    _order = 'create_date desc'
    
    project_id = fields.Many2one('artwork.project', string='Project', ondelete='cascade')
    file_id = fields.Many2one('ir.attachment', string='Original File', ondelete='set null')
    vectorized_file_id = fields.Many2one('ir.attachment', string='Vectorized File', ondelete='set null')
    
    customer_name = fields.Char(string='Customer Name', required=True)
    email = fields.Char(string='Email', required=True)
    notes = fields.Text(string='Notes')
    
    user_id = fields.Many2one('res.users', string='Requested By', ondelete='cascade')
    assigned_to = fields.Many2one('res.users', string='Assigned To')
    
    state = fields.Selection([
        ('pending', 'Pending'),
        ('in_progress', 'In Progress'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
    ], default='pending', string='Status')
    
    create_date = fields.Datetime(string='Requested Date', readonly=True)
    completed_date = fields.Datetime(string='Completed Date')
```

---

## Module Manifest

### File: `odoo_artwork_uploader/__manifest__.py`

```python
{
    'name': 'Artwork Uploader',
    'version': '1.0.0',
    'category': 'Website',
    'summary': 'Customer artwork upload and design tool',
    'description': """
        ProofDesigner - Logo upload and garment design tool
        
        Features:
        - Upload logos (PNG, JPEG, SVG, PDF)
        - Design layouts on garment templates
        - Generate production-ready PDFs with tight bounds
        - Vectorization service requests
        - CMYK color preservation
    """,
    'author': 'Your Company',
    'website': 'https://www.yourcompany.com',
    'depends': ['base', 'website', 'portal'],
    'data': [
        'security/ir.model.access.csv',
        'views/website_templates.xml',
        'views/artwork_project_views.xml',
        'views/artwork_template_views.xml',
        'views/artwork_vectorization_views.xml',
        'data/artwork_template_data.xml',
    ],
    'assets': {
        'web.assets_frontend': [
            'odoo_artwork_uploader/static/assets/index.js',
            'odoo_artwork_uploader/static/assets/index.css',
        ],
    },
    'installable': True,
    'application': True,
    'license': 'LGPL-3',
}
```

---

## Security Rules

### File: `odoo_artwork_uploader/security/ir.model.access.csv`

```csv
id,name,model_id:id,group_id:id,perm_read,perm_write,perm_create,perm_unlink
access_artwork_project_user,artwork.project user,model_artwork_project,base.group_user,1,1,1,1
access_artwork_template_user,artwork.template user,model_artwork_template,base.group_user,1,0,0,0
access_artwork_template_admin,artwork.template admin,model_artwork_template,base.group_system,1,1,1,1
access_artwork_vectorization_user,artwork.vectorization user,model_artwork_vectorization,base.group_user,1,1,1,1
```

---

## Frontend API Client Updates

### Update: `client/src/lib/queryClient.ts`

```typescript
import { QueryClient } from '@tanstack/react-query';

// Use Odoo config injected in template, fallback to env var
const API_BASE_URL = (window as any).ODOO_CONFIG?.apiBaseUrl || '/artwork';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: async ({ queryKey }) => {
        const url = `${API_BASE_URL}${queryKey[0]}`;
        const res = await fetch(url, {
          method: 'POST',  // Odoo JSON routes use POST
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',  // Send session cookies
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'call',
            params: {},
          }),
        });
        
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return data.result;  // Odoo wraps response in 'result'
      },
    },
  },
});

export async function apiRequest(url: string, options: RequestInit = {}) {
  const res = await fetch(`${API_BASE_URL}${url}`, {
    method: 'POST',  // Odoo JSON routes
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    credentials: 'include',
  });
  
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.result;
}
```

### Update Frontend Route Calls

**Before (Express)**:
```typescript
// Get templates
const { data } = useQuery({
  queryKey: ['/api/template-sizes'],
});

// Create project
const mutation = useMutation({
  mutationFn: async (data) => apiRequest('/api/projects', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
});
```

**After (Odoo)**:
```typescript
// Get templates
const { data } = useQuery({
  queryKey: ['/templates'],  // /artwork/templates
});

// Create project
const mutation = useMutation({
  mutationFn: async (data) => apiRequest('/project/create', {
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'call',
      params: data,
    }),
  }),
});
```

---

## Testing Controllers

### Test GET Endpoint
```bash
curl -X POST http://localhost:8069/artwork/templates \
  -H "Content-Type: application/json" \
  -H "Cookie: session_id=YOUR_SESSION_ID" \
  -d '{"jsonrpc":"2.0","method":"call","params":{}}'
```

### Test File Upload
```bash
curl -X POST http://localhost:8069/artwork/upload \
  -H "Cookie: session_id=YOUR_SESSION_ID" \
  -F "file=@/path/to/logo.png" \
  -F "projectId=1"
```

---

## Summary

**Key Conversions**:

1. ✅ **Express routes** → **Odoo @http.route controllers**
2. ✅ **PostgreSQL queries** → **Odoo ORM (browse, search, create)**
3. ✅ **JSON responses** → **Odoo JSON-RPC format**
4. ✅ **Express session** → **Odoo session (request.env.user)**
5. ✅ **File uploads** → **ir.attachment model**
6. ✅ **Database models** → **Odoo models (models.Model)**

**Result**: Complete backend API migration from Node.js Express to Python Odoo controllers with identical functionality.
