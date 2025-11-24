# Odoo Artwork Uploader v36 - Corrected Pricelist Logic + Production Fixes

## Version
**16.0.36.0** (2025-11-24)

## Overview
This release fixes all three critical production issues PLUS corrects the pricelist logic to respect special customer pricelists. v35 incorrectly forced CT Euro/GBP for ALL customers - v36 respects your business rules.

---

## Critical Fixes (from v35)

### 1. PDF Sync to Manufacturing Tasks - Cron Strategy Fix ✅
**Problem:** Manufacturing tasks created asynchronously (after PDF upload) were missing artwork PDFs.  
**Solution:** Rewrote cron to scan `project.task` records instead of `sale.order.line` (reverse lookup).

### 2. PDF Overwrites/Updates Now Allowed ✅
**Problem:** Operators couldn't upload corrected PDFs - system blocked updates.  
**Solution:** Removed all early-return checks preventing PDF overwrites.

### 3. Pricelist Logic - CORRECTED in v36 ⭐
**v35 Problem:** Forced CT Euro/GBP for ALL customers, breaking special pricelist customers.  
**v36 Solution:** Proper priority logic that respects your business rules.

---

## NEW: Corrected Pricelist Priority Logic

### Business Rules (Now Correctly Implemented)
```
Priority 1: Customer has special pricelist (e.g., Galaxy Crystal, Visual Vinyl)
   → USE IT (highest priority, never override)

Priority 2: No special pricelist AND on completetransfers.com
   → Force CT Euro Pricelist (EUR customers) or CT Public Pricelist GBP (UK customers)

Priority 3: All other cases (e.g., serigraf.com)
   → Use partner's assigned pricelist (standard default)
```

### What's a "Special Pricelist"?
Special pricelists are customer-specific custom pricing (NOT standard public pricelists):

**Special Pricelists** (protected from override):
- Galaxy Crystal
- Visual Vinyl
- Platinum
- Corthea Medical
- WEB Embroidery variants
- [Bimonthly] RTP
- [2/monthly] Madeinco Nederland
- Any other custom customer pricelist

**Standard Pricelists** (can be overridden on completetransfers.com):
- Public Pricelist
- Euro Pricelist
- CT Euro Pricelist
- CT Public Pricelist GBP
- CT T1 Pricelist T1
- CT Public Pricelist T1
- Serigraf STD Pricelist

---

## Examples

### Example 1: Customer with Special Pricelist
**Scenario:** "Galaxy Crystal" customer logs into completetransfers.com  
**Before v36:** ❌ Forced to use CT Euro Pricelist (loses special pricing!)  
**After v36:** ✅ Keeps "Galaxy Crystal" pricelist (special pricing protected)  
**Logs:** `⭐ Using customer's SPECIAL pricelist: Galaxy Crystal`

### Example 2: Standard Customer on completetransfers.com
**Scenario:** Customer with "Euro Pricelist" logs into completetransfers.com  
**Before v36:** ❌ Used "Euro Pricelist" (wrong for Complete Transfers)  
**After v36:** ✅ Forced to use "CT Euro Pricelist"  
**Logs:** `🌐 Complete Transfers website → Forcing CT Euro Pricelist`

### Example 3: Standard Customer on serigraf.com
**Scenario:** Customer with "Euro Pricelist" logs into serigraf.com  
**Before v36:** ✅ Used "Euro Pricelist" (correct)  
**After v36:** ✅ Uses "Euro Pricelist" (unchanged)  
**Logs:** `📋 Using partner's assigned pricelist: Euro Pricelist`

### Example 4: UK Customer on completetransfers.com
**Scenario:** UK customer (country_id.code = 'GB') on completetransfers.com  
**Before v36:** ❌ Might use wrong currency pricelist  
**After v36:** ✅ Forced to use "CT Public Pricelist GBP"  
**Logs:** `🌐 Complete Transfers website → Forcing CT Public Pricelist GBP`

---

## Code Changes Summary

### Pricing API (`/artwork/api/pricing`)
```python
# Priority 1: Check for special pricelist
if partner.property_product_pricelist.name not in standard_pricelists:
    pricelist = partner.property_product_pricelist  # USE IT
    
# Priority 2: Complete Transfers website override
elif website.name == 'Complete Transfers':
    pricelist = 'CT Euro Pricelist' or 'CT Public Pricelist GBP' (based on country)
    
# Priority 3: Use partner's assigned pricelist
else:
    pricelist = partner.property_product_pricelist
```

### Add-to-Cart API (`/artwork/api/projects/<uuid>/add-to-cart`)
```python
# Same priority logic applied to cart pricelist
# Ensures pricing consistency between Replit app and Odoo checkout
```

---

## Deployment Instructions

### Step 1: Backup Current Module
```bash
# In Odoo Apps menu
1. Search for "Artwork Uploader"
2. Click "..." menu → "Export Translation"
3. Save backup of current configuration
```

### Step 2: Upload New Module
```bash
# Upload v36 zip file
1. Go to Apps → "Upload Module"
2. Select: odoo_artwork_uploader_v36_correct_pricelist_logic.zip
3. Click "Upload"
```

### Step 3: Upgrade Module
```bash
# Activate developer mode first
1. Settings → Activate Developer Mode
2. Apps → Remove "Apps" filter → Search "Artwork Uploader"
3. Click "Upgrade" button
4. Wait for upgrade completion
```

### Step 4: Restart Odoo Service
```bash
# SSH into Odoo server
sudo systemctl restart odoo16
# OR use Odoo.sh deploy button for cloud instances
```

### Step 5: Verify Installation
```bash
# Check module version
1. Apps → Search "Artwork Uploader"
2. Verify version shows: 16.0.36.0

# Check cron job
1. Settings → Technical → Automation → Scheduled Actions
2. Search: "Sync Artwork PDFs to Manufacturing Tasks"
3. Verify: Active, Next Execution Date set
4. Click "Run Manually" to test
```

---

## Testing Checklist

### Test 1: Special Pricelist Protected (NEW)
1. Log in as customer with "Galaxy Crystal" or "Visual Vinyl" pricelist
2. Go to completetransfers.com iframe
3. Select a template (e.g., 10 copies)
4. **Expected:** Pricing uses customer's special pricelist (NOT forced to CT Euro)
5. **Verify logs:** `⭐ Using customer's SPECIAL pricelist: Galaxy Crystal`
6. Add to cart
7. **Expected:** Cart also uses "Galaxy Crystal" pricelist

### Test 2: Standard Customer on completetransfers.com
1. Log in as standard customer (e.g., "Euro Pricelist")
2. Go to completetransfers.com iframe
3. Select a template
4. **Expected:** Pricing forced to "CT Euro Pricelist" (or "CT Public Pricelist GBP" for UK)
5. **Verify logs:** `🌐 Complete Transfers website → Forcing CT Euro Pricelist`
6. Add to cart
7. **Expected:** Cart uses correct CT pricelist

### Test 3: Standard Customer on serigraf.com
1. Log in as standard customer
2. Go to serigraf.com iframe
3. Select a template
4. **Expected:** Pricing uses partner's assigned pricelist
5. **Verify logs:** `📋 Using partner's assigned pricelist: Euro Pricelist`

### Test 4: PDF Sync for Async Tasks
1. Create project in Replit app
2. Upload artwork and generate PDF
3. Add to cart (creates order line with PDF)
4. Manually create manufacturing task in Odoo
5. **Expected:** Cron syncs PDF to task within 1 hour

### Test 5: PDF Overwrites
1. Find existing manufacturing task with artwork
2. Upload new PDF to linked order line
3. **Expected:** Task's `artwork_image` field updates with new PDF

---

## Log Monitoring

### Success Patterns
```
⭐ Using customer's SPECIAL pricelist: Galaxy Crystal
🌐 Complete Transfers website → Forcing CT Euro Pricelist
📋 Using partner's assigned pricelist: Euro Pricelist
✅ PDF synced to manufacturing task #<id> from order line #<id>
✅ Cart already using correct CT pricelist: CT Euro Pricelist
```

### Warning Patterns (Expected)
```
⚠️ No manufacturing task found for order line #<id> - will sync when task is created
⚠️ No country detected, defaulting to Euro pricelist
```

### Error Patterns (Investigate)
```
❌ Cron failed to sync PDF to task #<id>: <error>
⚠️ Could not find CT Euro Pricelist, keeping original pricelist
```

---

## Rollback Plan

If issues arise, rollback to v34:
```bash
1. Apps → Search "Artwork Uploader"
2. Click "..." → Uninstall (WARNING: preserves data)
3. Upload odoo_artwork_uploader_v34.zip
4. Install module
5. Restart Odoo service
```

---

## Technical Details

### Pricelist Detection Logic
```python
# Define standard pricelists (can be overridden on CT website)
standard_pricelists = [
    'Public Pricelist',
    'Euro Pricelist',
    'CT Euro Pricelist',
    'CT Public Pricelist GBP',
    'CT T1 Pricelist T1',
    'CT Public Pricelist T1',
    'Serigraf STD Pricelist',
]

# Priority 1: Special pricelist
if partner.property_product_pricelist.name not in standard_pricelists:
    use_special_pricelist()
    
# Priority 2: Complete Transfers website
elif website.name == 'Complete Transfers':
    force_ct_euro_or_gbp()
    
# Priority 3: Partner's assigned pricelist
else:
    use_partner_pricelist()
```

### Website Detection
```python
website = request.env['website'].sudo().get_current_website()
is_complete_transfers = website.name == 'Complete Transfers'
```

### Country-Based Currency Selection
```python
customer_country = partner.country_id.code
if customer_country == 'GB':
    pricelist_name = 'CT Public Pricelist GBP'
else:
    pricelist_name = 'CT Euro Pricelist'  # Default for EU/Other
```

---

## Support

For deployment issues, contact:
- **Email:** transferhelp@serigraf.com
- **Logs Location:** `/var/log/odoo/odoo-server.log` (or Odoo.sh log viewer)
- **Documentation:** `/odoo_artwork_uploader/DEPLOYMENT_GUIDE.md`

---

## Changelog

### v36 (2025-11-24) - **RECOMMENDED**
- **FIXED:** Corrected pricelist logic to respect special customer pricelists
- **FIXED:** Cron to scan tasks instead of order lines (PDF sync)
- **FIXED:** Removed PDF overwrite restrictions
- Applied consistent pricelist logic to both pricing API and cart

### v35 (2025-11-24) - **DO NOT USE**
- ❌ BROKEN: Forced CT Euro/GBP for ALL customers (ignores special pricelists)
- Fixed cron and PDF overwrites (carried forward to v36)

### v34 (2025-11-23)
- Initial PDF sync implementation
- Smart pricelist fallback logic
- Multi-color garment support
