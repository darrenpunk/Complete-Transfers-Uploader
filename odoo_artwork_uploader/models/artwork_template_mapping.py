from odoo import models, fields, api

class ArtworkTemplateMapping(models.Model):
    _name = 'artwork.template.mapping'
    _description = 'Artwork Template to Product Mapping'
    _rec_name = 'template_id'
    
    template_id = fields.Selection([
        ('template-A3', 'A3'),
        ('template-A4', 'A4'),
        ('template-A5', 'A5'),
        ('template-dtf-a3', 'DTF A3'),
        ('template-dtf-a4', 'DTF A4'),
        ('template-uv-dtf-a3', 'UV DTF A3'),
        ('template-uv-dtf-a4', 'UV DTF A4'),
        ('template-FOTLA3', 'FOTL A3'),
        ('template-FOTLA4', 'FOTL A4'),
        ('template-sublimation-a3', 'Sublimation A3'),
        ('template-sublimation-a4', 'Sublimation A4'),
        ('template-vinyl-a3', 'Vinyl A3'),
        ('template-vinyl-a4', 'Vinyl A4'),
        ('template-vinyl-flock-a3', 'Vinyl Flock A3'),
        ('template-vinyl-flock-a4', 'Vinyl Flock A4'),
        ('template-soft-shell-a3', 'Soft Shell A3'),
        ('template-soft-shell-a4', 'Soft Shell A4'),
        ('template-reflective-a3', 'Reflective A3'),
        ('template-reflective-a4', 'Reflective A4'),
        ('template-hi-viz-a3', 'Hi Viz A3'),
        ('template-hi-viz-a4', 'Hi Viz A4'),
        ('template-glitter-a3', 'Glitter A3'),
        ('template-glitter-a4', 'Glitter A4'),
        ('template-metallic-a3', 'Metallic A3'),
        ('template-metallic-a4', 'Metallic A4'),
        ('template-holographic-a3', 'Holographic A3'),
        ('template-holographic-a4', 'Holographic A4'),
        ('template-glow-in-dark-a3', 'Glow in Dark A3'),
        ('template-glow-in-dark-a4', 'Glow in Dark A4'),
        ('template-puff-a3', 'Puff A3'),
        ('template-puff-a4', 'Puff A4'),
        ('template-foil-a3', 'Foil A3'),
        ('template-foil-a4', 'Foil A4'),
        ('template-photographic-a3', 'Photographic A3'),
        ('template-photographic-a4', 'Photographic A4'),
        ('template-embroidery-badges-a3', 'Embroidery Badges A3'),
        ('template-embroidery-badges-a4', 'Embroidery Badges A4'),
        ('template-applique-badges-a3', 'Applique Badges A3'),
        ('template-applique-badges-a4', 'Applique Badges A4'),
        ('template-laser-cut-badges-a3', 'Laser Cut Badges A3'),
        ('template-laser-cut-badges-a4', 'Laser Cut Badges A4'),
        ('template-woven-badges-a3', 'Woven Badges A3'),
        ('template-woven-badges-a4', 'Woven Badges A4'),
    ], string='Template ID', required=True)
    
    product_id = fields.Many2one('product.product', string='Product', required=True, 
                                 help='The product in your Odoo catalog that corresponds to this template')
    
    active = fields.Boolean('Active', default=True)
    
    # Additional fields for flexibility
    min_quantity = fields.Integer('Minimum Quantity', default=10,
                                  help='Minimum quantity required for this template')
    max_quantity = fields.Integer('Maximum Quantity',
                                  help='Maximum quantity allowed (leave empty for no limit)')
    
    notes = fields.Text('Notes', help='Additional notes about this mapping')
    
    _sql_constraints = [
        ('template_unique', 'unique(template_id)', 'Each template can only be mapped once!'),
    ]
    
    @api.model
    def get_product_for_template(self, template_id):
        """Get the mapped product for a given template ID"""
        mapping = self.search([('template_id', '=', template_id), ('active', '=', True)], limit=1)
        if mapping:
            return mapping.product_id
        return False
    
    @api.model
    def get_min_quantity_for_template(self, template_id):
        """Get the minimum quantity for a given template ID"""
        mapping = self.search([('template_id', '=', template_id), ('active', '=', True)], limit=1)
        if mapping:
            return mapping.min_quantity
        return 10  # Default minimum