from odoo import models, fields, api
from odoo.exceptions import UserError

class ArtworkTemplateMappingWizard(models.TransientModel):
    _name = 'artwork.template.mapping.wizard'
    _description = 'Artwork Template Mapping Configuration Wizard'
    
    @api.model
    def _get_unmapped_templates(self):
        """Get list of template definitions that don't have mappings yet"""
        existing_mappings = self.env['artwork.template.mapping'].search([]).mapped('template_definition_id')
        unmapped = self.env['artwork.template.definition'].search([
            ('id', 'not in', existing_mappings.ids),
            ('active', '=', True)
        ])
        return unmapped
    
    mapping_line_ids = fields.One2many('artwork.template.mapping.wizard.line', 'wizard_id', string='Mappings')
    
    @api.model
    def default_get(self, fields):
        res = super().default_get(fields)
        
        unmapped_templates = self._get_unmapped_templates()
        lines = []
        
        for template in unmapped_templates:
            suggested_product = self._suggest_product_for_template(template)
            
            default_min_qty = 1 if template.category in ['dtf', 'uvdtf', 'sublimation'] else 10
            
            lines.append((0, 0, {
                'template_definition_id': template.id,
                'product_id': suggested_product.id if suggested_product else False,
                'min_quantity': default_min_qty,
            }))
        
        res['mapping_line_ids'] = lines
        return res
    
    def _suggest_product_for_template(self, template):
        """Try to find a product that might match this template"""
        domain = [('sale_ok', '=', True)]
        
        if template.category == 'dtf':
            domain.append(('name', 'ilike', 'DTF'))
        elif template.category == 'uvdtf':
            domain.append(('name', 'ilike', 'UV'))
        elif template.category == 'sublimation':
            domain.append(('name', 'ilike', 'sublimation'))
        elif template.category == 'reflective':
            domain.append(('name', 'ilike', 'reflective'))
        elif template.category == 'metallic':
            domain.append(('name', 'ilike', 'metallic'))
        elif template.category == 'single_colour':
            domain.append(('name', 'ilike', 'single'))
        elif template.category == 'zero':
            domain.append(('name', 'ilike', 'zero'))
        elif template.category == 'woven':
            domain.append(('name', 'ilike', 'woven'))
        elif template.category == 'applique':
            domain.append(('name', 'ilike', 'applique'))
        elif template.category == 'hd':
            domain.append(('name', 'ilike', 'HD'))
        elif template.category == 'full_colour':
            domain.append(('name', 'ilike', 'full'))
        
        template_id_lower = template.template_id.lower() if template.template_id else ''
        if 'a3' in template_id_lower:
            domain.append(('name', 'ilike', 'A3'))
        elif 'a4' in template_id_lower:
            domain.append(('name', 'ilike', 'A4'))
        elif 'a5' in template_id_lower:
            domain.append(('name', 'ilike', 'A5'))
        elif 'a6' in template_id_lower:
            domain.append(('name', 'ilike', 'A6'))
        elif 'sra3' in template_id_lower:
            domain.append(('name', 'ilike', 'SRA3'))
        
        products = self.env['product.product'].search(domain, limit=1)
        return products[0] if products else False
    
    def action_create_mappings(self):
        """Create the template mappings"""
        created_count = 0
        
        for line in self.mapping_line_ids:
            if line.product_id and line.template_definition_id:
                self.env['artwork.template.mapping'].create({
                    'template_definition_id': line.template_definition_id.id,
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
    template_definition_id = fields.Many2one('artwork.template.definition', string='Template', required=True)
    template_id = fields.Char(related='template_definition_id.template_id', string='Template ID', readonly=True)
    template_name = fields.Char(related='template_definition_id.name', string='Template Name', readonly=True)
    template_category = fields.Selection(related='template_definition_id.category', string='Category', readonly=True)
    product_id = fields.Many2one('product.product', string='Product', domain=[('sale_ok', '=', True)])
    min_quantity = fields.Integer('Min Quantity', default=10)
    max_quantity = fields.Integer('Max Quantity')
