from odoo import models, fields, api

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