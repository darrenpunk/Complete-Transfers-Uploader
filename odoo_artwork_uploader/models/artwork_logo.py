from odoo import models, fields, api
import base64
import os
import tempfile
import subprocess
import json
from werkzeug.utils import secure_filename

class ArtworkLogo(models.Model):
    _name = 'artwork.logo'
    _description = 'Artwork Logo File'
    _order = 'create_date desc'
    
    name = fields.Char('Name', required=True)
    project_id = fields.Many2one('artwork.project', string='Project', required=True, ondelete='cascade')
    
    # File information
    file_data = fields.Binary('File Data', required=True, attachment=True)
    filename = fields.Char('Filename', required=True)
    file_size = fields.Integer('File Size (bytes)')
    file_type = fields.Selection([
        ('png', 'PNG'),
        ('jpeg', 'JPEG'),
        ('svg', 'SVG'),
        ('pdf', 'PDF'),
        ('ai', 'AI'),
        ('eps', 'EPS'),
    ], string='File Type', compute='_compute_file_type', store=True)
    
    # Processed files
    svg_data = fields.Binary('SVG Data', attachment=True)
    svg_filename = fields.Char('SVG Filename')
    thumbnail_data = fields.Binary('Thumbnail', attachment=True)
    
    # File analysis
    is_vector = fields.Boolean('Is Vector', default=False)
    is_raster = fields.Boolean('Is Raster', default=False)
    has_mixed_content = fields.Boolean('Has Mixed Content', default=False)
    
    # Color information
    color_data = fields.Text('Color Data', help='JSON data containing color analysis')
    color_count = fields.Integer('Color Count', default=0)
    has_cmyk = fields.Boolean('Has CMYK Colors', default=False)
    has_rgb = fields.Boolean('Has RGB Colors', default=False)
    has_pantone = fields.Boolean('Has Pantone Colors', default=False)
    is_cmyk_preserved = fields.Boolean('CMYK Preserved', default=False, help='Original CMYK colors are preserved')
    
    # Dimensions
    width_px = fields.Float('Width (px)')
    height_px = fields.Float('Height (px)')
    width_mm = fields.Float('Width (mm)')
    height_mm = fields.Float('Height (mm)')
    
    # Preflight checks
    has_fonts = fields.Boolean('Has Embedded Fonts', default=False)
    min_stroke_width = fields.Float('Min Stroke Width')
    has_transparency = fields.Boolean('Has Transparency', default=False)
    
    @api.depends('filename')
    def _compute_file_type(self):
        for record in self:
            if record.filename:
                ext = os.path.splitext(record.filename)[1].lower()
                type_map = {
                    '.png': 'png',
                    '.jpg': 'jpeg',
                    '.jpeg': 'jpeg',
                    '.svg': 'svg',
                    '.pdf': 'pdf',
                    '.ai': 'ai',
                    '.eps': 'eps',
                }
                record.file_type = type_map.get(ext, False)
            else:
                record.file_type = False
    
    @api.model
    def create(self, vals):
        # Process the uploaded file
        if 'file_data' in vals and vals['file_data']:
            # Get file size
            vals['file_size'] = len(base64.b64decode(vals['file_data']))
            
        record = super(ArtworkLogo, self).create(vals)
        
        # Process the file after creation
        if record.file_data:
            record._process_file()
            
        return record
    
    def _process_file(self):
        """Process the uploaded file based on its type"""
        self.ensure_one()
        
        # Create temp file
        with tempfile.NamedTemporaryFile(suffix=os.path.splitext(self.filename)[1], delete=False) as tmp_file:
            tmp_file.write(base64.b64decode(self.file_data))
            tmp_path = tmp_file.name
        
        try:
            if self.file_type in ['ai', 'eps']:
                # Convert AI/EPS to SVG
                self._convert_to_svg(tmp_path)
            elif self.file_type == 'pdf':
                # Process PDF - check for CMYK and handle accordingly
                self._process_pdf(tmp_path)
            elif self.file_type == 'svg':
                # Process SVG for color analysis
                self._process_svg(tmp_path)
            elif self.file_type in ['png', 'jpeg']:
                # Process raster images
                self._process_raster(tmp_path)
                
            # Analyze colors after processing
            self._analyze_colors()
            
        finally:
            # Clean up temp file
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
    
    def _process_pdf(self, file_path):
        """Process PDF file and determine CMYK preservation"""
        self.ensure_one()
        try:
            # Import color workflow manager with proper error handling
            try:
                from ..lib.color_workflow import ColorWorkflowManager, FileType
            except ImportError:
                # Fallback if lib module not available
                ColorWorkflowManager = None
                FileType = None
            
            # Determine if this is a vector PDF that should preserve CMYK
            if ColorWorkflowManager:
                file_type = ColorWorkflowManager.get_file_type('application/pdf', self.filename)
            else:
                file_type = 'vector-pdf'  # Fallback
            
            # For now, mark PDFs as vector and potentially CMYK-preserved
            self.is_vector = True
            self.is_raster = False
            
            # Basic PDF analysis - in production, this would use more sophisticated tools
            # For now, assume PDFs may contain CMYK colors
            self.has_cmyk = True
            self.is_cmyk_preserved = True
            
            # Set basic dimensions (A3 default)
            self.width_mm = 420  # A3 width
            self.height_mm = 297  # A3 height
            self.width_px = self.width_mm * 2.834  # Convert to pixels at 72 DPI
            self.height_px = self.height_mm * 2.834
            
        except Exception as e:
            # Fallback values
            self.is_vector = True
            self.has_cmyk = False
            self.is_cmyk_preserved = False
    
    def _process_svg(self, file_path):
        """Process SVG file"""
        self.ensure_one()
        try:
            # SVG is vector by definition
            self.is_vector = True
            self.is_raster = False
            
            # Read SVG content for basic analysis
            with open(file_path, 'r', encoding='utf-8') as f:
                svg_content = f.read()
            
            # Basic color detection (simplified)
            has_cmyk_keywords = any(keyword in svg_content.lower() for keyword in ['cmyk', 'device-cmyk'])
            has_rgb_keywords = any(keyword in svg_content.lower() for keyword in ['rgb', '#', 'fill='])
            
            self.has_cmyk = has_cmyk_keywords
            self.has_rgb = has_rgb_keywords
            self.is_cmyk_preserved = has_cmyk_keywords
            
            # Store processed SVG
            with open(file_path, 'rb') as f:
                self.svg_data = base64.b64encode(f.read())
                self.svg_filename = self.filename.replace(os.path.splitext(self.filename)[1], '.svg')
                
        except Exception as e:
            # Fallback
            self.is_vector = True
            self.has_cmyk = False
    
    def _process_raster(self, file_path):
        """Process raster image files"""
        self.ensure_one()
        try:
            # Raster files
            self.is_vector = False
            self.is_raster = True
            self.has_rgb = True  # Assume raster images are RGB
            self.has_cmyk = False
            self.is_cmyk_preserved = False
            
            # Basic dimension detection would go here
            # For now, use default values
            self.width_px = 300
            self.height_px = 300
            
        except Exception as e:
            # Fallback
            self.is_raster = True
    
    def _analyze_colors(self):
        """Analyze colors in the processed file"""
        self.ensure_one()
        
        # This would contain sophisticated color analysis
        # For now, provide basic analysis based on file type
        
        if self.is_vector and self.has_cmyk:
            # Vector file with CMYK colors
            self.color_count = 5  # Example
            color_analysis = {
                'colors': [
                    {'type': 'cmyk', 'values': [0, 100, 100, 0]},  # Red
                    {'type': 'cmyk', 'values': [100, 0, 100, 0]},  # Green
                    {'type': 'cmyk', 'values': [100, 100, 0, 0]},  # Blue
                ]
            }
            self.color_data = json.dumps(color_analysis)
        elif self.is_raster:
            # Raster file - assume RGB
            self.color_count = 10  # Example
            color_analysis = {
                'colors': [
                    {'type': 'rgb', 'values': [255, 0, 0]},  # Red
                    {'type': 'rgb', 'values': [0, 255, 0]},  # Green
                ]
            }
            self.color_data = json.dumps(color_analysis)
        
    def _convert_to_svg(self, file_path):
        """Convert AI/EPS to SVG"""
        # This would use Inkscape or similar tool
        # For now, just mark as vector
        self.is_vector = True
        pass
                self._process_pdf(tmp_path)
            elif self.file_type == 'svg':
                # Analyze SVG
                self._analyze_svg(tmp_path)
            elif self.file_type in ['png', 'jpeg']:
                # Process raster
                self._process_raster(tmp_path)
                
            # Generate thumbnail
            self._generate_thumbnail(tmp_path)
            
        finally:
            # Clean up temp file
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
    
    def _convert_to_svg(self, file_path):
        """Convert AI/EPS files to SVG"""
        svg_path = file_path + '.svg'
        
        try:
            # First try converting to PDF
            pdf_path = file_path + '.pdf'
            result = subprocess.run(
                ['gs', '-dBATCH', '-dNOPAUSE', '-sDEVICE=pdfwrite', 
                 f'-sOutputFile={pdf_path}', file_path],
                capture_output=True,
                text=True
            )
            
            if result.returncode == 0 and os.path.exists(pdf_path):
                # Then convert PDF to SVG
                result = subprocess.run(
                    ['inkscape', '--export-type=svg', '--export-plain-svg', 
                     f'--export-filename={svg_path}', pdf_path],
                    capture_output=True,
                    text=True
                )
                
                if result.returncode == 0 and os.path.exists(svg_path):
                    with open(svg_path, 'rb') as f:
                        self.svg_data = base64.b64encode(f.read())
                        self.svg_filename = os.path.splitext(self.filename)[0] + '.svg'
                        self.is_vector = True
                
                # Clean up PDF
                if os.path.exists(pdf_path):
                    os.unlink(pdf_path)
                    
        except Exception as e:
            # Log error
            pass
        finally:
            if os.path.exists(svg_path):
                os.unlink(svg_path)
    
    def _process_pdf(self, file_path):
        """Process PDF file"""
        # Check if it's vector or raster
        # For now, mark as vector
        self.is_vector = True
        
    def _analyze_svg(self, file_path):
        """Analyze SVG file for colors and content"""
        self.is_vector = True
        # Color analysis would go here
        
    def _process_raster(self, file_path):
        """Process raster image"""
        self.is_raster = True
        # Image analysis would go here
        
    def _generate_thumbnail(self, file_path):
        """Generate thumbnail for preview"""
        # Thumbnail generation would go here
        pass