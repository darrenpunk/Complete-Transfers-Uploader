# Artwork Uploader Odoo Module

## Overview
This is an Odoo 16 module that ports the Artwork Uploader & Gang Sheet Builder functionality into Odoo's e-commerce platform.

## Features
- **File Upload Support**: PNG, JPEG, SVG, PDF, AI, EPS (up to 200MB)
- **Vector Graphics Preservation**: Maintains original vector data and CMYK colors
- **Interactive Canvas**: Position, rotate, and scale logos on templates
- **Template Selection**: 42 different template sizes and types
- **Garment Color Selection**: Gildan and Fruit of the Loom color palettes
- **PDF Generation**: Production-ready outputs with color labels
- **E-commerce Integration**: Add to cart and checkout functionality
- **Dynamic Pricing**: Based on template size and quantity

## Installation

1. Copy the `odoo_artwork_uploader` folder to your Odoo addons directory
2. Update the addons list in Odoo
3. Install the "Artwork Uploader" module from Apps

## Configuration

1. Go to Artwork > Configuration
2. Set up product templates for each artwork type
3. Configure pricing tiers
4. Set minimum quantities per template type

## Dependencies

### Odoo Modules
- base
- website
- website_sale
- sale
- product

### System Requirements
- Ghostscript (for PDF processing)
- Inkscape (for SVG conversion)
- ImageMagick (for image processing)

## Module Structure

```
odoo_artwork_uploader/
├── __init__.py
├── __manifest__.py
├── models/
│   ├── __init__.py
│   ├── artwork_project.py      # Main project model
│   ├── artwork_logo.py         # Logo file handling
│   ├── artwork_canvas_element.py # Canvas positioning
│   ├── product_template.py     # Product extensions
│   └── sale_order.py          # Sale order integration
├── controllers/
│   ├── __init__.py
│   └── main.py                # API endpoints
├── views/
│   ├── artwork_project_views.xml
│   ├── website_templates.xml
│   └── menu_views.xml
├── security/
│   └── ir.model.access.csv
├── static/
│   └── src/
│       ├── js/
│       │   └── artwork_uploader.js
│       └── scss/
│           └── artwork_uploader.scss
└── data/
    └── product_data.xml       # Default products
```

## API Endpoints

- `POST /artwork/api/projects` - Create new project
- `GET /artwork/api/projects/<uuid>` - Get project details
- `POST /artwork/api/projects/<uuid>/logos` - Upload logo
- `GET /artwork/api/projects/<uuid>/canvas-elements` - Get canvas elements
- `POST /artwork/api/projects/<uuid>/canvas-elements` - Save canvas state
- `GET /artwork/api/projects/<uuid>/generate-pdf` - Generate PDF
- `POST /artwork/api/projects/<uuid>/add-to-cart` - Add to cart

## Frontend Integration

The module includes a React-based frontend that integrates with Odoo's website. The main entry point is at `/artwork/upload`.

### Key Components
- Template selector
- File upload zone
- Interactive canvas editor
- Color picker
- PDF preview modal
- Pricing calculator

## Customization

### Adding New Templates
1. Add the template to the selection field in `artwork_project.py`
2. Update the dimensions mapping
3. Create corresponding product templates

### Custom Pricing
Override the `_compute_price` method in `artwork_project.py` to implement custom pricing logic.

### Branding
- Primary color: #961E75 (Complete Transfers pink)
- Update SCSS variables in `artwork_uploader.scss`

## Migration from Standalone

### Database Migration
1. Export projects from standalone database
2. Map fields to Odoo models
3. Import using Odoo's data import tools

### File Migration
1. Copy uploaded files to Odoo filestore
2. Update file references in database

## Troubleshooting

### Common Issues
- **PDF generation fails**: Check Ghostscript installation
- **SVG conversion errors**: Verify Inkscape is installed
- **Upload size limits**: Check Odoo's request size limits

### Debug Mode
Enable debug mode to see detailed error messages:
```python
import logging
_logger = logging.getLogger(__name__)
_logger.setLevel(logging.DEBUG)
```

## License
LGPL-3

## Support
For support, contact Complete Transfers at support@completetransfers.com