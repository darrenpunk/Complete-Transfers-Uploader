# Developer Quick Start - Odoo Module Installation

## 🎯 Goal
Install the `odoo_artwork_uploader` module to integrate the Replit artwork design app with Odoo.

---

## 📦 What You Need

**Files Available:**
- ✅ `odoo_artwork_uploader/` - Source code directory
- ✅ `odoo_artwork_uploader_fixed.zip` - Ready-to-upload ZIP (90KB)
- ✅ `ODOO_MODULE_INSTALLATION_GUIDE.md` - Full installation guide
- ✅ `GIT_INSTALLATION_INSTRUCTIONS.md` - Git-specific instructions

---

## ⚡ Quick Install (Choose One Method)

### Method A: Git Clone (Recommended - 2 minutes)

```bash
# 1. Navigate to Odoo addons
cd /opt/odoo/addons/

# 2. Clone and copy module
git clone YOUR_GIT_URL temp && mv temp/odoo_artwork_uploader ./ && rm -rf temp

# 3. Set permissions
chmod -R 755 odoo_artwork_uploader/

# 4. Restart Odoo
sudo systemctl restart odoo

# 5. Install via UI: Apps → Update Apps List → Search "artwork" → Install
```

---

### Method B: Direct Copy (1 minute)

```bash
# 1. Copy module folder to Odoo addons
cp -r /path/to/odoo_artwork_uploader /opt/odoo/addons/

# 2. Set permissions
chmod -R 755 /opt/odoo/addons/odoo_artwork_uploader/

# 3. Restart Odoo
sudo systemctl restart odoo

# 4. Install via UI: Apps → Update Apps List → Search "artwork" → Install
```

---

### Method C: ZIP Upload (If you have UI access)

**Use:** `odoo_artwork_uploader_fixed.zip` (90KB)

1. Download `odoo_artwork_uploader_fixed.zip` 
2. In Odoo: Apps → Upload → Select ZIP → Install

⚠️ If you see model access errors, use Method A or B instead.

---

## 🔧 Required Configuration (5 minutes)

### Step 1: Set Replit Environment Variable

In **Replit Project** → **Secrets**:
```
VITE_ODOO_URL=https://your-odoo-instance.com
```

Example:
```
VITE_ODOO_URL=https://mycompany.odoo.com
```

Then **redeploy** the Replit app.

---

### Step 2: Create Products in Odoo

Navigate to: **Sales → Products → Create**

Create products for each template type:
- Custom A3 Transfer
- Custom A4 Transfer  
- DTF Large Transfer
- HD A3 Transfer
- (etc.)

---

### Step 3: Map Templates to Products

Navigate to: **Artwork → Configuration → Template Mappings**

Create mappings:

| Template ID | Product | Price |
|-------------|---------|-------|
| `full-colour-a3` | Custom A3 Transfer | $25.00 |
| `full-colour-a4` | Custom A4 Transfer | $15.00 |
| `dtf-large` | DTF Large Transfer | $30.00 |

⚠️ **Important:** Template IDs must match exactly (case-sensitive).

---

## ✅ Verify Installation

### 1. Check API Endpoints

```bash
curl https://your-odoo.com/artwork/api/templates
```

Should return JSON array of templates.

### 2. Test Add to Cart

1. Open Replit app
2. Design artwork
3. Click "Add to Cart"
4. Should redirect to Odoo cart

---

## 🐛 Common Issues

| Issue | Fix |
|-------|-----|
| Module not found | Check addons path in `odoo.conf` |
| Permission denied | Run `chmod -R 755` on module |
| CORS errors | Verify `VITE_ODOO_URL` and redeploy Replit |
| Template not found | Create template mapping in Odoo |

---

## 📊 Module Details

**Name:** odoo_artwork_uploader  
**Version:** 16.0.1.0.0  
**Dependencies:** sale, website, website_sale, product  
**API Endpoints:** 10 (all CORS-enabled)  
**Database Models:** 4 (project, logo, canvas_element, template_mapping)

---

## 📞 Support Resources

- **Full Guide:** `ODOO_MODULE_INSTALLATION_GUIDE.md`
- **Git Instructions:** `GIT_INSTALLATION_INSTRUCTIONS.md`
- **API Integration:** `REPLIT_ODOO_API_INTEGRATION.md`

---

## 🎯 Installation Checklist

```
[ ] Module installed in Odoo (via git/copy/ZIP)
[ ] Odoo restarted
[ ] Module appears in Apps
[ ] VITE_ODOO_URL set in Replit
[ ] Replit app redeployed
[ ] Products created in Odoo
[ ] Template mappings configured
[ ] API endpoint tested (curl)
[ ] Add to cart tested (end-to-end)
```

---

## ⏱️ Time Estimate

- **Installation:** 2-5 minutes
- **Configuration:** 5-10 minutes
- **Testing:** 5 minutes
- **Total:** ~15-20 minutes

---

**Installation Date:** __________  
**Installed By:** __________  
**Odoo URL:** __________  
**Replit URL:** __________
