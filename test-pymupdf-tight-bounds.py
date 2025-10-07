#!/usr/bin/env python3
"""
PyMuPDF Tight Content Bounds vs Ghostscript bbox
This tests the CORRECT PyMuPDF method for tight content extraction
"""

import subprocess
import sys
import re
from pathlib import Path

try:
    import fitz
except ImportError:
    print("Installing PyMuPDF...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "PyMuPDF==1.23.26"])
    print("Please run script again: python3 test-pymupdf-tight-bounds.py")
    sys.exit(0)

def get_tight_bounds_pymupdf(pdf_path):
    """Extract TIGHT content bounds using PyMuPDF (not page size!)"""
    try:
        doc = fitz.open(pdf_path)
        page = doc[0]
        
        # METHOD 1: Get bounds from actual page content
        # This excludes whitespace and gives tight bounds
        rect = page.get_text("dict")["bbox"]  # Tight text bounds
        
        # METHOD 2: Analyze all drawings (paths, shapes)
        drawings = page.get_drawings()
        
        if drawings:
            # Calculate bounds from vector drawings
            min_x = min(d["rect"].x0 for d in drawings)
            min_y = min(d["rect"].y0 for d in drawings)
            max_x = max(d["rect"].x1 for d in drawings)
            max_y = max(d["rect"].y1 for d in drawings)
            
            # Combine with text bounds if exists
            if rect[2] > 0:  # Has text
                min_x = min(min_x, rect[0])
                min_y = min(min_y, rect[1])
                max_x = max(max_x, rect[2])
                max_y = max(max_y, rect[3])
        else:
            # No drawings, use text bounds
            min_x, min_y, max_x, max_y = rect
        
        # METHOD 3: Check images
        images = page.get_images()
        for img in images:
            # Get image position
            img_rects = page.get_image_rects(img[0])
            for img_rect in img_rects:
                min_x = min(min_x, img_rect.x0)
                min_y = min(min_y, img_rect.y0)
                max_x = max(max_x, img_rect.x1)
                max_y = max(max_y, img_rect.y1)
        
        # Calculate dimensions
        width_pt = max_x - min_x
        height_pt = max_y - min_y
        width_mm = width_pt * 0.352778
        height_mm = height_pt * 0.352778
        
        result = {
            'method': 'pymupdf_tight',
            'bbox': {
                'xMin': round(min_x, 2),
                'yMin': round(min_y, 2),
                'xMax': round(max_x, 2),
                'yMax': round(max_y, 2),
                'width_pt': round(width_pt, 2),
                'height_pt': round(height_pt, 2),
                'width_mm': round(width_mm, 2),
                'height_mm': round(height_mm, 2),
            }
        }
        
        doc.close()
        return result
        
    except Exception as e:
        return {'error': str(e), 'method': 'pymupdf_tight'}

def get_bounds_ghostscript(pdf_path):
    """Extract bounds using Ghostscript bbox device"""
    try:
        result = subprocess.run(
            ['gs', '-sDEVICE=bbox', '-dNOPAUSE', '-dBATCH', pdf_path],
            capture_output=True,
            text=True
        )
        
        output = result.stderr
        bbox_match = re.search(r'%%BoundingBox:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)', output)
        
        if bbox_match:
            x1, y1, x2, y2 = map(float, bbox_match.groups())
            width_pt = x2 - x1
            height_pt = y2 - y1
            
            return {
                'method': 'ghostscript',
                'bbox': {
                    'xMin': round(x1, 2),
                    'yMin': round(y1, 2),
                    'xMax': round(x2, 2),
                    'yMax': round(y2, 2),
                    'width_pt': round(width_pt, 2),
                    'height_pt': round(height_pt, 2),
                    'width_mm': round(width_pt * 0.352778, 2),
                    'height_mm': round(height_pt * 0.352778, 2),
                }
            }
        else:
            return {'error': 'Could not parse output', 'method': 'ghostscript'}
            
    except Exception as e:
        return {'error': str(e), 'method': 'ghostscript'}

def compare_results(gs_result, pm_result, filename):
    """Compare results"""
    print(f"\n{'='*80}")
    print(f"📄 {filename}")
    print(f"{'='*80}")
    
    if 'error' in gs_result:
        print(f"❌ Ghostscript: {gs_result['error']}")
        return False
    
    if 'error' in pm_result:
        print(f"❌ PyMuPDF: {pm_result['error']}")
        return False
    
    gs_bbox = gs_result['bbox']
    pm_bbox = pm_result['bbox']
    
    print(f"\n🔍 Bounding Box Comparison:")
    print(f"  Ghostscript: {gs_bbox['width_mm']}mm × {gs_bbox['height_mm']}mm")
    print(f"  PyMuPDF:     {pm_bbox['width_mm']}mm × {pm_bbox['height_mm']}mm")
    
    width_diff = abs(gs_bbox['width_mm'] - pm_bbox['width_mm'])
    height_diff = abs(gs_bbox['height_mm'] - pm_bbox['height_mm'])
    
    width_match = width_diff < 1.0
    height_match = height_diff < 1.0
    
    print(f"\n  Width difference:  {width_diff:.2f}mm {'✅' if width_match else '⚠️'}")
    print(f"  Height difference: {height_diff:.2f}mm {'✅' if height_match else '⚠️'}")
    
    # Detailed comparison
    print(f"\n📐 Detailed Coordinates:")
    print(f"  {'Metric':<15} {'Ghostscript':<15} {'PyMuPDF':<15} {'Diff':<15}")
    print(f"  {'-'*15} {'-'*15} {'-'*15} {'-'*15}")
    
    for key in ['width_pt', 'height_pt']:
        gs_val = gs_bbox[key]
        pm_val = pm_bbox[key]
        diff = abs(gs_val - pm_val)
        print(f"  {key:<15} {gs_val:<15} {pm_val:<15} {diff:.2f}")
    
    overall_match = width_match and height_match
    
    if overall_match:
        print(f"\n✅ MATCH - Difference within 1mm tolerance")
    else:
        print(f"\n⚠️  MISMATCH - Difference exceeds 1mm")
    
    return overall_match

def main():
    print("="*80)
    print("🧪 PyMuPDF TIGHT Content Bounds vs Ghostscript bbox")
    print("="*80)
    
    # Find test PDFs
    uploads_dir = Path('uploads')
    if not uploads_dir.exists():
        print("\n❌ No uploads/ directory found")
        return
    
    pdf_files = list(uploads_dir.glob('*.pdf'))[:5]
    
    if not pdf_files:
        print("\n❌ No PDF files found")
        return
    
    print(f"\n📁 Testing {len(pdf_files)} PDF files\n")
    
    all_match = True
    
    for pdf_path in pdf_files:
        gs_result = get_bounds_ghostscript(str(pdf_path))
        pm_result = get_tight_bounds_pymupdf(str(pdf_path))
        
        match = compare_results(gs_result, pm_result, pdf_path.name)
        
        if not match:
            all_match = False
    
    # Summary
    print(f"\n{'='*80}")
    print("📋 FINAL SUMMARY")
    print(f"{'='*80}")
    
    if all_match:
        print("\n✅ ALL TESTS PASSED!")
        print("   PyMuPDF tight bounds match Ghostscript bbox")
        print("   Migration is safe to proceed")
    else:
        print("\n⚠️  SOME DIFFERENCES DETECTED")
        print("   PyMuPDF tight bounds method needs refinement")
    
    print(f"\n{'='*80}\n")

if __name__ == "__main__":
    main()
