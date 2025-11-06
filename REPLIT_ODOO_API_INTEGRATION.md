# Replit App to Odoo API Integration Guide

## ✅ **YES - IT'S READY TO HOOK INTO ODOO VIA API, EVEN FROM IFRAME!**

This guide explains how to connect your Replit app to Odoo for product/pricing mapping and cart operations.

---

## Overview

The Replit app is **fully configured** to communicate with Odoo through REST APIs, with:
- ✅ **CORS enabled** on all Odoo endpoints (`cors='*'`)
- ✅ **CSRF disabled** for public API access
- ✅ **iframe-safe** communication
- ✅ **Environment-based configuration**

---

## Quick Setup

### 1. Set Odoo URL in Replit

Add the Odoo URL as an environment variable in your Replit project:

**In Replit Secrets:**
```
VITE_ODOO_URL=https://your-odoo-instance.com
```

**Example:**
```
VITE_ODOO_URL=https://support-atharva-serigraf-16-stage-0410-23999211.dev.odoo.com
```

> **Note:** The `VITE_` prefix is required for frontend environment variables in Vite.

### 2. Install Odoo Module

Install the `artwork_uploader` module in your Odoo instance:

```bash
# In Odoo apps menu:
Apps → Upload Module → artwork_uploader.zip
```

### 3. Configure Product/Template Mapping

Map artwork templates to Odoo products:

1. Go to **Artwork → Configuration → Template Mappings**
2. Click **Create**
3. For each template type, select the corresponding Odoo product
4. Set pricing for each product

**Example Mapping:**
| Template ID | Product | Price |
|------------|---------|-------|
| `template-A3` | Custom A3 Transfer | $25.00 |
| `template-A4` | Custom A4 Transfer | $15.00 |
| `template-dtf-a3` | DTF A3 Transfer | $30.00 |

---

## How It Works

### Architecture

```
┌─────────────────────┐
│   Replit App        │
│  (Running in        │
│   Odoo iframe)      │
└──────────┬──────────┘
           │ HTTPS + CORS
           ▼
┌─────────────────────┐
│   Odoo Instance     │
│                     │
│ ┌─────────────────┐ │
│ │ API Endpoints   │ │
│ │ - Templates     │ │
│ │ - Projects      │ │
│ │ - Logos         │ │
│ │ - Canvas        │ │
│ │ - PDF Gen       │ │
│ │ - Add to Cart   │ │
│ └─────────────────┘ │
│                     │
│ ┌─────────────────┐ │
│ │ Product Catalog │ │
│ │ - Mappings      │ │
│ │ - Pricing       │ │
│ └─────────────────┘ │
│                     │
│ ┌─────────────────┐ │
│ │ Shopping Cart   │ │
│ └─────────────────┘ │
└─────────────────────┘
```

### API Flow

1. **User designs in Replit app** (iframe in Odoo website)
2. **User clicks "Add to Cart"**
3. **Replit app calls:** `POST {ODOO_URL}/artwork/api/projects/{uuid}/add-to-cart`
4. **Odoo API:**
   - Fetches project data from database
   - Looks up product mapping for template type
   - Calculates price based on quantity
   - Adds to user's cart with artwork details
   - Returns cart URL
5. **Replit app redirects** user to cart page

---

## API Endpoints (All CORS-Enabled)

### 1. Get Templates
```javascript
GET {ODOO_URL}/artwork/api/templates
```

**Response:**
```json
[
  {
    "id": "template-A3",
    "name": "template_a3",
    "label": "A3 Template",
    "width": 297,
    "height": 420,
    "group": "Screen Printed Transfers",
    "description": "Full colour A3 transfers"
  }
]
```

### 2. Add to Cart
```javascript
POST {ODOO_URL}/artwork/api/projects/{uuid}/add-to-cart
Content-Type: application/json

{}  // Empty body or { "action": "new-project" | "view-cart" }
```

**Response:**
```json
{
  "success": true,
  "cart_url": "https://your-odoo.com/shop/cart",
  "order_id": 42,
  "line_id": 123
}
```

### 3. Generate PDF (Multi-Color Support)
```javascript
GET {ODOO_URL}/artwork/api/projects/{uuid}/generate-pdf
```

**Returns:**
- Multi-page PDF
- Page 1: Transparent background (production)
- Pages 2+: One per garment color with footer

---

## Product/Pricing Mapping Setup

### Model: `artwork.template.mapping`

Create mappings in Odoo to connect template IDs to products:

```python
# In Odoo Python console or setup script:
mapping = env['artwork.template.mapping'].create({
    'template_id': 'template-A3',
    'product_id': product_a3.id,  # Your Odoo product
    'name': 'A3 Full Colour Transfer Mapping'
})
```

### View Setup

The module creates a menu item:
- **Artwork → Configuration → Template Mappings**

From there you can:
1. View all mappings
2. Create new mappings
3. Edit pricing
4. Set default quantities

---

## Environment Variables Reference

### Replit App (Frontend)

```bash
# Required
VITE_ODOO_URL=https://your-odoo-instance.com

# Optional (for testing)
VITE_DEBUG_MODE=true
```

### Odoo Module (Backend)

No additional environment variables needed. The module uses Odoo's built-in:
- Database connection
- Session management
- Product catalog
- Shopping cart system

---

## Testing the Integration

### Test 1: Check CORS

```bash
# From browser console (while on Odoo site):
fetch('https://your-odoo.com/artwork/api/templates', {
  method: 'GET',
  headers: { 'Content-Type': 'application/json' }
})
.then(r => r.json())
.then(console.log)

# Should return template list without CORS errors
```

### Test 2: Add to Cart

```javascript
// In Replit app (upload-tool page):
1. Design artwork
2. Click "Add to Cart"
3. Check browser network tab for API call
4. Verify redirect to Odoo cart page
```

### Test 3: Multi-Color PDF

```javascript
// In Replit app:
1. Select Full-Colour, HD, or Metallic template
2. Add multiple garment colors (e.g., 10 Black, 5 Gold)
3. Generate PDF
4. Verify multi-page output with footers
```

---

## Iframe Embedding in Odoo

### Option 1: Embed in Website Page

1. Go to **Website → Pages**
2. Edit or create a page
3. Add **"Embedded Code"** block
4. Insert iframe code:

```html
<iframe 
  src="https://your-replit-app.replit.app" 
  width="100%" 
  height="800px" 
  frameborder="0"
  style="border: none;">
</iframe>
```

### Option 2: Direct Menu Item

Create a menu item in Odoo:

```xml
<menuitem 
  id="menu_artwork_designer" 
  name="Design Artwork"
  action="action_artwork_designer"
  parent="website.menu_website"
  sequence="10"/>

<record id="action_artwork_designer" model="ir.actions.act_url">
  <field name="name">Artwork Designer</field>
  <field name="url">https://your-replit-app.replit.app</field>
  <field name="target">new</field>
</record>
```

---

## Security Considerations

### Production Deployment

For production, **lock down CORS** to specific domains:

**Update controllers:**
```python
# Change from cors='*' to specific domain:
@http.route('/artwork/api/templates', 
            type='json', 
            auth='public', 
            methods=['GET', 'OPTIONS'], 
            cors='https://your-replit-app.replit.app',  # Specific domain
            csrf=False)
```

### Authentication

Current setup uses `auth='public'` for unauthenticated access.

**For authenticated access:**
```python
@http.route('/artwork/api/projects', 
            type='json', 
            auth='user',  # Requires login
            methods=['POST', 'OPTIONS'], 
            cors='*', 
            csrf=False)
```

---

## Troubleshooting

### Issue: CORS Errors

**Symptom:**
```
Access to fetch at 'https://odoo.com/artwork/api/templates' 
from origin 'https://replit.app' has been blocked by CORS policy
```

**Solution:**
1. Verify `cors='*'` is in all route decorators
2. Restart Odoo server
3. Clear browser cache

### Issue: 404 Not Found

**Symptom:**
```
GET /artwork/api/templates → 404
```

**Solution:**
1. Verify module is installed and activated
2. Check routes are registered: `/artwork/deploy/status`
3. Restart Odoo

### Issue: Add to Cart Fails

**Symptom:**
```
Error: No product mapped for this template
```

**Solution:**
1. Go to **Artwork → Configuration → Template Mappings**
2. Create mapping for the template type
3. Ensure product exists and is published

### Issue: Empty Cart Response

**Symptom:**
```json
{"error": "Project not found"}
```

**Solution:**
1. Verify project UUID is correct
2. Check project exists in database:
   ```sql
   SELECT * FROM artwork_project WHERE uuid = 'your-uuid';
   ```

---

## Multi-Color Order Comments

When adding multi-color orders to cart, Odoo automatically generates comments:

**Example Sale Order Line Comment:**
```
Custom A4 Transfer

10 Black
5 Gold
3 White

Ink Color: White
Template: A4 Full Colour
```

This format ensures production team has all color/quantity details.

---

## Next Steps

1. ✅ Set `VITE_ODOO_URL` in Replit secrets
2. ✅ Install `artwork_uploader` module in Odoo
3. ✅ Configure template-to-product mappings
4. ✅ Test add-to-cart flow
5. ✅ Embed iframe in Odoo website
6. ✅ Lock down CORS for production

---

## Support

For issues or questions:
- Check browser console for errors
- Review Odoo logs: `Settings → Technical → Logging`
- Use hot deployment system for quick fixes
- Contact: transferhelp@serigraf.com

**Integration Status: ✅ READY FOR DEPLOYMENT**
