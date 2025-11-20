from odoo import models, fields, api

class SaleOrder(models.Model):
    _inherit = 'sale.order'
    
    artwork_project_ids = fields.One2many('artwork.project', 'sale_order_id', string='Artwork Projects')
    has_artwork_products = fields.Boolean('Has Artwork Products', compute='_compute_has_artwork_products')
    
    @api.depends('order_line.product_id.is_artwork_product')
    def _compute_has_artwork_products(self):
        for order in self:
            order.has_artwork_products = any(line.product_id.is_artwork_product for line in order.order_line)


class SaleOrderLine(models.Model):
    _inherit = 'sale.order.line'
    
    artwork_project_id = fields.Many2one('artwork.project', string='Artwork Project')
    
    # Related fields for easy access to artwork PDF and details
    artwork_pdf_file = fields.Binary('Artwork PDF', related='artwork_project_id.pdf_file', readonly=True)
    artwork_pdf_filename = fields.Char('Artwork PDF Filename', related='artwork_project_id.pdf_filename', readonly=True)
    artwork_comments = fields.Text('Artwork Comments', related='artwork_project_id.project_comments', readonly=True)
    artwork_garment_colors = fields.Text('Garment Colors', compute='_compute_artwork_garment_colors', store=True)
    
    @api.depends('artwork_project_id', 'artwork_project_id.garment_colors_json', 'artwork_project_id.garment_color_name')
    def _compute_artwork_garment_colors(self):
        """Compute formatted garment colors text for display"""
        for line in self:
            if line.artwork_project_id:
                line.artwork_garment_colors = line._get_garment_colors_text(line.artwork_project_id)
            else:
                line.artwork_garment_colors = ''
    
    @api.onchange('artwork_project_id')
    def _onchange_artwork_project_id(self):
        if self.artwork_project_id:
            self.product_uom_qty = self.artwork_project_id.quantity
            self.price_unit = self.artwork_project_id.price_unit
            # Add comments and garment colors to the order line
            self._update_artwork_comments()
    
    def _update_artwork_comments(self):
        """Update the order line comments with artwork project details"""
        if not self.artwork_project_id:
            return
            
        project = self.artwork_project_id
        comments = []
        
        # Add project comments if available
        if project.project_comments:
            comments.append(f"Project Comments: {project.project_comments}")
        
        # Add garment colors (exact format: "10 Black\n5 Gold" for multi-color)
        garment_colors = self._get_garment_colors_text(project)
        if garment_colors:
            comments.append(garment_colors)  # No prefix - exact format
        
        # Add ink color if available
        if project.ink_color_name:
            comments.append(f"Ink Color: {project.ink_color_name}")
        
        # Add template information
        template_display = dict(project._fields['template_size'].selection).get(project.template_size, project.template_size)
        comments.append(f"Template: {template_display}")
        
        # Update the name field (which serves as comments in order lines)
        if comments:
            base_name = self.product_id.name if self.product_id else self.name or ''
            self.name = f"{base_name}\n\n" + "\n".join(comments)
    
    def _get_garment_colors_text(self, project):
        """
        Extract and format garment colors text with quantities
        Returns: "10 Black, 5 Gold, 3 White" format for multi-color orders
        """
        colors_text = []
        
        # Check for multiple colors in JSON field
        if project.garment_colors_json:
            try:
                import json
                colors_data = json.loads(project.garment_colors_json)
                if isinstance(colors_data, list) and len(colors_data) > 0:
                    # Multi-color format: "quantity colorName"
                    for color_info in colors_data:
                        if isinstance(color_info, dict):
                            quantity = color_info.get('quantity', 1)
                            color_name = color_info.get('colorName', color_info.get('name', 'Unknown'))
                            colors_text.append(f"{quantity} {color_name}")
                        elif isinstance(color_info, str):
                            colors_text.append(color_info)
                    return "\n".join(colors_text)
            except (json.JSONDecodeError, TypeError):
                pass
        
        # Fallback to single garment color
        if not colors_text and project.garment_color_name:
            quantity = project.total_quantity or project.quantity or 1
            return f"{quantity} {project.garment_color_name}"
        elif not colors_text and project.garment_color:
            return project.garment_color
        
        return ""