from odoo import models, fields, api


class ArtworkTemplateMappingWizard(models.TransientModel):
    _name = 'artwork.template.mapping.wizard'
    _description = 'Artwork Template Mapping Setup Wizard'
    
    step = fields.Selection([
        ('intro', 'Introduction'),
        ('products', 'Select Products'),
        ('mapping', 'Map Templates'),
        ('confirm', 'Confirmation'),
    ], string='Step', default='intro')
    
    product_ids = fields.Many2many('product.product', string='Products', 
                                  domain=[('sale_ok', '=', True)])
    
    # Dynamic fields for mapping - these would be created based on selected products
    mapping_line_ids = fields.One2many('artwork.template.mapping.wizard.line', 'wizard_id', 
                                       string='Mapping Lines')
    
    def action_next_step(self):
        if self.step == 'intro':
            self.step = 'products'
        elif self.step == 'products':
            self._generate_mapping_lines()
            self.step = 'mapping'
        elif self.step == 'mapping':
            self.step = 'confirm'
        elif self.step == 'confirm':
            self._create_mappings()
            return self.action_close()
        
        return {
            'type': 'ir.actions.act_window',
            'res_model': 'artwork.template.mapping.wizard',
            'res_id': self.id,
            'view_mode': 'form',
            'target': 'new',
        }
    
    def action_previous_step(self):
        if self.step == 'products':
            self.step = 'intro'
        elif self.step == 'mapping':
            self.step = 'products'
        elif self.step == 'confirm':
            self.step = 'mapping'
        
        return {
            'type': 'ir.actions.act_window',
            'res_model': 'artwork.template.mapping.wizard',
            'res_id': self.id,
            'view_mode': 'form',
            'target': 'new',
        }
    
    def action_close(self):
        return {'type': 'ir.actions.act_window_close'}
    
    def _generate_mapping_lines(self):
        """Generate mapping lines based on selected products"""
        self.mapping_line_ids.unlink()
        
        # Get all template types
        templates = dict(self.env['artwork.template.mapping']._fields['template_id'].selection)
        
        lines = []
        for template_id, template_name in templates.items():
            lines.append((0, 0, {
                'wizard_id': self.id,
                'template_id': template_id,
                'template_name': template_name,
                'product_id': False,
            }))
        
        self.mapping_line_ids = lines
    
    def _create_mappings(self):
        """Create the actual template mappings"""
        for line in self.mapping_line_ids:
            if line.product_id:
                # Check if mapping already exists
                existing = self.env['artwork.template.mapping'].search([
                    ('template_id', '=', line.template_id)
                ])
                if existing:
                    existing.product_id = line.product_id
                else:
                    self.env['artwork.template.mapping'].create({
                        'template_id': line.template_id,
                        'product_id': line.product_id.id,
                    })


class ArtworkTemplateMappingWizardLine(models.TransientModel):
    _name = 'artwork.template.mapping.wizard.line'
    _description = 'Template Mapping Wizard Line'
    
    wizard_id = fields.Many2one('artwork.template.mapping.wizard', required=True, ondelete='cascade')
    template_id = fields.Char('Template ID', required=True)
    template_name = fields.Char('Template Name', required=True)
    product_id = fields.Many2one('product.product', string='Product', 
                                domain=[('sale_ok', '=', True)])