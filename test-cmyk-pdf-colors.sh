#!/bin/bash

echo "🔍 Testing CMYK Color Preservation in Generated PDF"
echo "=================================================="

# Generate a fresh PDF
echo "📄 Generating new PDF..."
curl -s -X GET "http://localhost:5000/api/projects/361b1d9d-d82d-46c8-b148-7873bed8bcc5/generate-pdf" -o test-cmyk-preservation.pdf

# Check file size
FILE_SIZE=$(stat -c%s test-cmyk-preservation.pdf)
echo "📊 PDF Size: ${FILE_SIZE} bytes"

# Extract text and look for CMYK markers
echo "🎨 Checking for CMYK content..."
strings test-cmyk-preservation.pdf | grep -i "cmyk\|device" | head -5

# Look for specific CMYK color operators
echo "🔍 CMYK Color Operators:"
strings test-cmyk-preservation.pdf | grep -E "^\d+\.?\d* \d+\.?\d* \d+\.?\d* \d+\.?\d* k$" | head -3
strings test-cmyk-preservation.pdf | grep -E "^\d+\.?\d* \d+\.?\d* \d+\.?\d* \d+\.?\d* K$" | head -3

# Check for RGB vs CMYK color space
echo "🎨 Color Spaces:"
strings test-cmyk-preservation.pdf | grep -E "(DeviceRGB|DeviceCMYK|ICCBased)" | sort | uniq -c

echo "✅ Test completed. PDF generated with $(node verify-cmyk-colors.js test-cmyk-preservation.pdf | grep -o "YES\|NO")"