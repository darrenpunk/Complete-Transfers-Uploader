from odoo import models, fields, api
from odoo.exceptions import UserError

class ArtworkTemplateMappingWizard(models.TransientModel):
    _name = 'artwork.template.mapping.wizard'
    _description = 'Artwork Template Mapping Configuration Wizard'
    
    @api.model
    def _get_unmapped_templates(self):
        """Get list of templates that don't have mappings yet"""
        all_templates = [
            # Screen Printed Transfers - Full Colour (8 templates)
            'template-A3', 'template-A4', 'template-A5', 'template-A6',
            'template-transfer-size', 'template-square', 'template-badge', 'template-small',
            
            # Screen Printed Transfers - Full Colour Metallic (8 templates)
            'metallic-A3', 'metallic-A4', 'metallic-A5', 'metallic-A6',
            'metallic-transfer-size', 'metallic-square', 'metallic-badge', 'metallic-small',
            
            # Screen Printed Transfers - Full Colour HD (2 templates)
            'hd-A3', 'hd-A4',
            
            # Screen Printed Transfers - Single Colour (8 templates)
            'single-A3', 'single-A4', 'single-A5', 'single-A6',
            'single-transfer-size', 'single-square', 'single-badge', 'single-small',
            
            # Screen Printed Transfers - Zero (8 templates)
            'zero-A3', 'zero-A4', 'zero-A5', 'zero-A6',
            'zero-transfer-size', 'zero-square', 'zero-badge', 'zero-small',
            
            # Digital Transfers - DTF (2 templates)
            'dtf-SRA3', 'dtf-large',
            
            # Digital Transfers - UV DTF (1 template)
            'uvdtf-A3',
            
            # Digital Transfers - Custom Badges (4 templates)
            'woven-A6', 'woven-square', 'woven-badge', 'woven-small',
            
            # Digital Transfers - Applique Badges (4 templates)
            'applique-A6', 'applique-square', 'applique-badge', 'applique-small',
            
            # Screen Printed Transfers - Reflective (8 templates)
            'reflective-A3', 'reflective-A4', 'reflective-A5', 'reflective-A6',
            'reflective-transfer-size', 'reflective-square', 'reflective-badge', 'reflective-small',
            
            # Digital Transfers - Sublimation (12 templates)
            'sublimation-A2-fabric', 'sublimation-A3-fabric', 'sublimation-A4-fabric',
            'sublimation-A3', 'sublimation-A4', 'sublimation-mug',
            'sublimation-A5', 'sublimation-A6', 'sublimation-transfer-size',
            'sublimation-square', 'sublimation-badge', 'sublimation-small',
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
                'min_quantity': 1 if any(x in template for x in ['dtf', 'uvdtf', 'sublimation']) else 10,
            }))
        
        res['mapping_line_ids'] = lines
        return res
    
    def _suggest_product_for_template(self, template_id):
        """Try to find a product that might match this template"""
        # Search for products with matching names
        domain = [('sale_ok', '=', True)]
        
        # Add specific search terms based on template type
        if 'dtf' in template_id.lower():
            domain.append(('name', 'ilike', 'DTF'))
        elif 'uvdtf' in template_id.lower():
            domain.append(('name', 'ilike', 'UV'))
        elif 'sublimation' in template_id.lower():
            domain.append(('name', 'ilike', 'sublimation'))
        elif 'reflective' in template_id.lower():
            domain.append(('name', 'ilike', 'reflective'))
        elif 'metallic' in template_id.lower():
            domain.append(('name', 'ilike', 'metallic'))
        elif 'single' in template_id.lower():
            domain.append(('name', 'ilike', 'single'))
        elif 'zero' in template_id.lower():
            domain.append(('name', 'ilike', 'zero'))
        elif 'woven' in template_id.lower():
            domain.append(('name', 'ilike', 'woven'))
        elif 'applique' in template_id.lower():
            domain.append(('name', 'ilike', 'applique'))
        elif 'hd' in template_id.lower():
            domain.append(('name', 'ilike', 'HD'))
        elif 'template-' in template_id:  # Full colour templates
            domain.append(('name', 'ilike', 'full'))
        
        # Check for size patterns
        if 'a3' in template_id.lower():
            domain.append(('name', 'ilike', 'A3'))
        elif 'a4' in template_id.lower():
            domain.append(('name', 'ilike', 'A4'))
        elif 'a5' in template_id.lower():
            domain.append(('name', 'ilike', 'A5'))
        elif 'a6' in template_id.lower():
            domain.append(('name', 'ilike', 'A6'))
        elif 'sra3' in template_id.lower():
            domain.append(('name', 'ilike', 'SRA3'))
        elif 'transfer-size' in template_id:
            domain.append(('name', 'ilike', '295'))
        elif 'square' in template_id:
            domain.append(('name', 'ilike', '95'))
        elif 'badge' in template_id:
            domain.append(('name', 'ilike', '100'))
        elif 'small' in template_id:
            domain.append(('name', 'ilike', '60'))
        elif 'mug' in template_id:
            domain.append(('name', 'ilike', 'mug'))
        
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