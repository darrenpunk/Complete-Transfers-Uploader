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
    
    # NOTE: The following fields are provided by website_artwork_dropbox module:
    # - artwork_files_datas: Binary field storing PDF in Odoo filestore (before Dropbox sync)
    # - artwork_file_name: String field storing the filename
    # - dropbox_path_pdf: String field storing Dropbox URL (after automatic sync)
    # - artwork_comment: Text field for comments shown in sales order view
    # We rely on those fields being present via the module dependency
    artwork_garment_colors = fields.Text('Garment Colors', compute='_compute_artwork_garment_colors', store=True)
    
    @api.model_create_multi
    def create(self, vals_list):
        """Override create to populate comments from artwork project"""
        import logging
        _logger = logging.getLogger(__name__)
        
        lines = super().create(vals_list)
        
        # Update comments for lines with artwork projects
        for line in lines:
            if line.artwork_project_id:
                line._update_artwork_comments()
                _logger.info(f"✅ Comments populated for new order line #{line.id} from project #{line.artwork_project_id.id}")
        
        return lines
    
    def write(self, vals):
        """Override write to:
        1. Populate comments when artwork project is linked/updated
        2. Sync PDF to manufacturing task when PDF is added or updated
        """
        import logging
        _logger = logging.getLogger(__name__)
        
        result = super().write(vals)
        
        # If artwork project is being linked/updated, populate comments
        if 'artwork_project_id' in vals:
            for line in self:
                if line.artwork_project_id:
                    line._update_artwork_comments()
                    _logger.info(f"✅ Comments updated for order line #{line.id} from project #{line.artwork_project_id.id}")
        
        # If PDF is being added/updated, sync it to any related manufacturing task
        # artwork_files_datas field is provided by website_artwork_dropbox module
        if 'artwork_files_datas' in vals and vals['artwork_files_datas']:
            for line in self:
                if line.artwork_files_datas:
                    # Find related manufacturing task
                    task = self.env['project.task'].sudo().search([
                        ('sale_line_id', '=', line.id),
                    ], limit=1)
                    
                    if task:
                        task.write({'artwork_image': line.artwork_files_datas})
                        _logger.info(f"✅ PDF synced to manufacturing task #{task.id} from order line #{line.id}")
                    else:
                        _logger.warning(f"⚠️ No manufacturing task found for order line #{line.id} - will sync when task is created")
        
        return result
    
    @api.model
    def _cron_sync_artwork_pdfs_to_tasks(self):
        """Scheduled cron job to ensure eventual consistency of PDFs on manufacturing tasks
        
        STRATEGY: Scan project.tasks (not order lines) to catch tasks created after PDF upload.
        This handles the race condition where tasks are created asynchronously by external modules.
        """
        import logging
        _logger = logging.getLogger(__name__)
        
        # CRITICAL FIX: Search for tasks that need PDFs (not order lines)
        # This catches tasks created AFTER the PDF was uploaded to the order line
        tasks_needing_sync = self.env['project.task'].sudo().search([
            ('sale_line_id', '!=', False),  # Task is linked to order line
            ('artwork_image', '=', False),   # Task doesn't have PDF yet
        ])
        
        synced_count = 0
        skipped_count = 0
        error_count = 0
        
        for task in tasks_needing_sync:
            order_line = task.sale_line_id
            
            # Check if order line has artwork PDF (artwork_files_datas from website_artwork_dropbox)
            if order_line and order_line.artwork_files_datas:
                try:
                    task.write({'artwork_image': order_line.artwork_files_datas})
                    synced_count += 1
                    _logger.info(f"🔄 Cron synced PDF to task #{task.id} ({task.name}) from order line #{order_line.id}")
                except Exception as e:
                    error_count += 1
                    _logger.error(f"❌ Cron failed to sync PDF to task #{task.id}: {str(e)}")
            else:
                skipped_count += 1
                _logger.debug(f"⏭️ Task #{task.id} has no PDF on order line, skipping")
        
        _logger.info(f"✅ Cron PDF sync complete: {synced_count} synced, {skipped_count} skipped (no PDF on line), {error_count} errors")
    
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
        """Update the order line comments with artwork project details
        
        CRITICAL: Comments go to 'artwork_comment' field (provided by website_artwork_dropbox)
        NOT to 'name' field (that's just the product description)
        
        IMPORTANT: Garment colors go to separate 'artwork_garment_colors' field
        The 'artwork_comment' field should contain:
        1. User's special instructions (from modal Comments textarea) - MAIN CONTENT
        2. Template info
        3. Ink color (if set)
        """
        if not self.artwork_project_id:
            return
            
        project = self.artwork_project_id
        comments = []
        
        # Add project comments FIRST (special instructions from modal)
        # This is the user's input from the Comments textarea
        if project.project_comments:
            comments.append(project.project_comments)
        
        # Add template information
        # template_size is now a Char field, look up display name from template definitions
        template_display = project.template_size
        if project.template_size:
            template_def = self.env['artwork.template.definition'].sudo().search([
                ('template_id', '=', project.template_size)
            ], limit=1)
            if template_def:
                template_display = template_def.name
        comments.append(f"Template: {template_display}")
        
        # Add ink color if available
        if project.ink_color_name:
            comments.append(f"Ink Color: {project.ink_color_name}")
        
        # NOTE: Garment colors are NOT added here - they go to 'artwork_garment_colors' field
        # which is displayed in a separate column
        
        # CRITICAL: Use artwork_comment field (production's actual field)
        # NOT the 'name' field (which is just product description)
        if comments:
            # IMPORTANT: Must call write() to persist the change to database!
            self.sudo().write({'artwork_comment': "\n".join(comments)})
            _logger.info(f"✅ Updated order line #{self.id} comments to artwork_comment field")
    
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