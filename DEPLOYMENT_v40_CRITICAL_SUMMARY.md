# v40 Deployment - Critical Summary

**Version:** 16.0.40.0  
**Date:** November 25, 2025  
**Status:** READY FOR STAGING DEPLOYMENT

---

## What v40 Fixes

### ✅ Issue #1: Add-to-Cart Failing
**Error in Staging:**
```
ValueError: Invalid field 'artwork_file' on model 'sale.order.line'
```

**Root Cause:**
- v39 tried to create fields that already exist in production's `website_artwork_dropbox` module
- Field conflict prevented module from loading properly

**Fix:**
- Removed duplicate field definitions
- Added `website_artwork_dropbox` as a dependency
- Now uses production's existing fields

---

### ✅ Issue #2: Wrong Pricelist in Product Selector
**Behavior in Staging:**
- Customer logged in as "IH Consultants" with "CT Euro Pricelist"
- Pricing API shows "Public user" with "Hollister" pricelist
- Prices don't change with quantity

**Root Cause:**
- Pricing endpoint used `request.env.user.partner_id` → Got "Public User"
- Add-to-cart used `cart.partner_id` → Got actual customer
- "Hollister" not in standard pricelists list → Treated as special, blocked CT Euro override

**Fix:**
1. Pricing endpoint now checks cart partner first (actual customer context)
2. Added "Hollister" to standard pricelists array
3. Fallback to session user if no cart exists

---

## Expected Behavior After v40

### On completetransfers.com (Complete Transfers website):
- ✅ All standard pricelists → **CT Euro Pricelist** (or CT Public Pricelist GBP for UK)
- ✅ Special pricelists (Galaxy Crystal, Visual Vinyl, etc.) → **Kept unchanged**
- ✅ Add-to-cart works without errors
- ✅ PDF uploaded to production fields (triggers Dropbox workflow)

### On serigraf.com (Serigraf website):
- ✅ Customer's assigned pricelist → **Used as-is**
- ✅ No CT Euro override (works as before)

---

## Deployment Instructions

### Step 1: Upload to Staging
```
1. Go to: https://stage-completetransfers.odoo.com
2. Apps → Upload Module → Select: odoo_artwork_uploader_v40_production_integration.zip
3. Click Upload
```

### Step 2: Upgrade Module
```
1. Apps → Remove "Apps" filter → Search "Artwork Uploader"
2. Click "Upgrade" button
3. Wait for upgrade to complete
```

### Step 3: Verify Dependencies
```
Ensure website_artwork_dropbox module is installed
(It should already be installed on staging since it matches production)
```

### Step 4: Restart Odoo (if needed)
```bash
# Only if you see module loading issues
sudo systemctl restart odoo
```

---

## Testing After Deployment

### Test 1: Add to Cart
1. Go to artwork uploader
2. Select template, upload logo
3. Click "Add to Cart"
4. **Expected:** ✅ Success, no "Invalid field" error
5. **Check:** PDF should be in order line's `artwork_file` field

### Test 2: Pricing with Cart Partner
1. Create a cart as logged-in user
2. Open product selector
3. Change quantity (1 → 10 → 50)
4. **Expected:** Pricing uses customer's context (not Public User)
5. **Check logs:** Should show cart partner, not "Public user"

### Test 3: Pricelist Override
**On completetransfers.com:**
- Customer with Hollister pricelist
- **Expected:** Gets CT Euro Pricelist
- **Check logs:** Should show "Forcing CT Euro Pricelist"

**On serigraf.com:**
- Customer with Hollister pricelist
- **Expected:** Keeps Hollister pricelist
- **Check logs:** Should show "Using partner's assigned pricelist: Hollister"

---

## Rollback Plan (if needed)

If v40 causes issues:
```
1. Apps → Artwork Uploader → Uninstall
2. Upload previous version (v38)
3. Install v38
```

**Note:** v39 has the field conflict bug, don't rollback to v39.

---

## Key Files Changed in v40

```
models/sale_order.py:
  - Line 23-24: Removed artwork_file/artwork_file_name field definitions
  - Line 64-76: Updated PDF sync logic to use production fields
  - Line 105-112: Updated cron job to use production fields

controllers/main.py:
  - Lines 649-658: Use cart partner instead of session user
  - Lines 499, 666: Added 'Hollister' to standard_pricelists

__manifest__.py:
  - Line 36: Added 'website_artwork_dropbox' dependency
```

---

## Production Deployment (After Staging Success)

**ONLY deploy to production after:**
1. ✅ All staging tests pass
2. ✅ No errors in staging logs
3. ✅ Add-to-cart works correctly
4. ✅ Pricing shows correct pricelist
5. ✅ PDF appears on manufacturing tasks

**Production URL:** https://completetransfers.odoo.com

Follow same steps as staging deployment.

---

## Support

**Issues?** transferhelp@serigraf.com

**Files:**
- Module: `odoo_artwork_uploader_v40_production_integration.zip`
- Deployment Notes: `DEPLOYMENT_v40_NOTES.md`
