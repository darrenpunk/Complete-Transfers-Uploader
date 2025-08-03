# Odoo Artwork Uploader - Embed Button Guide

## Overview
The Odoo Artwork Uploader module includes an embed button widget that allows you to add "Order Transfers" buttons throughout your Odoo website.

## Quick Start

### Method 1: Using HTML/XML Snippets
Add this to any Odoo website page or template:

```xml
<button class="artwork-uploader-embed-button">Order Transfers</button>
```

### Method 2: Using Data Attribute
```xml
<div data-artwork-uploader="true">
    <button class="btn btn-primary">Design Your Transfer</button>
</div>
```

### Method 3: In Product Templates
Add to your product page template:

```xml
<template id="product_artwork_button" inherit_id="website_sale.product">
    <xpath expr="//div[@id='add_to_cart_wrap']" position="after">
        <button class="artwork-uploader-embed-button btn btn-secondary mt-2">
            <i class="fa fa-paint-brush"/> Order Custom Transfer
        </button>
    </xpath>
</template>
```

## Configuration Options

### Button Attributes
- `data-mode="popup"` - Opens in popup window (default: redirect)
- `class="custom-styled"` - Prevents default styling

### Examples

#### Popup Mode
```xml
<button class="artwork-uploader-embed-button" data-mode="popup">
    Order Transfers
</button>
```

#### Custom Styled Button
```xml
<button class="artwork-uploader-embed-button custom-styled btn btn-lg btn-warning">
    <i class="fa fa-rocket"/> Launch Designer
</button>
```

## Integration Examples

### In Website Builder Snippets
Create a custom snippet for drag-and-drop:

```xml
<template id="s_artwork_uploader_button" name="Artwork Uploader Button">
    <section class="s_artwork_button pt16 pb16">
        <div class="container">
            <div class="row">
                <div class="col-lg-12 text-center">
                    <h2>Design Your Custom Transfer</h2>
                    <p>Create professional heat transfers with our easy-to-use designer</p>
                    <button class="artwork-uploader-embed-button btn btn-primary btn-lg">
                        Start Designing
                    </button>
                </div>
            </div>
        </div>
    </section>
</template>
```

### In Shop Category Pages
Add button to specific product categories:

```python
<!-- In website_sale.products -->
<t t-if="category and category.name == 'Custom Transfers'">
    <div class="artwork-uploader-section mb-3">
        <button class="artwork-uploader-embed-button btn btn-info btn-block">
            Design Your Transfer
        </button>
    </div>
</t>
```

### In Product Configurator
Integrate with product options:

```xml
<div t-if="product.allow_custom_design" class="mt-3">
    <label>Need a custom design?</label>
    <button class="artwork-uploader-embed-button btn btn-secondary">
        Open Design Tool
    </button>
</div>
```

## Styling Examples

### Bootstrap Themed
```xml
<!-- Primary Button -->
<button class="artwork-uploader-embed-button btn btn-primary">
    <i class="fa fa-paint-brush mr-2"/> Order Transfers
</button>

<!-- Success Button -->
<button class="artwork-uploader-embed-button btn btn-success btn-lg">
    Start Designing Now
</button>

<!-- Outline Button -->
<button class="artwork-uploader-embed-button btn btn-outline-primary">
    Custom Transfer Designer
</button>
```

### Custom CSS
Add to your theme:

```scss
.artwork-uploader-embed-button {
    &.custom-gradient {
        background: linear-gradient(45deg, #961E75, #C44569);
        border: none;
        color: white;
        padding: 15px 30px;
        font-size: 18px;
        border-radius: 50px;
        transition: all 0.3s;
        
        &:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(150, 30, 117, 0.3);
        }
    }
}
```

## Advanced Integration

### Conditional Display
Show button based on product attributes:

```python
class ProductTemplate(models.Model):
    _inherit = 'product.template'
    
    allow_custom_artwork = fields.Boolean('Allow Custom Artwork')
```

```xml
<button t-if="product.allow_custom_artwork" 
        class="artwork-uploader-embed-button btn btn-primary">
    Design Custom Artwork
</button>
```

### With JavaScript Actions
```javascript
odoo.define('my_module.artwork_integration', function (require) {
    'use strict';
    
    const publicWidget = require('web.public.widget');
    
    publicWidget.registry.MyArtworkIntegration = publicWidget.Widget.extend({
        selector: '.my-product-page',
        
        events: {
            'click .add-custom-design': '_onAddCustomDesign',
        },
        
        _onAddCustomDesign: function (ev) {
            // Custom logic before opening designer
            if (this._validateSelection()) {
                // Trigger artwork uploader button
                this.$('.artwork-uploader-embed-button').click();
            }
        },
    });
});
```

## Menu Integration

### Add to Website Menu
```xml
<record id="menu_artwork_designer" model="website.menu">
    <field name="name">Design Transfer</field>
    <field name="url">/artwork</field>
    <field name="parent_id" ref="website.main_menu"/>
    <field name="sequence">50</field>
</record>
```

### Add to User Portal
```xml
<template id="portal_my_home_artwork" inherit_id="portal.portal_my_home">
    <xpath expr="//div[hasclass('o_portal_docs')]" position="inside">
        <div class="col-md-6 col-lg-4">
            <a href="/artwork" class="btn btn-primary btn-block">
                <i class="fa fa-paint-brush"/> Design New Transfer
            </a>
        </div>
    </xpath>
</template>
```

## E-commerce Integration

### Add to Cart with Artwork
```javascript
// Extend add to cart to include artwork
$('.artwork-uploader-embed-button').on('click', function() {
    const productId = $(this).data('product-id');
    // Store product context for artwork session
    localStorage.setItem('artwork_product_id', productId);
});
```

### After Design Completion
```python
@http.route('/artwork/add-to-cart', type='json', auth='public')
def add_artwork_to_cart(self, project_id, **kwargs):
    # Get the artwork project
    project = request.env['artwork.project'].browse(project_id)
    
    # Add to cart with artwork reference
    sale_order = request.website.sale_get_order(force_create=True)
    sale_order._cart_update(
        product_id=project.product_id.id,
        add_qty=project.quantity,
        artwork_project_id=project.id
    )
    
    return {'success': True}
```

## Performance Considerations

1. **Lazy Loading**: The button JavaScript is lightweight and loads on-demand
2. **No External Dependencies**: Uses Odoo's built-in framework
3. **Mobile Optimized**: Responsive design for all devices

## Troubleshooting

### Button Not Working
1. Check that the artwork_uploader module is installed
2. Verify JavaScript is loaded: check for `artwork_uploader.embed_button` in browser console
3. Ensure proper permissions for /artwork route

### Popup Blocked
- Modern browsers may block popups
- Recommend using redirect mode for better compatibility
- Ensure button click is user-initiated

### Styling Issues
- Check for CSS conflicts with theme
- Use browser inspector to debug styles
- Add `!important` if needed for overrides

## Best Practices

1. **Consistent Placement**: Place buttons in logical locations (product pages, category pages)
2. **Clear Call-to-Action**: Use descriptive button text
3. **Visual Hierarchy**: Make buttons stand out with appropriate styling
4. **Mobile-First**: Test button appearance and functionality on mobile devices
5. **Analytics Tracking**: Add event tracking for conversion analysis

## Security Notes

- Buttons respect Odoo's access rights
- Artwork projects are user-specific
- No sensitive data exposed in button code

This completes the Odoo embed button integration guide.