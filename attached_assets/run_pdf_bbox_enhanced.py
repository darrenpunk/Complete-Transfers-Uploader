#!/usr/bin/env python3
"""
Enhanced PDF bounding box extractor using Ghostscript.
Matches the robust bounds extraction used in the Node.js system.

Usage:
  python3 run_pdf_bbox_enhanced.py /path/to/file.pdf            # page 1
  python3 run_pdf_bbox_enhanced.py /path/to/file.pdf --page 2   # specific page
"""

import argparse
import sys
import subprocess
import re
from pathlib import Path


def points_to_mm(value_points: float) -> float:
    """Convert PostScript points to millimeters (72 DPI standard)"""
    return value_points * (25.4 / 72.0)


def extract_bbox_mm(pdf_path: Path, page: int = 1):
    """
    Extract tight content bounding box from PDF using Ghostscript.
    
    Returns:
        dict with bbox in both points (pt) and millimeters (mm)
    """
    args = [
        "gs",
        "-dNOPAUSE",
        "-dBATCH",
        "-dQUIET",
        "-sDEVICE=bbox",
        f"-dFirstPage={page}",
        f"-dLastPage={page}",
        str(pdf_path)
    ]

    try:
        # Run ghostscript and capture both stdout and stderr
        result = subprocess.run(args, capture_output=True, text=True, check=True)
        output = result.stdout + result.stderr

        # Look for HiResBoundingBox first (higher precision), fallback to BoundingBox
        hires_match = re.search(r'%%HiResBoundingBox:\s*([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)', output)
        bbox_match = re.search(r'%%BoundingBox:\s*([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)', output)
        
        match = hires_match or bbox_match
        
        if match:
            x1, y1, x2, y2 = map(float, match.groups())
            
            # Handle PDFs with offset bounds (negative coordinates)
            # This matches the Node.js system's normalization logic
            if x1 < -100 or y1 < -100:
                offset_x = min(0, x1)
                offset_y = min(0, y1)
                x2 = x2 - offset_x
                y2 = y2 - offset_y
                x1 = 0
                y1 = 0
            
            width_pt = x2 - x1
            height_pt = y2 - y1
            
            # Validate bounds are reasonable
            if width_pt <= 0 or height_pt <= 0 or width_pt > 10000 or height_pt > 10000:
                return None
            
            return {
                # Points (PostScript/PDF coordinate system)
                "x1_pt": x1,
                "y1_pt": y1,
                "x2_pt": x2,
                "y2_pt": y2,
                "width_pt": width_pt,
                "height_pt": height_pt,
                
                # Millimeters (production/printing)
                "x1_mm": points_to_mm(x1),
                "y1_mm": points_to_mm(y1),
                "x2_mm": points_to_mm(x2),
                "y2_mm": points_to_mm(y2),
                "width_mm": points_to_mm(width_pt),
                "height_mm": points_to_mm(height_pt),
                
                # Metadata
                "method": "HiResBoundingBox" if hires_match else "BoundingBox"
            }
            
    except subprocess.CalledProcessError as e:
        raise Exception(f"Ghostscript failed: {e.stderr}")
    except FileNotFoundError:
        raise Exception("Ghostscript not found. Please install Ghostscript.")

    return None


def main():
    parser = argparse.ArgumentParser(
        description="Extract tight content bbox from PDF using Ghostscript (matches Node.js system)"
    )
    parser.add_argument("pdf", help="Path to PDF file")
    parser.add_argument("--page", "-p", type=int, default=1, help="Page number (1-indexed)")
    parser.add_argument("--json", action="store_true", help="Output JSON format")
    args = parser.parse_args()

    pdf_path = Path(args.pdf)
    if not pdf_path.exists():
        print(f"Error: file not found: {pdf_path}", file=sys.stderr)
        sys.exit(1)

    try:
        bbox = extract_bbox_mm(pdf_path, args.page)
        if not bbox:
            print("Error: could not extract bbox (is the PDF valid?)", file=sys.stderr)
            sys.exit(2)

        if args.json:
            import json
            print(json.dumps(bbox, indent=2))
        else:
            # Human-readable output
            print(f"Page {args.page} content bounds ({bbox['method']}):")
            print(f"")
            print(f"Points (PDF coordinates):")
            print(f"  width  = {bbox['width_pt']:.2f} pt")
            print(f"  height = {bbox['height_pt']:.2f} pt")
            print(f"  x1,y1  = {bbox['x1_pt']:.2f}, {bbox['y1_pt']:.2f}")
            print(f"  x2,y2  = {bbox['x2_pt']:.2f}, {bbox['y2_pt']:.2f}")
            print(f"")
            print(f"Millimeters (production):")
            print(f"  width  = {bbox['width_mm']:.2f} mm")
            print(f"  height = {bbox['height_mm']:.2f} mm")
            print(f"  x1,y1  = {bbox['x1_mm']:.2f}, {bbox['y1_mm']:.2f}")
            print(f"  x2,y2  = {bbox['x2_mm']:.2f}, {bbox['y2_mm']:.2f}")
            
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(3)


if __name__ == "__main__":
    main()
