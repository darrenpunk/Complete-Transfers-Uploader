from odoo import models, api
import logging

_logger = logging.getLogger(__name__)


class ProjectTask(models.Model):
    _inherit = 'project.task'
    
    @api.model_create_multi
    def create(self, vals_list):
        """Override create to automatically attach PDF from sale order line when task is created"""
        tasks = super().create(vals_list)
        
        # Sync PDFs from sale order lines to tasks (production workflow)
        for task in tasks:
            self._sync_artwork_pdf_from_order_line(task)
        
        return tasks
    
    def write(self, vals):
        """Override write to sync PDF if sale_line_id is being set"""
        result = super().write(vals)
        
        # If sale_line_id is being set/changed, sync PDF
        if 'sale_line_id' in vals:
            for task in self:
                self._sync_artwork_pdf_from_order_line(task)
        
        return result
    
    def _build_task_name(self, order_line, artwork_filename):
        """Build task name format:
        'SO86019 - [STCC6060] Single Colour - Cut 60x60mm (TAIL2408) GX logo.pdf'
        
        Format: {SO} - [{ProductCode}] {ProductName} ({CustomerCode}) {PDFName}
        """
        sale_order_ref = order_line.order_id.name if order_line.order_id else ''
        product = order_line.product_id.sudo()
        product_code = product.default_code if product and product.default_code else ''
        product_name = product.name if product else ''
        
        if not product_code and order_line.name:
            import re
            code_match = re.search(r'\[([A-Z0-9]+)\]', order_line.name or '')
            if code_match:
                product_code = code_match.group(1)
        
        partner = order_line.order_id.partner_id if order_line.order_id else None
        customer_code = partner.ref if partner and partner.ref else ''
        
        code_part = f"[{product_code}] " if product_code else ''
        customer_part = f"({customer_code}) " if customer_code else ''
        name_part = f"{product_name} " if product_name else ''
        file_part = (artwork_filename or '').replace('_', ' ')
        
        return f"{sale_order_ref} - {code_part}{name_part}{customer_part}{file_part}".strip()
    
    def _sync_artwork_pdf_from_order_line(self, task):
        """Helper method to sync artwork PDF and filename from sale order line to task
        
        Syncs both artwork_image (PDF binary) AND task name (includes PDF filename).
        Checks both artwork_pdf_file (manual upload) and artwork_files_datas (API upload)
        field sets to ensure task naming works regardless of upload path.
        Also copies ZIP attachments from order line to task.
        """
        if not task.sale_line_id:
            return
        
        order_line = task.sale_line_id
        
        # Check both field sets: artwork_pdf_file (manual) and artwork_files_datas (API/production)
        pdf_data = None
        artwork_filename = ''
        
        if order_line.artwork_pdf_file:
            pdf_data = order_line.artwork_pdf_file
            artwork_filename = order_line.artwork_pdf_filename or ''
        elif hasattr(order_line, 'artwork_files_datas') and order_line.artwork_files_datas:
            pdf_data = order_line.artwork_files_datas
            artwork_filename = order_line.artwork_file_name if hasattr(order_line, 'artwork_file_name') else ''
        
        if pdf_data:
            try:
                vals = {'artwork_image': pdf_data}
                
                # Build task name with product code
                task_name = self._build_task_name(order_line, artwork_filename)
                vals['name'] = task_name
                _logger.info(f"✅ Task name set: {task_name}")
                
                # CRITICAL: Must use write() to persist binary data in Odoo
                task.write(vals)
                _logger.info(f"✅ PDF synced to manufacturing task #{task.id} ({task.name}) from order line #{order_line.id}")
            except Exception as e:
                _logger.error(f"❌ Failed to sync PDF to task #{task.id}: {str(e)}")
        
        # Copy ZIP attachments from order line to task
        self._sync_zip_attachments_to_task(task, order_line)
    
    def _sync_zip_attachments_to_task(self, task, order_line):
        """Copy ZIP ir.attachment records from the sale order line to the task.
        
        This ensures ZIP files (e.g. repeat applique orders) are visible
        on the manufacturing task, not just on the order line.
        """
        try:
            zip_attachments = self.env['ir.attachment'].sudo().search([
                ('res_model', '=', 'sale.order.line'),
                ('res_id', '=', order_line.id),
                ('mimetype', '=', 'application/zip'),
            ])
            
            if not zip_attachments:
                return
            
            for attachment in zip_attachments:
                existing = self.env['ir.attachment'].sudo().search([
                    ('res_model', '=', 'project.task'),
                    ('res_id', '=', task.id),
                    ('name', '=', attachment.name),
                    ('mimetype', '=', 'application/zip'),
                ], limit=1)
                
                if existing:
                    _logger.info(f"⏭️ ZIP '{attachment.name}' already on task #{task.id}, skipping")
                    continue
                
                self.env['ir.attachment'].sudo().create({
                    'name': attachment.name,
                    'type': 'binary',
                    'datas': attachment.datas,
                    'res_model': 'project.task',
                    'res_id': task.id,
                    'mimetype': 'application/zip',
                })
                _logger.info(f"📎 ZIP '{attachment.name}' copied to task #{task.id} from order line #{order_line.id}")
        except Exception as e:
            _logger.error(f"❌ Failed to copy ZIP attachments to task #{task.id}: {str(e)}")
