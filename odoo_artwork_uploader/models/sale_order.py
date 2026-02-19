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
                        task_vals = {'artwork_image': line.artwork_files_datas}
                        
                        # Update task name to include product code if missing
                        product = line.product_id
                        product_code = product.default_code if product and product.default_code else ''
                        if product_code and task.name and f'[{product_code}]' not in task.name:
                            sale_order_ref = line.order_id.name if line.order_id else ''
                            product_name = product.name if product else ''
                            product_display = f"[{product_code}] {product_name}" if product_code else product_name
                            artwork_filename = line.artwork_file_name if hasattr(line, 'artwork_file_name') and line.artwork_file_name else ''
                            if artwork_filename:
                                task_vals['name'] = f"{sale_order_ref} - {product_display} {artwork_filename}"
                            else:
                                task_vals['name'] = f"{sale_order_ref} - {product_display}"
                        
                        task.write(task_vals)
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
                    task_vals = {'artwork_image': order_line.artwork_files_datas}
                    
                    # Update task name to include product code if missing
                    product = order_line.product_id
                    product_code = product.default_code if product and product.default_code else ''
                    if product_code and task.name and f'[{product_code}]' not in task.name:
                        sale_order_ref = order_line.order_id.name if order_line.order_id else ''
                        product_name = product.name if product else ''
                        product_display = f"[{product_code}] {product_name}" if product_code else product_name
                        artwork_filename = order_line.artwork_file_name if hasattr(order_line, 'artwork_file_name') and order_line.artwork_file_name else ''
                        if artwork_filename:
                            task_vals['name'] = f"{sale_order_ref} - {product_display} {artwork_filename}"
                        else:
                            task_vals['name'] = f"{sale_order_ref} - {product_display}"
                    
                    task.write(task_vals)
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
    
    GARMENT_CMYK_MAP = {
        '#ffffff': '0, 0, 0, 0',
        '#171816': '0, 0, 0, 100',
        '#1a1a1a': '0, 0, 0, 100',
        '#000000': '0, 0, 0, 100',
        '#d9d2ab': '11, 15, 32, 0',
        '#f3f590': '4, 2, 50, 0',
        '#f0f42a': '5, 0, 90, 0',
        '#d7da14': '20, 0, 100, 0',
        '#d98f17': '0, 51, 93, 0',
        '#388032': '86, 16, 100, 3',
        '#bf0072': '2, 97, 4, 0',
        '#767878': '0, 0, 0, 63',
        '#919393': '0, 0, 0, 50',
        '#a6a9a2': '32, 24, 26, 5',
        '#bcbfbb': '25, 18, 20, 2',
        '#353330': '66, 57, 54, 60',
        '#b9dbea': '32, 0, 5, 0',
        '#5998d4': '70, 15, 0, 0',
        '#201c3a': '100, 92, 36, 39',
        '#221866': '100, 95, 5, 0',
        '#b5d55e': '34, 0, 73, 0',
        '#90bf33': '50, 0, 99, 0',
        '#3c8a35': '85, 10, 100, 0',
        '#e7bbd0': '0, 32, 3, 0',
        '#d287a2': '2, 53, 11, 0',
        '#c42469': '0, 94, 20, 0',
        '#c02300': '0, 99, 97, 0',
        '#762009': '26, 100, 88, 27',
        '#4c0a6a': '75, 100, 0, 0',
        '#25282a': '94, 77, 53, 94',
        '#c8c9c7': '8, 5, 7, 16',
        '#66676c': '40, 30, 20, 66',
        '#263147': '95, 72, 15, 67',
        '#d50032': '0, 100, 72, 0',
        '#8a1538': '0, 100, 54, 43',
        '#ac2b37': '0, 100, 82, 26',
        '#971b2f': '0, 100, 70, 33',
        '#7d2935': '16, 100, 65, 58',
        '#5b2b42': '0, 81, 0, 79',
        '#224d8f': '100, 73, 0, 10',
        '#0077b5': '100, 23, 0, 19',
        '#006a8e': '100, 16, 10, 44',
        '#7ba4db': '59, 27, 0, 0',
        '#a4c8e1': '37, 9, 0, 1',
        '#71c5e8': '52, 0, 1, 0',
        '#486d87': '68, 35, 17, 40',
        '#3975b7': '88, 50, 0, 0',
        '#00a74a': '88, 0, 86, 0',
        '#00843d': '96, 2, 100, 12',
        '#00805e': '97, 6, 69, 19',
        '#273b33': '79, 34, 62, 84',
        '#5e7461': '52, 16, 52, 54',
        '#a0cfa8': '43, 0, 41, 0',
        '#92bf55': '52, 0, 82, 0',
        '#43b02a': '77, 0, 100, 0',
        '#c6d219': '28, 0, 100, 0',
        '#f4633a': '0, 68, 76, 0',
        '#b33d26': '0, 85, 98, 20',
        '#e5801c': '0, 65, 100, 0',
        '#ff8a3d': '0, 50, 71, 0',
        '#b65a30': '0, 69, 85, 24',
        '#dc6b2f': '0, 67, 100, 0',
        '#fed141': '0, 18, 74, 0',
        '#eead1a': '0, 31, 98, 0',
        '#c39367': '18, 41, 62, 6',
        '#f4d1a1': '0, 13, 35, 0',
        '#f0ec74': '0, 0, 55, 0',
        '#f5e1a4': '0, 4, 27, 0',
        '#464e7e': '86, 65, 21, 26',
        '#8094dd': '55, 37, 0, 0',
        '#c5b4e3': '24, 29, 0, 0',
        '#e4c6d4': '0, 22, 2, 1',
        '#dd74a1': '0, 67, 5, 0',
        '#db3e79': '0, 92, 18, 0',
        '#aa0061': '0, 100, 10, 21',
        '#e16f8f': '0, 75, 21, 0',
        '#fb637e': '0, 66, 29, 0',
        '#9b2743': '8, 100, 55, 37',
        '#4d6995': '79, 49, 17, 15',
        '#5caa7f': '73, 0, 62, 0',
        '#333f48': '65, 43, 26, 78',
        '#614b79': '70, 77, 7, 23',
        '#bf0d3e': '2, 99, 62, 11',
        '#307fe2': '70, 47, 0, 0',
        '#97999b': '20, 14, 12, 40',
        '#205c40': '84, 22, 77, 60',
        '#00263a': '100, 65, 22, 80',
        '#fc4c02': '0, 70, 99, 1',
        '#002d72': '100, 80, 6, 32',
        '#ba0c2f': '0, 100, 70, 12',
        '#f5f0e8': '4, 9, 25, 0',
        '#96a4c2': '47, 28, 11, 4',
        '#dcc6c4': '11, 26, 19, 0',
        '#c5c1e0': '25, 24, 0, 0',
        '#85a4a1': '56, 17, 35, 8',
        '#343737': '67, 52, 52, 68',
        '#f4f9ff': '6, 4, 5, 0',
        '#f2f0eb': '4, 5, 7, 1',
        '#4a4b4d': '59, 45, 44, 55',
        '#98979a': '32, 23, 23, 12',
        '#5e5c56': '51, 40, 37, 33',
        '#8a8683': '39, 29, 28, 18',
        '#d5d5d8': '12, 10, 9, 0',
        '#9fa39f': '37, 24, 30, 13',
        '#282d3c': '81, 59, 34, 65',
        '#005a92': '93, 45, 6, 19',
        '#62677a': '59, 46, 27, 30',
        '#39505c': '78, 37, 36, 47',
        '#94a5bc': '42, 23, 11, 0',
        '#a5c9e5': '34, 11, 3, 0',
        '#265165': '83, 39, 31, 41',
        '#868a9f': '48, 37, 20, 14',
        '#344d41': '74, 29, 60, 52',
        '#a49667': '25, 28, 60, 22',
        '#a39f86': '24, 19, 39, 9',
        '#6c644f': '43, 39, 58, 37',
        '#608c7d': '60, 19, 48, 25',
        '#4f845f': '64, 11, 66, 31',
        '#a2c8ba': '36, 7, 27, 0',
        '#bd162c': '8, 95, 76, 9',
        '#8a3f39': '17, 80, 69, 31',
        '#542b39': '38, 81, 43, 58',
        '#64242e': '30, 84, 55, 55',
        '#d1969a': '3, 41, 27, 0',
        '#f7ccd2': '0, 26, 9, 0',
        '#807db2': '56, 51, 4, 1',
        '#7a69ac': '60, 64, 0, 0',
        '#af895a': '16, 42, 66, 18',
        '#efe8d0': '4, 12, 26, 0',
        '#e0d5c6': '5, 8, 16, 0',
        '#9a9887': '21, 27, 35, 10',
        '#725848': '37, 52, 63, 36',
        '#f7b718': '0, 33, 93, 0',
        '#f8eec3': '3, 5, 32, 0',
        '#a97a2f': '10, 43, 85, 23',
        '#131f3c': '100, 80, 0, 70',
        '#002958': '100, 74, 0, 47',
        '#00468d': '100, 72, 0, 6',
        '#8fc3e7': '42, 8, 0, 0',
        '#00afdd': '75, 0, 5, 0',
        '#006579': '86, 17, 23, 44',
        '#0f3458': '95, 65, 15, 55',
        '#db002d': '0, 100, 81, 4',
        '#6b102b': '20, 100, 40, 58',
        '#dc0070': '8, 100, 0, 0',
        '#fad4d6': '0, 21, 8, 0',
        '#e479ac': '5, 65, 0, 0',
        '#472164': '80, 98, 5, 27',
        '#009b48': '90, 0, 95, 0',
        '#005445': '90, 30, 70, 45',
        '#82bc2b': '55, 0, 100, 0',
        '#64604e': '45, 40, 55, 40',
        '#968a69': '35, 35, 55, 20',
        '#b4d228': '35, 0, 100, 0',
        '#ffc300': '0, 25, 100, 0',
        '#ffe600': '0, 5, 100, 0',
        '#f37021': '0, 70, 100, 0',
        '#e1d2b9': '8, 12, 25, 5',
        '#473023': '50, 70, 80, 60',
        '#b0b3b5': '30, 20, 20, 10',
        '#465055': '65, 50, 45, 45',
        '#e6e6e1': '5, 5, 10, 5',
        '#e6e6da': '5, 5, 10, 5',
        '#171c21': '73, 67, 61, 67',
        '#a2a9a8': '13, 9, 10, 27',
        '#2a353c': '66, 57, 51, 52',
        '#000710': '100, 71, 39, 90',
        '#000b64': '100, 93, 36, 39',
        '#31637f': '68, 35, 17, 40',
        '#ffb3fa': '0, 30, 2, 0',
        '#69baff': '59, 27, 0, 0',
        '#af9fc9': '13, 21, 0, 21',
        '#6b7292': '50, 47, 32, 16',
        '#ff7019': '0, 56, 90, 0',
        '#61bbaa': '60, 23, 30, 5',
        '#8bd8eb': '42, 10, 2, 6',
        '#ffe800': '0, 9, 100, 0',
        '#ddca8f': '6, 14, 39, 8',
        '#476240': '58, 42, 62, 34',
        '#65554a': '16, 29, 38, 53',
        '#135e31': '84, 20, 58, 54',
        '#a4ada6': '31, 27, 30, 7',
        '#da0043': '3, 100, 70, 12',
        '#f500ba': '0, 100, 24, 4',
        '#12ff00': '93, 0, 100, 0',
        '#2402e0': '84, 99, 0, 12',
        '#003cf0': '100, 75, 0, 6',
        '#0380ff': '99, 50, 0, 0',
        '#105017': '84, 22, 77, 60',
        '#ff7900': '0, 60, 100, 0',
        '#ff2d2d': '0, 90, 80, 0',
        '#1c2440': '100, 85, 40, 50',
        '#10182c': '100, 85, 50, 70',
        '#00529c': '100, 70, 0, 0',
        '#004b3c': '90, 30, 70, 50',
        '#6e7378': '50, 40, 40, 30',
        '#91969b': '45, 35, 35, 10',
        '#1e73be': '85, 50, 0, 0',
        '#6e7355': '40, 30, 60, 40',
        '#c3aa82': '20, 30, 50, 10',
    }

    def _get_garment_cmyk(self, hex_color):
        """Get production CMYK values for a garment color hex"""
        if not hex_color:
            return ''
        return self.GARMENT_CMYK_MAP.get(hex_color.lower(), '')

    def _get_garment_colors_text(self, project):
        """
        Extract and format garment colors text with quantities and CMYK values
        Returns: "10 Black (CMYK: 0, 0, 0, 100)" format for multi-color orders
        """
        colors_text = []
        
        if project.garment_colors_json:
            try:
                import json
                colors_data = json.loads(project.garment_colors_json)
                if isinstance(colors_data, list) and len(colors_data) > 0:
                    for color_info in colors_data:
                        if isinstance(color_info, dict):
                            quantity = color_info.get('quantity', 1)
                            color_name = color_info.get('colorName', color_info.get('name', 'Unknown'))
                            color_hex = color_info.get('color', '')
                            cmyk = self._get_garment_cmyk(color_hex)
                            if cmyk:
                                colors_text.append(f"{quantity} {color_name} (CMYK: {cmyk})")
                            else:
                                colors_text.append(f"{quantity} {color_name}")
                        elif isinstance(color_info, str):
                            colors_text.append(color_info)
                    return "\n".join(colors_text)
            except (json.JSONDecodeError, TypeError):
                pass
        
        if not colors_text and project.garment_color_name:
            quantity = project.total_quantity or project.quantity or 1
            cmyk = self._get_garment_cmyk(project.garment_color)
            if cmyk:
                return f"{quantity} {project.garment_color_name} (CMYK: {cmyk})"
            return f"{quantity} {project.garment_color_name}"
        elif not colors_text and project.garment_color:
            cmyk = self._get_garment_cmyk(project.garment_color)
            if cmyk:
                return f"CMYK: {cmyk}"
            return project.garment_color
        
        return ""