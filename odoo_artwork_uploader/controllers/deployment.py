from odoo import http, tools
from odoo.http import request
from odoo.modules.registry import Registry
import json
import base64
import logging
import os
import tempfile
import shutil
from pathlib import Path

_logger = logging.getLogger(__name__)

class DeploymentController(http.Controller):
    """
    Hot deployment controller for updating Odoo module on the fly
    without requiring full module reinstallation.
    """
    
    @http.route('/artwork/deploy/status', type='json', auth='user', methods=['GET'])
    def deployment_status(self):
        """Check deployment system status"""
        return {
            'status': 'active',
            'module': 'artwork_uploader',
            'database': request.env.cr.dbname,
            'user': request.env.user.name,
            'timestamp': tools.datetime.now().isoformat()
        }
    
    @http.route('/artwork/deploy/reload-views', type='json', auth='user', methods=['POST'])
    def reload_views(self):
        """Reload XML views without module reinstall"""
        try:
            # Clear view cache
            request.env['ir.ui.view'].clear_caches()
            
            # Force reload of specific views
            views_to_reload = [
                'artwork_uploader.view_artwork_project_form',
                'artwork_uploader.view_artwork_project_tree',
                'artwork_uploader.view_artwork_project_search',
                'artwork_uploader.upload_page'
            ]
            
            updated_views = []
            for view_xml_id in views_to_reload:
                try:
                    view = request.env.ref(view_xml_id, raise_if_not_found=False)
                    if view:
                        view._compute_arch()
                        updated_views.append(view_xml_id)
                except Exception as e:
                    _logger.warning(f"Could not reload view {view_xml_id}: {e}")
            
            return {
                'success': True,
                'reloaded_views': updated_views,
                'timestamp': tools.datetime.now().isoformat()
            }
            
        except Exception as e:
            _logger.error(f"View reload failed: {e}")
            return {'success': False, 'error': str(e)}
    
    @http.route('/artwork/deploy/reload-models', type='json', auth='user', methods=['POST'])
    def reload_models(self):
        """Reload Python models without module reinstall"""
        try:
            # Get current registry
            registry = Registry(request.env.cr.dbname)
            
            # Models to reload
            models_to_reload = [
                'artwork.project',
                'artwork.logo', 
                'artwork.canvas.element',
                'sale.order',
                'sale.order.line'
            ]
            
            reloaded_models = []
            for model_name in models_to_reload:
                if model_name in registry:
                    # Clear model cache
                    registry[model_name].clear_caches()
                    reloaded_models.append(model_name)
            
            # Clear registry cache
            registry.clear_caches()
            
            return {
                'success': True,
                'reloaded_models': reloaded_models,
                'timestamp': tools.datetime.now().isoformat()
            }
            
        except Exception as e:
            _logger.error(f"Model reload failed: {e}")
            return {'success': False, 'error': str(e)}
    
    @http.route('/artwork/deploy/update-file', type='json', auth='user', methods=['POST'])
    def update_file(self):
        """Update a specific file in the module"""
        try:
            data = request.jsonrequest
            file_path = data.get('file_path')
            file_content = data.get('content')
            
            if not file_path or not file_content:
                return {'success': False, 'error': 'Missing file_path or content'}
            
            # Get module path
            module_path = Path(__file__).parent.parent
            target_file = module_path / file_path
            
            # Security check - ensure file is within module directory
            try:
                target_file.resolve().relative_to(module_path.resolve())
            except ValueError:
                return {'success': False, 'error': 'Invalid file path - outside module directory'}
            
            # Backup original file
            backup_path = target_file.with_suffix(target_file.suffix + '.backup')
            if target_file.exists():
                shutil.copy2(target_file, backup_path)
            
            # Write new content
            target_file.parent.mkdir(parents=True, exist_ok=True)
            
            if data.get('is_base64'):
                content = base64.b64decode(file_content).decode('utf-8')
            else:
                content = file_content
                
            target_file.write_text(content, encoding='utf-8')
            
            return {
                'success': True,
                'file_path': str(file_path),
                'backup_created': str(backup_path) if target_file.exists() else None,
                'timestamp': tools.datetime.now().isoformat()
            }
            
        except Exception as e:
            _logger.error(f"File update failed: {e}")
            return {'success': False, 'error': str(e)}
    
    @http.route('/artwork/deploy/run-sql', type='json', auth='user', methods=['POST'])
    def run_sql(self):
        """Execute SQL for database schema updates"""
        try:
            data = request.jsonrequest
            sql_commands = data.get('sql')
            
            if not sql_commands:
                return {'success': False, 'error': 'No SQL provided'}
            
            # Security check - only allow specific operations
            allowed_operations = ['ALTER TABLE', 'CREATE INDEX', 'DROP INDEX', 'UPDATE', 'INSERT']
            
            if not isinstance(sql_commands, list):
                sql_commands = [sql_commands]
            
            executed_commands = []
            for sql in sql_commands:
                sql_upper = sql.strip().upper()
                
                # Basic security check
                if not any(sql_upper.startswith(op) for op in allowed_operations):
                    return {'success': False, 'error': f'SQL operation not allowed: {sql[:50]}...'}
                
                try:
                    request.env.cr.execute(sql)
                    executed_commands.append(sql)
                except Exception as sql_error:
                    _logger.error(f"SQL execution failed: {sql_error}")
                    return {'success': False, 'error': f'SQL error: {sql_error}'}
            
            # Commit changes
            request.env.cr.commit()
            
            return {
                'success': True,
                'executed_commands': executed_commands,
                'timestamp': tools.datetime.now().isoformat()
            }
            
        except Exception as e:
            _logger.error(f"SQL execution failed: {e}")
            return {'success': False, 'error': str(e)}
    
    @http.route('/artwork/deploy/full-reload', type='json', auth='user', methods=['POST'])
    def full_reload(self):
        """Perform complete hot reload of views, models, and clear caches"""
        try:
            results = {}
            
            # 1. Reload views
            view_result = self.reload_views()
            results['views'] = view_result
            
            # 2. Reload models  
            model_result = self.reload_models()
            results['models'] = model_result
            
            # 3. Clear all caches
            request.env.registry.clear_caches()
            tools.clear_cache()
            
            # 4. Restart any background processes if needed
            # (This would depend on your specific setup)
            
            return {
                'success': True,
                'results': results,
                'message': 'Full hot reload completed',
                'timestamp': tools.datetime.now().isoformat()
            }
            
        except Exception as e:
            _logger.error(f"Full reload failed: {e}")
            return {'success': False, 'error': str(e)}
    
    @http.route('/artwork/deploy/backup-module', type='json', auth='user', methods=['POST'])
    def backup_module(self):
        """Create a backup of the current module state"""
        try:
            import zipfile
            from datetime import datetime
            
            # Create backup directory
            backup_dir = Path('/tmp/artwork_module_backups')
            backup_dir.mkdir(exist_ok=True)
            
            # Generate backup filename
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            backup_filename = f"artwork_uploader_backup_{timestamp}.zip"
            backup_path = backup_dir / backup_filename
            
            # Get module path
            module_path = Path(__file__).parent.parent
            
            # Create zip backup
            with zipfile.ZipFile(backup_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
                for file_path in module_path.rglob('*'):
                    if file_path.is_file() and not file_path.name.endswith('.pyc'):
                        arcname = file_path.relative_to(module_path.parent)
                        zipf.write(file_path, arcname)
            
            return {
                'success': True,
                'backup_path': str(backup_path),
                'backup_size': backup_path.stat().st_size,
                'timestamp': tools.datetime.now().isoformat()
            }
            
        except Exception as e:
            _logger.error(f"Backup creation failed: {e}")
            return {'success': False, 'error': str(e)}