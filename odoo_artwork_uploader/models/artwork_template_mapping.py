from odoo import models, fields, api
from odoo.exceptions import ValidationError

class ArtworkTemplateMapping(models.Model):
    _name = 'artwork.template.mapping'
    _description = 'Artwork Template to Product Mapping'
    _order = 'template_id, sequence'
    
    name = fields.Char('Name', compute='_compute_name', store=True)
    template_id = fields.Selection([
        ('template-A3', 'A3 (297×420mm)'),
        ('template-A4', 'A4 (210×297mm)'),
        ('template-A5', 'A5 (148×210mm)'),
        ('template-dtf-a3', 'DTF A3'),
        ('template-dtf-a4', 'DTF A4'),
        ('template-uv-dtf-a3', 'UV DTF A3'),
        ('template-uv-dtf-a4', 'UV DTF A4'),
        ('template-FOTLA3', 'Fruit of the Loom A3'),
        ('template-FOTLA4', 'Fruit of the Loom A4'),
        ('template-sublimation-a3', 'Sublimation A3'),
        ('template-sublimation-a4', 'Sublimation A4'),
        ('template-vinyl-a3', 'Vinyl Flex A3'),
        ('template-vinyl-a4', 'Vinyl Flex A4'),
        ('template-vinyl-flock-a3', 'Vinyl Flock A3'),
        ('template-vinyl-flock-a4', 'Vinyl Flock A4'),
        ('template-soft-shell-a3', 'Soft Shell A3'),
        ('template-soft-shell-a4', 'Soft Shell A4'),
        ('template-reflective-a3', 'Reflective A3'),
        ('template-reflective-a4', 'Reflective A4'),
        ('template-hi-viz-a3', 'Hi-Viz A3'),
        ('template-hi-viz-a4', 'Hi-Viz A4'),
        ('template-glitter-a3', 'Glitter A3'),
        ('template-glitter-a4', 'Glitter A4'),
        ('template-metallic-a3', 'Metallic A3'),
        ('template-metallic-a4', 'Metallic A4'),
        ('template-holographic-a3', 'Holographic A3'),
        ('template-holographic-a4', 'Holographic A4'),
        ('template-glow-in-dark-a3', 'Glow in the Dark A3'),
        ('template-glow-in-dark-a4', 'Glow in the Dark A4'),
        ('template-puff-a3', 'Puff A3'),
        ('template-puff-a4', 'Puff A4'),
        ('template-foil-a3', 'Foil A3'),
        ('template-foil-a4', 'Foil A4'),
        ('template-photographic-a3', 'Photographic A3'),
        ('template-photographic-a4', 'Photographic A4'),
        ('template-embroidery-badges-a3', 'Embroidery Badges A3'),
        ('template-embroidery-badges-a4', 'Embroidery Badges A4'),
        ('template-applique-badges-a3', 'Applique Badges & Embroidery A3'),
        ('template-applique-badges-a4', 'Applique Badges & Embroidery A4'),
        ('template-laser-cut-badges-a3', 'Laser Cut Badges A3'),
        ('template-laser-cut-badges-a4', 'Laser Cut Badges A4'),
        ('template-woven-badges-a3', 'Woven Badges A3'),
        ('template-woven-badges-a4', 'Woven Badges A4'),
    ], string='Template', required=True)
    
    product_id = fields.Many2one('product.product', string='Product', required=True, 
                                domain=[('sale_ok', '=', True)])
    sequence = fields.Integer('Sequence', default=10)
    active = fields.Boolean('Active', default=True)
    
    # Template details
    template_width = fields.Float('Width (mm)', compute='_compute_template_dimensions')
    template_height = fields.Float('Height (mm)', compute='_compute_template_dimensions')
    template_category = fields.Selection([
        ('transfers', 'Transfers'),
        ('vinyl', 'Vinyl'),
        ('badges', 'Badges & Embroidery'),
        ('special', 'Special Effects'),
    ], string='Category', compute='_compute_template_category')
    
    @api.depends('template_id', 'product_id')
    def _compute_name(self):
        for record in self:
            if record.template_id and record.product_id:
                template_name = dict(record._fields['template_id'].selection).get(record.template_id, record.template_id)
                record.name = f"{template_name} → {record.product_id.name}"
            else:
                record.name = "Template Mapping"
    
    @api.depends('template_id')
    def _compute_template_dimensions(self):
        dimensions = {
            'template-A3': (297, 420),
            'template-A4': (210, 297),
            'template-A5': (148, 210),
            'template-dtf-a3': (297, 420),
            'template-dtf-a4': (210, 297),
            'template-uv-dtf-a3': (297, 420),
            'template-uv-dtf-a4': (210, 297),
            'template-FOTLA3': (297, 420),
            'template-FOTLA4': (210, 297),
            'template-sublimation-a3': (297, 420),
            'template-sublimation-a4': (210, 297),
            'template-vinyl-a3': (297, 420),
            'template-vinyl-a4': (210, 297),
            'template-vinyl-flock-a3': (297, 420),
            'template-vinyl-flock-a4': (210, 297),
            'template-soft-shell-a3': (297, 420),
            'template-soft-shell-a4': (210, 297),
            'template-reflective-a3': (297, 420),
            'template-reflective-a4': (210, 297),
            'template-hi-viz-a3': (297, 420),
            'template-hi-viz-a4': (210, 297),
            'template-glitter-a3': (297, 420),
            'template-glitter-a4': (210, 297),
            'template-metallic-a3': (297, 420),
            'template-metallic-a4': (210, 297),
            'template-holographic-a3': (297, 420),
            'template-holographic-a4': (210, 297),
            'template-glow-in-dark-a3': (297, 420),
            'template-glow-in-dark-a4': (210, 297),
            'template-puff-a3': (297, 420),
            'template-puff-a4': (210, 297),
            'template-foil-a3': (297, 420),
            'template-foil-a4': (210, 297),
            'template-photographic-a3': (297, 420),
            'template-photographic-a4': (210, 297),
            'template-embroidery-badges-a3': (297, 420),
            'template-embroidery-badges-a4': (210, 297),
            'template-applique-badges-a3': (297, 420),
            'template-applique-badges-a4': (210, 297),
            'template-laser-cut-badges-a3': (297, 420),
            'template-laser-cut-badges-a4': (210, 297),
            'template-woven-badges-a3': (297, 420),
            'template-woven-badges-a4': (210, 297),
        }
        
        for record in self:
            if record.template_id in dimensions:
                width, height = dimensions[record.template_id]
                record.template_width = width
                record.template_height = height
            else:
                record.template_width = 297
                record.template_height = 420
    
    @api.depends('template_id')
    def _compute_template_category(self):
        categories = {
            'template-A3': 'transfers',
            'template-A4': 'transfers',
            'template-A5': 'transfers',
            'template-dtf-a3': 'transfers',
            'template-dtf-a4': 'transfers',
            'template-uv-dtf-a3': 'transfers',
            'template-uv-dtf-a4': 'transfers',
            'template-FOTLA3': 'transfers',
            'template-FOTLA4': 'transfers',
            'template-sublimation-a3': 'transfers',
            'template-sublimation-a4': 'transfers',
            'template-vinyl-a3': 'vinyl',
            'template-vinyl-a4': 'vinyl',
            'template-vinyl-flock-a3': 'vinyl',
            'template-vinyl-flock-a4': 'vinyl',
            'template-soft-shell-a3': 'vinyl',
            'template-soft-shell-a4': 'vinyl',
            'template-reflective-a3': 'special',
            'template-reflective-a4': 'special',
            'template-hi-viz-a3': 'special',
            'template-hi-viz-a4': 'special',
            'template-glitter-a3': 'special',
            'template-glitter-a4': 'special',
            'template-metallic-a3': 'special',
            'template-metallic-a4': 'special',
            'template-holographic-a3': 'special',
            'template-holographic-a4': 'special',
            'template-glow-in-dark-a3': 'special',
            'template-glow-in-dark-a4': 'special',
            'template-puff-a3': 'special',
            'template-puff-a4': 'special',
            'template-foil-a3': 'special',
            'template-foil-a4': 'special',
            'template-photographic-a3': 'transfers',
            'template-photographic-a4': 'transfers',
            'template-embroidery-badges-a3': 'badges',
            'template-embroidery-badges-a4': 'badges',
            'template-applique-badges-a3': 'badges',
            'template-applique-badges-a4': 'badges',
            'template-laser-cut-badges-a3': 'badges',
            'template-laser-cut-badges-a4': 'badges',
            'template-woven-badges-a3': 'badges',
            'template-woven-badges-a4': 'badges',
        }
        
        for record in self:
            record.template_category = categories.get(record.template_id, 'transfers')
    
    @api.constrains('template_id', 'product_id')
    def _check_unique_mapping(self):
        for record in self:
            if record.template_id:
                existing = self.search([
                    ('template_id', '=', record.template_id),
                    ('id', '!=', record.id),
                    ('active', '=', True)
                ])
                if existing:
                    raise ValidationError(f"Template {record.template_id} is already mapped to another product.")
    
    @api.model
    def get_product_for_template(self, template_id):
        """Get the product mapped to a specific template"""
        mapping = self.search([
            ('template_id', '=', template_id),
            ('active', '=', True)
        ], limit=1)
        return mapping.product_id if mapping else False
    
    @api.model
    def get_available_templates(self):
        """Get list of all available templates with their mappings"""
        all_templates = dict(self._fields['template_id'].selection)
        mapped_templates = self.search([('active', '=', True)])
        
        result = []
        for template_id, template_name in all_templates.items():
            mapping = mapped_templates.filtered(lambda m: m.template_id == template_id)
            result.append({
                'id': template_id,
                'name': template_name,
                'mapped': bool(mapping),
                'product_id': mapping.product_id.id if mapping else False,
                'product_name': mapping.product_id.name if mapping else False,
                'category': mapping.template_category if mapping else 'transfers',
                'width': mapping.template_width if mapping else 297,
                'height': mapping.template_height if mapping else 420,
            })
        
        return result


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