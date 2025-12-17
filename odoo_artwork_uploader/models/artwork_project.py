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
    
    # Template information - accepts any template ID from Replit app
    # Using Char field instead of Selection to accept all template IDs dynamically
    template_size = fields.Char('Template Size', required=True, help='Template ID from artwork uploader')
    
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
    total_quantity = fields.Integer('Total Quantity', help='Sum of all garment color quantities for multi-color orders')
    price_total = fields.Float('Total Price', compute='_compute_price', store=True)
    
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
        """Compute template dimensions from template definition or known patterns"""
        for record in self:
            if not record.template_size:
                record.template_width = 297
                record.template_height = 420
                continue
            
            # Try to get dimensions from template definition
            template_def = self.env['artwork.template.definition'].sudo().search([
                ('template_id', '=', record.template_size)
            ], limit=1)
            
            if template_def:
                record.template_width = template_def.width_mm
                record.template_height = template_def.height_mm
            else:
                # Fallback: Parse dimensions from template ID patterns
                template = record.template_size.lower()
                if 'a2' in template:
                    record.template_width, record.template_height = 420, 594
                elif 'a3' in template or 'sra3' in template:
                    record.template_width, record.template_height = 297, 420
                elif 'a4' in template:
                    record.template_width, record.template_height = 210, 297
                elif 'a5' in template:
                    record.template_width, record.template_height = 148, 210
                elif 'a6' in template:
                    record.template_width, record.template_height = 105, 148
                elif 'large' in template or '1000' in template:
                    record.template_width, record.template_height = 1000, 550
                elif '295x300' in template:
                    record.template_width, record.template_height = 295, 300
                elif 'transfer-size' in template or '295x100' in template:
                    record.template_width, record.template_height = 295, 100
                elif 'square' in template or '95x95' in template:
                    record.template_width, record.template_height = 95, 95
                elif 'badge' in template or '100x70' in template:
                    record.template_width, record.template_height = 100, 70
                elif 'small' in template or '60x60' in template:
                    record.template_width, record.template_height = 60, 60
                elif 'mug' in template:
                    record.template_width, record.template_height = 230, 95
                else:
                    # Default to A3
                    record.template_width, record.template_height = 297, 420
    
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
            # Handle case where template_size is False or None
            template_size = record.template_size or ''
            
            if 'A3' in template_size:
                base_price = base_prices['A3']
            elif 'A4' in template_size:
                base_price = base_prices['A4']
            elif 'A5' in template_size:
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
        
        # Find mapped product for this template
        product = self.env['artwork.template.mapping'].get_product_for_template(self.template_size)
        
        if not product:
            raise UserError('No product mapped for this template. Please configure template mappings.')
        
        # Update project with product
        self.product_id = product
        
        # Create sale order line with the artwork product
        # This would integrate with website_sale
        return True