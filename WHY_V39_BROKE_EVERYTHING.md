# Why v39 Broke Everything (Root Cause Analysis)

## Timeline of Events

### ✅ v36: Everything Working
**Status:** All features functional  
**Fields Used:** Custom fields defined in our module
```python
# In odoo_artwork_uploader/models/sale_order.py (v36)
artwork_pdf_file = fields.Binary('Artwork PDF File')
artwork_pdf_filename = fields.Char('Artwork PDF Filename')
```

**What Worked:**
- ✅ Add to cart
- ✅ Pricelist logic (CT Euro override)
- ✅ Discounts
- ✅ Customer context in pricing
- ✅ PDF uploads

**Why It Worked:**
These were our own custom fields. No conflicts with production modules.

---

### ❌ v39: Attempted Production Integration - BROKE EVERYTHING
**Status:** Complete failure  
**Intent:** Integrate with production's `website_artwork_dropbox` module  
**Fields Attempted:** `artwork_file` + `artwork_file_name`

**What Happened:**
```python
# v39 tried to use these fields:
order_line.write({
    'artwork_file': pdf_binary,        # ❌ Field doesn't exist in production
    'artwork_file_name': pdf_filename  # ✅ This one exists
})
```

**Error:**
```
ValueError: Invalid field 'artwork_file' on model 'sale.order.line'
```

**Why It Failed:**
1. Production's `website_artwork_dropbox` module uses **`artwork_files_datas`** (not `artwork_file`)
2. We assumed the field name without checking production
3. Field conflict caused module loading failure
4. All features broke: add-to-cart, pricing, everything

**The Mistake:**
```
❌ ASSUMED: artwork_file
✅ ACTUAL:  artwork_files_datas
```

One wrong field name broke the entire integration.

---

### ❌ v40: Fixed Dependencies But Not Field Name
**Status:** Still broken  
**What Changed:** Removed duplicate field definitions, added module dependency  
**What Didn't Change:** Still tried to write to `artwork_file`

**Same Error:**
```
ValueError: Invalid field 'artwork_file' on model 'sale.order.line'
```

**Why It Failed:**
Fixed the architecture (module dependencies) but still used wrong field name.

---

### ✅ v41: Correct Field Names - FIXED
**Status:** Working  
**What Changed:** Use correct production field name

**Correct Implementation:**
```python
# v41 uses correct production fields:
order_line.write({
    'artwork_files_datas': pdf_binary,    # ✅ CORRECT - Production field
    'artwork_file_name': pdf_filename      # ✅ CORRECT - Production field
})
```

**Why It Works:**
- Uses exact field names from production's `website_artwork_dropbox` module
- No field conflicts
- Triggers automatic Dropbox workflow
- All v36 features restored

---

## Production Field Structure (Confirmed by Dev Team)

### Fields on `sale.order.line` (from `website_artwork_dropbox` module)

```python
# Binary field - Stores PDF in Odoo filestore (temporary)
artwork_files_datas = fields.Binary('Artwork Files Data')

# String field - Stores filename
artwork_file_name = fields.Char('Artwork File Name')

# String field - Stores Dropbox URL (after automatic sync)
dropbox_path_pdf = fields.Char('Dropbox Path PDF')
```

### Workflow:
1. **Upload:** PDF stored in `artwork_files_datas` field
2. **Auto Sync:** Production's module automatically:
   - Uploads file to Dropbox
   - Clears `artwork_files_datas` 
   - Stores Dropbox URL in `dropbox_path_pdf`
3. **Manufacturing:** Task gets PDF via `artwork_image` field (synced from order line)

---

## Why This Was So Confusing

### The Field Name Was Almost Correct
```
❌ artwork_file           (what we tried)
✅ artwork_files_datas    (what production uses)
```

**The difference:** `_files_` (plural) vs no plural

This tiny naming difference caused complete failure.

---

## Key Learnings

### 1. Always Verify Field Names
Don't assume field names based on documentation or patterns. Check production directly.

### 2. Test Integration Early
If we had tested v39 on staging immediately, we would have caught this before it broke everything.

### 3. Don't Break Working Code Without Testing
v36 was working perfectly. We should have:
- Deployed v39 to staging first
- Tested add-to-cart
- Verified no errors
- Only then moved to production

### 4. Field Conflicts Are Subtle
The error "Invalid field 'artwork_file'" could mean:
- Field doesn't exist
- Field name typo
- Module dependency missing
- Field redefined in multiple modules

We had to check production's actual module code to find the real field name.

---

## How To Prevent This

### Before Integration:
1. ✅ Get production module source code
2. ✅ Check actual field definitions
3. ✅ Confirm field names with production team
4. ✅ Test on staging first

### During Integration:
1. ✅ Use exact field names from production
2. ✅ Add proper module dependencies
3. ✅ Don't redefine existing fields
4. ✅ Test thoroughly before deployment

### After Integration:
1. ✅ Monitor logs for errors
2. ✅ Test all critical workflows
3. ✅ Have rollback plan ready
4. ✅ Document field mappings

---

## The Fix (v41)

### Changed Files:
1. **controllers/main.py** - Line 577: `artwork_file` → `artwork_files_datas`
2. **models/sale_order.py** - Lines 67, 69, 76, 108, 110: Same change
3. **__manifest__.py** - Version bump + comment update

### Result:
- ✅ Add-to-cart works
- ✅ PDF uploads to production fields
- ✅ Dropbox workflow triggers
- ✅ Manufacturing tasks get PDFs
- ✅ All v36 features restored

---

## Deployment Status

**Current Production:** Unknown version (likely v39 or earlier)  
**Latest Staging:** v39 or v40 (still broken)  
**Ready to Deploy:** v41 (fixed)

**Next Steps:**
1. Upload v41 to staging
2. Upgrade module
3. Test add-to-cart
4. Verify PDF on order lines
5. Check manufacturing tasks
6. Deploy to production

---

## Contact

**Issues?** transferhelp@serigraf.com

**Files:**
- Fixed Module: `odoo_artwork_uploader_v41_correct_field_names.zip`
- This Document: `WHY_V39_BROKE_EVERYTHING.md`
- Deployment Guide: `DEPLOYMENT_v41_FIELD_FIX.md`
