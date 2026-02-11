from odoo import http
from odoo.http import request
import json
import base64
import logging
import uuid

_logger = logging.getLogger(__name__)

class ArtworkUploaderController(http.Controller):
    
    @http.route('/artwork/upload', type='http', auth='public', website=True, csrf=False)
    def artwork_upload_page(self, **kwargs):
        """Main artwork uploader page"""
        # Get templates from API endpoint method to stay consistent
        templates = self.get_templates()
        
        values = {
            'templates': templates,
            'garment_colors': self._get_garment_colors(),
            'ink_colors': self._get_ink_colors(),
        }
        
        return request.render('artwork_uploader.upload_page', values)
    
    @http.route('/artwork/api/templates', type='json', auth='public', methods=['GET', 'OPTIONS'], cors='*', csrf=False)
    def get_templates(self, **kwargs):
        """Get all individual template sizes - exact match with standalone app"""
        # Return all 65 individual templates from standalone app with exact structure
        return [
            # Screen Printed Transfers - Full Colour (8 templates)
            {"id": "template-A3", "name": "A3", "label": "A3", "width": 297, "height": 420, "pixelWidth": 842, "pixelHeight": 1191, "group": "Screen Printed Transfers", "description": "Full-Colour screen printed heat applied transfers"},
            {"id": "template-A4", "name": "A4", "label": "A4", "width": 210, "height": 297, "pixelWidth": 595, "pixelHeight": 842, "group": "Screen Printed Transfers", "description": "Full-Colour screen printed heat applied transfers"},
            {"id": "template-A5", "name": "A5", "label": "A5", "width": 148, "height": 210, "pixelWidth": 420, "pixelHeight": 595, "group": "Screen Printed Transfers", "description": "Full-Colour screen printed heat applied transfers"},
            {"id": "template-A6", "name": "A6", "label": "A6", "width": 105, "height": 148, "pixelWidth": 298, "pixelHeight": 420, "group": "Screen Printed Transfers", "description": "Full-Colour screen printed heat applied transfers"},
            {"id": "template-transfer-size", "name": "transfer_size", "label": "295×100mm", "width": 295, "height": 100, "pixelWidth": 836, "pixelHeight": 283, "group": "Screen Printed Transfers", "description": "Full-Colour screen printed heat applied transfers"},
            {"id": "template-square", "name": "square", "label": "95×95mm", "width": 95, "height": 95, "pixelWidth": 269, "pixelHeight": 269, "group": "Screen Printed Transfers", "description": "Full-Colour screen printed heat applied transfers"},
            {"id": "template-badge", "name": "badge", "label": "100×70mm", "width": 100, "height": 70, "pixelWidth": 283, "pixelHeight": 198, "group": "Screen Printed Transfers", "description": "Full-Colour screen printed heat applied transfers"},
            {"id": "template-small", "name": "small", "label": "60×60mm", "width": 60, "height": 60, "pixelWidth": 170, "pixelHeight": 170, "group": "Screen Printed Transfers", "description": "Full-Colour screen printed heat applied transfers"},
            
            # Screen Printed Transfers - Full Colour Metallic (8 templates)
            {"id": "metallic-A3", "name": "metallic_A3", "label": "A3 Metallic", "width": 297, "height": 420, "pixelWidth": 842, "pixelHeight": 1191, "group": "Screen Printed Transfers", "description": "Full-Colour screen printed with metallic finish"},
            {"id": "metallic-A4", "name": "metallic_A4", "label": "A4 Metallic", "width": 210, "height": 297, "pixelWidth": 595, "pixelHeight": 842, "group": "Screen Printed Transfers", "description": "Full-Colour screen printed with metallic finish"},
            {"id": "metallic-A5", "name": "metallic_A5", "label": "A5 Metallic", "width": 148, "height": 210, "pixelWidth": 420, "pixelHeight": 595, "group": "Screen Printed Transfers", "description": "Full-Colour screen printed with metallic finish"},
            {"id": "metallic-A6", "name": "metallic_A6", "label": "A6 Metallic", "width": 105, "height": 148, "pixelWidth": 298, "pixelHeight": 420, "group": "Screen Printed Transfers", "description": "Full-Colour screen printed with metallic finish"},
            {"id": "metallic-transfer-size", "name": "metallic_transfer_size", "label": "295×100mm Metallic", "width": 295, "height": 100, "pixelWidth": 836, "pixelHeight": 283, "group": "Screen Printed Transfers", "description": "Full-Colour screen printed with metallic finish"},
            {"id": "metallic-square", "name": "metallic_square", "label": "95×95mm Metallic", "width": 95, "height": 95, "pixelWidth": 269, "pixelHeight": 269, "group": "Screen Printed Transfers", "description": "Full-Colour screen printed with metallic finish"},
            {"id": "metallic-badge", "name": "metallic_badge", "label": "100×70mm Metallic", "width": 100, "height": 70, "pixelWidth": 283, "pixelHeight": 198, "group": "Screen Printed Transfers", "description": "Full-Colour screen printed with metallic finish"},
            {"id": "metallic-small", "name": "metallic_small", "label": "60×60mm Metallic", "width": 60, "height": 60, "pixelWidth": 170, "pixelHeight": 170, "group": "Screen Printed Transfers", "description": "Full-Colour screen printed with metallic finish"},
            
            # Screen Printed Transfers - Full Colour HD (2 templates)
            {"id": "hd-A3", "name": "hd_A3", "label": "A3 HD", "width": 297, "height": 420, "pixelWidth": 842, "pixelHeight": 1191, "group": "Screen Printed Transfers", "description": "High-definition full-colour screen printed transfers"},
            {"id": "hd-A4", "name": "hd_A4", "label": "A4 HD", "width": 210, "height": 297, "pixelWidth": 595, "pixelHeight": 842, "group": "Screen Printed Transfers", "description": "High-definition full-colour screen printed transfers"},
            
            # Screen Printed Transfers - Single Colour (8 templates)
            {"id": "single-A3", "name": "single_A3", "label": "A3 Single Colour", "width": 297, "height": 420, "pixelWidth": 842, "pixelHeight": 1191, "group": "Screen Printed Transfers", "description": "Screen printed using our off-the-shelf colour range"},
            {"id": "single-A4", "name": "single_A4", "label": "A4 Single Colour", "width": 210, "height": 297, "pixelWidth": 595, "pixelHeight": 842, "group": "Screen Printed Transfers", "description": "Screen printed using our off-the-shelf colour range"},
            {"id": "single-A5", "name": "single_A5", "label": "A5 Single Colour", "width": 148, "height": 210, "pixelWidth": 420, "pixelHeight": 595, "group": "Screen Printed Transfers", "description": "Screen printed using our off-the-shelf colour range"},
            {"id": "single-A6", "name": "single_A6", "label": "A6 Single Colour", "width": 105, "height": 148, "pixelWidth": 298, "pixelHeight": 420, "group": "Screen Printed Transfers", "description": "Screen printed using our off-the-shelf colour range"},
            {"id": "single-transfer-size", "name": "single_transfer_size", "label": "295×100mm Single Colour", "width": 295, "height": 100, "pixelWidth": 836, "pixelHeight": 283, "group": "Screen Printed Transfers", "description": "Screen printed using our off-the-shelf colour range"},
            {"id": "single-square", "name": "single_square", "label": "95×95mm Single Colour", "width": 95, "height": 95, "pixelWidth": 269, "pixelHeight": 269, "group": "Screen Printed Transfers", "description": "Screen printed using our off-the-shelf colour range"},
            {"id": "single-badge", "name": "single_badge", "label": "100×70mm Single Colour", "width": 100, "height": 70, "pixelWidth": 283, "pixelHeight": 198, "group": "Screen Printed Transfers", "description": "Screen printed using our off-the-shelf colour range"},
            {"id": "single-small", "name": "single_small", "label": "60×60mm Single Colour", "width": 60, "height": 60, "pixelWidth": 170, "pixelHeight": 170, "group": "Screen Printed Transfers", "description": "Screen printed using our off-the-shelf colour range"},
            
            # Screen Printed Transfers - Zero (8 templates)
            {"id": "zero-A3", "name": "zero_A3", "label": "A3 Zero", "width": 297, "height": 420, "pixelWidth": 842, "pixelHeight": 1191, "group": "Screen Printed Transfers", "description": "Zero inks are super stretchy and do not bleed!"},
            {"id": "zero-A4", "name": "zero_A4", "label": "A4 Zero", "width": 210, "height": 297, "pixelWidth": 595, "pixelHeight": 842, "group": "Screen Printed Transfers", "description": "Zero inks are super stretchy and do not bleed!"},
            {"id": "zero-A5", "name": "zero_A5", "label": "A5 Zero", "width": 148, "height": 210, "pixelWidth": 420, "pixelHeight": 595, "group": "Screen Printed Transfers", "description": "Zero inks are super stretchy and do not bleed!"},
            {"id": "zero-A6", "name": "zero_A6", "label": "A6 Zero", "width": 105, "height": 148, "pixelWidth": 298, "pixelHeight": 420, "group": "Screen Printed Transfers", "description": "Zero inks are super stretchy and do not bleed!"},
            {"id": "zero-transfer-size", "name": "zero_transfer_size", "label": "295×100mm Zero", "width": 295, "height": 100, "pixelWidth": 836, "pixelHeight": 283, "group": "Screen Printed Transfers", "description": "Zero inks are super stretchy and do not bleed!"},
            {"id": "zero-square", "name": "zero_square", "label": "95×95mm Zero", "width": 95, "height": 95, "pixelWidth": 269, "pixelHeight": 269, "group": "Screen Printed Transfers", "description": "Zero inks are super stretchy and do not bleed!"},
            {"id": "zero-badge", "name": "zero_badge", "label": "100×70mm Zero", "width": 100, "height": 70, "pixelWidth": 283, "pixelHeight": 198, "group": "Screen Printed Transfers", "description": "Zero inks are super stretchy and do not bleed!"},
            {"id": "zero-small", "name": "zero_small", "label": "60×60mm Zero", "width": 60, "height": 60, "pixelWidth": 170, "pixelHeight": 170, "group": "Screen Printed Transfers", "description": "Zero inks are super stretchy and do not bleed!"},
            
            # Digital Transfers - DTF (2 templates)
            {"id": "dtf-SRA3", "name": "SRA3", "label": "SRA3", "width": 320, "height": 450, "pixelWidth": 907, "pixelHeight": 1276, "group": "Digital Transfers", "description": "Small order digital heat transfers"},
            {"id": "dtf-large", "name": "large_dtf", "label": "1000×550mm DTF", "width": 1000, "height": 550, "pixelWidth": 2834, "pixelHeight": 1559, "group": "Digital Transfers", "description": "Small order digital heat transfers"},
            
            # Digital Transfers - UV DTF (1 template)
            {"id": "uvdtf-A3", "name": "uv_dtf_A3", "label": "A3 UV DTF", "width": 297, "height": 420, "pixelWidth": 842, "pixelHeight": 1191, "group": "Digital Transfers", "description": "Hard Surface Transfers"},
            
            # Digital Transfers - Custom Badges (4 templates)
            {"id": "woven-A6", "name": "woven_A6", "label": "A6 Woven", "width": 105, "height": 148, "pixelWidth": 298, "pixelHeight": 420, "group": "Digital Transfers", "description": "Polyester textile woven badges"},
            {"id": "woven-square", "name": "woven_square", "label": "95×95mm Woven", "width": 95, "height": 95, "pixelWidth": 269, "pixelHeight": 269, "group": "Digital Transfers", "description": "Polyester textile woven badges"},
            {"id": "woven-badge", "name": "woven_badge", "label": "100×70mm Woven", "width": 100, "height": 70, "pixelWidth": 283, "pixelHeight": 198, "group": "Digital Transfers", "description": "Polyester textile woven badges"},
            {"id": "woven-small", "name": "woven_small", "label": "60×60mm Woven", "width": 60, "height": 60, "pixelWidth": 170, "pixelHeight": 170, "group": "Digital Transfers", "description": "Polyester textile woven badges"},
            
            # Digital Transfers - Applique Badges (4 templates)
            {"id": "applique-A6", "name": "applique_A6", "label": "A6 Applique", "width": 105, "height": 148, "pixelWidth": 298, "pixelHeight": 420, "group": "Digital Transfers", "description": "Fabric applique badges"},
            {"id": "applique-square", "name": "applique_square", "label": "95×95mm Applique", "width": 95, "height": 95, "pixelWidth": 269, "pixelHeight": 269, "group": "Digital Transfers", "description": "Fabric applique badges"},
            {"id": "applique-badge", "name": "applique_badge", "label": "100×70mm Applique", "width": 100, "height": 70, "pixelWidth": 283, "pixelHeight": 198, "group": "Digital Transfers", "description": "Fabric applique badges"},
            {"id": "applique-small", "name": "applique_small", "label": "60×60mm Applique", "width": 60, "height": 60, "pixelWidth": 170, "pixelHeight": 170, "group": "Digital Transfers", "description": "Fabric applique badges"},
            
            # Screen Printed Transfers - Reflective (8 templates)
            {"id": "reflective-A3", "name": "reflective_A3", "label": "A3", "width": 297, "height": 420, "pixelWidth": 842, "pixelHeight": 1191, "group": "Screen Printed Transfers", "description": "Our silver reflective helps enhance the visibility of the wearer at night"},
            {"id": "reflective-A4", "name": "reflective_A4", "label": "A4", "width": 210, "height": 297, "pixelWidth": 595, "pixelHeight": 842, "group": "Screen Printed Transfers", "description": "Our silver reflective helps enhance the visibility of the wearer at night"},
            {"id": "reflective-A5", "name": "reflective_A5", "label": "A5", "width": 148, "height": 210, "pixelWidth": 420, "pixelHeight": 595, "group": "Screen Printed Transfers", "description": "Our silver reflective helps enhance the visibility of the wearer at night"},
            {"id": "reflective-A6", "name": "reflective_A6", "label": "A6", "width": 105, "height": 148, "pixelWidth": 298, "pixelHeight": 420, "group": "Screen Printed Transfers", "description": "Our silver reflective helps enhance the visibility of the wearer at night"},
            {"id": "reflective-transfer-size", "name": "reflective_transfer_size", "label": "295×100mm", "width": 295, "height": 100, "pixelWidth": 836, "pixelHeight": 283, "group": "Screen Printed Transfers", "description": "Our silver reflective helps enhance the visibility of the wearer at night"},
            {"id": "reflective-square", "name": "reflective_square", "label": "95×95mm", "width": 95, "height": 95, "pixelWidth": 269, "pixelHeight": 269, "group": "Screen Printed Transfers", "description": "Our silver reflective helps enhance the visibility of the wearer at night"},
            {"id": "reflective-badge", "name": "reflective_badge", "label": "100×70mm", "width": 100, "height": 70, "pixelWidth": 283, "pixelHeight": 198, "group": "Screen Printed Transfers", "description": "Our silver reflective helps enhance the visibility of the wearer at night"},
            {"id": "reflective-small", "name": "reflective_small", "label": "60×60mm", "width": 60, "height": 60, "pixelWidth": 170, "pixelHeight": 170, "group": "Screen Printed Transfers", "description": "Our silver reflective helps enhance the visibility of the wearer at night"},
            
            # Digital Transfers - Sublimation (12 templates)
            {"id": "sublimation-A2-fabric", "name": "sublimation_A2_fabric", "label": "A2 Fabric", "width": 420, "height": 594, "pixelWidth": 1191, "pixelHeight": 1684, "group": "Digital Transfers", "description": "Sublimation heat transfers are designed for full-colour decoration of white, 100% polyester"},
            {"id": "sublimation-A3-fabric", "name": "sublimation_A3_fabric", "label": "A3 Fabric", "width": 297, "height": 420, "pixelWidth": 842, "pixelHeight": 1191, "group": "Digital Transfers", "description": "Sublimation heat transfers are designed for full-colour decoration of white, 100% polyester"},
            {"id": "sublimation-A4-fabric", "name": "sublimation_A4_fabric", "label": "A4 Fabric", "width": 210, "height": 297, "pixelWidth": 595, "pixelHeight": 842, "group": "Digital Transfers", "description": "Sublimation heat transfers are designed for full-colour decoration of white, 100% polyester"},
            {"id": "sublimation-A3", "name": "sublimation_A3", "label": "A3 Hard Surface", "width": 297, "height": 420, "pixelWidth": 842, "pixelHeight": 1191, "group": "Digital Transfers", "description": "Sublimation heat transfers are designed for full-colour decoration of white, 100% polyester"},
            {"id": "sublimation-A4", "name": "sublimation_A4", "label": "A4 Hard Surface", "width": 210, "height": 297, "pixelWidth": 595, "pixelHeight": 842, "group": "Digital Transfers", "description": "Sublimation heat transfers are designed for full-colour decoration of white, 100% polyester"},
            {"id": "sublimation-mug", "name": "sublimation_mug", "label": "Mug Size", "width": 240, "height": 100, "pixelWidth": 680, "pixelHeight": 283, "group": "Digital Transfers", "description": "Sublimation heat transfers are designed for full-colour decoration of white, 100% polyester"},
            {"id": "sublimation-A5", "name": "sublimation_A5", "label": "A5 Sublimation", "width": 148, "height": 210, "pixelWidth": 420, "pixelHeight": 595, "group": "Digital Transfers", "description": "Sublimation heat transfers are designed for full-colour decoration of white, 100% polyester"},
            {"id": "sublimation-A6", "name": "sublimation_A6", "label": "A6 Sublimation", "width": 105, "height": 148, "pixelWidth": 298, "pixelHeight": 420, "group": "Digital Transfers", "description": "Sublimation heat transfers are designed for full-colour decoration of white, 100% polyester"},
            {"id": "sublimation-transfer-size", "name": "sublimation_transfer_size", "label": "295×100mm Sublimation", "width": 295, "height": 100, "pixelWidth": 836, "pixelHeight": 283, "group": "Digital Transfers", "description": "Sublimation heat transfers are designed for full-colour decoration of white, 100% polyester"},
            {"id": "sublimation-square", "name": "sublimation_square", "label": "95×95mm Sublimation", "width": 95, "height": 95, "pixelWidth": 269, "pixelHeight": 269, "group": "Digital Transfers", "description": "Sublimation heat transfers are designed for full-colour decoration of white, 100% polyester"},
            {"id": "sublimation-badge", "name": "sublimation_badge", "label": "100×70mm Sublimation", "width": 100, "height": 70, "pixelWidth": 283, "pixelHeight": 198, "group": "Digital Transfers", "description": "Sublimation heat transfers are designed for full-colour decoration of white, 100% polyester"},
            {"id": "sublimation-small", "name": "sublimation_small", "label": "60×60mm Sublimation", "width": 60, "height": 60, "pixelWidth": 170, "pixelHeight": 170, "group": "Digital Transfers", "description": "Sublimation heat transfers are designed for full-colour decoration of white, 100% polyester"}
        ]
    
    @http.route('/artwork/api/projects', type='json', auth='public', methods=['POST', 'OPTIONS'], cors='*', csrf=False)
    def create_project(self, **kwargs):
        """Create a new artwork project"""
        data = request.jsonrequest
        
        # Create project
        project_vals = {
            'name': data.get('name', 'Untitled Project'),
            'template_size': data.get('templateSize'),
            'garment_color': data.get('garmentColor', '#000000'),
            'garment_color_name': data.get('garmentColorName', ''),
            'project_comments': data.get('comments', ''),
            'partner_id': request.env.user.partner_id.id if request.env.user._is_public() else False,
        }
        
        # Handle multiple garment colors
        if data.get('garmentColors'):
            project_vals['garment_colors_json'] = json.dumps(data.get('garmentColors'))
        
        # Handle ink color
        if data.get('inkColor'):
            project_vals['ink_color'] = data.get('inkColor')
            project_vals['ink_color_name'] = data.get('inkColorName', '')
        
        project = request.env['artwork.project'].sudo().create(project_vals)
        
        return {
            'id': project.uuid,
            'name': project.name,
            'templateSize': project.template_size,
            'garmentColor': project.garment_color,
            'garmentColorName': project.garment_color_name,
            'comments': project.project_comments,
        }
    
    @http.route('/artwork/api/projects/<string:project_uuid>', type='json', auth='public', methods=['GET', 'OPTIONS'], cors='*', csrf=False)
    def get_project(self, project_uuid, **kwargs):
        """Get project details"""
        project = request.env['artwork.project'].sudo().search([('uuid', '=', project_uuid)], limit=1)
        
        if not project:
            return {'error': 'Project not found'}
        
        # Parse garment colors JSON if available
        garment_colors = []
        if project.garment_colors_json:
            try:
                garment_colors = json.loads(project.garment_colors_json)
            except (json.JSONDecodeError, TypeError):
                pass
        
        return {
            'id': project.uuid,
            'name': project.name,
            'templateSize': project.template_size,
            'garmentColor': project.garment_color,
            'garmentColorName': project.garment_color_name,
            'garmentColors': garment_colors,
            'inkColor': project.ink_color,
            'inkColorName': project.ink_color_name,
            'comments': project.project_comments,
            'state': project.state,
        }
    
    @http.route('/artwork/api/projects/<string:project_uuid>', type='json', auth='public', methods=['PATCH', 'OPTIONS'], cors='*', csrf=False)
    def update_project(self, project_uuid, **kwargs):
        """Update project details"""
        project = request.env['artwork.project'].sudo().search([('uuid', '=', project_uuid)], limit=1)
        
        if not project:
            return {'error': 'Project not found'}
        
        data = request.jsonrequest
        update_vals = {}
        
        # Handle updateable fields
        if 'name' in data:
            update_vals['name'] = data['name']
        if 'comments' in data:
            update_vals['project_comments'] = data['comments']
        if 'garmentColor' in data:
            update_vals['garment_color'] = data['garmentColor']
        if 'garmentColorName' in data:
            update_vals['garment_color_name'] = data['garmentColorName']
        if 'garmentColors' in data:
            update_vals['garment_colors_json'] = json.dumps(data['garmentColors'])
        if 'inkColor' in data:
            update_vals['ink_color'] = data['inkColor']
        if 'inkColorName' in data:
            update_vals['ink_color_name'] = data['inkColorName']
        
        if update_vals:
            project.write(update_vals)
        
        return {'success': True, 'updated_fields': list(update_vals.keys())}
    
    @http.route('/artwork/api/projects/<string:project_uuid>/logos', type='json', auth='public', methods=['POST', 'OPTIONS'], cors='*', csrf=False)
    def upload_logo(self, project_uuid, **kwargs):
        """Upload a logo file"""
        project = request.env['artwork.project'].sudo().search([('uuid', '=', project_uuid)], limit=1)
        
        if not project:
            return {'error': 'Project not found'}
        
        data = request.jsonrequest
        file_data = data.get('file')
        filename = data.get('filename')
        
        if not file_data or not filename:
            return {'error': 'Missing file data or filename'}
        
        # Decode and analyze file
        try:
            file_content = base64.b64decode(file_data)
            file_size = len(file_content)
        except Exception:
            return {'error': 'Invalid file data'}
        
        # Create logo record
        logo_vals = {
            'name': filename,
            'project_id': project.id,
            'filename': filename,
            'file_data': file_data,
            'file_size': file_size,
        }
        
        logo = request.env['artwork.logo'].sudo().create(logo_vals)
        
        return {
            'id': str(logo.id),
            'filename': logo.filename,
            'originalName': logo.name,
            'fileType': logo.file_type,
            'isVector': logo.is_vector,
            'colorCount': logo.color_count,
            'width': logo.width_px,
            'height': logo.height_px,
            'isCMYKPreserved': logo.is_cmyk_preserved,
            'hasCMYK': logo.has_cmyk,
            'hasRGB': logo.has_rgb,
            'fileSize': logo.file_size,
        }
    
    @http.route('/artwork/api/projects/<string:project_uuid>/canvas-elements', type='json', auth='public', methods=['GET', 'OPTIONS'], cors='*', csrf=False)
    def get_canvas_elements(self, project_uuid, **kwargs):
        """Get canvas elements"""
        project = request.env['artwork.project'].sudo().search([('uuid', '=', project_uuid)], limit=1)
        
        if not project:
            return []
        
        elements = []
        for element in project.canvas_element_ids:
            elements.append(element.get_canvas_data())
        
        return elements
    
    @http.route('/artwork/api/projects/<string:project_uuid>/canvas-elements', type='json', auth='public', methods=['POST', 'OPTIONS'], cors='*', csrf=False)
    def save_canvas_elements(self, project_uuid, **kwargs):
        """Save canvas elements"""
        project = request.env['artwork.project'].sudo().search([('uuid', '=', project_uuid)], limit=1)
        
        if not project:
            return {'error': 'Project not found'}
        
        data = request.jsonrequest
        elements_data = data.get('elements', [])
        
        # Delete existing elements
        project.canvas_element_ids.unlink()
        
        # Create new elements
        for element_data in elements_data:
            request.env['artwork.canvas.element'].sudo().create_from_canvas_data(
                project.id, element_data
            )
        
        return {'success': True}
    
    @http.route('/artwork/api/projects/<string:project_uuid>/generate-pdf', type='http', auth='public', methods=['GET', 'OPTIONS'], cors='*', csrf=False)
    def generate_pdf(self, project_uuid, **kwargs):
        """Generate PDF for the project"""
        project = request.env['artwork.project'].sudo().search([('uuid', '=', project_uuid)], limit=1)
        
        if not project:
            return request.not_found()
        
        try:
            # Import PDF generator with error handling
            try:
                from ..lib.pdf_generator import OdooPDFGenerator
            except ImportError:
                # Fallback if PDF generator not available
                OdooPDFGenerator = None
            
            # Parse garment colors
            garment_colors = []
            if project.garment_colors_json:
                try:
                    garment_colors = json.loads(project.garment_colors_json)
                except (json.JSONDecodeError, TypeError):
                    pass
            
            # Prepare project data
            project_data = {
                'project_id': project.uuid,
                'project_name': project.name,
                'template_size': {
                    'name': project.template_size,
                    'width': project.template_width,
                    'height': project.template_height,
                },
                'canvas_elements': [],
                'logos': [],
                'garment_color': project.garment_color,
                'garment_color_name': project.garment_color_name,
                'garment_colors': garment_colors,  # Multi-color support
                'quantity': project.quantity,
                'total_quantity': project.total_quantity,
            }
            
            # Get canvas elements
            for element in project.canvas_element_ids:
                element_data = element.get_canvas_data()
                project_data['canvas_elements'].append(element_data)
            
            # Get logos
            for logo in project.logo_ids:
                logo_data = {
                    'id': str(logo.id),
                    'filename': logo.filename,
                    'originalName': logo.name,
                    'isCMYKPreserved': logo.is_cmyk_preserved,
                    'fileType': logo.file_type,
                    'isVector': logo.is_vector,
                }
                project_data['logos'].append(logo_data)
            
            # Generate PDF
            if OdooPDFGenerator:
                generator = OdooPDFGenerator()
                pdf_content = generator.generate_pdf(project_data)
            else:
                # Fallback to basic PDF if generator not available
                raise ImportError("PDF generator not available")
            
            # Return PDF
            headers = [
                ('Content-Type', 'application/pdf'),
                ('Content-Disposition', f'attachment; filename="{project.name}_artwork.pdf"'),
            ]
            
            return request.make_response(pdf_content, headers)
            
        except Exception as e:
            _logger.error(f"PDF generation failed: {str(e)}")
            # Fallback to basic PDF
            pdf_content = b'%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj xref\n0 4\n0000000000 65535 f \n0000000010 00000 n \n0000000053 00000 n \n0000000125 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n206\n%%EOF'
            
            headers = [
                ('Content-Type', 'application/pdf'),
                ('Content-Disposition', f'attachment; filename="{project.name}_artwork.pdf"'),
            ]
            
            return request.make_response(pdf_content, headers)
    
    @http.route('/artwork/api/projects/<string:project_uuid>/add-to-cart', type='http', auth='public', methods=['POST', 'OPTIONS'], csrf=False)
    def add_to_cart(self, project_uuid, **kwargs):
        """Add artwork project to cart"""
        # Get the origin from the request
        origin = request.httprequest.headers.get('Origin', '*')
        
        # Handle CORS preflight
        if request.httprequest.method == 'OPTIONS':
            headers = [
                ('Access-Control-Allow-Origin', origin),
                ('Access-Control-Allow-Methods', 'POST, OPTIONS'),
                ('Access-Control-Allow-Headers', 'Content-Type, Accept'),
                ('Access-Control-Allow-Credentials', 'true'),
                ('Access-Control-Max-Age', '86400'),
            ]
            return request.make_response('', headers=headers)
        
        try:
            _logger.info(f"🛒 ADD TO CART START - Project UUID: {project_uuid}")
            
            # Parse JSON body
            try:
                data = json.loads(request.httprequest.data.decode('utf-8')) if request.httprequest.data else {}
            except (json.JSONDecodeError, UnicodeDecodeError):
                data = {}
            
            _logger.info(f"📦 Received project data keys: {list(data.keys())}")
            _logger.info(f"📦 website_id from data: {data.get('website_id')}, source: {data.get('source')}")
            
            # DEBUG: List all websites to help identify correct Complete Transfers website ID
            all_websites = request.env['website'].sudo().search([])
            for ws in all_websites:
                _logger.info(f"🌐 AVAILABLE WEBSITE: ID={ws.id}, Name='{ws.name}', Domain='{ws.domain}'")
            
            # Find or create project in Odoo database
            project = request.env['artwork.project'].sudo().search([('uuid', '=', project_uuid)], limit=1)
            
            if not project:
                _logger.info(f"🆕 Project not found in Odoo, creating new project")
                
                # Create project in Odoo database with data from Replit
                project_vals = {
                    'uuid': project_uuid,
                    'name': data.get('name', 'Untitled Project'),
                    'template_size': data.get('templateSize', ''),
                    'garment_color': data.get('garmentColor', ''),
                    'garment_color_name': data.get('garmentColorName', ''),
                    'ink_color': data.get('inkColor', ''),
                    'ink_color_name': data.get('inkColorName', ''),
                    'quantity': data.get('quantity', 1),
                    'total_quantity': data.get('totalQuantity', data.get('quantity', 1)),
                    'project_comments': data.get('comments', ''),
                    'state': 'draft',
                }
                
                # Handle garment colors for multi-color orders
                if data.get('garmentColors'):
                    project_vals['garment_colors_json'] = json.dumps(data['garmentColors'])
                
                # Note: PDF is NOT stored in artwork.project - it goes directly to sale.order.line
                # to avoid duplicate storage (Dropbox is primary storage, order line is for production)
                
                project = request.env['artwork.project'].sudo().create(project_vals)
                _logger.info(f"✅ Created project in Odoo: {project.name} (ID: {project.id})")
            else:
                _logger.info(f"✅ Found existing project in Odoo: {project.name} (ID: {project.id})")
                
                # Update project with latest data
                update_vals = {}
                if data.get('name'):
                    update_vals['name'] = data['name']
                if data.get('quantity'):
                    update_vals['quantity'] = data['quantity']
                if data.get('totalQuantity'):
                    update_vals['total_quantity'] = data['totalQuantity']
                if data.get('comments'):
                    update_vals['project_comments'] = data['comments']
                if data.get('garmentColors'):
                    update_vals['garment_colors_json'] = json.dumps(data['garmentColors'])
                
                # Note: PDF is NOT stored in artwork.project - it goes directly to sale.order.line
                
                if update_vals:
                    project.sudo().write(update_vals)
                    _logger.info(f"✅ Updated project with latest data")
            
            _logger.info(f"✅ Found project: {project.name}, Template: {project.template_size}, Qty: {project.quantity}")
            
            # Get current user (parent window calls this API as logged-in customer)
            current_user = request.env.user
            is_public = current_user._is_public()
            _logger.info(f"👤 Current user: {current_user.name} (ID: {current_user.id}), Is Public: {is_public}")
            
            # CRITICAL: Use explicit website_id if provided (from iframe context)
            # This ensures correct pricelist even when called from Replit iframe
            website_id_param = data.get('website_id')
            website = None
            
            if website_id_param:
                try:
                    explicit_website = request.env['website'].sudo().browse(int(website_id_param))
                    if explicit_website.exists():
                        website = explicit_website
                        _logger.info(f"🌐 Using EXPLICIT website from parameter: {website.name} (ID: {website.id})")
                except (ValueError, TypeError) as e:
                    _logger.warning(f"⚠️ Invalid website_id parameter: {e}")
            
            # Fallback to current website detection
            if not website:
                website = request.env['website'].get_current_website()
                _logger.info(f"🌐 Using detected website: {website.name if website else 'None'}")
            
            # CRITICAL: Bind website to request for JSON controllers (sale_get_order expects request.website)
            request.website = website
            
            # CRITICAL FIX: If partnerEmail is provided, look up that customer and use their cart
            # This handles the case where Replit backend proxies request without session cookies
            partner_email = data.get('partnerEmail')
            partner = None
            sale_order = None
            
            if partner_email and is_public:
                # Request comes from Replit backend without session - use partnerEmail to find customer
                _logger.info(f"📧 Looking up customer by email: {partner_email}")
                partner = request.env['res.partner'].sudo().search([
                    ('email', '=ilike', partner_email),
                    ('customer_rank', '>', 0)  # Ensure it's a customer
                ], limit=1)
                
                if not partner:
                    # Try without customer_rank filter (new customer may not have rank yet)
                    partner = request.env['res.partner'].sudo().search([
                        ('email', '=ilike', partner_email)
                    ], limit=1)
                
                if partner:
                    _logger.info(f"✅ Found customer: {partner.name} (ID: {partner.id}) for email {partner_email}")
                    
                    # Find or create draft sale order for this customer
                    sale_order = request.env['sale.order'].sudo().search([
                        ('partner_id', '=', partner.id),
                        ('website_id', '=', website.id),
                        ('state', '=', 'draft'),
                    ], order='create_date desc', limit=1)
                    
                    if sale_order:
                        _logger.info(f"🛒 Found existing cart #{sale_order.id} for customer {partner.name}")
                        # Ensure existing order has an access_token
                        if not sale_order.access_token:
                            sale_order.sudo().write({'access_token': str(uuid.uuid4())})
                            _logger.info(f"🔑 Generated access_token for existing cart #{sale_order.id}")
                    else:
                        # Create new cart for this customer
                        access_token = str(uuid.uuid4())
                        _logger.info(f"🆕 Creating new cart for customer {partner.name}")
                        sale_order = request.env['sale.order'].sudo().create({
                            'partner_id': partner.id,
                            'website_id': website.id,
                            'pricelist_id': partner.property_product_pricelist.id or website.pricelist_id.id,
                            'access_token': access_token,
                        })
                        _logger.info(f"✅ Created cart #{sale_order.id} for customer {partner.name} (token: {access_token[:8]}...)")
                else:
                    _logger.warning(f"⚠️ Customer not found for email: {partner_email}, will use session cart")
            
            # Fallback to standard website cart if no partner found
            if not sale_order:
                sale_order = website.sale_get_order(force_create=True)
                partner = sale_order.partner_id
            _logger.info(f"🛒 Website cart: #{sale_order.id} for {partner.name}, Original Pricelist: {sale_order.pricelist_id.name}")
            
            # PRICELIST CORRECTION LOGIC (must match pricing API):
            # 1. If customer has special pricelist (e.g., Galaxy Crystal) → Keep it
            # 2. If on completetransfers.com AND no special pricelist → Force CT Euro/GBP
            # 3. Else → Use cart's current pricelist (serigraf.com default)
            
            # Define standard/public pricelists (NOT special customer pricelists)
            # These are DEFAULT pricelists that should be overridden by CT pricelist
            standard_pricelists = [
                'Public Pricelist',
                'Euro Pricelist',
                'Euro Prices',  # Standard Euro pricelist - NOT a special customer pricelist
                'CT Euro Pricelist',
                'CT Public Pricelist GBP',
                'CT T1 Pricelist T1',
                'CT Public Pricelist T1',
                'Serigraf STD Pricelist',
                'Hollister',  # Standard pricelist, not special customer pricing
            ]
            
            # Check if customer has a special/custom pricelist
            has_special_pricelist = sale_order.pricelist_id.name not in standard_pricelists
            original_pricelist = sale_order.pricelist_id
            
            # We'll determine the correct pricelist AFTER we know the product
            # Store the flag for now
            _logger.info(f"📋 Cart pricelist: {sale_order.pricelist_id.name}, is_special: {has_special_pricelist}")
            
            _logger.info(f"✅ Sale order: #{sale_order.id}, Partner: {partner.name}, Current lines: {len(sale_order.order_line)}")
            
            # Find mapped product for the template
            # Use template_id from request data if provided (for vectorization service), otherwise use project's template
            template_for_lookup = data.get('template_id') or project.template_size
            _logger.info(f"🔍 Looking up product for template: '{template_for_lookup}' (from request: {bool(data.get('template_id'))}, project: '{project.template_size}')")
            product = request.env['artwork.template.mapping'].sudo().get_product_for_template(template_for_lookup)
            
            if not product:
                _logger.error(f"❌ No product mapped for template: {template_for_lookup}")
                response = json.dumps({'error': 'No product mapped for this template. Please configure template mappings in Artwork > Configuration > Template Mappings.'})
                headers = [
                    ('Content-Type', 'application/json'),
                    ('Access-Control-Allow-Origin', origin),
                    ('Access-Control-Allow-Credentials', 'true'),
                ]
                return request.make_response(response, headers=headers)
            
            _logger.info(f"✅ Found product: {product.name} (ID: {product.id})")
            
            # NOW determine the correct pricelist based on the product
            # This mirrors the logic in get_pricing() - check if special pricelist has rules for THIS product
            if has_special_pricelist:
                # Check if special pricelist has a SPECIFIC rule for this product
                has_specific_product_rule = False
                
                # First check: exact product variant match
                product_rule = request.env['product.pricelist.item'].sudo().search([
                    ('pricelist_id', '=', original_pricelist.id),
                    ('applied_on', '=', '0_product_variant'),
                    ('product_id', '=', product.id)
                ], limit=1)
                
                if product_rule:
                    has_specific_product_rule = True
                    _logger.info(f"✅ Found PRODUCT VARIANT rule in {original_pricelist.name} for {product.name}")
                else:
                    # Second check: product template match
                    template_rule = request.env['product.pricelist.item'].sudo().search([
                        ('pricelist_id', '=', original_pricelist.id),
                        ('applied_on', '=', '1_product'),
                        ('product_tmpl_id', '=', product.product_tmpl_id.id)
                    ], limit=1)
                    
                    if template_rule:
                        has_specific_product_rule = True
                        _logger.info(f"✅ Found PRODUCT TEMPLATE rule in {original_pricelist.name} for {product.name}")
                
                if has_specific_product_rule:
                    # Customer's special pricelist has rules for this product - keep it
                    _logger.info(f"⭐ Using customer's SPECIAL pricelist: {original_pricelist.name} (has specific rule for {product.name})")
                else:
                    # Special pricelist doesn't have a SPECIFIC rule for this product
                    # Fall back to CT Euro Pricelist for Complete Transfers website
                    _logger.info(f"⚠️ Customer has SPECIAL pricelist '{original_pricelist.name}' but NO specific rule for '{product.name}'")
                    
                    if website and website.name == 'Complete Transfers':
                        customer_country = partner.country_id.code if partner and partner.country_id else None
                        ct_pricelist_name = 'CT Public Pricelist GBP' if customer_country == 'GB' else 'CT Euro Pricelist'
                        
                        ct_pricelist = request.env['product.pricelist'].sudo().search([
                            ('name', '=', ct_pricelist_name),
                            ('active', '=', True)
                        ], limit=1)
                        
                        if ct_pricelist and sale_order.pricelist_id.id != ct_pricelist.id:
                            sale_order.sudo().write({'pricelist_id': ct_pricelist.id})
                            _logger.info(f"🔄 Falling back to {ct_pricelist.name} for {product.name} (no special rule)")
                        else:
                            _logger.warning(f"⚠️ Could not find {ct_pricelist_name}, keeping original pricelist")
                    else:
                        _logger.info(f"📋 Not CT website, keeping cart's pricelist: {original_pricelist.name}")
            elif website and website.name == 'Complete Transfers':
                # On Complete Transfers website with standard pricelist - force CT Euro/GBP pricelist
                customer_country = partner.country_id.code if partner and partner.country_id else None
                ct_pricelist_name = 'CT Public Pricelist GBP' if customer_country == 'GB' else 'CT Euro Pricelist'
                
                ct_pricelist = request.env['product.pricelist'].sudo().search([
                    ('name', '=', ct_pricelist_name),
                    ('active', '=', True)
                ], limit=1)
                
                if ct_pricelist and sale_order.pricelist_id.id != ct_pricelist.id:
                    sale_order.sudo().write({'pricelist_id': ct_pricelist.id})
                    _logger.info(f"🌐 Complete Transfers website → Updated cart from '{sale_order.pricelist_id.name}' to '{ct_pricelist.name}'")
                elif ct_pricelist:
                    _logger.info(f"✅ Cart already using correct CT pricelist: {ct_pricelist.name}")
                else:
                    _logger.warning(f"⚠️ Could not find {ct_pricelist_name}, keeping original pricelist")
            else:
                # On serigraf.com or other - keep cart's current pricelist
                _logger.info(f"📋 Using cart's assigned pricelist: {sale_order.pricelist_id.name}")
            
            # Add to cart
            _logger.info(f"🛒 Calling _cart_update with qty={project.quantity}")
            cart_result = sale_order.sudo()._cart_update(
                product_id=product.id,
                add_qty=project.quantity,
                set_qty=0,
                attributes={},
                no_variant_attribute_values={}
            )
            _logger.info(f"✅ Cart updated: {cart_result}")
            
            # Link project to order
            project.sale_order_id = sale_order.id
            _logger.info(f"✅ Linked project to sale order #{sale_order.id}")
            
            # Find the created order line and link it to the project
            order_line = sale_order.order_line.filtered(lambda l: l.product_id.id == product.id)[-1]
            if order_line:
                order_line.artwork_project_id = project.id
                order_line._update_artwork_comments()
                
                # Attach artwork file to order line (production workflow via artwork_files_datas and artwork_file_name)
                # CRITICAL: Must use production's exact field names to trigger Dropbox workflow
                if data.get('pdfBase64'):
                    # IMPORTANT: Odoo Binary fields expect base64-encoded STRING, not raw bytes!
                    # The pdfBase64 from frontend is already base64, so pass it directly
                    pdf_base64_string = data['pdfBase64']
                    
                    # Use artworkFilename if provided (preserves original filename for vectorization uploads)
                    # Otherwise fall back to project name with qty and .pdf extension
                    if data.get('artworkFilename'):
                        artwork_filename = data['artworkFilename'].replace(' ', '_')
                        _logger.info(f"📄 Using provided artworkFilename: {artwork_filename}")
                    else:
                        project_name = data.get('name', 'artwork').replace(' ', '_')
                        quantity = data.get('quantity', project.quantity or 1)
                        artwork_filename = f"{project_name}_qty{quantity}.pdf"
                        _logger.info(f"📄 Generated filename with quantity: {artwork_filename}")
                    
                    # CRITICAL: Upload to PRODUCTION fields (artwork_files_datas + artwork_file_name)
                    # artwork_files_datas expects base64-encoded string, NOT decoded bytes
                    order_line.write({
                        'artwork_files_datas': pdf_base64_string,    # Production field - must be base64 STRING
                        'artwork_file_name': artwork_filename        # Production field (filename)
                    })
                    _logger.info(f"📄 Artwork uploaded to PRODUCTION fields (artwork_files_datas + artwork_file_name): {artwork_filename}")
                    _logger.info(f"✅ Dropbox workflow will automatically move file to Dropbox via shipping_dropbox_customization module")
                
                _logger.info(f"✅ Linked order line #{order_line.id} to project")
            else:
                _logger.warning(f"⚠️ Could not find order line for product {product.id}")
            
            _logger.info(f"✅ ADD TO CART SUCCESS - Cart now has {sale_order.cart_quantity} items")
            
            response_data = {
                'success': True,
                'cart_quantity': sale_order.cart_quantity,
                'website_sale_order': sale_order.id,
                'access_token': sale_order.access_token or '',
                'partner_id': sale_order.partner_id.id,
            }
            
            response = json.dumps(response_data)
            headers = [
                ('Content-Type', 'application/json'),
                ('Access-Control-Allow-Origin', origin),
                ('Access-Control-Allow-Credentials', 'true'),
            ]
            
            return request.make_response(response, headers=headers)
            
        except Exception as e:
            _logger.error(f"❌ ADD TO CART FAILED: {str(e)}")
            _logger.exception("Full traceback:")
            
            response = json.dumps({'error': f'Failed to add to cart: {str(e)}'})
            headers = [
                ('Content-Type', 'application/json'),
                ('Access-Control-Allow-Origin', origin),
                ('Access-Control-Allow-Credentials', 'true'),
            ]
            return request.make_response(response, headers=headers, status=500)
    
    @http.route('/artwork/claim-cart', type='http', auth='public', website=True, methods=['GET', 'POST', 'OPTIONS'], csrf=False)
    def claim_cart(self, order_id=None, access_token=None, **kwargs):
        """Claim a cart into the current browser session.
        
        This endpoint allows the parent window to sync the browser session with
        a cart that was created/updated via the API. It validates that the order
        belongs to the current logged-in customer before setting it in the session.
        
        Called by parent window after receiving add-to-cart success from iframe.
        """
        origin = request.httprequest.headers.get('Origin', '*')
        
        # Handle CORS preflight
        if request.httprequest.method == 'OPTIONS':
            headers = [
                ('Content-Type', 'application/json'),
                ('Access-Control-Allow-Origin', origin),
                ('Access-Control-Allow-Credentials', 'true'),
                ('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'),
                ('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With'),
            ]
            return request.make_response('', headers=headers)
        
        try:
            if not order_id:
                response_data = {'error': 'order_id is required'}
                headers = [
                    ('Content-Type', 'application/json'),
                    ('Access-Control-Allow-Origin', origin),
                    ('Access-Control-Allow-Credentials', 'true'),
                ]
                return request.make_response(json.dumps(response_data), headers=headers, status=400)
            
            order_id = int(order_id)
            sale_order = request.env['sale.order'].sudo().browse(order_id)
            
            if not sale_order.exists():
                _logger.warning(f"❌ Claim cart failed: Order {order_id} not found")
                response_data = {'error': 'Order not found'}
                headers = [
                    ('Content-Type', 'application/json'),
                    ('Access-Control-Allow-Origin', origin),
                    ('Access-Control-Allow-Credentials', 'true'),
                ]
                return request.make_response(json.dumps(response_data), headers=headers, status=404)
            
            # Get current user's partner
            current_partner = request.env.user.partner_id
            is_public = request.env.user._is_public()
            
            _logger.info(f"🔑 Claim cart request: Order #{order_id}, Current user: {request.env.user.name}, Is public: {is_public}, Access token provided: {bool(access_token)}")
            
            # Security validation: order must belong to the current user's partner OR match access token
            can_claim = False
            
            # Check 1: Access token validation (highest priority - works regardless of session/cookie state)
            if access_token:
                order_token = getattr(sale_order, 'access_token', None)
                if order_token and order_token == access_token:
                    can_claim = True
                    _logger.info(f"✅ Valid access token provided for order #{order_id}")
                else:
                    _logger.info(f"⚠️ Access token mismatch for order #{order_id}: provided={access_token[:8]}..., order_has_token={bool(order_token)}")
            
            # Check 2: Logged-in user owns the order
            if not can_claim and not is_public and sale_order.partner_id.id == current_partner.id:
                can_claim = True
                _logger.info(f"✅ Order belongs to logged-in user {current_partner.name}")
            
            # Check 3: Public user claiming a public cart
            if not can_claim and is_public:
                public_partner = request.env.ref('base.public_partner', raise_if_not_found=False)
                if public_partner and sale_order.partner_id.id == public_partner.id:
                    can_claim = True
                    _logger.info(f"✅ Public user claiming public cart #{order_id}")
            
            # Check 4: Fallback - if order is in draft/sent state and has a valid access token in URL,
            # allow claiming even if token field is empty (handles cases where Odoo didn't generate a token)
            if not can_claim and access_token and sale_order.state in ('draft', 'sent'):
                can_claim = True
                _logger.info(f"✅ Fallback: allowing claim for draft order #{order_id} with access token")
            
            if not can_claim:
                _logger.warning(f"❌ Claim cart denied: Order #{order_id} belongs to {sale_order.partner_id.name}, not {current_partner.name}")
                response_data = {'error': 'You are not authorized to claim this cart'}
                headers = [
                    ('Content-Type', 'application/json'),
                    ('Access-Control-Allow-Origin', origin),
                    ('Access-Control-Allow-Credentials', 'true'),
                ]
                return request.make_response(json.dumps(response_data), headers=headers, status=403)
            
            # Set the session's sale_order_id to this order
            request.session['sale_order_id'] = order_id
            # Also set sale_last_order_id to prevent website_sale from overriding
            request.session['sale_last_order_id'] = order_id
            _logger.info(f"✅ Session cart set to order #{order_id} for user {request.env.user.name}")
            
            # Check if we should redirect or return JSON
            # If 'redirect' parameter is set, redirect to cart page after setting session
            redirect_url = kwargs.get('redirect')
            if redirect_url:
                _logger.info(f"🔄 Redirecting to {redirect_url} after claiming cart")
                return request.redirect(redirect_url)
            
            response_data = {
                'success': True,
                'message': f'Cart #{order_id} claimed successfully',
                'cart_quantity': sale_order.cart_quantity,
            }
            
            headers = [
                ('Content-Type', 'application/json'),
                ('Access-Control-Allow-Origin', origin),
                ('Access-Control-Allow-Credentials', 'true'),
            ]
            return request.make_response(json.dumps(response_data), headers=headers)
            
        except Exception as e:
            _logger.error(f"❌ Claim cart failed: {str(e)}")
            _logger.exception("Full traceback:")
            
            response_data = {'error': str(e)}
            headers = [
                ('Content-Type', 'application/json'),
                ('Access-Control-Allow-Origin', origin),
                ('Access-Control-Allow-Credentials', 'true'),
            ]
            return request.make_response(json.dumps(response_data), headers=headers, status=500)
    
    @http.route('/artwork/api/current-user', type='http', auth='public', methods=['GET', 'OPTIONS'], csrf=False)
    def get_current_user(self, **kwargs):
        """Get current logged-in user's email for the artwork uploader iframe.
        
        This endpoint reliably returns the portal user's email, which is needed
        for customer-specific pricing when the iframe can't access session cookies.
        """
        # Handle CORS preflight
        origin = request.httprequest.headers.get('Origin', '*')
        
        if request.httprequest.method == 'OPTIONS':
            headers = [
                ('Access-Control-Allow-Origin', origin),
                ('Access-Control-Allow-Methods', 'GET, OPTIONS'),
                ('Access-Control-Allow-Headers', 'Content-Type'),
                ('Access-Control-Allow-Credentials', 'true'),
            ]
            return request.make_response('', headers=headers)
        
        headers = [
            ('Content-Type', 'application/json'),
            ('Access-Control-Allow-Origin', origin),
            ('Access-Control-Allow-Credentials', 'true'),
        ]
        
        try:
            user = request.env.user
            partner = user.partner_id
            
            # Get email from partner (most reliable for portal users)
            email = ''
            name = ''
            
            if user and user.id != request.env.ref('base.public_user').id:
                # Not public user - get their info
                email = partner.email if partner else (user.email or user.login)
                name = partner.name if partner else user.name
                _logger.info(f"📧 Current user API: {name} ({email})")
            else:
                _logger.info("📧 Current user API: Public user (no email)")
            
            response_data = {
                'success': True,
                'email': email or '',
                'name': name or '',
                'is_public': user.id == request.env.ref('base.public_user').id
            }
            
            return request.make_response(json.dumps(response_data), headers=headers)
            
        except Exception as e:
            _logger.error(f"Error getting current user: {e}")
            return request.make_response(json.dumps({
                'success': False,
                'email': '',
                'error': str(e)
            }), headers=headers, status=500)
    
    @http.route('/artwork/api/pricing', type='http', auth='public', methods=['GET', 'POST', 'OPTIONS'], csrf=False)
    def get_pricing(self, templateId=None, copies=None, **kwargs):
        """Get pricing for a template from Odoo product mappings
        
        Supports cross-origin requests with credentials for customer-specific pricing.
        When called from iframe with session cookie, identifies logged-in customer and
        applies their assigned pricelist (including special customer pricelists).
        """
        # Handle CORS preflight for credentials mode
        origin = request.httprequest.headers.get('Origin', '*')
        
        # For OPTIONS preflight request
        if request.httprequest.method == 'OPTIONS':
            headers = [
                ('Content-Type', 'application/json'),
                ('Access-Control-Allow-Origin', origin),
                ('Access-Control-Allow-Credentials', 'true'),
                ('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'),
                ('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With'),
            ]
            return request.make_response('', headers=headers)
        
        try:
            # Parse JSON body for POST requests (JSON-RPC format from frontend)
            if request.httprequest.method == 'POST':
                try:
                    body = json.loads(request.httprequest.data.decode('utf-8'))
                    # Handle JSON-RPC format
                    if 'params' in body:
                        params = body.get('params', {})
                        templateId = params.get('templateId', templateId)
                        copies = params.get('copies', copies)
                        kwargs.update(params)
                except:
                    pass
            
            if not templateId or not copies:
                response_data = {'error': 'templateId and copies are required'}
                headers = [
                    ('Content-Type', 'application/json'),
                    ('Access-Control-Allow-Origin', origin),
                    ('Access-Control-Allow-Credentials', 'true'),
                ]
                return request.make_response(json.dumps(response_data), headers=headers)
            
            copies = int(copies)
            if copies < 1:
                response_data = {'error': 'Invalid copies quantity'}
                headers = [
                    ('Content-Type', 'application/json'),
                    ('Access-Control-Allow-Origin', origin),
                    ('Access-Control-Allow-Credentials', 'true'),
                ]
                return request.make_response(json.dumps(response_data), headers=headers)
            
            # Find mapped product for the template
            product = request.env['artwork.template.mapping'].sudo().get_product_for_template(templateId)
            
            if not product:
                response_data = {
                    'error': 'No product mapped for this template',
                    'pricePerUnit': 0,
                    'totalPrice': 0,
                    'currency': 'EUR'
                }
                headers = [
                    ('Content-Type', 'application/json'),
                    ('Access-Control-Allow-Origin', origin),
                    ('Access-Control-Allow-Credentials', 'true'),
                ]
                return request.make_response(json.dumps(response_data), headers=headers)
            
            # Get price from product (considering pricelists with quantity discounts)
            # PRICELIST PRIORITY LOGIC:
            # 1. Special/custom customer pricelist (highest priority)
            # 2. If request is from completetransfers.com: Force CT Euro/GBP pricelist
            # 3. Else: Use partner's assigned pricelist (serigraf.com default)
            
            # CRITICAL: Use explicit website_id if provided (from iframe context)
            # This ensures correct pricelist even when called from Replit iframe
            website = None  # Initialize to avoid "referenced before assignment" error
            website_id_param = kwargs.get('website_id')
            if website_id_param:
                try:
                    explicit_website = request.env['website'].sudo().browse(int(website_id_param))
                    if explicit_website.exists():
                        website = explicit_website
                        _logger.info(f"🌐 Using EXPLICIT website from parameter: {website.name} (ID: {website.id})")
                except (ValueError, TypeError):
                    pass
            
            # Fallback to current website detection if no explicit website found
            if not website:
                website = request.env['website'].sudo().get_current_website()
                _logger.info(f"🌐 Using detected website: {website.name if website else 'None'}")
            
            # CRITICAL FIX: If partnerEmail is provided, look up that customer directly
            # This handles the case where iframe session cookies aren't passed correctly
            partner_email = kwargs.get('partnerEmail')
            partner = None
            cart = None
            
            if partner_email:
                _logger.info(f"📧 Looking up customer by email for pricing: {partner_email}")
                partner = request.env['res.partner'].sudo().search([
                    ('email', '=ilike', partner_email),
                    ('customer_rank', '>', 0)
                ], limit=1)
                
                if not partner:
                    # Try without customer_rank filter
                    partner = request.env['res.partner'].sudo().search([
                        ('email', '=ilike', partner_email)
                    ], limit=1)
                
                if partner:
                    _logger.info(f"✅ Found customer for pricing: {partner.name} (ID: {partner.id})")
                    # Also try to find their cart on this website
                    if website:
                        cart = request.env['sale.order'].sudo().search([
                            ('partner_id', '=', partner.id),
                            ('website_id', '=', website.id),
                            ('state', '=', 'draft'),
                        ], order='create_date desc', limit=1)
                else:
                    _logger.warning(f"⚠️ Customer not found for email: {partner_email}")
            
            # Fallback: Try to get partner from cart (actual customer), then session user
            if not partner:
                # IMPORTANT: Use the correct website context for cart lookup
                if website:
                    try:
                        # Use with_context to ensure cart lookup uses the correct website
                        cart = website.with_context(website_id=website.id).sale_get_order(force_create=False)
                    except Exception as e:
                        _logger.warning(f"⚠️ Could not get cart: {e}")
                
                if cart and cart.partner_id:
                    partner = cart.partner_id
                    _logger.info(f"👤 Using CART partner: {partner.name} (ID: {partner.id})")
                else:
                    partner = request.env.user.partner_id if hasattr(request.env.user, 'partner_id') else None
                    _logger.info(f"👤 Using SESSION user partner: {partner.name if partner else 'None'}")
            
            # CRITICAL FIX: Detect if request originates from Complete Transfers website
            # When loaded in iframe on completetransfers.com, Odoo may see wrong website
            # Check source parameter (passed by Replit backend), referrer, or website name
            is_complete_transfers = False
            
            # PRIMARY CHECK: explicit website_id parameter (most reliable for iframe)
            if website_id_param:
                # If website_id is passed, check if it's a Complete Transfers website
                if website and 'complete' in website.name.lower():
                    is_complete_transfers = True
                    _logger.info(f"🎯 Explicit website_id={website_id_param} → Complete Transfers detected")
            
            # SECONDARY CHECK: source parameter from Replit backend
            source_param = kwargs.get('source', '')
            if not is_complete_transfers and source_param and 'completetransfers' in source_param.lower():
                is_complete_transfers = True
                _logger.info(f"🎯 source='completetransfers' → CT mode (from Replit backend)")
            
            # TERTIARY CHECK: referrer header for completetransfers.com
            if not is_complete_transfers:
                referrer = request.httprequest.headers.get('Referer', '')
                origin = request.httprequest.headers.get('Origin', '')
                if 'completetransfers' in referrer.lower() or 'completetransfers' in origin.lower():
                    is_complete_transfers = True
                    _logger.info(f"🎯 Referrer/Origin contains completetransfers → CT mode")
            
            # FALLBACK CHECK: website name (standard detection)
            if not is_complete_transfers and website and 'complete' in website.name.lower():
                is_complete_transfers = True
                _logger.info(f"🎯 Website name '{website.name}' → Complete Transfers detected")
            
            _logger.info(f"🌐 Website: {website.name if website else 'None'} (ID: {website.id if website else 'None'}), Is CT: {is_complete_transfers}")
            _logger.info(f"🔑 Session user: {request.env.user.name} (ID: {request.env.user.id}), Partner: {partner.name if partner else 'None'}")
            
            # Define standard/public pricelists (NOT special customer pricelists)
            # These are DEFAULT pricelists that should be overridden by CT pricelist
            standard_pricelists = [
                'Public Pricelist',
                'Euro Pricelist',
                'Euro Prices',  # Standard Euro pricelist - NOT a special customer pricelist
                'CT Euro Pricelist',
                'CT Public Pricelist GBP',
                'CT T1 Pricelist T1',
                'CT Public Pricelist T1',
                'Serigraf STD Pricelist',
                'Hollister',  # Standard pricelist, not special customer pricing
            ]
            
            pricelist = None
            fallback_pricelist = None  # CT Euro pricelist for products not in special pricelist
            
            # PRIORITY 1: Check if customer has a SPECIAL/CUSTOM pricelist (e.g., Galaxy Crystal, Visual Vinyl, DTF)
            if partner and partner.property_product_pricelist:
                customer_pricelist = partner.property_product_pricelist
                # Only use it if it's a special pricelist (not a standard one)
                if customer_pricelist.name not in standard_pricelists:
                    # Check if this special pricelist has a SPECIFIC rule for this exact product
                    # IMPORTANT: Only match product-specific or template-specific rules
                    # DO NOT match global rules or category rules - those are too broad
                    # e.g., DTF pricelist should only apply to DTF products, not Full Colour
                    has_specific_product_rule = False
                    
                    # First check: exact product variant match
                    product_rule = request.env['product.pricelist.item'].sudo().search([
                        ('pricelist_id', '=', customer_pricelist.id),
                        ('applied_on', '=', '0_product_variant'),
                        ('product_id', '=', product.id)
                    ], limit=1)
                    
                    if product_rule:
                        has_specific_product_rule = True
                        _logger.info(f"✅ Found PRODUCT VARIANT rule in {customer_pricelist.name} for {product.name}")
                    else:
                        # Second check: product template match
                        template_rule = request.env['product.pricelist.item'].sudo().search([
                            ('pricelist_id', '=', customer_pricelist.id),
                            ('applied_on', '=', '1_product'),
                            ('product_tmpl_id', '=', product.product_tmpl_id.id)
                        ], limit=1)
                        
                        if template_rule:
                            has_specific_product_rule = True
                            _logger.info(f"✅ Found PRODUCT TEMPLATE rule in {customer_pricelist.name} for {product.name}")
                    
                    if has_specific_product_rule:
                        pricelist = customer_pricelist
                        _logger.info(f"⭐ Using customer's SPECIAL pricelist: {pricelist.name} (has specific rule for {product.name})")
                    else:
                        # Special pricelist doesn't have a SPECIFIC rule for this product
                        # Will fall back to CT Euro Pricelist
                        _logger.info(f"⚠️ Customer has SPECIAL pricelist '{customer_pricelist.name}' but NO specific rule for '{product.name}'")
                        _logger.info(f"🔄 Will fall back to CT Euro Pricelist for this product")
            
            # PRIORITY 2: If request is from Complete Transfers (detected via referrer, origin, or website), force CT Euro/GBP
            if not pricelist and is_complete_transfers:
                customer_country = partner.country_id.code if partner and partner.country_id else None
                ct_pricelist_name = 'CT Public Pricelist GBP' if customer_country == 'GB' else 'CT Euro Pricelist'
                
                pricelist = request.env['product.pricelist'].sudo().search([
                    ('name', '=', ct_pricelist_name),
                    ('active', '=', True)
                ], limit=1)
                
                if pricelist:
                    _logger.info(f"🌐 Complete Transfers request → Using {ct_pricelist_name}")
                else:
                    _logger.warning(f"⚠️ {ct_pricelist_name} not found, trying fallback...")
                    # Fallback: Try CT Euro Pricelist if GBP not found
                    pricelist = request.env['product.pricelist'].sudo().search([
                        ('name', '=', 'CT Euro Pricelist'),
                        ('active', '=', True)
                    ], limit=1)
                    if pricelist:
                        _logger.info(f"🔄 Fallback to CT Euro Pricelist")
            
            # PRIORITY 3: Use partner's assigned pricelist (for serigraf.com or other sites)
            if not pricelist and partner and partner.property_product_pricelist:
                pricelist = partner.property_product_pricelist
                _logger.info(f"📋 Using partner's assigned pricelist: {pricelist.name}")
            
            # Strategy 3: Get website's default pricelist
            if not pricelist and website:
                try:
                    pricelist = website.get_current_pricelist()
                except:
                    pass
            
            # Strategy 4: Search for CT Euro Pricelist as last resort (best default with discounts)
            if not pricelist:
                pricelist = request.env['product.pricelist'].sudo().search([
                    ('name', '=', 'CT Euro Pricelist'),
                    ('active', '=', True)
                ], limit=1)
                if pricelist:
                    _logger.info(f"🔄 Last resort: Using CT Euro Pricelist")
            
            # Strategy 5: Get any active pricelist
            if not pricelist:
                pricelist = request.env['product.pricelist'].sudo().search([
                    ('active', '=', True)
                ], limit=1)
            
            _logger.info(f"🔍 Pricing debug - Website: {website.name if website else 'None'}, Pricelist: {pricelist.name if pricelist else 'None'}, Product: {product.name}, Qty: {copies}")
            if pricelist:
                _logger.info(f"🔍 Pricelist details - ID: {pricelist.id}, Website: {pricelist.website_id.name if pricelist.website_id else 'Not linked'}, Company: {pricelist.company_id.name if pricelist.company_id else 'None'}")
            
            # Get base list price for fallback
            base_list_price = product.list_price
            
            if pricelist:
                # Get price from CT Euro/GBP pricelist (no more fallback logic needed)
                try:
                    price_per_unit = pricelist._get_product_price(
                        product,
                        copies,
                        partner=partner,
                        date=False,
                        uom=product.uom_id
                    )
                    _logger.info(f"✅ {pricelist.name} - Qty {copies}: €{price_per_unit}")
                except Exception as e:
                    _logger.error(f"❌ Pricing failed: {str(e)}")
                    price_per_unit = base_list_price
                    _logger.info(f"⚠️ Using list price as fallback: €{price_per_unit}")
            else:
                price_per_unit = base_list_price
                _logger.info(f"📋 No pricelist found, using list price: {price_per_unit}")
            
            total_price = price_per_unit * copies
            
            _logger.info(f"💵 Final pricing - Unit: {price_per_unit}, Total: {total_price} for {copies} items")
            
            response_data = {
                'pricePerUnit': round(price_per_unit, 2),
                'totalPrice': round(total_price, 2),
                'currency': product.currency_id.name if product.currency_id else 'EUR',
                'productName': product.name,
            }
            headers = [
                ('Content-Type', 'application/json'),
                ('Access-Control-Allow-Origin', origin),
                ('Access-Control-Allow-Credentials', 'true'),
            ]
            return request.make_response(json.dumps(response_data), headers=headers)
            
        except Exception as e:
            _logger.error(f"Pricing error: {str(e)}")
            response_data = {
                'error': f'Failed to calculate pricing: {str(e)}',
                'pricePerUnit': 0,
                'totalPrice': 0,
                'currency': 'EUR'
            }
            headers = [
                ('Content-Type', 'application/json'),
                ('Access-Control-Allow-Origin', origin),
                ('Access-Control-Allow-Credentials', 'true'),
            ]
            return request.make_response(json.dumps(response_data), headers=headers)
    
    @http.route('/artwork/api/helpdesk/create', type='http', auth='public', methods=['POST', 'OPTIONS'], csrf=False)
    def create_helpdesk_ticket(self, **kwargs):
        """Create a helpdesk ticket for the logged-in customer"""
        origin = request.httprequest.headers.get('Origin', '*')
        
        # Handle CORS preflight
        if request.httprequest.method == 'OPTIONS':
            headers = [
                ('Access-Control-Allow-Origin', origin),
                ('Access-Control-Allow-Methods', 'POST, OPTIONS'),
                ('Access-Control-Allow-Headers', 'Content-Type, Accept'),
                ('Access-Control-Allow-Credentials', 'true'),
                ('Access-Control-Max-Age', '86400'),
            ]
            return request.make_response('', headers=headers)
        
        try:
            _logger.info("🎫 CREATE HELPDESK TICKET START")
            
            # Parse JSON body
            try:
                data = json.loads(request.httprequest.data.decode('utf-8')) if request.httprequest.data else {}
            except (json.JSONDecodeError, UnicodeDecodeError):
                data = {}
            
            subject = data.get('subject', 'Support Request')
            description = data.get('description', '')
            customer_name = data.get('name', '')
            customer_email = data.get('email', '')
            
            _logger.info(f"📧 Ticket data: subject='{subject}', email='{customer_email}'")
            
            # Get current user
            current_user = request.env.user
            is_public = current_user._is_public()
            partner = None
            
            if not is_public:
                # Logged-in user - use their partner
                partner = current_user.partner_id
                _logger.info(f"👤 Logged-in user: {partner.name} (ID: {partner.id})")
            else:
                # Public user - try to find by email
                if customer_email:
                    partner = request.env['res.partner'].sudo().search([
                        ('email', '=ilike', customer_email)
                    ], limit=1)
                    
                    if not partner:
                        # Create a new partner for this customer
                        partner = request.env['res.partner'].sudo().create({
                            'name': customer_name or customer_email,
                            'email': customer_email,
                        })
                        _logger.info(f"✅ Created new partner: {partner.name} (ID: {partner.id})")
                    else:
                        _logger.info(f"✅ Found existing partner: {partner.name} (ID: {partner.id})")
            
            # Find the Artwork Uploader helpdesk team
            helpdesk_team = request.env['helpdesk.team'].sudo().search([
                ('name', 'ilike', 'Artwork Uploader')
            ], limit=1)
            
            if not helpdesk_team:
                # Try to find any helpdesk team
                helpdesk_team = request.env['helpdesk.team'].sudo().search([], limit=1)
                _logger.warning(f"⚠️ 'Artwork Uploader' team not found, using: {helpdesk_team.name if helpdesk_team else 'None'}")
            
            if not helpdesk_team:
                raise ValueError("No helpdesk team found in Odoo")
            
            _logger.info(f"🎫 Using helpdesk team: {helpdesk_team.name} (ID: {helpdesk_team.id})")
            
            # Create the helpdesk ticket
            ticket_vals = {
                'name': subject,
                'description': description,
                'team_id': helpdesk_team.id,
            }
            
            if partner:
                ticket_vals['partner_id'] = partner.id
                ticket_vals['partner_email'] = partner.email or customer_email
            elif customer_email:
                ticket_vals['partner_email'] = customer_email
            
            ticket = request.env['helpdesk.ticket'].sudo().create(ticket_vals)
            _logger.info(f"✅ Created helpdesk ticket: {ticket.name} (ID: {ticket.id})")
            
            response_data = {
                'success': True,
                'ticket_id': ticket.id,
                'ticket_name': ticket.name,
                'message': 'Support ticket created successfully'
            }
            
            headers = [
                ('Content-Type', 'application/json'),
                ('Access-Control-Allow-Origin', origin),
                ('Access-Control-Allow-Credentials', 'true'),
            ]
            return request.make_response(json.dumps(response_data), headers=headers)
            
        except Exception as e:
            _logger.error(f"❌ Helpdesk ticket creation failed: {str(e)}")
            response_data = {
                'success': False,
                'error': str(e)
            }
            headers = [
                ('Content-Type', 'application/json'),
                ('Access-Control-Allow-Origin', origin),
                ('Access-Control-Allow-Credentials', 'true'),
            ]
            return request.make_response(json.dumps(response_data), headers=headers, status=500)
    
    def _get_garment_colors(self):
        """Get available garment colors"""
        try:
            try:
                from ..lib.garment_colors import GarmentColorManager
            except ImportError:
                GarmentColorManager = None
            
            if GarmentColorManager:
                all_colors = GarmentColorManager.get_all_colors()
                colors = []
                
                for color in all_colors:
                    colors.append({
                        'value': color['hex'],
                        'label': color['name'],
                        'cmyk': GarmentColorManager.get_cmyk_string(color),
                        'manufacturer': color.get('manufacturer', ''),
                        'category': color.get('category', ''),
                    })
                
                return colors
            else:
                # Fallback to basic colors
                return [
                    {'value': '#000000', 'label': 'Black', 'cmyk': 'C:0 M:0 Y:0 K:100'},
                    {'value': '#FFFFFF', 'label': 'White', 'cmyk': 'C:0 M:0 Y:0 K:0'},
                    {'value': '#FF0000', 'label': 'Red', 'cmyk': 'C:0 M:100 Y:100 K:0'},
                    {'value': '#00FF00', 'label': 'Green', 'cmyk': 'C:100 M:0 Y:100 K:0'},
                    {'value': '#0000FF', 'label': 'Blue', 'cmyk': 'C:100 M:100 Y:0 K:0'},
                ]
        except Exception as e:
            _logger.warning(f"Error loading garment colors: {e}")
            # Fallback colors if import fails
            return [
                {'value': '#000000', 'label': 'Black', 'cmyk': 'C:0 M:0 Y:0 K:100'},
                {'value': '#FFFFFF', 'label': 'White', 'cmyk': 'C:0 M:0 Y:0 K:0'},
                {'value': '#FF0000', 'label': 'Red', 'cmyk': 'C:0 M:100 Y:100 K:0'},
                {'value': '#00FF00', 'label': 'Green', 'cmyk': 'C:100 M:0 Y:100 K:0'},
                {'value': '#0000FF', 'label': 'Blue', 'cmyk': 'C:100 M:100 Y:0 K:0'},
            ]
    
    def _get_ink_colors(self):
        """Get available ink colors for single color templates"""
        return self._get_garment_colors()  # Same as garment colors for now
    
    @http.route('/artwork/api/order-history', type='http', auth='public', methods=['GET', 'OPTIONS'], cors='*', csrf=False)
    def get_order_history(self, page=1, limit=20, email=None, **kwargs):
        origin = request.httprequest.headers.get('Origin', '*')
        
        if request.httprequest.method == 'OPTIONS':
            headers = [
                ('Access-Control-Allow-Origin', origin),
                ('Access-Control-Allow-Methods', 'GET, OPTIONS'),
                ('Access-Control-Allow-Headers', 'Content-Type'),
                ('Access-Control-Allow-Credentials', 'true'),
            ]
            return request.make_response('', headers=headers)
        
        headers = [
            ('Content-Type', 'application/json'),
            ('Access-Control-Allow-Origin', origin),
            ('Access-Control-Allow-Credentials', 'true'),
        ]
        
        try:
            partner = None
            user = request.env.user
            
            if user.id != request.env.ref('base.public_user').id:
                partner = user.partner_id
            
            if not partner and email:
                partner = request.env['res.partner'].sudo().search([
                    ('email', '=ilike', email)
                ], limit=1)
                _logger.info(f"📋 Order history lookup by email: {email} -> partner: {partner.id if partner else 'not found'}")
            
            if not partner:
                return request.make_response(json.dumps({
                    'success': False,
                    'error': 'Login required to view order history'
                }), headers=headers, status=401)
            
            page = int(page)
            limit = int(limit)
            offset = (page - 1) * limit
            
            domain = [
                ('partner_id', '=', partner.id),
                ('state', 'in', ['sale', 'done']),
            ]
            
            total = request.env['sale.order'].sudo().search_count(domain)
            orders = request.env['sale.order'].sudo().search(
                domain, order='date_order desc', limit=limit, offset=offset
            )
            
            order_list = []
            for order in orders:
                artwork_lines = []
                for line in order.order_line:
                    if not line.artwork_project_id:
                        continue
                    
                    project = line.artwork_project_id
                    garment_colors = []
                    if project.garment_colors_json:
                        try:
                            garment_colors = json.loads(project.garment_colors_json)
                        except (json.JSONDecodeError, TypeError):
                            pass
                    
                    if not garment_colors and project.garment_color_name:
                        garment_colors = [{
                            'colorName': project.garment_color_name,
                            'color': project.garment_color or '#000000',
                            'quantity': project.quantity or 1
                        }]
                    
                    artwork_lines.append({
                        'lineId': line.id,
                        'projectName': project.name,
                        'projectUuid': project.uuid,
                        'templateSize': project.template_size or '',
                        'quantity': project.total_quantity or project.quantity or 1,
                        'garmentColors': garment_colors,
                        'garmentColorName': project.garment_color_name or '',
                        'inkColorName': project.ink_color_name or '',
                        'hasPdf': bool(line.artwork_files_datas if hasattr(line, 'artwork_files_datas') else False),
                        'pdfFileName': line.artwork_file_name if hasattr(line, 'artwork_file_name') else '',
                        'state': project.state or 'draft',
                        'createdDate': project.create_date.isoformat() if project.create_date else '',
                    })
                
                if artwork_lines:
                    order_list.append({
                        'orderId': order.id,
                        'orderName': order.name,
                        'dateOrder': order.date_order.isoformat() if order.date_order else '',
                        'state': order.state,
                        'amountTotal': order.amount_total,
                        'currencySymbol': order.currency_id.symbol if order.currency_id else '',
                        'artworkLines': artwork_lines,
                    })
            
            return request.make_response(json.dumps({
                'success': True,
                'orders': order_list,
                'total': total,
                'page': page,
                'limit': limit,
                'totalPages': (total + limit - 1) // limit if limit > 0 else 1,
            }), headers=headers)
            
        except Exception as e:
            _logger.error(f"Error fetching order history: {e}")
            return request.make_response(json.dumps({
                'success': False,
                'error': str(e)
            }), headers=headers, status=500)
    
    @http.route('/artwork/api/order-pdf/<int:line_id>', type='http', auth='public', methods=['GET', 'OPTIONS'], csrf=False)
    def download_order_pdf(self, line_id, email=None, **kwargs):
        origin = request.httprequest.headers.get('Origin', '*')
        
        if request.httprequest.method == 'OPTIONS':
            headers = [
                ('Access-Control-Allow-Origin', origin),
                ('Access-Control-Allow-Methods', 'GET, OPTIONS'),
                ('Access-Control-Allow-Headers', 'Content-Type'),
                ('Access-Control-Allow-Credentials', 'true'),
            ]
            return request.make_response('', headers=headers)
        
        try:
            partner = None
            user = request.env.user
            if user.id != request.env.ref('base.public_user').id:
                partner = user.partner_id
            
            if not partner and email:
                partner = request.env['res.partner'].sudo().search([
                    ('email', '=ilike', email)
                ], limit=1)
            
            if not partner:
                return request.make_response('Login required', status=401)
            
            line = request.env['sale.order.line'].sudo().browse(line_id)
            
            if not line.exists():
                return request.make_response('Order line not found', status=404)
            
            if line.order_id.partner_id.id != partner.id:
                return request.make_response('Access denied', status=403)
            
            if not hasattr(line, 'artwork_files_datas') or not line.artwork_files_datas:
                return request.make_response('No PDF available', status=404)
            
            pdf_data = base64.b64decode(line.artwork_files_datas)
            filename = line.artwork_file_name if hasattr(line, 'artwork_file_name') and line.artwork_file_name else 'artwork.pdf'
            
            headers = [
                ('Content-Type', 'application/pdf'),
                ('Content-Disposition', f'attachment; filename="{filename}"'),
                ('Content-Length', str(len(pdf_data))),
                ('Access-Control-Allow-Origin', origin),
                ('Access-Control-Allow-Credentials', 'true'),
            ]
            
            return request.make_response(pdf_data, headers=headers)
            
        except Exception as e:
            _logger.error(f"Error downloading order PDF: {e}")
            return request.make_response(f'Error: {str(e)}', status=500)
    
    def _get_template_type(self, template_size):
        """Get template type from template size"""
        if 'dtf' in template_size.lower():
            return 'dtf'
        elif 'uv-dtf' in template_size.lower():
            return 'uv_dtf'
        elif 'sublimation' in template_size.lower():
            return 'sublimation'
        elif 'vinyl' in template_size.lower():
            return 'vinyl'
        elif 'badge' in template_size.lower():
            return 'badges'
        else:
            return 'full_colour'