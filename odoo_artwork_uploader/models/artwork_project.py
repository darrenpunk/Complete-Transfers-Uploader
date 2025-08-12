from odoo import models, fields, api
from odoo.exceptions import UserError
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
    
    # Multiple garment colors support
    garment_colors_json = fields.Text('Garment Colors JSON', help='JSON array of selected garment colors')
    
    # Ink color for single color templates
    ink_color = fields.Char('Ink Color')
    ink_color_name = fields.Char('Ink Color Name')
    
    # Comments section
    project_comments = fields.Text('Project Comments', help='Additional comments for this project')
    
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
    
    def write(self, vals):
        """Override write to update sale order line comments when project is modified"""
        result = super().write(vals)
        
        # Update sale order line comments if relevant fields changed
        comment_fields = ['project_comments', 'garment_color', 'garment_color_name', 
                         'garment_colors_json', 'ink_color', 'ink_color_name', 'template_size']
        
        if any(field in vals for field in comment_fields):
            for project in self:
                sale_lines = self.env['sale.order.line'].sudo().search([
                    ('artwork_project_id', '=', project.id)
                ])
                for line in sale_lines:
                    line._update_artwork_comments()
        
        return result
    
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
                width, height = dimensions[record.template_size]
                record.template_width = width
                record.template_height = height
            else:
                record.template_width = 297  # Default A3 width
                record.template_height = 420  # Default A3 height

    @api.depends('template_size', 'quantity')
    def _compute_price(self):
        """Compute pricing based on template and quantity"""
        # Base pricing structure
        base_prices = {
            'template-A3': 5.50,
            'template-A4': 4.50,
            'template-A5': 3.50,
            'template-dtf-a3': 6.00,
            'template-dtf-a4': 5.00,
            'template-uv-dtf-a3': 7.50,
            'template-uv-dtf-a4': 6.50,
            'template-FOTLA3': 5.50,
            'template-FOTLA4': 4.50,
            'template-sublimation-a3': 6.50,
            'template-sublimation-a4': 5.50,
            'template-vinyl-a3': 4.50,
            'template-vinyl-a4': 3.50,
            'template-vinyl-flock-a3': 5.00,
            'template-vinyl-flock-a4': 4.00,
            'template-soft-shell-a3': 8.50,
            'template-soft-shell-a4': 7.50,
            'template-reflective-a3': 9.50,
            'template-reflective-a4': 8.50,
            'template-hi-viz-a3': 10.50,
            'template-hi-viz-a4': 9.50,
            'template-glitter-a3': 7.50,
            'template-glitter-a4': 6.50,
            'template-metallic-a3': 8.00,
            'template-metallic-a4': 7.00,
            'template-holographic-a3': 9.00,
            'template-holographic-a4': 8.00,
            'template-glow-in-dark-a3': 11.50,
            'template-glow-in-dark-a4': 10.50,
            'template-puff-a3': 7.00,
            'template-puff-a4': 6.00,
            'template-foil-a3': 12.50,
            'template-foil-a4': 11.50,
            'template-photographic-a3': 8.50,
            'template-photographic-a4': 7.50,
            'template-embroidery-badges-a3': 15.00,
            'template-embroidery-badges-a4': 12.00,
            'template-applique-badges-a3': 18.00,
            'template-applique-badges-a4': 15.00,
            'template-laser-cut-badges-a3': 20.00,
            'template-laser-cut-badges-a4': 17.00,
            'template-woven-badges-a3': 16.00,
            'template-woven-badges-a4': 13.00,
        }
        
        for record in self:
            base_price = base_prices.get(record.template_size, 5.50)
            
            # Quantity discounts
            if record.quantity >= 100:
                discount = 0.15  # 15% discount
            elif record.quantity >= 50:
                discount = 0.10  # 10% discount
            elif record.quantity >= 25:
                discount = 0.05  # 5% discount
            else:
                discount = 0.0
            
            record.price_unit = base_price * (1 - discount)
            record.price_total = record.price_unit * record.quantity

    def action_confirm(self):
        """Confirm the project"""
        self.state = 'confirmed'
        
    def action_cancel(self):
        """Cancel the project"""
        self.state = 'cancelled'
        
    def action_done(self):
        """Mark project as done"""
        self.state = 'done'

    def action_reset_to_draft(self):
        """Reset to draft state"""
        self.state = 'draft'

    def get_project_data(self):
        """Get project data as dict for API responses"""
        self.ensure_one()
        
        # Parse garment colors JSON if available
        garment_colors = []
        if self.garment_colors_json:
            try:
                garment_colors = json.loads(self.garment_colors_json)
            except (json.JSONDecodeError, TypeError):
                pass
        
        return {
            'id': self.uuid,
            'name': self.name,
            'templateSize': self.template_size,
            'templateWidth': self.template_width,
            'templateHeight': self.template_height,
            'garmentColor': self.garment_color,
            'garmentColorName': self.garment_color_name,
            'garmentColors': garment_colors,
            'inkColor': self.ink_color,
            'inkColorName': self.ink_color_name,
            'comments': self.project_comments,
            'quantity': self.quantity,
            'priceUnit': self.price_unit,
            'priceTotal': self.price_total,
            'state': self.state,
            'canvasData': self.canvas_data,
        }