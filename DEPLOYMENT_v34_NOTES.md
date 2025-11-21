# Deployment Notes - v34 Bidirectional PDF Sync

## Version
**Module Version:** 16.0.34.0  
**Package:** `odoo_artwork_uploader_v34_bidirectional_pdf_sync.zip`

## What Changed
Comprehensive fix for the critical production workflow issue where PDFs were not appearing on manufacturing tasks.

### 3-Layer PDF Sync Strategy

#### Layer 1: Immediate Sync (Controller)
- **File:** `controllers/main.py` (lines 523-536)
- **When:** Add-to-cart API is called
- **Action:** Uses `order_line.write({'artwork_pdf_file': pdf})` to trigger sync hooks
- **Coverage:** Tasks that exist at add-to-cart time

#### Layer 2: Bidirectional ORM Hooks
- **sale.order.line.write()** - `models/sale_order.py` (lines 29-55)
  - Fires when PDF added to order line
  - Syncs to task if task exists
  
- **project.task.create()** - `models/project_task.py` (lines 11-19)
  - Fires when task created
  - Syncs from order line if PDF exists
  
- **project.task.write()** - `models/project_task.py` (lines 21-33)
  - Fires when task updated (e.g., sale_line_id linked)
  - Syncs from order line if PDF exists

#### Layer 3: Scheduled Cron Job (Eventual Consistency)
- **File:** `data/cron_jobs.xml`
- **Frequency:** Every 15 minutes
- **Method:** `sale.order.line._cron_sync_artwork_pdfs_to_tasks()`
- **Action:** Scans all order lines with PDFs, syncs to tasks if missing
- **Logging:** Reports synced count, skipped count, and error count

## Files Modified
1. `controllers/main.py` - Use write() to trigger hooks
2. `models/sale_order.py` - write() override + cron method
3. `models/project_task.py` - create/write overrides
4. `models/__init__.py` - Import project_task model
5. `data/cron_jobs.xml` - Cron job definition (NEW)
6. `__manifest__.py` - Version bump + cron registration

## Deployment Steps

### Option 1: Hot Deployment (Recommended)
```javascript
// In Odoo staging browser console
const script = document.createElement('script');
script.src = '/artwork_uploader/static/src/js/deployment_client.js';
document.head.appendChild(script);

setTimeout(async () => {
  await deploy.full();
  console.log('✅ v34 deployed - PDF sync active');
}, 2000);
```

### Option 2: Module Upload
1. Apps > Upload Module
2. Select `odoo_artwork_uploader_v34_bidirectional_pdf_sync.zip`
3. Click Upgrade
4. Restart Odoo

## Testing Checklist
- [ ] Add artwork to cart via Replit app
- [ ] Verify PDF appears on sale.order.line.artwork_pdf_file
- [ ] Check manufacturing task has artwork_image populated
- [ ] Test PDF access via /web/content?model=project.task&field=artwork_image&id=XXX
- [ ] Create order BEFORE task → verify PDF syncs when task created
- [ ] Create task BEFORE cart → verify PDF syncs via write() hook
- [ ] Wait 15+ minutes → verify cron job runs and logs results

## Monitoring
Check logs for:
- `✅ PDF synced to manufacturing task #XXX` - Successful sync
- `⚠️ No manufacturing task found` - Normal (task created later)
- `🔄 Cron synced PDF to task #XXX` - Cron safety net triggered
- `❌ Failed to sync PDF` - Investigate errors

## Rollback
If issues occur, revert to v33 or earlier via Apps > Artwork Uploader > Uninstall/Downgrade

## Support
If PDFs still missing from tasks:
1. Check Odoo logs (Settings > Technical > Logging)
2. Verify task auto-creation module is active
3. Check project.task.sale_line_id field exists
4. Manually trigger cron: Settings > Technical > Scheduled Actions > Run Now
