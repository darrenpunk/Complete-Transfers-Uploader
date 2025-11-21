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
    
    def _sync_artwork_pdf_from_order_line(self, task):
        """Helper method to sync artwork PDF from sale order line to task"""
        if not task.sale_line_id:
            return
        
        order_line = task.sale_line_id
        
        # Check if order line has artwork PDF
        if order_line.artwork_pdf_file and not task.artwork_image:
            try:
                # CRITICAL: Must use write() to persist binary data in Odoo
                task.write({'artwork_image': order_line.artwork_pdf_file})
                _logger.info(f"✅ PDF synced to manufacturing task #{task.id} ({task.name}) from order line #{order_line.id}")
            except Exception as e:
                _logger.error(f"❌ Failed to sync PDF to task #{task.id}: {str(e)}")
