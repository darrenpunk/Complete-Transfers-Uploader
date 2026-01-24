{
    'name': 'Artwork Uploader',
    'version': '16.0.47.4',
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
        'website_artwork_dropbox',  # Provides artwork_files_datas, artwork_file_name, artwork_comment fields
    ],
    'data': [
        'security/ir.model.access.csv',
        'data/product_data.xml',
        'data/cron_jobs.xml',
        'views/artwork_project_views.xml',
        'views/sale_order_views.xml',
        'views/artwork_template_definition_views.xml',
        'views/artwork_template_mapping_views.xml',
        'views/artwork_template_mapping_wizard_views.xml',
        'views/menu_views.xml',
        'views/website_templates.xml',
        'views/artwork_uploader_templates.xml',
        'views/website_snippets.xml',
    ],
    'assets': {
        'web.assets_frontend': [
            'artwork_uploader/static/src/scss/artwork_uploader.scss',
            'artwork_uploader/static/src/scss/snippets.scss',
            'artwork_uploader/static/src/js/iframe_message_handler.js',
            'artwork_uploader/static/src/js/embed_button.js',
            'artwork_uploader/static/src/js/artwork_uploader.js',
            'artwork_uploader/static/src/js/website_artwork_uploader.js',
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