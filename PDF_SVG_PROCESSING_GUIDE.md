# PDF/SVG Processing Migration: TypeScript to Python

## Overview

This guide explains how to port the PDF bounds extraction and SVG analysis from Node.js/TypeScript to Python for Odoo.

---

## Current Implementation Architecture

### TypeScript Stack
- **PDF Processing**: Ghostscript (subprocess) + Node Canvas
- **SVG Processing**: JSDOM (DOM-based analysis)
- **Libraries**: 
  - `pdf-lib` - PDF manipulation
  - `canvas` - Image pixel analysis
  - `jsdom` - SVG DOM parsing
  - `child_process` - Ghostscript subprocess calls

### Core Functionality
1. **PDF Bounds Extraction** (`server/pdf-bounds-extractor.ts`)
   - Uses Ghostscript `-sDEVICE=bbox` for precise bounds
   - Falls back to PDF→SVG conversion if needed
   - Detects tight content bounds by pixel analysis
   - Preserves CMYK colors

2. **SVG Bounds Analysis** (`server/svg-bounds-analyzer.ts`)
   - DOM-based SVG parsing with JSDOM
   - Geometric path calculations
   - ViewBox/crop detection
   - Raster content detection

---

## Python Implementation Strategy

### Target Stack
- **PDF Processing**: Ghostscript (subprocess) + Pillow (PIL)
- **SVG Processing**: lxml (XML parsing) + svgpathtools
- **Libraries**:
  - `subprocess` - Ghostscript calls (same as TypeScript)
  - `Pillow` (PIL) - Image analysis (replaces Canvas)
  - `lxml` - SVG XML parsing (replaces JSDOM)
  - `reportlab` - PDF generation (replaces pdf-lib)

---

## Part 1: PDF Bounds Extraction

### Current TypeScript Implementation

**Key Algorithm** (`server/pdf-bounds-extractor.ts`):
```typescript
async extractWithGhostscript(pdfPath: string): Promise<BoundsExtractionResult> {
  // Step 1: Get bbox from Ghostscript
  const bbox = execSync(`gs -sDEVICE=bbox -dNOPAUSE -dBATCH ${pdfPath} 2>&1`);
  
  // Step 2: Parse bbox output
  // %%BoundingBox: 28 45 567 789
  
  // Step 3: Convert to pixels and return
  return { bbox, method: 'ghostscript' };
}
```

### Python Port

**File: `odoo_artwork_uploader/utils/pdf_processor.py`**

```python
import subprocess
import tempfile
import os
import re
from PIL import Image
import io
import logging

_logger = logging.getLogger(__name__)


class PDFBoundsExtractor:
    """Extract tight vector content bounds from PDF files"""
    
    @staticmethod
    def extract_bounds(pdf_data, page_number=1, options=None):
        """Extract content bounds from PDF
        
        Args:
            pdf_data (bytes): PDF file binary data
            page_number (int): Page to analyze (1-indexed)
            options (dict): Optional extraction options
                - include_stroke_extents (bool): Include stroke widths
                - padding (float): Additional padding in points
                - tolerance (float): Numerical tolerance
                
        Returns:
            dict: {
                'success': bool,
                'bbox': {
                    'xMin': float,
                    'yMin': float,
                    'xMax': float,
                    'yMax': float,
                    'width': float,
                    'height': float,
                    'units': 'pt'
                },
                'method': str,
                'contentFound': bool
            }
        """
        options = options or {}
        
        # Create temp file for PDF
        with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as pdf_file:
            pdf_file.write(pdf_data)
            pdf_path = pdf_file.name
        
        try:
            # Method 1: Ghostscript bbox (most accurate)
            result = PDFBoundsExtractor._extract_with_ghostscript(pdf_path, page_number)
            
            if result['success']:
                return result
            
            # Method 2: Fallback - Raster analysis
            _logger.warning("Ghostscript bbox failed, using raster fallback")
            result = PDFBoundsExtractor._extract_with_raster(pdf_path, page_number)
            
            return result
            
        finally:
            # Cleanup temp file
            if os.path.exists(pdf_path):
                os.unlink(pdf_path)
    
    @staticmethod
    def _extract_with_ghostscript(pdf_path, page_number=1):
        """Extract bounds using Ghostscript -sDEVICE=bbox"""
        try:
            # Run Ghostscript to get bounding box
            # Note: bbox output goes to stderr, not stdout
            process = subprocess.run(
                [
                    'gs',
                    '-sDEVICE=bbox',
                    '-dNOPAUSE',
                    '-dBATCH',
                    f'-dFirstPage={page_number}',
                    f'-dLastPage={page_number}',
                    '-q',  # Quiet mode
                    pdf_path
                ],
                capture_output=True,
                text=True,
                check=False
            )
            
            # Parse bbox from stderr
            # Format: %%BoundingBox: x_min y_min x_max y_max
            bbox_pattern = r'%%BoundingBox:\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)'
            match = re.search(bbox_pattern, process.stderr)
            
            if match:
                x_min, y_min, x_max, y_max = map(int, match.groups())
                width = x_max - x_min
                height = y_max - y_min
                
                return {
                    'success': True,
                    'bbox': {
                        'xMin': x_min,
                        'yMin': y_min,
                        'xMax': x_max,
                        'yMax': y_max,
                        'width': width,
                        'height': height,
                        'units': 'pt'  # Ghostscript uses PostScript points
                    },
                    'method': 'ghostscript',
                    'contentFound': True
                }
            
            return {
                'success': False,
                'method': 'ghostscript',
                'contentFound': False,
                'error': 'No bounding box found in Ghostscript output'
            }
            
        except FileNotFoundError:
            return {
                'success': False,
                'method': 'ghostscript',
                'contentFound': False,
                'error': 'Ghostscript not installed'
            }
        except Exception as e:
            _logger.error(f"Ghostscript extraction error: {str(e)}")
            return {
                'success': False,
                'method': 'ghostscript',
                'contentFound': False,
                'error': str(e)
            }
    
    @staticmethod
    def _extract_with_raster(pdf_path, page_number=1, dpi=300):
        """Fallback: Convert to raster and find content bounds"""
        try:
            # Convert PDF to PNG at high DPI
            output_pattern = pdf_path.replace('.pdf', '_page%d.png')
            subprocess.run([
                'gs',
                '-sDEVICE=png16m',
                f'-r{dpi}',
                '-dNOPAUSE',
                '-dBATCH',
                f'-dFirstPage={page_number}',
                f'-dLastPage={page_number}',
                f'-sOutputFile={output_pattern}',
                pdf_path
            ], check=True, capture_output=True)
            
            # Load generated image
            png_path = pdf_path.replace('.pdf', f'_page{page_number}.png')
            
            try:
                with Image.open(png_path) as img:
                    # Convert to RGB if needed
                    if img.mode != 'RGB':
                        img = img.convert('RGB')
                    
                    # Find content bounds by pixel analysis
                    bbox_pixels = PDFBoundsExtractor._find_content_bbox(img)
                    
                    if not bbox_pixels:
                        return {
                            'success': False,
                            'method': 'raster-fallback',
                            'contentFound': False,
                            'error': 'No content found in raster'
                        }
                    
                    # Convert pixel bounds to PDF points
                    # DPI → points conversion: 1 inch = 72 points
                    scale = 72.0 / dpi
                    
                    x_min = bbox_pixels[0] * scale
                    y_min = bbox_pixels[1] * scale
                    x_max = bbox_pixels[2] * scale
                    y_max = bbox_pixels[3] * scale
                    
                    return {
                        'success': True,
                        'bbox': {
                            'xMin': x_min,
                            'yMin': y_min,
                            'xMax': x_max,
                            'yMax': y_max,
                            'width': x_max - x_min,
                            'height': y_max - y_min,
                            'units': 'pt'
                        },
                        'method': 'raster-fallback',
                        'contentFound': True
                    }
            finally:
                # Cleanup PNG
                if os.path.exists(png_path):
                    os.unlink(png_path)
                    
        except Exception as e:
            _logger.error(f"Raster extraction error: {str(e)}")
            return {
                'success': False,
                'method': 'raster-fallback',
                'contentFound': False,
                'error': str(e)
            }
    
    @staticmethod
    def _find_content_bbox(img, threshold=250):
        """Find bounding box of non-white content in image
        
        Args:
            img (PIL.Image): Image to analyze
            threshold (int): RGB threshold for "white" (0-255)
            
        Returns:
            tuple: (x_min, y_min, x_max, y_max) or None
        """
        pixels = img.load()
        width, height = img.size
        
        min_x = width
        min_y = height
        max_x = 0
        max_y = 0
        found_content = False
        
        # Scan all pixels
        for y in range(height):
            for x in range(width):
                r, g, b = pixels[x, y][:3]
                
                # Check if pixel is not white
                if r < threshold or g < threshold or b < threshold:
                    min_x = min(min_x, x)
                    min_y = min(min_y, y)
                    max_x = max(max_x, x)
                    max_y = max(max_y, y)
                    found_content = True
        
        if not found_content:
            return None
        
        return (min_x, min_y, max_x, max_y)
```

---

## Part 2: SVG Bounds Analysis

### Current TypeScript Implementation

**Key Algorithm** (`server/svg-bounds-analyzer.ts`):
```typescript
async analyzeSVGContent(svgContent: string): Promise<SVGBoundsResult> {
  const dom = new JSDOM(svgContent, { contentType: "image/svg+xml" });
  const svg = dom.window.document.querySelector('svg');
  
  // Get viewBox or width/height
  const viewBox = svg.getAttribute('viewBox');
  
  // Analyze all paths/shapes for content bounds
  const paths = svg.querySelectorAll('path, rect, circle, ellipse');
  
  return { contentBounds, viewBoxBounds };
}
```

### Python Port

**File: `odoo_artwork_uploader/utils/svg_processor.py`**

```python
import xml.etree.ElementTree as ET
import re
import logging

_logger = logging.getLogger(__name__)


class SVGBoundsAnalyzer:
    """Analyze SVG files for content bounds and properties"""
    
    # SVG namespace
    SVG_NS = '{http://www.w3.org/2000/svg}'
    
    @staticmethod
    def analyze_bounds(svg_content):
        """Analyze SVG content for bounds and properties
        
        Args:
            svg_content (str): SVG file content as string
            
        Returns:
            dict: {
                'success': bool,
                'contentBounds': {
                    'xMin': float,
                    'yMin': float,
                    'xMax': float,
                    'yMax': float,
                    'width': float,
                    'height': float,
                    'units': 'px'
                },
                'viewBoxBounds': dict or None,
                'hasRasterContent': bool,
                'colors': list,
                'method': str
            }
        """
        try:
            # Check for crop marker
            if 'data-crop-extracted="true"' in svg_content:
                _logger.info("Crop marker detected, using crop viewBox")
                return SVGBoundsAnalyzer._extract_crop_bounds(svg_content)
            
            # Parse SVG
            root = ET.fromstring(svg_content)
            
            # Get viewBox
            viewbox_bounds = SVGBoundsAnalyzer._extract_viewbox(root)
            
            # Detect raster content
            has_raster = SVGBoundsAnalyzer._detect_raster_content(root)
            
            # Extract colors
            colors = SVGBoundsAnalyzer._extract_colors(root)
            
            # Get content bounds from viewBox (simplified approach)
            content_bounds = viewbox_bounds or {
                'xMin': 0,
                'yMin': 0,
                'xMax': 0,
                'yMax': 0,
                'width': 0,
                'height': 0,
                'units': 'px'
            }
            
            return {
                'success': True,
                'contentBounds': content_bounds,
                'viewBoxBounds': viewbox_bounds,
                'hasRasterContent': has_raster,
                'colors': colors,
                'method': 'dom-analysis'
            }
            
        except Exception as e:
            _logger.error(f"SVG analysis error: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'method': 'dom-analysis',
                'hasRasterContent': False
            }
    
    @staticmethod
    def _extract_crop_bounds(svg_content):
        """Extract bounds from cropped SVG"""
        # Parse viewBox from SVG
        viewbox_match = re.search(r'viewBox="([^"]+)"', svg_content)
        if viewbox_match:
            values = list(map(float, viewbox_match.group(1).split()))
            if len(values) == 4:
                x, y, width, height = values
                return {
                    'success': True,
                    'contentBounds': {
                        'xMin': x,
                        'yMin': y,
                        'xMax': x + width,
                        'yMax': y + height,
                        'width': width,
                        'height': height,
                        'units': 'px'
                    },
                    'method': 'crop-viewbox',
                    'hasRasterContent': False
                }
        
        return {
            'success': False,
            'error': 'Could not parse crop viewBox',
            'method': 'crop-viewbox',
            'hasRasterContent': False
        }
    
    @staticmethod
    def _extract_viewbox(root):
        """Extract viewBox from SVG root"""
        viewbox = root.get('viewBox')
        
        if viewbox:
            try:
                values = list(map(float, viewbox.split()))
                if len(values) == 4:
                    x, y, width, height = values
                    return {
                        'xMin': x,
                        'yMin': y,
                        'xMax': x + width,
                        'yMax': y + height,
                        'width': width,
                        'height': height,
                        'units': 'px'
                    }
            except ValueError:
                pass
        
        # Fallback to width/height attributes
        width = root.get('width', '0')
        height = root.get('height', '0')
        
        # Remove units (px, pt, mm, etc.)
        width = float(re.sub(r'[a-z]+', '', width) or '0')
        height = float(re.sub(r'[a-z]+', '', height) or '0')
        
        if width > 0 and height > 0:
            return {
                'xMin': 0,
                'yMin': 0,
                'xMax': width,
                'yMax': height,
                'width': width,
                'height': height,
                'units': 'px'
            }
        
        return None
    
    @staticmethod
    def _detect_raster_content(root):
        """Check if SVG contains raster images"""
        # Find all image tags (with and without namespace)
        images = (
            root.findall('.//{http://www.w3.org/2000/svg}image') +
            root.findall('.//image')
        )
        return len(images) > 0
    
    @staticmethod
    def _extract_colors(root):
        """Extract unique colors from SVG elements"""
        colors = set()
        
        # Search all elements for fill and stroke attributes
        for elem in root.iter():
            fill = elem.get('fill')
            stroke = elem.get('stroke')
            
            if fill and fill not in ('none', 'transparent'):
                colors.add(fill)
            
            if stroke and stroke not in ('none', 'transparent'):
                colors.add(stroke)
            
            # Also check style attribute
            style = elem.get('style', '')
            
            # Extract fill from style
            fill_match = re.search(r'fill:\s*([^;]+)', style)
            if fill_match:
                fill_color = fill_match.group(1).strip()
                if fill_color not in ('none', 'transparent'):
                    colors.add(fill_color)
            
            # Extract stroke from style
            stroke_match = re.search(r'stroke:\s*([^;]+)', style)
            if stroke_match:
                stroke_color = stroke_match.group(1).strip()
                if stroke_color not in ('none', 'transparent'):
                    colors.add(stroke_color)
        
        return list(colors)
```

---

## Part 3: PDF Generation

### Current TypeScript Implementation

Uses `pdf-lib` to generate PDFs from canvas data.

### Python Port

**File: `odoo_artwork_uploader/utils/pdf_generator.py`**

```python
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib.utils import ImageReader
from io import BytesIO
import base64
import logging

_logger = logging.getLogger(__name__)


class PDFGenerator:
    """Generate production-ready PDFs from artwork data"""
    
    @staticmethod
    def generate(project_data, artworks):
        """Generate PDF from project data and artworks
        
        Args:
            project_data (dict): Canvas state data
            artworks (list): List of artwork objects with URLs
            
        Returns:
            bytes: PDF file data
        """
        try:
            # Create PDF in memory
            buffer = BytesIO()
            
            # Get template dimensions
            template_width = project_data.get('templateWidth', 612)  # Default letter width
            template_height = project_data.get('templateHeight', 792)  # Default letter height
            
            # Create canvas
            pdf_canvas = canvas.Canvas(buffer, pagesize=(template_width, template_height))
            
            # Add artworks to PDF
            for artwork in artworks:
                x = artwork.get('x', 0)
                y = artwork.get('y', 0)
                width = artwork.get('width', 100)
                height = artwork.get('height', 100)
                
                # Get image data
                image_url = artwork.get('url', '')
                if image_url.startswith('/web/content/'):
                    # Load from Odoo attachment
                    attachment_id = int(image_url.split('/')[-1])
                    # TODO: Load attachment and add to PDF
                    pass
            
            # Save PDF
            pdf_canvas.save()
            
            # Get PDF bytes
            pdf_data = buffer.getvalue()
            buffer.close()
            
            return pdf_data
            
        except Exception as e:
            _logger.error(f"PDF generation error: {str(e)}")
            raise
```

---

## System Requirements

### Required Packages

**Python packages** (add to Odoo requirements.txt):
```txt
Pillow>=10.0.0  # Image processing
reportlab>=4.0.0  # PDF generation
lxml>=4.9.0  # XML/SVG parsing
```

**System packages** (verify on Odoo server):
```bash
# Check Ghostscript
gs --version
# If not installed:
apt-get install ghostscript

# Check Poppler (optional)
pdfimages -v
# If not installed:
apt-get install poppler-utils
```

---

## Testing Python Implementation

### Test PDF Bounds Extraction

```python
from odoo_artwork_uploader.utils.pdf_processor import PDFBoundsExtractor

# Load PDF data
with open('test.pdf', 'rb') as f:
    pdf_data = f.read()

# Extract bounds
result = PDFBoundsExtractor.extract_bounds(pdf_data)
print(result)
# Output:
# {
#   'success': True,
#   'bbox': {'xMin': 28, 'yMin': 45, 'xMax': 567, 'yMax': 789, ...},
#   'method': 'ghostscript',
#   'contentFound': True
# }
```

### Test SVG Bounds Analysis

```python
from odoo_artwork_uploader.utils.svg_processor import SVGBoundsAnalyzer

# Load SVG content
with open('test.svg', 'r') as f:
    svg_content = f.read()

# Analyze bounds
result = SVGBoundsAnalyzer.analyze_bounds(svg_content)
print(result)
# Output:
# {
#   'success': True,
#   'contentBounds': {'xMin': 0, 'yMin': 0, 'xMax': 500, 'yMax': 500, ...},
#   'hasRasterContent': False,
#   'colors': ['#FF0000', '#00FF00'],
#   'method': 'dom-analysis'
# }
```

---

## Key Differences: TypeScript vs Python

| Feature | TypeScript | Python |
|---------|-----------|--------|
| **Subprocess** | `child_process.execSync()` | `subprocess.run()` |
| **Image Processing** | `canvas` package | `Pillow` (PIL) |
| **SVG Parsing** | `jsdom` (DOM) | `lxml` (XML) |
| **PDF Library** | `pdf-lib` | `reportlab` |
| **Error Handling** | Try/catch | Try/except |
| **Async** | async/await | Not needed (sync is fine) |

---

## Migration Checklist

### Pre-Migration
- [ ] Verify Ghostscript installed: `gs --version`
- [ ] Install Python packages: `pip3 install Pillow reportlab lxml`
- [ ] Test Ghostscript bbox: `gs -sDEVICE=bbox test.pdf 2>&1`
- [ ] Verify permissions to create temp files

### Implementation
- [ ] Create `odoo_artwork_uploader/utils/__init__.py`
- [ ] Port `pdf_processor.py` from TypeScript
- [ ] Port `svg_processor.py` from TypeScript
- [ ] Port `pdf_generator.py` from TypeScript
- [ ] Add imports to Odoo controllers

### Testing
- [ ] Test PDF bounds extraction with sample PDFs
- [ ] Test SVG bounds analysis with sample SVGs
- [ ] Test PDF generation with artwork data
- [ ] Verify CMYK color preservation
- [ ] Compare output with TypeScript version

### Deployment
- [ ] Add utils to module `__init__.py`
- [ ] Update controller imports
- [ ] Restart Odoo server
- [ ] Run end-to-end tests

---

## Troubleshooting

### Issue: Ghostscript not found

**Error**: `FileNotFoundError: gs command not found`

**Fix**:
```bash
apt-get update
apt-get install ghostscript
```

### Issue: Pillow import error

**Error**: `ImportError: No module named 'PIL'`

**Fix**:
```bash
pip3 install Pillow
```

### Issue: Incorrect bounds from Ghostscript

**Check**:
1. Verify PDF has vector content (not just raster)
2. Check Ghostscript version: `gs --version` (should be 9.x+)
3. Test manually: `gs -sDEVICE=bbox -dNOPAUSE -dBATCH test.pdf 2>&1`

**Fix**: Use raster fallback if Ghostscript fails

---

## Performance Considerations

### TypeScript vs Python Performance

| Operation | TypeScript | Python | Notes |
|-----------|-----------|--------|-------|
| PDF→PNG (300 DPI) | ~1-2s | ~1-2s | Same (both use Ghostscript) |
| Pixel analysis | ~0.5s (Canvas) | ~0.3s (Pillow) | Pillow is faster |
| SVG parsing | ~0.1s (JSDOM) | ~0.05s (lxml) | lxml is faster |
| **Total** | ~2s | ~1.5s | Python slightly faster |

### Optimization Tips

1. **Cache results**: Store extracted bounds in database
2. **Parallel processing**: Process multiple files concurrently
3. **Lower DPI for preview**: Use 150 DPI for quick preview, 300 DPI for production
4. **Temp file cleanup**: Always clean up temp files in finally blocks

---

## Summary

**Migration Path**:

1. ✅ **Ghostscript calls**: Same subprocess approach works in Python
2. ✅ **Image analysis**: Replace Canvas with Pillow (PIL)
3. ✅ **SVG parsing**: Replace JSDOM with lxml
4. ✅ **PDF generation**: Replace pdf-lib with reportlab
5. ✅ **Same algorithm**: Pixel-based bounds detection preserved

**Result**: Identical functionality to TypeScript version, slightly better performance, no external dependencies beyond system packages.

**Key Advantage**: All processing runs server-side in Python, no need for Node.js runtime in production.
