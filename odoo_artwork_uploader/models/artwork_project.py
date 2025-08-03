from odoo import models, fields, api
import json
import uuid

class ArtworkProject(models.Model):
    _name = 'artwork.project'
    _description = 'Artwork Design Project'
    _inherit = ['mail.thread', 'mail.activity.mixin']
    _order = 'create_date desc'
    
    name = fields.Char('Project Name', required=True, tracking=True)
    uuid = fields.Char('UUID', default=lambda self: str(uuid.uuid4()), readonly=True, copy=False)
    
    # Template information
    template_size = fields.Selection([
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
    ], string='Template Size', required=True)
    
    template_width = fields.Float('Template Width (mm)', compute='_compute_template_dimensions', store=True)
    template_height = fields.Float('Template Height (mm)', compute='_compute_template_dimensions', store=True)
    
    # Garment color
    garment_color = fields.Char('Garment Color', default='#000000')
    garment_color_name = fields.Char('Garment Color Name')
    
    # Ink color for single color templates
    ink_color = fields.Char('Ink Color')
    ink_color_name = fields.Char('Ink Color Name')
    
    # Canvas data
    canvas_data = fields.Text('Canvas Data', help='JSON data containing canvas state')
    
    # Related records
    logo_ids = fields.One2many('artwork.logo', 'project_id', string='Logos')
    canvas_element_ids = fields.One2many('artwork.canvas.element', 'project_id', string='Canvas Elements')
    
    # E-commerce integration
    partner_id = fields.Many2one('res.partner', string='Customer')
    sale_order_id = fields.Many2one('sale.order', string='Sale Order')
    product_id = fields.Many2one('product.product', string='Product')
    
    # Status
    state = fields.Selection([
        ('draft', 'Draft'),
        ('confirmed', 'Confirmed'),
        ('done', 'Done'),
        ('cancelled', 'Cancelled'),
    ], string='Status', default='draft', tracking=True)
    
    # Pricing
    price_unit = fields.Float('Unit Price', compute='_compute_price', store=True)
    quantity = fields.Integer('Quantity', default=10)
    price_total = fields.Float('Total Price', compute='_compute_price', store=True)
    
    # PDF
    pdf_file = fields.Binary('Generated PDF')
    pdf_filename = fields.Char('PDF Filename')
    
    @api.depends('template_size')
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
            if record.template_size in dimensions:
                record.template_width, record.template_height = dimensions[record.template_size]
            else:
                record.template_width = 297
                record.template_height = 420
    
    @api.depends('template_size', 'quantity')
    def _compute_price(self):
        # This would integrate with Odoo's pricelist system
        # For now, using simple pricing logic
        base_prices = {
            'A3': 20.00,
            'A4': 15.00,
            'A5': 10.00,
        }
        
        for record in self:
            if 'A3' in record.template_size:
                base_price = base_prices['A3']
            elif 'A4' in record.template_size:
                base_price = base_prices['A4']
            elif 'A5' in record.template_size:
                base_price = base_prices['A5']
            else:
                base_price = 20.00
            
            # Quantity discounts
            if record.quantity >= 100:
                base_price *= 0.8
            elif record.quantity >= 50:
                base_price *= 0.9
            
            record.price_unit = base_price
            record.price_total = base_price * record.quantity
    
    def action_confirm(self):
        self.ensure_one()
        self.state = 'confirmed'
        
    def action_cancel(self):
        self.ensure_one()
        self.state = 'cancelled'
        
    def action_done(self):
        self.ensure_one()
        self.state = 'done'
        
    def action_generate_pdf(self):
        """Generate PDF from the artwork project"""
        self.ensure_one()
        # This would call the PDF generation service
        # For now, just mark as done
        self.action_done()
        
    def action_add_to_cart(self):
        """Add the artwork project to cart"""
        self.ensure_one()
        # Create sale order line with the artwork product
        # This would integrate with website_sale
        return True