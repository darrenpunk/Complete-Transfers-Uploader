# Installation Fix for Artwork Uploader Module

## Issue Fixed
Fixed the installation error: `KeyError: ('ir.model.data', ..., 'artwork_uploader_module.menu_artwork_config')`

## Root Cause
The issue was caused by incorrect data file loading order in `__manifest__.py`. The template mapping views were trying to reference menu items that hadn't been loaded yet.

## Solution Applied
1. **Fixed Data Loading Order**: Moved `views/menu_views.xml` before `views/artwork_template_mapping_views.xml` in the manifest file
2. **Correct Dependencies**: Ensured all menu references are loaded before being referenced

## Fixed Loading Order
```python
'data': [
    'security/ir.model.access.csv',
    'data/product_data.xml', 
    'views/artwork_project_views.xml',      # Defines actions
    'views/menu_views.xml',                 # Defines menus (must come before references)
    'views/artwork_template_mapping_views.xml',  # References menu_artwork_config
    'views/artwork_template_mapping_wizard_views.xml',  # References menu_artwork_config  
    'views/website_templates.xml',
],
```

## Installation Steps
1. Copy the `odoo_artwork_uploader` folder to your Odoo addons directory
2. Update the addons list: `./odoo-bin -u all -d your_database`
3. Go to Apps menu in Odoo
4. Search for "Artwork Uploader"
5. Click Install

## Verification
After installation, you should see:
- **Artwork** menu in the main navigation
- **Projects** submenu with artwork project management
- **Configuration** submenu with template mappings

## Dependencies Required
- Odoo 16
- Base modules: `base`, `website`, `website_sale`, `sale`, `product`
- System tools: Ghostscript, ImageMagick, Inkscape

## Next Steps
1. Configure template to product mappings in Artwork > Configuration > Template Mappings
2. Set up product catalog with artwork products
3. Access the artwork uploader at `/artwork/upload`