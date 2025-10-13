#!/usr/bin/env python3
"""
Minimal script: extract tight content bbox from a PDF page using Ghostscript.

Usage:
  python3 run_pdf_bbox.py /path/to/file.pdf            # page 1
  python3 run_pdf_bbox.py /path/to/file.pdf --page 2   # specific page
"""

import argparse
import sys
import subprocess
from pathlib import Path


def points_to_mm(value_points: float) -> float:
    return value_points * (25.4 / 72.0)


def extract_bbox_mm(pdf_path: Path, page: int = 1):
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

        for line in output.splitlines():
            if line.startswith("%%BoundingBox:"):
                parts = line.split()
                if len(parts) >= 5:
                    x1, y1, x2, y2 = map(float, parts[1:5])
                    return {
                        "x1_mm": points_to_mm(x1),
                        "y1_mm": points_to_mm(y1),
                        "x2_mm": points_to_mm(x2),
                        "y2_mm": points_to_mm(y2),
                        "width_mm": points_to_mm(x2 - x1),
                        "height_mm": points_to_mm(y2 - y1),
                    }
    except subprocess.CalledProcessError as e:
        raise Exception(f"Ghostscript failed: {e.stderr}")
    except FileNotFoundError:
        raise Exception("Ghostscript not found. Please install Ghostscript.")

    return None


def main():
    parser = argparse.ArgumentParser(
        description="Extract tight content bbox (mm) from a PDF using Ghostscript"
    )
    parser.add_argument("pdf", help="Path to PDF file")
    parser.add_argument("--page", "-p", type=int, default=1, help="Page number (1-indexed)")
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

        # Human-readable output
        print(f"Page {args.page} bbox (mm):")
        print(f"  width  = {bbox['width_mm']:.2f}")
        print(f"  height = {bbox['height_mm']:.2f}")
        print(f"  x1,y1  = {bbox['x1_mm']:.2f}, {bbox['y1_mm']:.2f}")
        print(f"  x2,y2  = {bbox['x2_mm']:.2f}, {bbox['y2_mm']:.2f}")

        # Machine-friendly line
        print(
            f"bbox_mm width={bbox['width_mm']:.6f} height={bbox['height_mm']:.6f} "
            f"x1={bbox['x1_mm']:.6f} y1={bbox['y1_mm']:.6f} x2={bbox['x2_mm']:.6f} y2={bbox['y2_mm']:.6f}"
        )
    except Exception as e:
        print(f"Ghostscript error: {e}", file=sys.stderr)
        sys.exit(3)


if __name__ == "__main__":
    main()


