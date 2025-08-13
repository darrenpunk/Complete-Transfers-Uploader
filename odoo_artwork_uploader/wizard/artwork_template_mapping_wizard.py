from odoo import models, fields, api
from odoo.exceptions import UserError

class ArtworkTemplateMappingWizard(models.TransientModel):
    _name = 'artwork.template.mapping.wizard'
    _description = 'Artwork Template Mapping Configuration Wizard'
    
    @api.model
    def _get_unmapped_templates(self):
        """Get list of templates that don't have mappings yet"""
        all_templates = [
            'template-A3', 'template-A4', 'template-A5',
            'template-dtf-a3', 'template-dtf-a4',
            'template-uv-dtf-a3', 'template-uv-dtf-a4',
            'template-FOTLA3', 'template-FOTLA4',
            'template-sublimation-a3', 'template-sublimation-a4',
            'template-vinyl-a3', 'template-vinyl-a4',
            'template-vinyl-flock-a3', 'template-vinyl-flock-a4',
            'template-soft-shell-a3', 'template-soft-shell-a4',
            'template-reflective-a3', 'template-reflective-a4',
            'template-hi-viz-a3', 'template-hi-viz-a4',
            'template-glitter-a3', 'template-glitter-a4',
            'template-metallic-a3', 'template-metallic-a4',
            'template-holographic-a3', 'template-holographic-a4',
            'template-glow-in-dark-a3', 'template-glow-in-dark-a4',
            'template-puff-a3', 'template-puff-a4',
            'template-foil-a3', 'template-foil-a4',
            'template-photographic-a3', 'template-photographic-a4',
            'template-embroidery-badges-a3', 'template-embroidery-badges-a4',
            'template-applique-badges-a3', 'template-applique-badges-a4',
            'template-laser-cut-badges-a3', 'template-laser-cut-badges-a4',
            'template-woven-badges-a3', 'template-woven-badges-a4',
        ]
        
        existing_mappings = self.env['artwork.template.mapping'].search([]).mapped('template_id')
        unmapped = [t for t in all_templates if t not in existing_mappings]
        
        return unmapped
    
    mapping_line_ids = fields.One2many('artwork.template.mapping.wizard.line', 'wizard_id', string='Mappings')
    
    @api.model
    def default_get(self, fields):
        res = super().default_get(fields)
        
        # Create lines for unmapped templates
        unmapped_templates = self._get_unmapped_templates()
        lines = []
        
        for template in unmapped_templates:
            # Try to suggest a product based on template name
            suggested_product = self._suggest_product_for_template(template)
            
            lines.append((0, 0, {
                'template_id': template,
                'template_display_name': dict(self.env['artwork.template.mapping']._fields['template_id'].selection)[template],
                'product_id': suggested_product.id if suggested_product else False,
                'min_quantity': 10 if 'dtf' not in template else 1,
            }))
        
        res['mapping_line_ids'] = lines
        return res
    
    def _suggest_product_for_template(self, template_id):
        """Try to find a product that might match this template"""
        # Extract key parts from template ID
        template_parts = template_id.replace('template-', '').replace('-', ' ')
        
        # Search for products with matching names
        domain = [('sale_ok', '=', True)]
        
        # Add specific search terms based on template
        if 'dtf' in template_id.lower():
            domain.append(('name', 'ilike', 'DTF'))
        elif 'embroidery' in template_id:
            domain.append(('name', 'ilike', 'embroidery'))
        elif 'badge' in template_id:
            domain.append(('name', 'ilike', 'badge'))
        elif 'vinyl' in template_id:
            domain.append(('name', 'ilike', 'vinyl'))
        elif 'sublimation' in template_id:
            domain.append(('name', 'ilike', 'sublimation'))
        
        # Check for size
        if 'a3' in template_id.lower():
            domain.append(('name', 'ilike', 'A3'))
        elif 'a4' in template_id.lower():
            domain.append(('name', 'ilike', 'A4'))
        elif 'a5' in template_id.lower():
            domain.append(('name', 'ilike', 'A5'))
        
        products = self.env['product.product'].search(domain, limit=1)
        return products[0] if products else False
    
    def action_create_mappings(self):
        """Create the template mappings"""
        created_count = 0
        
        for line in self.mapping_line_ids:
            if line.product_id:
                self.env['artwork.template.mapping'].create({
                    'template_id': line.template_id,
                    'product_id': line.product_id.id,
                    'min_quantity': line.min_quantity,
                    'max_quantity': line.max_quantity,
                })
                created_count += 1
        
        if created_count == 0:
            raise UserError('No mappings were created. Please select products for at least one template.')
        
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': 'Success',
                'message': f'{created_count} template mapping(s) created successfully.',
                'type': 'success',
                'sticky': False,
            }
        }


class ArtworkTemplateMappingWizardLine(models.TransientModel):
    _name = 'artwork.template.mapping.wizard.line'
    _description = 'Artwork Template Mapping Wizard Line'
    
    wizard_id = fields.Many2one('artwork.template.mapping.wizard', required=True, ondelete='cascade')
    template_id = fields.Char('Template ID', required=True)
    template_display_name = fields.Char('Template Name', readonly=True)
    product_id = fields.Many2one('product.product', string='Product', domain=[('sale_ok', '=', True)])
    min_quantity = fields.Integer('Min Quantity', default=10)
    max_quantity = fields.Integer('Max Quantity')