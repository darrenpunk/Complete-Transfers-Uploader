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
        # Get template configurations
        templates = request.env['product.template'].sudo().search([
            ('is_artwork_product', '=', True)
        ])
        
        values = {
            'templates': templates,
            'garment_colors': self._get_garment_colors(),
            'ink_colors': self._get_ink_colors(),
        }
        
        return request.render('artwork_uploader.upload_page', values)
    
    @http.route('/artwork/api/projects', type='json', auth='public', methods=['POST'], csrf=False)
    def create_project(self, **kwargs):
        """Create a new artwork project"""
        data = request.jsonrequest
        
        # Create project
        project_vals = {
            'name': data.get('name', 'Untitled Project'),
            'template_size': data.get('templateSize'),
            'garment_color': data.get('garmentColor', '#000000'),
            'partner_id': request.env.user.partner_id.id if request.env.user._is_public() else False,
        }
        
        project = request.env['artwork.project'].sudo().create(project_vals)
        
        return {
            'id': project.uuid,
            'name': project.name,
            'templateSize': project.template_size,
            'garmentColor': project.garment_color,
        }
    
    @http.route('/artwork/api/projects/<string:project_uuid>', type='json', auth='public', methods=['GET'], csrf=False)
    def get_project(self, project_uuid, **kwargs):
        """Get project details"""
        project = request.env['artwork.project'].sudo().search([('uuid', '=', project_uuid)], limit=1)
        
        if not project:
            return {'error': 'Project not found'}
        
        return {
            'id': project.uuid,
            'name': project.name,
            'templateSize': project.template_size,
            'garmentColor': project.garment_color,
            'inkColor': project.ink_color,
            'state': project.state,
        }
    
    @http.route('/artwork/api/projects/<string:project_uuid>/logos', type='json', auth='public', methods=['POST'], csrf=False)
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
        
        # Create logo record
        logo_vals = {
            'name': filename,
            'project_id': project.id,
            'filename': filename,
            'file_data': file_data,
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
        }
    
    @http.route('/artwork/api/projects/<string:project_uuid>/canvas-elements', type='json', auth='public', methods=['GET'], csrf=False)
    def get_canvas_elements(self, project_uuid, **kwargs):
        """Get canvas elements"""
        project = request.env['artwork.project'].sudo().search([('uuid', '=', project_uuid)], limit=1)
        
        if not project:
            return []
        
        elements = []
        for element in project.canvas_element_ids:
            elements.append(element.get_canvas_data())
        
        return elements
    
    @http.route('/artwork/api/projects/<string:project_uuid>/canvas-elements', type='json', auth='public', methods=['POST'], csrf=False)
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
    
    @http.route('/artwork/api/projects/<string:project_uuid>/generate-pdf', type='http', auth='public', methods=['GET'], csrf=False)
    def generate_pdf(self, project_uuid, **kwargs):
        """Generate PDF for the project"""
        project = request.env['artwork.project'].sudo().search([('uuid', '=', project_uuid)], limit=1)
        
        if not project:
            return request.not_found()
        
        # Generate PDF (simplified for now)
        pdf_content = b'%PDF-1.4\n%%EOF'  # Placeholder PDF
        
        # Return PDF
        headers = [
            ('Content-Type', 'application/pdf'),
            ('Content-Disposition', f'attachment; filename="{project.name}_artwork.pdf"'),
        ]
        
        return request.make_response(pdf_content, headers)
    
    @http.route('/artwork/api/projects/<string:project_uuid>/add-to-cart', type='json', auth='public', methods=['POST'], csrf=False)
    def add_to_cart(self, project_uuid, **kwargs):
        """Add artwork project to cart"""
        project = request.env['artwork.project'].sudo().search([('uuid', '=', project_uuid)], limit=1)
        
        if not project:
            return {'error': 'Project not found'}
        
        # Get or create sale order
        sale_order = request.website.sale_get_order(force_create=True)
        
        # Find artwork product
        product = request.env['product.product'].sudo().search([
            ('is_artwork_product', '=', True),
            ('artwork_template_type', '=', self._get_template_type(project.template_size))
        ], limit=1)
        
        if not product:
            return {'error': 'Product not found'}
        
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
        
        return {
            'success': True,
            'cart_quantity': sale_order.cart_quantity,
            'website_sale_order': sale_order.id,
        }
    
    def _get_garment_colors(self):
        """Get available garment colors"""
        return [
            {'value': '#000000', 'label': 'Black', 'cmyk': 'C:0 M:0 Y:0 K:100'},
            {'value': '#FFFFFF', 'label': 'White', 'cmyk': 'C:0 M:0 Y:0 K:0'},
            {'value': '#FF0000', 'label': 'Red', 'cmyk': 'C:0 M:100 Y:100 K:0'},
            {'value': '#00FF00', 'label': 'Green', 'cmyk': 'C:100 M:0 Y:100 K:0'},
            {'value': '#0000FF', 'label': 'Blue', 'cmyk': 'C:100 M:100 Y:0 K:0'},
            # Add more colors as needed
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