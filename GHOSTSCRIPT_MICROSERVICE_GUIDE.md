# Ghostscript Bounds Extraction Microservice

## Overview

This external microservice provides Ghostscript-powered PDF bounds extraction for the Odoo module when Ghostscript is unavailable on Odoo.sh. The service is a lightweight FastAPI application that can be deployed for FREE on Render.com or Fly.io.

## Architecture

```
Odoo Module (Python)
    ↓ HTTP POST
Ghostscript Microservice (FastAPI)
    ↓ Process with Ghostscript
Return tight content bounds
```

**Key Benefits:**
- ✅ FREE hosting (fits in Render/Fly free tier)
- ✅ Ghostscript bbox accuracy preserved
- ✅ Works from Odoo.sh (no system packages needed)
- ✅ Can switch to Odoo.sh native if Ghostscript added later
- ✅ ~100ms processing time + network latency

---

## Part 1: Microservice Implementation

### File Structure
```
ghostscript-service/
├── app.py              # FastAPI application
├── requirements.txt    # Python dependencies
├── Dockerfile          # Container definition
├── render.yaml         # Render.com deployment config
└── README.md          # Service documentation
```

### 1.1 FastAPI Application (`app.py`)

```python
"""
Ghostscript PDF Bounds Extraction Microservice
FastAPI service providing precise PDF content bounding box extraction
"""

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import subprocess
import tempfile
import os
import re
from typing import Dict, Any
from pydantic import BaseModel

app = FastAPI(
    title="Ghostscript Bounds Service",
    description="Precise PDF content bounds extraction using Ghostscript bbox",
    version="1.0.0"
)

# CORS for Odoo.sh domains
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict to your Odoo.sh domain in production
    allow_methods=["POST"],
    allow_headers=["*"],
)

class BoundsResponse(BaseModel):
    """Response model for bounds extraction"""
    success: bool
    bbox: Dict[str, float] | None = None
    error: str | None = None
    method: str = "ghostscript_bbox"

@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "service": "Ghostscript Bounds Extraction",
        "status": "running",
        "version": "1.0.0"
    }

@app.get("/health")
async def health_check():
    """Verify Ghostscript is available"""
    try:
        result = subprocess.run(
            ["gs", "--version"],
            capture_output=True,
            text=True,
            timeout=5
        )
        return {
            "status": "healthy",
            "ghostscript_version": result.stdout.strip()
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "error": str(e)
        }

@app.post("/extract-bounds", response_model=BoundsResponse)
async def extract_bounds(
    file: UploadFile = File(...),
    include_cmyk: bool = False
):
    """
    Extract tight content bounds from PDF using Ghostscript bbox device
    
    Args:
        file: PDF file to process
        include_cmyk: Whether to detect CMYK colors (slower)
    
    Returns:
        BoundsResponse with bbox coordinates and dimensions
    """
    
    # Validate file type
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(
            status_code=400,
            detail="Only PDF files are supported"
        )
    
    # Create temporary file
    with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as temp_pdf:
        try:
            # Write uploaded file to temp location
            content = await file.read()
            temp_pdf.write(content)
            temp_pdf.flush()
            temp_path = temp_pdf.name
            
            # Run Ghostscript bbox extraction
            result = subprocess.run(
                [
                    'gs',
                    '-sDEVICE=bbox',
                    '-dNOPAUSE',
                    '-dBATCH',
                    '-dFirstPage=1',
                    '-dLastPage=1',
                    temp_path
                ],
                capture_output=True,
                text=True,
                timeout=30
            )
            
            # Parse bbox from stderr (Ghostscript outputs to stderr)
            output = result.stderr
            
            # Look for %%BoundingBox: x1 y1 x2 y2
            bbox_match = re.search(
                r'%%BoundingBox:\s+(\d+\.?\d*)\s+(\d+\.?\d*)\s+(\d+\.?\d*)\s+(\d+\.?\d*)',
                output
            )
            
            if not bbox_match:
                # Try HiResBoundingBox for more precision
                bbox_match = re.search(
                    r'%%HiResBoundingBox:\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)',
                    output
                )
            
            if bbox_match:
                x1, y1, x2, y2 = map(float, bbox_match.groups())
                
                # Calculate dimensions
                width_pt = x2 - x1
                height_pt = y2 - y1
                width_mm = width_pt * 0.352778
                height_mm = height_pt * 0.352778
                
                bbox_data = {
                    'xMin': round(x1, 2),
                    'yMin': round(y1, 2),
                    'xMax': round(x2, 2),
                    'yMax': round(y2, 2),
                    'width_pt': round(width_pt, 2),
                    'height_pt': round(height_pt, 2),
                    'width_mm': round(width_mm, 2),
                    'height_mm': round(height_mm, 2),
                }
                
                # Optional CMYK detection
                if include_cmyk:
                    bbox_data['has_cmyk'] = detect_cmyk(temp_path)
                
                return BoundsResponse(
                    success=True,
                    bbox=bbox_data,
                    method="ghostscript_bbox"
                )
            else:
                return BoundsResponse(
                    success=False,
                    error="Could not parse Ghostscript bbox output",
                    method="ghostscript_bbox"
                )
                
        except subprocess.TimeoutExpired:
            return BoundsResponse(
                success=False,
                error="Ghostscript processing timeout (>30s)",
                method="ghostscript_bbox"
            )
        except Exception as e:
            return BoundsResponse(
                success=False,
                error=f"Processing error: {str(e)}",
                method="ghostscript_bbox"
            )
        finally:
            # Clean up temp file
            if os.path.exists(temp_path):
                os.unlink(temp_path)

def detect_cmyk(pdf_path: str) -> bool:
    """Detect CMYK colors in PDF using Ghostscript inkcov"""
    try:
        result = subprocess.run(
            [
                'gs',
                '-o', '-',
                '-sDEVICE=inkcov',
                pdf_path
            ],
            capture_output=True,
            text=True,
            timeout=10
        )
        
        # Parse inkcov output (CMYK percentages)
        # Output format: "0.00000  0.00000  0.00000  0.00000 CMYK OK"
        # Non-zero CMYK values indicate CMYK content
        lines = result.stdout.strip().split('\n')
        for line in lines:
            if 'CMYK' in line:
                parts = line.split()
                if len(parts) >= 4:
                    c, m, y, k = map(float, parts[:4])
                    if c > 0 or m > 0 or y > 0 or k > 0:
                        return True
        
        return False
        
    except Exception:
        return False

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

### 1.2 Requirements (`requirements.txt`)

```
fastapi==0.104.1
uvicorn[standard]==0.24.0
python-multipart==0.0.6
```

### 1.3 Dockerfile

```dockerfile
FROM python:3.11-slim

# Install Ghostscript
RUN apt-get update && \
    apt-get install -y ghostscript && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY app.py .

# Expose port
EXPOSE 8000

# Run application
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
```

### 1.4 Render.com Deployment (`render.yaml`)

```yaml
services:
  - type: web
    name: ghostscript-bounds-service
    env: docker
    region: oregon
    plan: free
    healthCheckPath: /health
    envVars:
      - key: PORT
        value: 8000
```

---

## Part 2: Deployment Instructions

### Option A: Deploy to Render.com (FREE)

**Steps:**
1. Create GitHub repository with the microservice code
2. Sign up at [render.com](https://render.com)
3. Click "New +" → "Web Service"
4. Connect your GitHub repository
5. Configure:
   - **Environment:** Docker
   - **Plan:** Free
   - **Health Check Path:** `/health`
6. Click "Create Web Service"
7. Wait 3-5 minutes for deployment
8. Your service URL: `https://your-service.onrender.com`

**Free Tier Limits:**
- ✅ Spins down after 15 minutes of inactivity
- ✅ Spins up in ~30 seconds on first request
- ✅ 750 hours/month (always-on)
- ✅ Perfect for this use case

### Option B: Deploy to Fly.io (FREE)

**Steps:**
```bash
# Install Fly CLI
curl -L https://fly.io/install.sh | sh

# Login to Fly
fly auth login

# Initialize app
fly launch

# Deploy
fly deploy
```

**Free Tier Limits:**
- ✅ 3 shared-cpu-1x VMs
- ✅ 160GB outbound data transfer/month
- ✅ Always-on (no spin down)

---

## Part 3: Odoo Module Integration

### 3.1 Python Client Code for Odoo Controller

Add this to your Odoo module's Python controller:

```python
import requests
from odoo import http, _
from odoo.exceptions import UserError
import logging

_logger = logging.getLogger(__name__)

# Microservice URL (set in Odoo config or environment variable)
GHOSTSCRIPT_SERVICE_URL = "https://your-service.onrender.com"

def extract_pdf_bounds_remote(pdf_binary):
    """
    Extract PDF bounds using external Ghostscript microservice
    
    Args:
        pdf_binary: PDF file content as bytes
    
    Returns:
        dict: Bounds data with xMin, yMin, xMax, yMax, width_mm, height_mm
    """
    try:
        # Prepare file for upload
        files = {
            'file': ('artwork.pdf', pdf_binary, 'application/pdf')
        }
        
        # Call microservice
        response = requests.post(
            f"{GHOSTSCRIPT_SERVICE_URL}/extract-bounds",
            files=files,
            timeout=60  # 60 second timeout
        )
        
        response.raise_for_status()
        result = response.json()
        
        if result.get('success') and result.get('bbox'):
            _logger.info("Successfully extracted bounds via Ghostscript service")
            return result['bbox']
        else:
            error_msg = result.get('error', 'Unknown error')
            _logger.error(f"Bounds extraction failed: {error_msg}")
            raise UserError(_("Could not extract PDF bounds: %s") % error_msg)
            
    except requests.RequestException as e:
        _logger.error(f"Ghostscript service connection error: {str(e)}")
        raise UserError(_("PDF processing service unavailable. Please try again later."))
    except Exception as e:
        _logger.error(f"Unexpected error in bounds extraction: {str(e)}")
        raise UserError(_("Error processing PDF: %s") % str(e))

# Usage in your controller:
class ProofDesignerController(http.Controller):
    
    @http.route('/proofdesigner/upload', type='json', auth='user')
    def upload_artwork(self, file_data, **kwargs):
        """Handle artwork upload"""
        
        # Decode base64 file if needed
        import base64
        pdf_binary = base64.b64decode(file_data)
        
        # Extract bounds using microservice
        bounds = extract_pdf_bounds_remote(pdf_binary)
        
        # Store in database
        artwork = request.env['proofdesigner.artwork'].create({
            'name': kwargs.get('filename'),
            'file_data': file_data,
            'content_bounds': {
                'xMin': bounds['xMin'],
                'yMin': bounds['yMin'],
                'xMax': bounds['xMax'],
                'yMax': bounds['yMax'],
                'width_mm': bounds['width_mm'],
                'height_mm': bounds['height_mm'],
            }
        })
        
        return {
            'success': True,
            'artwork_id': artwork.id,
            'bounds': bounds
        }
```

### 3.2 Configuration in Odoo

Add to your `odoo.conf` or environment variables:

```ini
[options]
ghostscript_service_url = https://your-service.onrender.com
```

Access in code:
```python
from odoo import tools
GHOSTSCRIPT_SERVICE_URL = tools.config.get('ghostscript_service_url')
```

---

## Part 4: Performance & Caching

### 4.1 Cache Bounds in Database

Since bounds don't change once extracted, cache them:

```python
def get_or_extract_bounds(self, pdf_binary, artwork_id=None):
    """Get cached bounds or extract if needed"""
    
    # Check if already extracted
    if artwork_id:
        artwork = self.env['proofdesigner.artwork'].browse(artwork_id)
        if artwork.content_bounds:
            return artwork.content_bounds
    
    # Extract fresh
    bounds = extract_pdf_bounds_remote(pdf_binary)
    
    # Cache for future use
    if artwork_id:
        artwork.write({'content_bounds': bounds})
    
    return bounds
```

### 4.2 Handle Service Downtime

Add retry logic with exponential backoff:

```python
import time

def extract_pdf_bounds_remote(pdf_binary, max_retries=3):
    """Extract with retry logic"""
    
    for attempt in range(max_retries):
        try:
            # ... extraction code ...
            return bounds
            
        except requests.RequestException as e:
            if attempt < max_retries - 1:
                wait_time = 2 ** attempt  # 1s, 2s, 4s
                _logger.warning(f"Retry {attempt + 1}/{max_retries} after {wait_time}s")
                time.sleep(wait_time)
            else:
                raise UserError(_("PDF service unavailable after %s retries") % max_retries)
```

---

## Part 5: Testing the Service

### 5.1 Test Locally

```bash
# Build and run locally
docker build -t ghostscript-service .
docker run -p 8000:8000 ghostscript-service

# Test health endpoint
curl http://localhost:8000/health

# Test bounds extraction
curl -X POST http://localhost:8000/extract-bounds \
  -F "file=@test.pdf"
```

### 5.2 Test from Python

```python
import requests

# Test health
response = requests.get("http://localhost:8000/health")
print(response.json())

# Test bounds extraction
with open('test.pdf', 'rb') as f:
    response = requests.post(
        "http://localhost:8000/extract-bounds",
        files={'file': ('test.pdf', f, 'application/pdf')}
    )
    print(response.json())
```

---

## Part 6: Cost Analysis

### Free Tier Hosting (Render.com)

**Monthly Costs: $0**

**Limitations:**
- 750 hours/month
- Spins down after 15 minutes inactivity
- First request after spin-down: ~30s delay
- Subsequent requests: ~100ms

**For Your Use Case:**
- Average processing: 5-10 PDFs/hour during business hours
- Monthly: ~200 extractions
- Well within free tier limits ✅

### Paid Tier (Optional)

**Render.com Starter: $7/month**
- Always-on (no spin down)
- Faster processing
- Custom domain support

**When to upgrade:**
- Processing >50 PDFs/hour consistently
- Cannot tolerate 30s first-request delay
- Need guaranteed uptime SLA

---

## Part 7: Security Considerations

### 7.1 API Authentication

Add API key authentication:

```python
# In app.py
from fastapi import Security, HTTPException
from fastapi.security import APIKeyHeader

API_KEY = os.getenv("API_KEY", "your-secret-key-here")
api_key_header = APIKeyHeader(name="X-API-Key")

def verify_api_key(api_key: str = Security(api_key_header)):
    if api_key != API_KEY:
        raise HTTPException(status_code=403, detail="Invalid API key")
    return api_key

# Add to endpoint
@app.post("/extract-bounds")
async def extract_bounds(
    file: UploadFile = File(...),
    api_key: str = Security(verify_api_key)
):
    # ... processing ...
```

From Odoo:
```python
headers = {'X-API-Key': 'your-secret-key-here'}
response = requests.post(url, files=files, headers=headers)
```

### 7.2 File Size Limits

```python
# In app.py
MAX_FILE_SIZE = 200 * 1024 * 1024  # 200MB

@app.post("/extract-bounds")
async def extract_bounds(file: UploadFile = File(...)):
    # Check file size
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(413, "File too large (max 200MB)")
    
    # ... process ...
```

---

## Part 8: Monitoring & Logging

### 8.1 Add Logging

```python
import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

@app.post("/extract-bounds")
async def extract_bounds(file: UploadFile = File(...)):
    logging.info(f"Processing file: {file.filename}, size: {len(content)} bytes")
    
    # ... processing ...
    
    logging.info(f"Extracted bounds: {bbox_data}")
```

### 8.2 Monitor on Render.com

Render dashboard provides:
- Request logs
- CPU/Memory usage
- Response times
- Error rates

---

## Summary

### Quick Start Checklist

- [ ] Create GitHub repo with microservice code
- [ ] Deploy to Render.com (5 minutes)
- [ ] Get service URL (e.g., `https://your-service.onrender.com`)
- [ ] Add URL to Odoo configuration
- [ ] Update Odoo controller to call service
- [ ] Test with sample PDF
- [ ] Deploy to production

### Comparison: Odoo.sh Native vs Microservice

| Aspect | Odoo.sh Native (if Ghostscript added) | External Microservice |
|--------|--------------------------------------|----------------------|
| **Hosting Cost** | $0 | $0 (free tier) |
| **Processing Speed** | ~100ms | ~100ms + network (~50ms) |
| **Accuracy** | ✅ Perfect (Ghostscript) | ✅ Perfect (Ghostscript) |
| **Complexity** | ⭐ Simple (subprocess) | ⭐⭐ Moderate (HTTP calls) |
| **Maintenance** | ⭐ Odoo manages | ⭐⭐ You manage service |
| **Reliability** | ⭐⭐⭐ High | ⭐⭐ Good (free tier spins down) |

**Recommendation:** Use microservice as fallback while waiting for Odoo.sh to add Ghostscript. Can switch later if they comply.

---

## Next Steps

1. **Contact Odoo.sh support** with the support ticket (see ODOO_SH_GHOSTSCRIPT_REQUEST.md)
2. **Meanwhile, deploy microservice** to have working solution
3. **Update Odoo module** to call microservice
4. **Test thoroughly** before production deployment
5. **Monitor** service usage and consider paid tier if needed

The microservice ensures your migration can proceed while waiting for Odoo.sh response. Total deployment time: ~1 hour.
