# Odoo Module Installation Guide for Developers

## 📦 Module: `odoo_artwork_uploader`

**Version:** 16.0.1.0.0  
**Compatible with:** Odoo 16  
**Author:** Complete Transfers  
**License:** LGPL-3

---

## 🎯 Quick Overview

This module integrates the Replit artwork design app with Odoo, enabling:
- REST API endpoints for the Replit app (running in iframe)
- Product/template mapping for pricing
- Shopping cart integration
- Multi-color garment order support
- Automated PDF generation and sales order creation

---

## 📋 Prerequisites

Before installation, ensure:
- ✅ Odoo 16 is installed and running
- ✅ Required dependencies are available: `sale`, `website`, `website_sale`, `product`
- ✅ Python packages: `reportlab` (for PDF generation)
- ✅ Server access or Apps → Upload Module permissions

---

## 🚀 Installation Methods

### Method 1: Git Clone (Recommended)

**Step 1: Clone to Odoo addons directory**

```bash
# Navigate to your Odoo addons path
cd /path/to/odoo/addons/

# Clone the repository
git clone https://github.com/yourusername/your-repo.git temp_repo

# Move just the module to addons
mv temp_repo/odoo_artwork_uploader ./

# Clean up
rm -rf temp_repo
```

**Step 2: Update Odoo addons path (if needed)**

Add the addons directory to your `odoo.conf`:
```ini
[options]
addons_path = /path/to/odoo/addons,/path/to/custom/addons
```

**Step 3: Restart Odoo**

```bash
# Stop Odoo
sudo systemctl stop odoo

# Restart Odoo
sudo systemctl start odoo

# Or if running manually:
./odoo-bin -c /path/to/odoo.conf
```

**Step 4: Update Apps List**

In Odoo UI:
1. Go to **Apps** menu
2. Click **Update Apps List** (top menu, may need debug mode)
3. Search for "artwork" or "Artwork Uploader"
4. Click **Install**

---

### Method 2: Copy Module Folder

**Step 1: Copy the module**

```bash
# From this project
cp -r odoo_artwork_uploader /path/to/odoo/addons/

# Verify permissions
chmod -R 755 /path/to/odoo/addons/odoo_artwork_uploader
```

**Step 2: Follow Steps 3-4 from Method 1**

---

### Method 3: ZIP Upload (Requires Fixed ZIP)

**Use the fixed ZIP file:** `odoo_artwork_uploader_fixed.zip`

**In Odoo:**
1. Go to **Apps**
2. Click **Upload** button (top right corner)
3. Select `odoo_artwork_uploader_fixed.zip`
4. Click **Upload & Install**

⚠️ **Note:** If you see errors about model access, the ZIP structure may be incorrect. Use Method 1 instead.

---

## 🔧 Post-Installation Configuration

### 1. Verify Installation

Check that the module is installed:
```bash
# In Odoo shell
./odoo-bin shell -d your_database

>>> env['ir.module.module'].search([('name', '=', 'odoo_artwork_uploader')])
```

Expected output: Module record with `state='installed'`

---

### 2. Configure Template Mappings

After installation, you must map artwork templates to Odoo products:

**Navigate to:**
```
Artwork → Configuration → Template Mappings
```

**Create mappings for each template:**

| Template ID | Odoo Product | Price |
|-------------|--------------|-------|
| `full-colour-a3` | Custom A3 Transfer | $25.00 |
| `full-colour-a4` | Custom A4 Transfer | $15.00 |
| `hd-a3` | HD A3 Transfer | $30.00 |
| `dtf-large` | DTF Large Transfer | $35.00 |

**Steps:**
1. Click **Create**
2. Enter **Template ID** (must match Replit app template IDs exactly)
3. Select **Product** from dropdown
4. Enter **Price**
5. Save

---

### 3. Set Up Products

The module requires products to exist in Odoo. Create them if needed:

**Navigate to:**
```
Sales → Products → Products
```

**Create product for each template type:**
- Name: "Custom A3 Transfer"
- Type: Service or Storable Product
- Sales Price: (will be overridden by template mapping)
- Category: Transfers / Custom Apparel

---

### 4. Enable Website Integration (Optional)

To add "Order Transfers" button to your website:

**Navigate to:**
```
Website → Edit → Blocks → Artwork Uploader → Order Transfers Button
```

Drag the snippet to your page.

---

## 🌐 Replit App Configuration

### Set Environment Variable

In your **Replit** project, add this secret:

```
VITE_ODOO_URL=https://your-odoo-instance.com
```

**Example:**
```
VITE_ODOO_URL=https://mycompany.odoo.com
VITE_ODOO_URL=https://support-atharva-serigraf-16-stage-0410-23999211.dev.odoo.com
```

⚠️ **Important:** After adding the secret, **redeploy** your Replit app for it to take effect.

---

## 🔌 API Endpoints

The module exposes these REST API endpoints (all CORS-enabled):

### Public Endpoints (No Auth Required)

```
GET  /artwork/api/templates
GET  /artwork/api/projects/<uuid>
GET  /artwork/api/projects/<uuid>/logos
GET  /artwork/api/projects/<uuid>/canvas
POST /artwork/api/projects/<uuid>/add-to-cart
GET  /artwork/api/projects/<uuid>/generate-pdf
```

### Admin Endpoints (Auth Required)

```
POST /artwork/api/projects
PATCH /artwork/api/projects/<uuid>
POST /artwork/api/logos
PATCH /artwork/api/logos/<uuid>
POST /artwork/api/canvas
PATCH /artwork/api/canvas/<uuid>
```

**CORS Configuration:** All endpoints have `cors='*'` and `csrf=False` for iframe compatibility.

---

## 🧪 Testing the Integration

### 1. Test API Endpoints

```bash
# Get templates
curl https://your-odoo.com/artwork/api/templates

# Should return JSON array of templates
```

### 2. Test Add to Cart Flow

1. Open Replit app in browser
2. Design an artwork
3. Click "Add to Cart"
4. Verify redirect to Odoo cart
5. Check cart contains artwork with correct pricing

### 3. Verify Multi-Color Orders

For Full-Colour, HD, and Metallic templates:
1. Create project with multi-color garment selection
2. Add to cart
3. Verify sale order comment shows:
   ```
   10 Black
   5 Gold
   3 White
   ```

---

## 📊 Database Models

The module creates these models:

- **artwork.project** - Customer design projects
- **artwork.logo** - Uploaded logo files
- **artwork.canvas.element** - Canvas element positions/properties
- **artwork.template.mapping** - Template-to-product mappings

---

## 🐛 Troubleshooting

### Issue: "No matching record found for external id"

**Cause:** Security file loaded before models are registered.

**Solution:** Use git installation method (Method 1) instead of ZIP upload.

---

### Issue: "CORS error when calling API from Replit app"

**Cause:** CORS not enabled or Odoo URL incorrect.

**Fix:**
1. Verify module is installed
2. Check `VITE_ODOO_URL` is set correctly in Replit
3. Redeploy Replit app
4. Clear browser cache

---

### Issue: "Template not found when adding to cart"

**Cause:** Template mapping not configured.

**Fix:**
1. Go to Artwork → Configuration → Template Mappings
2. Create mapping for the template ID
3. Verify template ID matches exactly (case-sensitive)

---

### Issue: "Product not found" error

**Cause:** Product doesn't exist in Odoo.

**Fix:**
1. Create the product in Sales → Products
2. Map it in Template Mappings
3. Try add to cart again

---

## 🔒 Security & Permissions

### Access Rights

The module grants these permissions:

**Public users (website visitors):**
- Read, Create projects and logos
- Cannot delete

**Internal users:**
- Full CRUD access to all artwork models

### Security File Location
```
odoo_artwork_uploader/security/ir.model.access.csv
```

---

## 📁 Module Structure

```
odoo_artwork_uploader/
├── __init__.py
├── __manifest__.py
├── controllers/
│   ├── __init__.py
│   ├── main.py              # REST API endpoints
│   └── deployment.py         # Hot deployment system
├── models/
│   ├── __init__.py
│   ├── artwork_project.py
│   ├── artwork_logo.py
│   ├── artwork_canvas_element.py
│   ├── artwork_template_mapping.py
│   ├── sale_order.py         # Sale order extensions
│   └── product_template.py
├── views/
│   ├── menu_views.xml
│   ├── artwork_project_views.xml
│   ├── artwork_template_mapping_views.xml
│   └── website_templates.xml
├── security/
│   └── ir.model.access.csv
├── static/
│   └── src/
│       ├── js/
│       └── scss/
└── data/
    └── product_data.xml
```

---

## 🔄 Upgrading the Module

### From Git

```bash
# Pull latest changes
cd /path/to/odoo/addons/odoo_artwork_uploader
git pull origin main

# Restart Odoo
sudo systemctl restart odoo

# Upgrade module
./odoo-bin -u odoo_artwork_uploader -d your_database
```

### From Odoo UI

1. Go to **Apps**
2. Remove filter "Apps"
3. Search "artwork"
4. Click **Upgrade**

---

## 📞 Support

For issues or questions:
- Check the troubleshooting section above
- Review API integration docs: `REPLIT_ODOO_API_INTEGRATION.md`
- Contact: Complete Transfers technical team

---

## ✅ Installation Checklist

- [ ] Module files copied to Odoo addons directory
- [ ] Odoo restarted
- [ ] Apps list updated
- [ ] Module installed successfully
- [ ] Template mappings created
- [ ] Products created in Odoo
- [ ] `VITE_ODOO_URL` set in Replit
- [ ] Replit app redeployed
- [ ] API endpoints tested
- [ ] Add to cart flow tested
- [ ] Multi-color orders tested (if applicable)

---

**Installation Date:** _____________  
**Installed By:** _____________  
**Odoo Version:** _____________  
**Database Name:** _____________
