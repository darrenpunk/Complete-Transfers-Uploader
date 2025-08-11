from odoo import models, fields, api
from odoo.exceptions import ValidationError

class ProductTemplate(models.Model):
    _inherit = 'product.template'
    
    is_artwork_product = fields.Boolean('Is Artwork Product', default=False)
    artwork_template_type = fields.Selection([
        ('full_colour', 'Full Colour Transfers'),
        ('single_colour', 'Single Colour Transfers'),
        ('dtf', 'DTF Transfers'),
        ('uv_dtf', 'UV DTF Transfers'),
        ('sublimation', 'Sublimation'),
        ('vinyl', 'Vinyl'),
        ('special_effects', 'Special Effects'),
        ('badges', 'Badges & Embroidery'),
    ], string='Artwork Template Type')
    
    min_quantity = fields.Integer('Minimum Quantity', default=10)
    max_upload_size_mb = fields.Integer('Max Upload Size (MB)', default=200)
    
    # Pricing tiers
    price_tier_ids = fields.One2many('product.price.tier', 'product_tmpl_id', string='Price Tiers')


class ProductPriceTier(models.Model):
    _name = 'product.price.tier'
    _description = 'Product Price Tier'
    _order = 'min_quantity'
    
    product_tmpl_id = fields.Many2one('product.template', string='Product', required=True, ondelete='cascade')
    min_quantity = fields.Integer('Minimum Quantity', required=True)
    max_quantity = fields.Integer('Maximum Quantity')
    price_unit = fields.Float('Unit Price', required=True)
    
    @api.constrains('min_quantity', 'max_quantity')
    def _check_quantity_ranges(self):
        for record in self:
            if record.max_quantity and record.min_quantity > record.max_quantity:
                raise ValidationError("Minimum quantity cannot be greater than maximum quantity")