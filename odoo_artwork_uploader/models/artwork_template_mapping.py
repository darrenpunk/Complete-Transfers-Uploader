from odoo import models, fields, api

class ArtworkTemplateMapping(models.Model):
    _name = 'artwork.template.mapping'
    _description = 'Artwork Template to Product Mapping'
    _rec_name = 'template_definition_id'
    
    template_definition_id = fields.Many2one(
        'artwork.template.definition', 
        string='Template', 
        required=True,
        ondelete='restrict',
        help='Select the artwork template to map to a product'
    )
    
    template_id = fields.Char(
        related='template_definition_id.template_id',
        string='Template ID',
        store=True,
        readonly=True,
        help='The unique identifier for this template'
    )
    
    product_id = fields.Many2one(
        'product.product', 
        string='Product', 
        required=True,
        domain=[('sale_ok', '=', True)],
        help='The product in your Odoo catalog that corresponds to this template'
    )
    
    active = fields.Boolean('Active', default=True)
    
    min_quantity = fields.Integer(
        'Minimum Quantity', 
        default=10,
        help='Minimum quantity required for this template'
    )
    max_quantity = fields.Integer(
        'Maximum Quantity',
        help='Maximum quantity allowed (leave empty for no limit)'
    )
    
    notes = fields.Text('Notes', help='Additional notes about this mapping')
    
    _sql_constraints = [
        ('template_unique', 'unique(template_definition_id)', 
         'Each template can only be mapped once!'),
    ]
    
    @api.model
    def get_product_for_template(self, template_id):
        """Get the mapped product for a given template ID"""
        mapping = self.search([
            ('template_id', '=', template_id), 
            ('active', '=', True)
        ], limit=1)
        if mapping:
            return mapping.product_id
        return False
    
    @api.model
    def get_min_quantity_for_template(self, template_id):
        """Get the minimum quantity for a given template ID"""
        mapping = self.search([
            ('template_id', '=', template_id), 
            ('active', '=', True)
        ], limit=1)
        if mapping:
            return mapping.min_quantity
        return 10  # Default minimum
