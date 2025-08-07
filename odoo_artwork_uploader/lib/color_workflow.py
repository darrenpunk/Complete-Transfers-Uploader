"""
Color Workflow Manager for Odoo Artwork Uploader
Ported from React/Express ColorWorkflowManager
"""

import logging
from enum import Enum

_logger = logging.getLogger(__name__)

class FileType(Enum):
    VECTOR_SVG = 'vector-svg'
    VECTOR_PDF = 'vector-pdf'
    VECTOR_AI = 'vector-ai'
    VECTOR_EPS = 'vector-eps'
    RASTER_PNG = 'raster-png'
    RASTER_JPEG = 'raster-jpeg'
    MIXED_CONTENT = 'mixed-content'
    UNKNOWN = 'unknown'

class ColorSpace(Enum):
    RGB = 'rgb'
    CMYK = 'cmyk'
    SPOT = 'spot'
    UNKNOWN = 'unknown'

class ColorWorkflowManager:
    """
    Manages color workflows for vector and raster files
    Ensures CMYK preservation for vector files
    """
    
    @staticmethod
    def get_file_type(mime_type, filename):
        """Determine file type based on mime type and extension"""
        extension = filename.lower().split('.')[-1] if '.' in filename else ''
        
        mime_type_mapping = {
            'image/svg+xml': FileType.VECTOR_SVG,
            'application/pdf': FileType.VECTOR_PDF,
            'application/postscript': FileType.VECTOR_EPS,
            'application/illustrator': FileType.VECTOR_AI,
            'application/x-illustrator': FileType.VECTOR_AI,
            'image/png': FileType.RASTER_PNG,
            'image/jpeg': FileType.RASTER_JPEG,
            'image/jpg': FileType.RASTER_JPEG,
        }
        
        if mime_type in mime_type_mapping:
            # Special case for AI vs EPS
            if mime_type in ['application/postscript', 'application/illustrator']:
                return FileType.VECTOR_AI if extension == 'ai' else FileType.VECTOR_EPS
            return mime_type_mapping[mime_type]
        
        # Fallback to extension
        extension_mapping = {
            'svg': FileType.VECTOR_SVG,
            'pdf': FileType.VECTOR_PDF,
            'ai': FileType.VECTOR_AI,
            'eps': FileType.VECTOR_EPS,
            'png': FileType.RASTER_PNG,
            'jpg': FileType.RASTER_JPEG,
            'jpeg': FileType.RASTER_JPEG,
        }
        
        return extension_mapping.get(extension, FileType.UNKNOWN)
    
    @staticmethod
    def is_vector_file(file_type):
        """Check if file type is vector"""
        return file_type in [
            FileType.VECTOR_SVG,
            FileType.VECTOR_PDF,
            FileType.VECTOR_AI,
            FileType.VECTOR_EPS
        ]
    
    @staticmethod
    def is_raster_file(file_type):
        """Check if file type is raster"""
        return file_type in [
            FileType.RASTER_PNG,
            FileType.RASTER_JPEG
        ]
    
    @staticmethod
    def should_preserve_cmyk(file_type, has_cmyk_colors=False):
        """Determine if CMYK should be preserved"""
        if not ColorWorkflowManager.is_vector_file(file_type):
            return False
        
        # Preserve CMYK for vector files that contain CMYK colors
        return has_cmyk_colors
    
    @staticmethod
    def get_workflow_options(file_type, has_cmyk_colors=False):
        """Get recommended workflow options for file type"""
        if ColorWorkflowManager.is_vector_file(file_type):
            return {
                'preserve_cmyk': ColorWorkflowManager.should_preserve_cmyk(file_type, has_cmyk_colors),
                'convert_to_cmyk': not has_cmyk_colors,  # Convert RGB to CMYK for vector files
                'allow_raster_conversion': False,  # Don't rasterize vector files
            }
        else:
            return {
                'preserve_cmyk': False,
                'convert_to_cmyk': True,  # Convert raster RGB to CMYK for print
                'allow_raster_conversion': True,
            }
    
    @staticmethod
    def detect_color_space(color_data):
        """Detect color space from color data"""
        if not color_data:
            return ColorSpace.UNKNOWN
        
        # Check for CMYK indicators
        if any(keyword in str(color_data).lower() for keyword in ['cmyk', 'cyan', 'magenta', 'yellow', 'black']):
            return ColorSpace.CMYK
        
        # Check for RGB indicators
        if any(keyword in str(color_data).lower() for keyword in ['rgb', '#', 'red', 'green', 'blue']):
            return ColorSpace.RGB
        
        # Check for spot color indicators
        if any(keyword in str(color_data).lower() for keyword in ['pantone', 'spot', 'pms']):
            return ColorSpace.SPOT
        
        return ColorSpace.UNKNOWN
    
    @staticmethod
    def rgb_to_cmyk(r, g, b):
        """Convert RGB to CMYK (basic conversion)"""
        if r == 0 and g == 0 and b == 0:
            return 0, 0, 0, 100
        
        # Normalize RGB values
        r = r / 255.0
        g = g / 255.0
        b = b / 255.0
        
        # Calculate CMY
        c = 1 - r
        m = 1 - g
        y = 1 - b
        
        # Calculate K (black)
        k = min(c, min(m, y))
        
        # Adjust CMY based on K
        if k == 1:
            c = m = y = 0
        else:
            c = (c - k) / (1 - k)
            m = (m - k) / (1 - k)
            y = (y - k) / (1 - k)
        
        # Convert to percentages
        return round(c * 100), round(m * 100), round(y * 100), round(k * 100)
    
    @staticmethod
    def hex_to_cmyk(hex_color):
        """Convert hex color to CMYK"""
        # Remove # if present
        hex_color = hex_color.lstrip('#')
        
        # Convert hex to RGB
        try:
            r = int(hex_color[0:2], 16)
            g = int(hex_color[2:4], 16)
            b = int(hex_color[4:6], 16)
            
            return ColorWorkflowManager.rgb_to_cmyk(r, g, b)
        except (ValueError, IndexError):
            _logger.warning(f"Invalid hex color: {hex_color}")
            return 0, 0, 0, 100  # Default to black
    
    @staticmethod
    def validate_color_workflow(file_type, color_data, workflow_options):
        """Validate color workflow configuration"""
        issues = []
        
        # Check for vector/raster mismatch
        if ColorWorkflowManager.is_vector_file(file_type) and workflow_options.get('allow_raster_conversion'):
            issues.append("Vector file should not be rasterized")
        
        # Check for CMYK preservation on non-CMYK files
        if workflow_options.get('preserve_cmyk') and not color_data.get('has_cmyk'):
            issues.append("Cannot preserve CMYK on file without CMYK colors")
        
        # Check for conflicting conversion options
        if workflow_options.get('preserve_cmyk') and workflow_options.get('convert_to_cmyk'):
            issues.append("Cannot both preserve and convert CMYK")
        
        return issues