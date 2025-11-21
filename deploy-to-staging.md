# Deploy PDF Task Fix to Staging Odoo

## What Changed
- Modified `add-to-cart` controller to attach PDF to `project.task.artwork_image` field
- Added fallback mechanism in `sale.order.line.write()` to sync PDFs to tasks automatically
- This ensures production team can access PDFs via the manufacturing task workflow

## Option 1: Hot Deployment (Fastest - Recommended)

### Step 1: Open Odoo Staging in Browser
Navigate to: https://stage-completetransfers.odoo.com

### Step 2: Open Browser Console
Press F12 or Right-click > Inspect > Console

### Step 3: Run Hot Deployment Commands

```javascript
// Load deployment client
const script = document.createElement('script');
script.src = '/artwork_uploader/static/src/js/deployment_client.js';
document.head.appendChild(script);

// Wait a moment for script to load, then deploy changes
setTimeout(async () => {
  // Reload models (includes sale.order.line changes)
  await deploy.models();
  
  // Full reload to update controllers
  await deploy.full();
  
  console.log('✅ Deployment complete! PDF attachment to tasks is now active.');
}, 2000);
```

### Step 4: Test the Fix
1. Go to https://stage-completetransfers.odoo.com/artwork/upload
2. Create a new project with artwork
3. Add to cart
4. Check the manufacturing task - PDF should now appear in artwork_image field

## Option 2: Module Upload (If Hot Deployment Unavailable)

### Step 1: Download Updated Module
The updated module is packaged as: `odoo_artwork_uploader_v33_pdf_task_fix.zip`

### Step 2: Upload to Odoo
1. Go to Odoo Settings > Apps
2. Click "Upload" button
3. Select the zip file
4. Click "Install" or "Upgrade" (if module already exists)

### Step 3: Restart Odoo Service
After upload, restart the Odoo service to apply changes.

## What the Fix Does

### Before (Current Issue):
```
Customer uploads artwork → PDF generated → Stored on sale.order.line
Manufacturing task created → NO PDF attached ❌
Production team can't access PDF ❌
```

### After (Fixed):
```
Customer uploads artwork → PDF generated → Stored on sale.order.line
Manufacturing task created → PDF AUTOMATICALLY attached to task.artwork_image ✅
Production team accesses PDF via /web/content?model=project.task&field=artwork_image&id=XXXX ✅
```

## Code Changes Summary

### File: `odoo_artwork_uploader/controllers/main.py`
- Line 538-552: Added logic to find manufacturing task and attach PDF to `task.artwork_image`

### File: `odoo_artwork_uploader/models/sale_order.py`  
- Line 29-50: Added `write()` override to sync PDF to task when task is created

## Testing Checklist

- [ ] Add artwork to cart via Replit app
- [ ] Check sale order - PDF appears on order line
- [ ] Check manufacturing task - PDF appears on task.artwork_image field
- [ ] Verify PDF opens correctly from task view
- [ ] Confirm production team can access PDF

## Rollback (If Needed)

If issues occur, you can rollback to previous version:

```javascript
// In browser console
await deploy.backup();  // Creates backup first
// Then re-upload previous module version
```

## Support

If deployment fails or PDF still doesn't appear on tasks:
1. Check Odoo logs for errors: Settings > Technical > Logging
2. Verify task auto-creation module is active
3. Confirm PDF is being received in add-to-cart (check logs for "📄 PDF attached to order line")
4. Check if task.artwork_image field exists on project.task model
