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
                # Process PDF
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