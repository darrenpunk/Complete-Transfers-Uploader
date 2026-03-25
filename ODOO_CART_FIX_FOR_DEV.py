"""
=============================================================================
FIX: Cart items wiped when adding new products
=============================================================================

MODULE:   website_product_artworks
FILE:     models/models.py (on the Odoo server)
PRIORITY: HIGH - affecting multiple customers (confirmed: #1481, #1813)
DATE:     25 Mar 2026

PROBLEM:
--------
The _cart_update() override in website_product_artworks deletes ALL existing
artwork order lines from the cart every time a new product is added. This means
customers can only ever have ONE item in their cart at a time.

Odoo logs show this pattern repeating for every add-to-cart:
    odoo.models.unlink: User #1481 deleted sale.order.line records with IDs: [336266]
    odoo.addons.website_product_artworks.models.models: cart update called
    werkzeug: POST /shop/cart/update_json - 200

HOW TO FIX:
-----------
Open website_product_artworks/models/models.py on the Odoo server.
Find the SaleOrder class with the _cart_update method.
Replace the entire _cart_update method with the fixed version below.

The fix: Only unlink order lines for the SAME product_id (replacement),
never delete lines for OTHER products (those should stay in the cart).
"""

# =============================================================================
# OPTION A: SAFE FIX — scope the unlink to same product only
# =============================================================================
#
# Find this method in website_product_artworks/models/models.py and REPLACE it:
#
# class SaleOrder(models.Model):
#     _inherit = 'sale.order'
#
#     def _cart_update(self, product_id=None, line_id=None, add_qty=0, set_qty=0, **kwargs):
#         _logger.info('cart update called')
#
#         ############################################################
#         # BUGGY CODE — DELETE/COMMENT OUT EVERYTHING BETWEEN HERE
#         ############################################################
#
#         # Look for lines like:
#         #   existing_lines = self.order_line.filtered(...)
#         #   existing_lines.unlink()
#         #
#         # Or:
#         #   self.order_line.unlink()
#         #
#         # Or:
#         #   for line in self.order_line:
#         #       line.unlink()
#         #
#         # Any code that calls .unlink() on order lines BEFORE
#         # calling super()._cart_update() is the bug.
#
#         ############################################################
#         # END OF BUGGY CODE
#         ############################################################
#
#         return super()._cart_update(...)


# HERE IS THE FIXED VERSION — copy-paste this to replace the method:

"""
class SaleOrder(models.Model):
    _inherit = 'sale.order'

    def _cart_update(self, product_id=None, line_id=None, add_qty=0, set_qty=0, **kwargs):
        import logging
        _logger = logging.getLogger(__name__)
        _logger.info(
            'cart update called for product %s (line_id=%s, add_qty=%s, set_qty=%s)',
            product_id, line_id, add_qty, set_qty
        )

        # FIXED: Only remove an existing line when REPLACING the same product
        # (set_qty > 0 means "set quantity to X" — a deliberate replacement)
        # NEVER delete lines for other products — that wipes the cart.
        if product_id and set_qty > 0 and not line_id:
            same_product_lines = self.order_line.filtered(
                lambda l: l.product_id.id == product_id
            )
            if same_product_lines:
                _logger.info(
                    'Replacing existing line(s) for product %s: %s',
                    product_id, same_product_lines.ids
                )
                same_product_lines.unlink()

        return super()._cart_update(
            product_id=product_id,
            line_id=line_id,
            add_qty=add_qty,
            set_qty=set_qty,
            **kwargs
        )
"""


# =============================================================================
# OPTION B: SIMPLEST FIX — just remove the unlink entirely
# =============================================================================
# If the _cart_update override isn't doing anything essential beyond logging,
# the safest fix is to remove the unlink and just pass through to Odoo:

"""
class SaleOrder(models.Model):
    _inherit = 'sale.order'

    def _cart_update(self, product_id=None, line_id=None, add_qty=0, set_qty=0, **kwargs):
        import logging
        _logger = logging.getLogger(__name__)
        _logger.info(
            'cart update called for product %s (add_qty=%s, set_qty=%s)',
            product_id, add_qty, set_qty
        )
        # Let Odoo handle everything — no custom unlink logic
        return super()._cart_update(
            product_id=product_id,
            line_id=line_id,
            add_qty=add_qty,
            set_qty=set_qty,
            **kwargs
        )
"""


# =============================================================================
# HOW TO VERIFY THE FIX
# =============================================================================
#
# 1. SSH into the Odoo server or use the Odoo.sh editor
# 2. Edit website_product_artworks/models/models.py
# 3. Replace the _cart_update method with Option A or Option B above
# 4. Restart the Odoo service:
#        sudo systemctl restart odoo
#    or on Odoo.sh: push the commit and let it redeploy
#
# 5. Test:
#    a. Log in as daragh@hairybaby.com (or any customer)
#    b. Add Product A to cart → verify it appears in cart
#    c. Add Product B to cart → verify BOTH products appear
#    d. Check Odoo logs — should see "cart update called" but NO
#       "odoo.models.unlink: User #XXXX deleted sale.order.line" entries
#       between different product additions
#
# 6. Also test the artwork uploader "Add to Cart" button:
#    a. Upload artwork and click "Add to Cart" for one template
#    b. Go back, upload different artwork, click "Add to Cart" again
#    c. Both items should appear in the cart
