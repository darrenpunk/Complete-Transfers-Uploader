# Deployment Notes - v40 (Production Integration Fix)

**Date:** November 25, 2025  
**Version:** 16.0.40.0  
**Critical Fix:** Field conflicts and production module integration

---

## Critical Fixes

### 1. **Field Conflict Resolution** ✅
**Problem:** Module was re-defining `artwork_file` and `artwork_file_name` fields that already exist in production's `website_artwork_dropbox` module, causing:
```
ValueError: Invalid field 'artwork_file' on model 'sale.order.line'
```

**Solution:**
- Removed duplicate field definitions from `sale_order.py`
- Added `website_artwork_dropbox` as a module dependency in `__manifest__.py`
- Now relies on production's existing fields instead of creating conflicts

**Files Changed:**
- `models/sale_order.py`: Removed field definitions (lines 24-29)
- `__manifest__.py`: Added `website_artwork_dropbox` to dependencies

---

### 2. **Production Workflow Integration** ✅
**How it Works:**
1. Add-to-cart uploads PDF to `sale.order.line.artwork_file` and `artwork_file_name`
2. Production's `shipping_dropbox_customization` module automatically:
   - Uploads PDF to Dropbox
   - Creates task named: "SO83304 - [CTCCA31] Full Colour A3 PRINTING_OFFSET.pdf"
   - Makes PDF accessible via Dropbox link in task
3. Our module syncs PDF to `project.task.artwork_image` for manufacturing access

**No Changes Needed:** Production's existing Dropbox workflow triggers automatically.

---

## Pricing Information

### **Volume Discounts**
The pricing endpoint correctly calls `pricelist._get_product_price()` with quantity parameter. If you see the same unit price for different quantities (e.g., €8.57 for both qty 1 and qty 10), it means:

**The pricelist doesn't have volume discount rules configured.**

To add volume discounts:
1. Go to Odoo → Sales → Configuration → Pricelists
2. Edit the pricelist (e.g., "Hollister")
3. Add price rules with quantity breakpoints:
   - 1-9 units: €8.57
   - 10-49 units: €7.50
   - 50+ units: €6.00

**Our code is working correctly** - it passes the quantity to the pricelist system.

---

## Fixed Issues (from v36-v39)

✅ Correct pricelist priority logic  
✅ Comments sync to sales order lines  
✅ PDF sync to manufacturing tasks  
✅ Multi-color garment order support  
✅ Field conflicts resolved  
✅ Production module integration  

---

## Deployment Steps

### **Staging (stage-completetransfers.odoo.com)**

1. **Upload Module:**
   ```
   Apps → Upload → odoo_artwork_uploader_v40_production_integration.zip
   ```

2. **Upgrade Module:**
   ```
   Apps → Search "Artwork Uploader" → Upgrade
   ```

3. **Verify Dependencies:**
   - Ensure `website_artwork_dropbox` module is installed
   - If not, install it first before upgrading artwork_uploader

4. **Test Critical Workflows:**
   - Add project to cart → Should succeed (no "Invalid field" error)
   - Check PDF appears in task's artwork_image field
   - Verify task name includes PDF filename
   - Check Dropbox sync (if staging has Dropbox configured)

5. **Restart Odoo Service** (if needed):
   ```bash
   sudo systemctl restart odoo
   ```

---

## Testing Checklist

### **Add to Cart Workflow**
- [ ] Select template and add logos
- [ ] Enter project name and quantity
- [ ] Click "Add to Cart"
- [ ] Verify no "Invalid field" error
- [ ] Check PDF attached to order line (artwork_file field)
- [ ] Verify comments appear on order line
- [ ] Check task created with PDF in artwork_image field

### **Pricing Display**
- [ ] Change quantity in product selector
- [ ] Verify price updates correctly
- [ ] Note: Same unit price = pricelist has no volume discounts (not a bug)

### **Production Integration**
- [ ] Complete order to trigger task creation
- [ ] Verify task name format: "SO##### - [PRODUCT_CODE] TEMPLATE_NAME FILENAME.pdf"
- [ ] Check PDF accessible via Dropbox (production only)
- [ ] Verify manufacturing team can access PDF from task

---

## Known Behaviors

### **Volume Discounts**
If unit price doesn't change with quantity, the pricelist needs discount rules configured in Odoo. This is **not a bug** in the module.

### **Dropbox Sync**
Dropbox upload is handled by production's `shipping_dropbox_customization` module. Our module only uploads the PDF to the correct field - Dropbox sync happens automatically.

---

## Rollback Plan

If v40 causes issues:

1. **Remove from Apps:**
   ```
   Apps → Artwork Uploader → Uninstall
   ```

2. **Restore Previous Version:**
   ```
   Upload v38 or v39 → Install
   ```

---

## Production Deployment

**ONLY deploy to production after staging verification:**

1. Verify all checklist items pass on staging
2. Check with production team that Dropbox workflow works
3. Upload to production: https://completetransfers.odoo.com
4. Follow same upgrade steps as staging
5. Monitor logs for any errors

---

## Support

**Issues?** Contact: transferhelp@serigraf.com

**Module Author:** Complete Transfers  
**Odoo Version:** 16.0  
**Module Version:** 40.0
