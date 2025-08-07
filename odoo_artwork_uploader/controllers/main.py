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
    
    @http.route('/artwork/api/projects/<string:project_uuid>', type='json', auth='public', methods=['GET'], csrf=False)
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
    
    @http.route('/artwork/api/projects/<string:project_uuid>', type='json', auth='public', methods=['PATCH'], csrf=False)
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
        
        try:
            # Import PDF generator with error handling
            try:
                from ..lib.pdf_generator import OdooPDFGenerator
            except ImportError:
                # Fallback if PDF generator not available
                OdooPDFGenerator = None
            
            # Prepare project data
            project_data = {
                'project_id': project.uuid,
                'template_size': {
                    'name': project.template_size,
                    'width': project.template_width,
                    'height': project.template_height,
                },
                'canvas_elements': [],
                'logos': [],
                'garment_color': project.garment_color,
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
    
    @http.route('/artwork/api/projects/<string:project_uuid>/add-to-cart', type='json', auth='public', methods=['POST'], csrf=False)
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