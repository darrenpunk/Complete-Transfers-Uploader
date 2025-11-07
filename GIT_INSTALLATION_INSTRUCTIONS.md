# Git Installation Instructions for Odoo Module

## 🎯 Quick Setup for Your Developer

This guide provides exact commands for installing the `odoo_artwork_uploader` module via git.

---

## 📦 Repository Information

**Module Name:** `odoo_artwork_uploader`  
**Location in Repo:** `/odoo_artwork_uploader/`  
**Version:** 16.0.1.0.0  
**Odoo Compatibility:** 16.x

---

## 🚀 Installation Commands

### Option 1: Clone Entire Repository

If you want access to all documentation and files:

```bash
# Navigate to your Odoo addons directory
cd /opt/odoo/addons/  # or wherever your addons are

# Clone the repository
git clone https://your-replit-git-url.git artwork_project

# Copy just the module to addons
cp -r artwork_project/odoo_artwork_uploader ./

# Optional: Remove the cloned repo if you don't need it
rm -rf artwork_project

# Set proper permissions
chmod -R 755 odoo_artwork_uploader/
chown -R odoo:odoo odoo_artwork_uploader/  # If running as odoo user
```

---

### Option 2: Sparse Checkout (Module Only)

If you only want the module without other files:

```bash
# Navigate to addons directory
cd /opt/odoo/addons/

# Initialize sparse checkout
git clone --no-checkout https://your-replit-git-url.git temp_repo
cd temp_repo
git sparse-checkout init --cone
git sparse-checkout set odoo_artwork_uploader

# Checkout only the module
git checkout main  # or master, depending on your branch

# Move module to parent addons directory
mv odoo_artwork_uploader ../
cd ..
rm -rf temp_repo

# Set permissions
chmod -R 755 odoo_artwork_uploader/
chown -R odoo:odoo odoo_artwork_uploader/
```

---

### Option 3: Direct Download (No Git)

If git is not available:

```bash
# Download the repository as ZIP
wget https://github.com/yourusername/your-repo/archive/refs/heads/main.zip -O repo.zip

# Extract
unzip repo.zip

# Move module to addons
mv your-repo-main/odoo_artwork_uploader /opt/odoo/addons/

# Cleanup
rm -rf your-repo-main repo.zip

# Set permissions
chmod -R 755 /opt/odoo/addons/odoo_artwork_uploader/
```

---

## 🔧 After Installation

### 1. Restart Odoo Service

```bash
# For systemd
sudo systemctl restart odoo

# For manual start
./odoo-bin -c /etc/odoo.conf

# For Docker
docker restart odoo
```

### 2. Update Apps List

**Via Command Line:**
```bash
./odoo-bin -d your_database --update odoo_artwork_uploader

# Or to just update apps list:
./odoo-bin -d your_database --init odoo_artwork_uploader
```

**Via Odoo UI:**
1. Go to **Apps**
2. Enable Developer Mode (Settings → Activate Developer Mode)
3. Click **Update Apps List**
4. Search for "Artwork Uploader"
5. Click **Install**

---

## 🌐 Get Your Git URL

### From Replit

If the project is on Replit:

1. Open your Replit project
2. Click on **Version Control** (Git icon in sidebar)
3. Click **Create a Git Repository** (if not already done)
4. Get the clone URL from the Git panel

**Format:** 
```
https://YOUR_REPLIT_USERNAME@replit.com/YOUR_REPL_NAME.git
```

### From GitHub/GitLab

If you've pushed to GitHub or GitLab:

```bash
# GitHub
https://github.com/yourusername/your-repo.git

# GitLab
https://gitlab.com/yourusername/your-repo.git
```

---

## 📋 Verification Checklist

After installation, verify:

```bash
# Check module files exist
ls -la /opt/odoo/addons/odoo_artwork_uploader/

# Expected output:
# __init__.py
# __manifest__.py
# controllers/
# models/
# views/
# security/
# static/
# data/

# Verify Python can import the module
python3 << EOF
import sys
sys.path.append('/opt/odoo/addons')
import odoo_artwork_uploader
print("Module imported successfully!")
EOF

# Check Odoo recognizes the module
./odoo-bin shell -d your_database << EOF
env['ir.module.module'].search([('name', '=', 'odoo_artwork_uploader')])
EOF
```

---

## 🔄 Updating the Module

When changes are made to the module:

```bash
# Navigate to module directory
cd /opt/odoo/addons/odoo_artwork_uploader/

# Pull latest changes
git pull origin main  # or master

# Restart Odoo
sudo systemctl restart odoo

# Upgrade in database
./odoo-bin -d your_database -u odoo_artwork_uploader
```

---

## 🐛 Common Issues & Fixes

### Issue: "Module not found"

**Check addons path in odoo.conf:**
```ini
[options]
addons_path = /opt/odoo/addons,/opt/odoo/custom/addons
```

**Verify module is in one of these paths:**
```bash
ls /opt/odoo/addons/odoo_artwork_uploader/
```

---

### Issue: Permission denied

**Fix permissions:**
```bash
chmod -R 755 /opt/odoo/addons/odoo_artwork_uploader/
chown -R odoo:odoo /opt/odoo/addons/odoo_artwork_uploader/
```

---

### Issue: Module shows but won't install

**Check dependencies are installed:**
```bash
# In Odoo UI, verify these modules are installed:
# - sale
# - website
# - website_sale
# - product
```

**Or via CLI:**
```bash
./odoo-bin shell -d your_database << EOF
for module in ['sale', 'website', 'website_sale', 'product']:
    state = env['ir.module.module'].search([('name', '=', module)]).state
    print(f"{module}: {state}")
EOF
```

---

## 📞 Quick Reference

**Module Path:** `/opt/odoo/addons/odoo_artwork_uploader/`  
**Service Restart:** `sudo systemctl restart odoo`  
**Update Module:** `./odoo-bin -d DB_NAME -u odoo_artwork_uploader`  
**Check Logs:** `tail -f /var/log/odoo/odoo-server.log`

---

## ✅ Installation Complete!

After successful installation:

1. ✅ Module appears in Apps
2. ✅ Install completes without errors
3. ✅ Menu item "Artwork" appears in Odoo
4. ✅ API endpoints are accessible: `/artwork/api/templates`

**Next Steps:**
- Configure template mappings (see ODOO_MODULE_INSTALLATION_GUIDE.md)
- Set `VITE_ODOO_URL` in Replit
- Test the integration

---

**Installed By:** _______________  
**Installation Date:** _______________  
**Git Commit:** _______________
