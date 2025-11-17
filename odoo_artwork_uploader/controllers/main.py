from odoo import http
from odoo.http import request
import json
import base64
import logging

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
    
    @http.route('/artwork/api/projects/<string:project_uuid>/add-to-cart', type='json', auth='public', methods=['POST', 'OPTIONS'], cors='*', csrf=False)
    def add_to_cart(self, project_uuid, **kwargs):
        """Add artwork project to cart"""
        project = request.env['artwork.project'].sudo().search([('uuid', '=', project_uuid)], limit=1)
        
        if not project:
            return {'error': 'Project not found'}
        
        # Get or create sale order
        sale_order = request.website.sale_get_order(force_create=True)
        
        # Find mapped product for the template
        product = request.env['artwork.template.mapping'].sudo().get_product_for_template(project.template_size)
        
        if not product:
            return {'error': 'No product mapped for this template. Please configure template mappings in Artwork > Configuration > Template Mappings.'}
        
        # Add to cart
        sale_order.sudo()._cart_update(
            product_id=product.id,
            add_qty=project.quantity,
            set_qty=0,
            attributes={},
            no_variant_attribute_values={}
        )
        
        # Link project to order
        project.sale_order_id = sale_order.id
        
        # Find the created order line and link it to the project
        order_line = sale_order.order_line.filtered(lambda l: l.product_id.id == product.id)[-1]
        if order_line:
            order_line.artwork_project_id = project.id
            order_line._update_artwork_comments()
        
        return {
            'success': True,
            'cart_quantity': sale_order.cart_quantity,
            'website_sale_order': sale_order.id,
        }
    
    @http.route('/artwork/api/pricing', type='json', auth='public', methods=['GET', 'POST', 'OPTIONS'], cors='*', csrf=False)
    def get_pricing(self, templateId=None, copies=None, **kwargs):
        """Get pricing for a template from Odoo product mappings"""
        try:
            if not templateId or not copies:
                return {'error': 'templateId and copies are required'}
            
            copies = int(copies)
            if copies < 1:
                return {'error': 'Invalid copies quantity'}
            
            # Find mapped product for the template
            product = request.env['artwork.template.mapping'].sudo().get_product_for_template(templateId)
            
            if not product:
                return {
                    'error': 'No product mapped for this template',
                    'pricePerUnit': 0,
                    'totalPrice': 0,
                    'currency': 'EUR'
                }
            
            # Get price from product (considering pricelists if applicable)
            pricelist = request.website.get_current_pricelist() if hasattr(request, 'website') else None
            
            if pricelist:
                price_per_unit = pricelist.get_product_price(product, copies, None)
            else:
                price_per_unit = product.list_price
            
            total_price = price_per_unit * copies
            
            return {
                'pricePerUnit': round(price_per_unit, 2),
                'totalPrice': round(total_price, 2),
                'currency': product.currency_id.name if product.currency_id else 'EUR',
                'productName': product.name,
            }
            
        except Exception as e:
            _logger.error(f"Pricing error: {str(e)}")
            return {
                'error': f'Failed to calculate pricing: {str(e)}',
                'pricePerUnit': 0,
                'totalPrice': 0,
                'currency': 'EUR'
            }
    
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