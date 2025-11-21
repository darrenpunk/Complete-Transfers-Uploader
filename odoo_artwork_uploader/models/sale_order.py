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
    
    # Direct PDF storage on order line (optimized - no duplicate in artwork.project)
    artwork_pdf_file = fields.Binary('Artwork PDF', attachment=True, help='Production-ready PDF attached directly to order line')
    artwork_pdf_filename = fields.Char('Artwork PDF Filename', help='Filename for the artwork PDF')
    artwork_comments = fields.Text('Artwork Comments', related='artwork_project_id.project_comments', readonly=True)
    artwork_garment_colors = fields.Text('Garment Colors', compute='_compute_artwork_garment_colors', store=True)
    
    def write(self, vals):
        """Override write to sync PDF to manufacturing task when PDF is added"""
        import logging
        _logger = logging.getLogger(__name__)
        
        result = super().write(vals)
        
        # If PDF is being added/updated, sync it to any related manufacturing task
        if 'artwork_pdf_file' in vals and vals['artwork_pdf_file']:
            for line in self:
                if line.artwork_pdf_file:
                    # Find related manufacturing task
                    task = self.env['project.task'].sudo().search([
                        ('sale_line_id', '=', line.id),
                    ], limit=1)
                    
                    if task:
                        if not task.artwork_image:
                            # Attach PDF to task's artwork_image field (production workflow)
                            task.write({'artwork_image': line.artwork_pdf_file})
                            _logger.info(f"✅ PDF synced to manufacturing task #{task.id} from order line #{line.id}")
                        else:
                            _logger.info(f"ℹ️ Task #{task.id} already has artwork, skipping sync")
                    else:
                        _logger.warning(f"⚠️ No manufacturing task found for order line #{line.id} - will sync when task is created")
        
        return result
    
    @api.model
    def _cron_sync_artwork_pdfs_to_tasks(self):
        """Scheduled cron job to ensure eventual consistency of PDFs on manufacturing tasks
        
        Scans all order lines with PDFs and syncs them to related tasks if missing.
        This handles edge cases where timing issues prevent immediate sync.
        """
        import logging
        _logger = logging.getLogger(__name__)
        
        # Find all order lines with PDFs that have related tasks
        lines_with_pdfs = self.search([
            ('artwork_pdf_file', '!=', False),
        ])
        
        synced_count = 0
        skipped_count = 0
        error_count = 0
        
        for line in lines_with_pdfs:
            # Find related manufacturing task
            task = self.env['project.task'].sudo().search([
                ('sale_line_id', '=', line.id),
            ], limit=1)
            
            if task:
                # Only sync if task doesn't already have artwork
                if not task.artwork_image:
                    try:
                        task.write({'artwork_image': line.artwork_pdf_file})
                        synced_count += 1
                        _logger.info(f"🔄 Cron synced PDF to task #{task.id} from order line #{line.id}")
                    except Exception as e:
                        error_count += 1
                        _logger.error(f"❌ Cron failed to sync PDF to task #{task.id}: {str(e)}")
                else:
                    skipped_count += 1
        
        _logger.info(f"✅ Cron PDF sync complete: {synced_count} synced, {skipped_count} skipped (already had PDF), {error_count} errors")
    
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