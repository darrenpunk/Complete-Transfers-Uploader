{
    'name': 'Artwork Uploader',
    'version': '16.0.1.0.0',
    'category': 'Sales/Sales',
    'summary': 'Upload and design artwork on garment templates',
    'description': """
        Artwork Uploader Module
        =======================
        
        This module allows customers to:
        - Upload logo files (PNG, JPEG, SVG, PDF, AI, EPS)
        - Design layouts on various garment templates
        - Preview designs with accurate color representation
        - Generate production-ready PDF outputs
        - Integrated with e-commerce for seamless ordering
        
        Key Features:
        - Vector graphics preservation
        - CMYK color workflow
        - Multiple template sizes
        - Garment color selection
        - Real-time preview
        - PDF generation with imposition
    """,
    'author': 'Complete Transfers',
    'website': 'https://completetransfers.com',
    'depends': [
        'base',
        'website',
        'website_sale',
        'sale',
        'product',
    ],
    'data': [
        'security/ir.model.access.csv',
        'data/product_data.xml',
        'views/artwork_project_views.xml',
        'views/menu_views.xml',
        'views/artwork_template_mapping_views.xml',
        'views/artwork_template_mapping_wizard_views.xml',
        'views/website_templates.xml',
    ],
    'assets': {
        'web.assets_frontend': [
            'artwork_uploader/static/src/scss/artwork_uploader.scss',
            'artwork_uploader/static/src/js/artwork_uploader.js',
            'artwork_uploader/static/src/js/canvas_editor.js',
            'artwork_uploader/static/src/js/color_picker.js',
            'artwork_uploader/static/src/js/pdf_preview.js',
        ],
        'web.assets_backend': [
            'artwork_uploader/static/src/js/deployment_client.js',
        ],
    },
    'installable': True,
    'application': True,
    'auto_install': False,
    'license': 'LGPL-3',
}