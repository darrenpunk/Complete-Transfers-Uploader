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
        
        # Add garment colors
        garment_colors = self._get_garment_colors_text(project)
        if garment_colors:
            comments.append(f"Garment Colors: {garment_colors}")
        
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
        """Extract and format garment colors text"""
        colors_text = []
        
        # Check for multiple colors in JSON field
        if project.garment_colors_json:
            try:
                import json
                colors_data = json.loads(project.garment_colors_json)
                if isinstance(colors_data, list):
                    for color_info in colors_data:
                        if isinstance(color_info, dict) and 'name' in color_info:
                            colors_text.append(color_info['name'])
                        elif isinstance(color_info, str):
                            colors_text.append(color_info)
            except (json.JSONDecodeError, TypeError):
                pass
        
        # Fallback to single garment color
        if not colors_text and project.garment_color_name:
            colors_text.append(project.garment_color_name)
        elif not colors_text and project.garment_color:
            colors_text.append(project.garment_color)
        
        return ", ".join(colors_text) if colors_text else ""