# Bug Report: Cart Items Deleted When Adding New Products

## Issue
When customers add a new product to their shopping cart, the **previous order line gets deleted** instead of being kept alongside the new one. The cart only ever holds one item at a time.

## Affected Module
`website_product_artworks` → `models/models.py` → `_cart_update` method override

## Confirmed Affected Users
- **User #1481** (IP `86.44.207.47`) — reported as "Hairy Baby"
- **User #1813** (IP `188.65.190.64`) — same pattern, unreported
- Likely affecting other customers silently

## Sale Order
- `sale.order(88542)` for User #1481

## Log Evidence (24 Mar 2026)

### User #1481 — First add-to-cart (13:22:34)
```
odoo.models.unlink: User #1481 deleted sale.order.line records with IDs: [336266]
odoo.addons.website_product_artworks.models.models: cart update called
werkzeug: 86.44.207.47 - POST /shop/cart/update_json - 200 - 316 bytes
```

### User #1481 — Second add-to-cart (13:22:36)
```
odoo.models.unlink: User #1481 deleted sale.order.line records with IDs: [336268]
odoo.addons.website_product_artworks.models.models: cart update called
werkzeug: 86.44.207.47 - POST /shop/cart/update_json - 200 - 298 bytes
```

### User #1813 — Same pattern repeating (13:22:33, 13:23:11, 13:23:22)
```
odoo.models.unlink: User #1813 deleted sale.order.line records with IDs: [336273]
odoo.models.unlink: User #1813 deleted sale.order.line records with IDs: [336274]
odoo.models.unlink: User #1813 deleted sale.order.line records with IDs: [336275]
```
Each deletion is immediately followed by `cart update called` and a new `POST /shop/cart/update_json`.

## Root Cause
The `_cart_update` method in `website_product_artworks/models/models.py` is unlinking (deleting) existing sale order lines **before** adding a new product. It treats every add-to-cart as a **replace** operation instead of an **add** operation.

## The Fix

### Current buggy code (likely pattern in `models/models.py`)
```python
class SaleOrder(models.Model):
    _inherit = 'sale.order'

    def _cart_update(self, product_id=None, line_id=None, add_qty=0, set_qty=0, **kwargs):
        _logger.info('cart update called')

        # BUG: This deletes ALL existing artwork order lines before adding the new one
        existing_lines = self.order_line.filtered(
            lambda l: l.product_id.default_code and 'artwork' in l.product_id.default_code.lower()
            # or some other broad filter
        )
        if existing_lines:
            existing_lines.unlink()  # <-- THIS IS THE PROBLEM

        return super()._cart_update(
            product_id=product_id, line_id=line_id,
            add_qty=add_qty, set_qty=set_qty, **kwargs
        )
```

### Fixed code
```python
class SaleOrder(models.Model):
    _inherit = 'sale.order'

    def _cart_update(self, product_id=None, line_id=None, add_qty=0, set_qty=0, **kwargs):
        _logger.info('cart update called')

        # FIXED: Only remove a line if the SAME product is being re-added
        # (i.e., replacing an existing line for the same product, not a different one)
        if product_id:
            existing_lines = self.order_line.filtered(
                lambda l: l.product_id.id == product_id
            )
            # Only unlink if we're setting quantity (replacing), not adding alongside
            if existing_lines and set_qty > 0:
                # Replace the existing line for the same product
                existing_lines.unlink()
            elif existing_lines and add_qty > 0:
                # Same product being added again — let Odoo's default merge handle it
                pass
            # If it's a DIFFERENT product, do NOT delete anything — just add alongside

        return super()._cart_update(
            product_id=product_id, line_id=line_id,
            add_qty=add_qty, set_qty=set_qty, **kwargs
        )
```

### Key change
- **Before**: The override deletes existing order lines broadly (likely filtering by product category, default_code pattern, or no filter at all) before adding the new item
- **After**: Only delete an existing line if the **exact same `product_id`** is being added again with `set_qty` (explicit quantity replacement). When a **different** product is being added, let it create a new order line alongside existing ones

### Alternative simpler fix
If the `_cart_update` override isn't doing anything essential beyond logging, the safest fix is:

```python
class SaleOrder(models.Model):
    _inherit = 'sale.order'

    def _cart_update(self, product_id=None, line_id=None, add_qty=0, set_qty=0, **kwargs):
        _logger.info('cart update called for product %s, add_qty=%s, set_qty=%s',
                      product_id, add_qty, set_qty)

        # Let Odoo handle cart updates normally — no custom unlink logic
        return super()._cart_update(
            product_id=product_id, line_id=line_id,
            add_qty=add_qty, set_qty=set_qty, **kwargs
        )
```

## How to verify the fix
1. Log in as a customer
2. Add Product A to cart → verify it appears
3. Add Product B to cart → verify BOTH Product A and Product B appear
4. Check the Odoo logs — `cart update called` should appear but NO `odoo.models.unlink: User #XXXX deleted sale.order.line` entries between cart additions of different products

## Priority
**HIGH** — This is silently affecting multiple customers and causing lost revenue (customers think their cart items disappeared, may abandon orders or re-add items unnecessarily).
