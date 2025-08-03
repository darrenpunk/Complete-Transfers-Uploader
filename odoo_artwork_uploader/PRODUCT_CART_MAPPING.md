# Product and WebCart Mapping Guide

## Overview
The Odoo module integrates artwork projects with Odoo's e-commerce system through a carefully designed mapping between artwork projects, products, and the shopping cart.

## Key Components

### 1. Product Template Extension
The module extends Odoo's `product.template` model to add artwork-specific fields:

```python
# product_template.py
is_artwork_product = Boolean  # Identifies artwork products
artwork_template_type = Selection  # Type of artwork (full_colour, dtf, etc.)
min_quantity = Integer  # Minimum order quantity
max_upload_size_mb = Integer  # Maximum file size allowed
```

### 2. Artwork Project Model
Each artwork design session creates an `artwork.project` record containing:

```python
# artwork_project.py
product_id = Many2one('product.product')  # Link to product variant
sale_order_id = Many2one('sale.order')  # Link to sale order
partner_id = Many2one('res.partner')  # Customer
price_unit = Float  # Calculated unit price
quantity = Integer  # Quantity to order
price_total = Float  # Total price
```

## Mapping Flow

### Step 1: Product Setup
Products are pre-created in Odoo with specific artwork types:

```
Product: "Full Colour Transfer - A3"
├── is_artwork_product: True
├── artwork_template_type: 'full_colour'
├── min_quantity: 10
├── list_price: €20.00
└── Template mapping: 'template-A3'
```

### Step 2: Project Creation
When a user starts designing:

1. User selects template size (e.g., "A3")
2. System creates `artwork.project` record
3. Project is linked to user session (not yet to product)

### Step 3: Add to Cart Process

```python
# When user clicks "Add to Cart"
def add_to_cart(project_uuid):
    # 1. Find the artwork project
    project = find_project(project_uuid)
    
    # 2. Determine product type from template
    template_type = get_template_type(project.template_size)
    # e.g., 'template-A3' → 'full_colour'
    
    # 3. Find matching product
    product = search([
        ('is_artwork_product', '=', True),
        ('artwork_template_type', '=', template_type)
    ])
    
    # 4. Get or create sale order (cart)
    sale_order = website.sale_get_order(force_create=True)
    
    # 5. Add product to cart
    sale_order._cart_update(
        product_id=product.id,
        add_qty=project.quantity
    )
    
    # 6. Link project to order
    project.sale_order_id = sale_order.id
```

## Template to Product Mapping

### Template Size → Product Type
```
template-A3 → Full Colour Transfer A3
template-A4 → Full Colour Transfer A4
template-dtf-a3 → DTF Transfer A3
template-dtf-a4 → DTF Transfer A4
template-uv-dtf-a3 → UV DTF Transfer A3
template-embroidery-badges-a3 → Embroidery Badges A3
```

### Product Identification Logic
```python
def _get_template_type(template_size):
    if 'dtf' in template_size:
        return 'dtf'
    elif 'uv-dtf' in template_size:
        return 'uv_dtf'
    elif 'badge' in template_size:
        return 'badges'
    else:
        return 'full_colour'
```

## Sale Order Integration

### Sale Order Line Extension
```python
class SaleOrderLine(models.Model):
    _inherit = 'sale.order.line'
    
    artwork_project_id = Many2one('artwork.project')
    # Links order line to artwork project
```

### Order Flow
1. **Design Phase**: User creates artwork project
2. **Cart Addition**: Project linked to product and added to cart
3. **Checkout**: Standard Odoo checkout process
4. **Order Confirmation**: Artwork project state updated to 'confirmed'
5. **Production**: PDF generated and sent to production

## Pricing Integration

### Dynamic Pricing Calculation
```python
@api.depends('template_size', 'quantity')
def _compute_price(self):
    # Base price from template size
    base_price = get_base_price(template_size)
    
    # Quantity discounts
    if quantity >= 100:
        base_price *= 0.8  # 20% discount
    elif quantity >= 50:
        base_price *= 0.9  # 10% discount
    
    # Can integrate with Odoo pricelists
    pricelist = self.partner_id.property_product_pricelist
    final_price = pricelist.get_product_price(product, quantity)
```

## E-commerce Frontend Integration

### React Component → Odoo API
```javascript
// Frontend add to cart
async function addToCart(projectId) {
    const response = await fetch(`/artwork/api/projects/${projectId}/add-to-cart`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    });
    
    if (response.ok) {
        // Redirect to cart
        window.location.href = '/shop/cart';
    }
}
```

### Cart Display
- Standard Odoo cart shows product name and quantity
- Custom fields can display artwork preview
- Link to view/edit artwork project

## Database Relationships

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ artwork.project │────►│ product.product │────►│ sale.order.line │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                                                 │
        │                                                 ▼
        │                                        ┌─────────────────┐
        └───────────────────────────────────────►│   sale.order    │
                                                 └─────────────────┘
```

## Key Benefits

1. **Seamless Integration**: Works with existing Odoo e-commerce
2. **Product Flexibility**: Different products for different artwork types
3. **Pricing Control**: Leverages Odoo's pricelist system
4. **Order Management**: Standard Odoo order workflow
5. **Inventory Tracking**: Can track production capacity
6. **Customer Portal**: Customers can view order history

## Configuration Requirements

1. Create products for each artwork type/size combination
2. Set up pricelists for quantity discounts
3. Configure payment methods
4. Set up shipping methods (if applicable)
5. Configure tax rules

## Security Considerations

- Guest users can create projects and add to cart
- Logged-in users have projects linked to their account
- Order history only visible to authenticated users
- Admin users can view all projects

This mapping ensures that the creative design process seamlessly transitions into Odoo's robust e-commerce and order management system.