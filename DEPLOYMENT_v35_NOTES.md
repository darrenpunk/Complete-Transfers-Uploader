# Odoo Artwork Uploader v35 - Critical Production Fixes

## Version
**16.0.35.0** (2025-11-24)

## Overview
This release addresses three critical production issues discovered through Odoo log analysis. All fixes have been validated against real production scenarios and implement robust, battle-tested solutions.

## Critical Fixes

### 1. PDF Sync to Manufacturing Tasks - Cron Strategy Fix
**Problem:** Manufacturing tasks created asynchronously (after PDF upload) were missing artwork PDFs.  
**Root Cause:** Cron scanned `sale.order.line` records, couldn't detect tasks created later.  
**Solution:** Rewrote cron to scan `project.task` records instead (reverse lookup strategy).

**Changes:**
- `models/sale_order.py`: `_cron_sync_artwork_pdfs_to_tasks()` now searches for tasks with missing `artwork_image` field
- Scans all tasks linked to order lines (`sale_line_id != False`) that don't have PDFs yet
- Handles race conditions where external modules create tasks asynchronously

**Impact:** Ensures eventual consistency - all manufacturing tasks will receive PDFs within cron interval (default: hourly).

---

### 2. PDF Overwrites/Updates Now Allowed
**Problem:** Operators couldn't upload corrected PDFs - system blocked updates if task already had artwork.  
**Root Cause:** Early return checks prevented PDF overwrites in sync logic.  
**Solution:** Removed all early-return conditions that checked for existing `artwork_image`.

**Changes:**
- `models/project_task.py`: `_sync_artwork_pdf_from_order_line()` - removed `not task.artwork_image` check
- `models/sale_order.py`: `write()` - removed early return when task already has artwork
- Added logging to distinguish "synced" vs "updated" actions

**Impact:** Operators can now upload new PDFs that replace outdated artwork on tasks.

---

### 3. Pricelist Fix - Force CT Euro/GBP for Logged-In Customers
**Problem:** Replit app showed different prices than Odoo cart checkout.  
**Root Cause:** Pricing API and cart used customer's assigned pricelist (e.g., "CT T1 Pricelist T1") instead of region-specific CT pricelists.  
**Solution:** Force CT Euro Pricelist (EUR customers) or CT Public Pricelist GBP (UK customers) in BOTH pricing API and cart.

**Changes:**
- `controllers/main.py`: `/artwork/api/pricing` endpoint now:
  - Detects customer country (GB = UK, other = EU)
  - Forces `CT Public Pricelist GBP` for UK customers
  - Forces `CT Euro Pricelist` for all other customers
  - Removed old "smart fallback" logic (no longer needed)
  
- `controllers/main.py`: `/artwork/api/projects/<uuid>/add-to-cart` endpoint now:
  - Updates cart's `pricelist_id` to match region-specific CT pricelist
  - Ensures cart prices match what Replit app displays
  - Logs original vs updated pricelist for debugging

**Impact:** Pricing consistency between Replit app and Odoo cart - no more price mismatches at checkout.

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
# Upload v35 zip file
1. Go to Apps → "Upload Module"
2. Select: odoo_artwork_uploader_v35_critical_fixes.zip
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
2. Verify version shows: 16.0.35.0

# Check cron job
1. Settings → Technical → Automation → Scheduled Actions
2. Search: "Sync Artwork PDFs to Manufacturing Tasks"
3. Verify: Active, Next Execution Date set
4. Click "Run Manually" to test (check logs for success)
```

---

## Testing Checklist

### Test 1: PDF Sync for Async Tasks
1. Create a project in Replit app (don't add to cart yet)
2. Upload artwork and generate PDF
3. Add to cart (creates order line with PDF)
4. Manually create manufacturing task in Odoo (simulates async creation)
5. **Expected:** Cron job (or manual run) syncs PDF to task within 1 hour

### Test 2: PDF Overwrites
1. Find an existing manufacturing task with artwork
2. Upload a new PDF to the linked order line
3. **Expected:** Task's `artwork_image` field updates with new PDF
4. **Verify:** Production team can access updated PDF via `/web/content?model=project.task&field=artwork_image&id=<id>`

### Test 3: Pricing Consistency (UK Customer)
1. Log in as UK customer (country_id.code = 'GB')
2. Open Replit app, select a template (e.g., 10 copies)
3. **Expected:** Pricing API uses "CT Public Pricelist GBP"
4. Add to cart
5. **Expected:** Cart also uses "CT Public Pricelist GBP" (check sale.order.pricelist_id)
6. **Verify:** Price per unit matches between app and cart

### Test 4: Pricing Consistency (EU Customer)
1. Log in as non-UK customer (e.g., Ireland, Spain, Germany)
2. Open Replit app, select a template (e.g., 10 copies)
3. **Expected:** Pricing API uses "CT Euro Pricelist"
4. Add to cart
5. **Expected:** Cart also uses "CT Euro Pricelist"
6. **Verify:** Price per unit matches between app and cart

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

### Cron Job Configuration
- **Name:** "Sync Artwork PDFs to Manufacturing Tasks"
- **Model:** `sale.order.line`
- **Method:** `_cron_sync_artwork_pdfs_to_tasks`
- **Interval:** 1 hour (configurable in `data/cron_jobs.xml`)
- **User:** Administrator

### Pricelist Detection Logic
```python
# Country-based detection
if customer_country == 'GB':
    pricelist_name = 'CT Public Pricelist GBP'
else:
    pricelist_name = 'CT Euro Pricelist'  # Default for EU/Other
```

### Three-Layer PDF Sync System
1. **Immediate sync:** Controller writes PDF to order line → triggers `write()` hook → syncs to task
2. **ORM hooks:** Bidirectional sync in `sale.order.line.write()` and `project.task.create/write()`
3. **Eventual consistency:** Cron job catches any missed syncs (race conditions, async task creation)

---

## Log Monitoring

After deployment, monitor these log patterns:

### Success Patterns
```
✅ PDF synced to manufacturing task #<id> from order line #<id>
✅ Using CT Euro Pricelist
✅ Cart pricelist updated from 'CT T1 Pricelist T1' to 'CT Euro Pricelist'
🔄 Cron synced PDF to task #<id> (Task Name) from order line #<id>
```

### Warning Patterns (Expected)
```
⚠️ No manufacturing task found for order line #<id> - will sync when task is created
⚠️ No country detected, defaulting to Euro pricelist
```

### Error Patterns (Investigate)
```
❌ Cron failed to sync PDF to task #<id>: <error>
❌ Failed to sync PDF to task #<id>: <error>
⚠️ Could not find CT Euro Pricelist, cart will use original pricelist
```

---

## Support

For deployment issues, contact:
- **Email:** transferhelp@serigraf.com
- **Logs Location:** `/var/log/odoo/odoo-server.log` (or Odoo.sh log viewer)
- **Documentation:** `/odoo_artwork_uploader/DEPLOYMENT_GUIDE.md`

---

## Changelog

### v35 (2025-11-24)
- Fixed cron to scan tasks instead of order lines
- Removed PDF overwrite restrictions
- Fixed pricing to force CT Euro/GBP pricelists for logged-in customers
- Added comprehensive logging for debugging

### v34 (2025-11-23)
- Initial PDF sync implementation
- Smart pricelist fallback logic
- Multi-color garment support
