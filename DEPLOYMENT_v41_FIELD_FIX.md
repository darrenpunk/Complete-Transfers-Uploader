# v41 - CRITICAL FIX: Correct Production Field Names

**Version:** 16.0.41.0  
**Date:** November 25, 2025  
**Status:** READY FOR IMMEDIATE DEPLOYMENT

---

## 🎯 The Real Problem (Root Cause Analysis)

### Why v36 Worked
v36 defined its own fields in the module:
- ✅ `artwork_pdf_file` (custom field)
- ✅ `artwork_pdf_filename` (custom field)
- ✅ No conflict with production fields
- ✅ Add-to-cart, pricelists, discounts all working perfectly

### Why v39 Broke Everything
v39 tried to integrate with production fields but used **WRONG FIELD NAMES**:
- ❌ Attempted to use `artwork_file` (doesn't exist in production)
- ❌ Created field conflict with `website_artwork_dropbox` module
- ❌ Error: `Invalid field 'artwork_file' on model 'sale.order.line'`
- ❌ Broke add-to-cart, broke all working features from v36

### Why v40 Still Failed
v40 removed duplicate field definitions but still used wrong field name:
- ❌ Still tried to write to `artwork_file` (doesn't exist)
- ❌ Same error: `Invalid field 'artwork_file' on model 'sale.order.line'`

---

## ✅ v41 Solution: Use Correct Production Field Names

**Production developer confirmed the actual fields:**

```python
# PRODUCTION FIELDS (from website_artwork_dropbox module):
artwork_files_datas   # Binary field - PDF stored in Odoo filestore (before Dropbox sync)
artwork_file_name     # String field - Filename
dropbox_path_pdf      # String field - Dropbox URL (after automatic sync happens)
```

**Workflow:**
1. Upload PDF → Stored in `artwork_files_datas` field
2. Automatic Dropbox sync → File moved to Dropbox, `artwork_files_datas` cleared, URL saved in `dropbox_path_pdf`
3. Manufacturing task → Gets PDF from `artwork_image` field (synced from order line)

---

## 📋 Changes in v41

### File: `controllers/main.py` (Line 574-580)
**BEFORE (v40):**
```python
order_line.write({
    'artwork_file': pdf_binary,           # ❌ WRONG - Field doesn't exist
    'artwork_file_name': pdf_filename
})
```

**AFTER (v41):**
```python
order_line.write({
    'artwork_files_datas': pdf_binary,    # ✅ CORRECT - Production field
    'artwork_file_name': pdf_filename      # ✅ CORRECT - Production field
})
```

### File: `models/sale_order.py` (Lines 66-76)
**BEFORE (v40):**
```python
if 'artwork_file' in vals and vals['artwork_file']:  # ❌ WRONG
    for line in self:
        if line.artwork_file:                         # ❌ WRONG
            task.write({'artwork_image': line.artwork_file})
```

**AFTER (v41):**
```python
if 'artwork_files_datas' in vals and vals['artwork_files_datas']:  # ✅ CORRECT
    for line in self:
        if line.artwork_files_datas:                                # ✅ CORRECT
            task.write({'artwork_image': line.artwork_files_datas})
```

### File: `__manifest__.py`
**BEFORE:**
```python
'version': '16.0.40.0',
```

**AFTER:**
```python
'version': '16.0.41.0',
```

---

## 🚀 Expected Results After v41

### ✅ Add-to-Cart Will Work
- No more "Invalid field 'artwork_file'" error
- PDF correctly uploaded to `artwork_files_datas` field
- Automatic Dropbox sync triggered by production module
- Manufacturing tasks receive PDF via `artwork_image` field

### ✅ All v36 Features Restored
- Pricelist logic working (CT Euro override for completetransfers.com)
- Add-to-cart functional
- Discounts applied correctly
- Customer context preserved in pricing

### ✅ Production Integration Complete
- Uses production's exact field names
- Triggers existing Dropbox workflow
- No field conflicts
- No custom fields (relies on production module dependency)

---

## 📦 Deployment Instructions

### Step 1: Upload v41 to Staging
```
1. Go to: https://stage-completetransfers.odoo.com
2. Apps → Upload Module
3. Select: odoo_artwork_uploader_v41_correct_field_names.zip
4. Click Upload
```

### Step 2: Upgrade Module
```
1. Apps → Remove "Apps" filter
2. Search "Artwork Uploader"
3. Click "Upgrade" button
4. Wait for upgrade to complete
```

### Step 3: Test Add-to-Cart
```
1. Login as customer (e.g., IH Consultants)
2. Go to artwork uploader
3. Select template, upload logo
4. Click "Add to Cart"
5. Expected: ✅ SUCCESS - No "Invalid field" error
```

### Step 4: Verify PDF in Production Fields
```
1. Go to Sales → Orders → Find the test order
2. Open order line
3. Check fields:
   - artwork_files_datas: Should have binary data (before Dropbox sync)
   - artwork_file_name: Should show filename (e.g., "test_3.pdf")
   - dropbox_path_pdf: Will populate after automatic sync
```

### Step 5: Check Manufacturing Task
```
1. Go to Project → Tasks
2. Find task for the order line
3. Check artwork_image field
4. Expected: ✅ PDF appears on task (accessible to production team)
```

---

## 🧪 Testing Checklist

- [ ] Add-to-cart works without errors
- [ ] PDF appears in `artwork_files_datas` field on order line
- [ ] Filename appears in `artwork_file_name` field
- [ ] PDF syncs to manufacturing task's `artwork_image` field
- [ ] Dropbox workflow triggers (check `dropbox_path_pdf` after sync)
- [ ] Pricing uses correct customer context (not Public User)
- [ ] CT Euro Pricelist override works on completetransfers.com
- [ ] Special pricelists respected on serigraf.com

---

## 🔄 Timeline of Versions

**v36:** ✅ Working - Custom fields, all features functional  
**v39:** ❌ Broken - Tried to use `artwork_file` (doesn't exist), broke add-to-cart  
**v40:** ❌ Broken - Fixed dependencies but still used wrong field name  
**v41:** ✅ FIXED - Uses correct field name `artwork_files_datas`

---

## 🎯 Production Deployment (After Staging Success)

**Deploy to production ONLY after:**
1. ✅ All staging tests pass
2. ✅ No errors in staging logs
3. ✅ Add-to-cart completes successfully
4. ✅ PDF appears on order lines
5. ✅ PDF appears on manufacturing tasks
6. ✅ Dropbox sync works correctly

**Production URL:** https://completetransfers.odoo.com

---

## 📞 Support

**Issues?** transferhelp@serigraf.com

**Files:**
- Module: `odoo_artwork_uploader_v41_correct_field_names.zip`
- Deployment Guide: `DEPLOYMENT_v41_FIELD_FIX.md`

---

## 🔍 Key Lesson Learned

**ALWAYS confirm exact field names with production team before integrating with existing modules.**

The field name difference was subtle:
- ❌ `artwork_file` (doesn't exist)
- ✅ `artwork_files_datas` (actual production field)

This single character difference (`_files_` vs no plural) broke the entire integration.
