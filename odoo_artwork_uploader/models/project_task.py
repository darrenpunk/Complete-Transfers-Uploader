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
        'SO12345 - [CTCCA4] ProjectName.pdf'
        
        Format: SO number - [ProductCode] ArtworkFilename
        The artwork filename already contains the project name, so we only
        need the SO reference, product code, and the filename.
        """
        sale_order_ref = order_line.order_id.name if order_line.order_id else ''
        product = order_line.product_id
        product_code = product.default_code if product and product.default_code else ''
        
        code_part = f"[{product_code}] " if product_code else ''
        
        if artwork_filename:
            return f"{sale_order_ref} - {code_part}{artwork_filename}"
        return f"{sale_order_ref} - {code_part}{order_line.name or ''}"
    
    def _sync_artwork_pdf_from_order_line(self, task):
        """Helper method to sync artwork PDF and filename from sale order line to task
        
        Syncs both artwork_image (PDF binary) AND task name (includes PDF filename).
        Checks both artwork_pdf_file (manual upload) and artwork_files_datas (API upload)
        field sets to ensure task naming works regardless of upload path.
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
