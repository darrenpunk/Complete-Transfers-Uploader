# Odoo Migration: Step-by-Step Implementation Guide

## Overview

This guide provides a practical, day-by-day implementation plan for migrating ProofDesigner from Replit to Odoo 16.

**Total Timeline**: 14 days (2 weeks)

**Prerequisites**:
- Odoo 16 instance (development + staging)
- Python 3.8+ environment
- Ghostscript installed on server
- Git repository for version control

---

## Week 1: Foundation & Backend

### Day 1: Environment Setup & Frontend Build

**Morning (2-3 hours): Verify Requirements**

1. **Check Odoo server dependencies**:
   ```bash
   # SSH to Odoo server
   ssh user@odoo-server.com
   
   # Verify Ghostscript
   gs --version
   # Expected: Ghostscript 9.x or higher
   
   # Verify Python
   python3 --version
   # Expected: Python 3.8+
   
   # Install missing packages if needed
   sudo apt-get update
   sudo apt-get install ghostscript poppler-utils
   
   # Install Python packages
   pip3 install Pillow reportlab lxml
   ```

2. **Clone Replit codebase**:
   ```bash
   git clone <your-replit-repo> proofdesigner-replit
   cd proofdesigner-replit
   ```

**Afternoon (3-4 hours): Build React Frontend**

3. **Configure Vite for production**:
   
   Edit `vite.config.ts`:
   ```typescript
   export default defineConfig({
     build: {
       outDir: 'dist',
       rollupOptions: {
         output: {
           entryFileNames: 'assets/index.js',  // No hash for easier management
           chunkFileNames: 'assets/[name].js',
           assetFileNames: 'assets/[name].[ext]',
         },
       },
     },
   });
   ```

4. **Create build script**:
   
   Create `build-for-odoo.sh`:
   ```bash
   #!/bin/bash
   set -e
   
   echo "Building React app..."
   npm run build
   
   echo "Creating Odoo static directory..."
   mkdir -p odoo_artwork_uploader/static
   
   echo "Copying assets..."
   cp -r dist/* odoo_artwork_uploader/static/
   cp -r attached_assets/* odoo_artwork_uploader/static/assets/
   
   echo "✅ Build complete!"
   ```
   
   ```bash
   chmod +x build-for-odoo.sh
   ./build-for-odoo.sh
   ```

5. **Test build output**:
   ```bash
   ls -la odoo_artwork_uploader/static/assets/
   # Should see: index.js, index.css, and image assets
   ```

**✅ Day 1 Deliverable**: React app builds successfully, assets ready for Odoo

---

### Day 2: Odoo Module Structure

**Morning (2-3 hours): Create Odoo Module**

1. **Create module directory structure**:
   ```bash
   mkdir -p odoo_artwork_uploader/{models,controllers,views,data,utils,security,static}
   ```

2. **Create `__manifest__.py`**:
   ```python
   {
       'name': 'Artwork Uploader',
       'version': '1.0.0',
       'category': 'Website',
       'summary': 'Customer artwork upload and design tool',
       'depends': ['base', 'website', 'portal'],
       'data': [
           'security/ir.model.access.csv',
           'views/website_templates.xml',
           'views/artwork_project_views.xml',
           'views/artwork_template_views.xml',
           'data/artwork_template_data.xml',
       ],
       'assets': {
           'web.assets_frontend': [
               'odoo_artwork_uploader/static/assets/index.js',
               'odoo_artwork_uploader/static/assets/index.css',
           ],
       },
       'installable': True,
       'application': True,
   }
   ```

3. **Create `__init__.py` files**:
   ```bash
   touch odoo_artwork_uploader/__init__.py
   touch odoo_artwork_uploader/models/__init__.py
   touch odoo_artwork_uploader/controllers/__init__.py
   touch odoo_artwork_uploader/utils/__init__.py
   
   # odoo_artwork_uploader/__init__.py
   from . import models, controllers
   ```

**Afternoon (3-4 hours): Create Data Models**

4. **Create models** (copy from PYTHON_CONTROLLERS_GUIDE.md):
   - `models/artwork_project.py`
   - `models/artwork_template.py`
   - `models/artwork_vectorization.py`
   
   Update `models/__init__.py`:
   ```python
   from . import artwork_project
   from . import artwork_template
   from . import artwork_vectorization
   ```

5. **Create security rules**:
   
   `security/ir.model.access.csv`:
   ```csv
   id,name,model_id:id,group_id:id,perm_read,perm_write,perm_create,perm_unlink
   access_artwork_project_user,artwork.project user,model_artwork_project,base.group_user,1,1,1,1
   access_artwork_template_user,artwork.template user,model_artwork_template,base.group_user,1,0,0,0
   access_artwork_vectorization_user,artwork.vectorization user,model_artwork_vectorization,base.group_user,1,1,1,1
   ```

6. **Create website template**:
   
   `views/website_templates.xml`:
   ```xml
   <?xml version="1.0" encoding="UTF-8"?>
   <odoo>
       <template id="artwork_uploader_page" name="Artwork Uploader">
           <t t-call="website.layout">
               <div id="root"></div>
               
               <script>
                   window.ODOO_CONFIG = {
                       apiBaseUrl: '/artwork'
                   };
               </script>
               
               <script type="module" src="/odoo_artwork_uploader/static/assets/index.js"></script>
               <link rel="stylesheet" href="/odoo_artwork_uploader/static/assets/index.css"/>
           </t>
       </template>
   </odoo>
   ```

**✅ Day 2 Deliverable**: Odoo module structure complete, models defined

---

### Day 3: Install Module & Test Models

**Morning (2 hours): Install Module**

1. **Copy module to Odoo addons**:
   ```bash
   cp -r odoo_artwork_uploader /path/to/odoo/addons/
   ```

2. **Update Odoo apps list**:
   ```bash
   # Restart Odoo with update
   ./odoo-bin -u base --stop-after-init
   ./odoo-bin
   ```

3. **Install module via UI**:
   - Navigate to Apps
   - Search "Artwork Uploader"
   - Click Install

**Afternoon (4 hours): Test Models & Create Sample Data**

4. **Create sample templates** via Python shell:
   ```bash
   ./odoo-bin shell -d your_database
   ```
   
   ```python
   # In Odoo shell
   Template = env['artwork.template']
   
   Template.create({
       'name': 'template-A3',
       'label': 'A3 (297x420mm)',
       'width': 842,
       'height': 1191,
       'sequence': 1,
   })
   
   Template.create({
       'name': 'template-A4',
       'label': 'A4 (210x297mm)',
       'width': 595,
       'height': 842,
       'sequence': 2,
   })
   ```

5. **Test project creation**:
   ```python
   Project = env['artwork.project']
   
   project = Project.create({
       'name': 'Test Project',
       'template_id': 1,  # A3 template
       'user_id': 2,  # Admin user
       'data': '{"test": "data"}',
   })
   
   print(project.name)  # Should print "Test Project"
   ```

**✅ Day 3 Deliverable**: Module installed, models working, sample data created

---

### Day 4-5: Backend Controllers

**Day 4 Morning (3 hours): Template & Project Endpoints**

1. **Create main controller**:
   
   `controllers/main.py` - Copy from PYTHON_CONTROLLERS_GUIDE.md:
   - Template endpoints
   - Project CRUD endpoints
   
   Update `controllers/__init__.py`:
   ```python
   from . import main
   ```

2. **Test endpoints**:
   ```bash
   # Get session cookie first (login via browser)
   
   # Test templates endpoint
   curl -X POST http://localhost:8069/artwork/templates \
     -H "Content-Type: application/json" \
     -H "Cookie: session_id=YOUR_SESSION" \
     -d '{"jsonrpc":"2.0","method":"call","params":{}}'
   ```

**Day 4 Afternoon (4 hours): File Upload Endpoint**

3. **Implement upload endpoint** (from PYTHON_CONTROLLERS_GUIDE.md)

4. **Test file upload**:
   ```bash
   curl -X POST http://localhost:8069/artwork/upload \
     -H "Cookie: session_id=YOUR_SESSION" \
     -F "file=@test-logo.png" \
     -F "projectId=1"
   ```

**Day 5 (Full day): PDF/SVG Processing**

5. **Create utility modules** (copy from PDF_SVG_PROCESSING_GUIDE.md):
   - `utils/pdf_processor.py`
   - `utils/svg_processor.py`
   - `utils/pdf_generator.py`

6. **Test PDF bounds extraction**:
   ```python
   from odoo_artwork_uploader.utils.pdf_processor import PDFBoundsExtractor
   
   with open('test.pdf', 'rb') as f:
       pdf_data = f.read()
   
   result = PDFBoundsExtractor.extract_bounds(pdf_data)
   print(result)
   ```

7. **Integrate with controllers**:
   - Add PDF bounds endpoint
   - Add SVG bounds endpoint
   - Test both endpoints

**✅ Day 4-5 Deliverable**: All backend endpoints working, PDF/SVG processing functional

---

## Week 2: Frontend Integration & Testing

### Day 6-7: Frontend API Integration

**Day 6 Morning (3 hours): Update API Client**

1. **Update `client/src/lib/queryClient.ts`**:
   ```typescript
   const API_BASE_URL = (window as any).ODOO_CONFIG?.apiBaseUrl || '/artwork';
   
   export const queryClient = new QueryClient({
     defaultOptions: {
       queries: {
         queryFn: async ({ queryKey }) => {
           const res = await fetch(`${API_BASE_URL}${queryKey[0]}`, {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             credentials: 'include',
             body: JSON.stringify({
               jsonrpc: '2.0',
               method: 'call',
               params: {},
             }),
           });
           
           const data = await res.json();
           return data.result;
         },
       },
     },
   });
   ```

**Day 6 Afternoon (4 hours): Update Route Calls**

2. **Update all API routes**:
   
   Find and replace:
   - `/api/template-sizes` → `/templates`
   - `/api/projects` → `/project/create`
   - `/api/projects/:id` → `/project/${id}`
   - etc.

3. **Test in browser**:
   - Rebuild: `./build-for-odoo.sh`
   - Copy to Odoo: `cp -r odoo_artwork_uploader/static/* /path/to/odoo/addons/odoo_artwork_uploader/static/`
   - Restart Odoo
   - Navigate to `/artwork`

**Day 7 (Full day): Frontend Testing & Fixes**

4. **Test all features**:
   - [ ] Template selection
   - [ ] File upload (PNG, JPEG, SVG, PDF)
   - [ ] Canvas interaction
   - [ ] Project save/load
   - [ ] PDF generation
   - [ ] Bounds extraction

5. **Fix issues**:
   - Debug API calls
   - Fix CORS/session issues
   - Update error handling

**✅ Day 6-7 Deliverable**: Frontend fully integrated with Odoo backend

---

### Day 8-9: Data Migration

**Day 8 Morning (3 hours): Export Replit Data**

1. **Export from Replit database**:
   ```bash
   # SSH to Replit or use Neon dashboard
   
   # Export templates
   psql $DATABASE_URL -c "\COPY (SELECT * FROM templates) TO '/tmp/templates.csv' CSV HEADER"
   
   # Export projects
   psql $DATABASE_URL -c "\COPY (SELECT * FROM projects) TO '/tmp/projects.csv' CSV HEADER"
   
   # Download CSVs
   scp user@replit:/tmp/*.csv ./migration-data/
   ```

**Day 8 Afternoon (4 hours): Import to Odoo**

2. **Create import script**:
   
   `migrate_data.py`:
   ```python
   import csv
   import json
   from odoo import api, SUPERUSER_ID
   
   def migrate_templates(cr):
       env = api.Environment(cr, SUPERUSER_ID, {})
       
       with open('migration-data/templates.csv') as f:
           reader = csv.DictReader(f)
           for row in reader:
               env['artwork.template'].create({
                   'name': row['name'],
                   'label': row['label'],
                   'width': int(row['width']),
                   'height': int(row['height']),
               })
   
   def migrate_projects(cr):
       env = api.Environment(cr, SUPERUSER_ID, {})
       
       with open('migration-data/projects.csv') as f:
           reader = csv.DictReader(f)
           for row in reader:
               # Map Replit user_id to Odoo user_id
               odoo_user_id = map_user_id(row['user_id'])
               
               env['artwork.project'].create({
                   'name': row['name'],
                   'user_id': odoo_user_id,
                   'template_id': row['template_id'],
                   'data': row['data'],
               })
   ```

3. **Run migration**:
   ```bash
   ./odoo-bin shell -d your_database < migrate_data.py
   ```

**Day 9 (Full day): Migrate File Attachments**

4. **Export files from Replit Object Storage**:
   ```bash
   # Download all files from GCS
   gsutil -m cp -r gs://your-bucket/* ./migration-files/
   ```

5. **Import to Odoo attachments**:
   ```python
   import base64
   import os
   
   def migrate_files(cr):
       env = api.Environment(cr, SUPERUSER_ID, {})
       
       for filename in os.listdir('./migration-files'):
           filepath = f'./migration-files/{filename}'
           
           with open(filepath, 'rb') as f:
               file_data = f.read()
           
           env['ir.attachment'].create({
               'name': filename,
               'type': 'binary',
               'datas': base64.b64encode(file_data),
               'res_model': 'artwork.project',
               'res_id': get_project_id(filename),  # Map filename to project
           })
   ```

**✅ Day 8-9 Deliverable**: All data migrated from Replit to Odoo

---

### Day 10-11: Full Testing

**Day 10 (Full day): Feature Testing**

1. **Test matrix**:
   
   | Feature | Test Case | Status |
   |---------|-----------|--------|
   | Upload PNG | Upload raster logo | ☐ |
   | Upload SVG | Upload vector logo | ☐ |
   | Upload PDF | Upload PDF artwork | ☐ |
   | Bounds Detection | Verify tight bounds | ☐ |
   | PDF Generation | Generate print PDF | ☐ |
   | Vectorization Form | Submit service request | ☐ |
   | Project Save | Save canvas state | ☐ |
   | Project Load | Load existing project | ☐ |

2. **Performance testing**:
   - Test with 50 concurrent users
   - Measure page load time
   - Test file upload speed

**Day 11 (Full day): Bug Fixes**

3. **Fix identified issues**
4. **Optimize performance**
5. **Update documentation**

**✅ Day 10-11 Deliverable**: All features tested and working

---

### Day 12-13: Staging Deployment & QA

**Day 12 Morning (3 hours): Deploy to Staging**

1. **Deploy Odoo module to staging**:
   ```bash
   # Copy module to staging server
   scp -r odoo_artwork_uploader user@staging:/path/to/odoo/addons/
   
   # SSH to staging
   ssh user@staging
   
   # Update module
   ./odoo-bin -u odoo_artwork_uploader --stop-after-init
   ./odoo-bin
   ```

**Day 12 Afternoon (4 hours): User Acceptance Testing**

2. **UAT checklist**:
   - [ ] User can access artwork uploader
   - [ ] Upload workflow matches Replit
   - [ ] PDF output is identical quality
   - [ ] Cart integration works
   - [ ] Mobile responsive

**Day 13 (Full day): Final Fixes & Documentation**

3. **Fix UAT issues**
4. **Update user documentation**
5. **Prepare production deployment**

**✅ Day 12-13 Deliverable**: Staging approved, ready for production

---

### Day 14: Production Deployment

**Morning (2 hours): Pre-Deployment**

1. **Final checklist**:
   - [ ] Database backup created
   - [ ] Replit deployment still running (rollback ready)
   - [ ] DNS ready to switch
   - [ ] SSL certificates configured

**Midday (2 hours): Deploy to Production**

2. **Production deployment**:
   ```bash
   # Deploy module
   scp -r odoo_artwork_uploader user@production:/path/to/odoo/addons/
   
   # Update module
   ./odoo-bin -u odoo_artwork_uploader --stop-after-init
   ./odoo-bin
   ```

3. **Switch DNS/routing**:
   - Point artwork uploader URL to Odoo
   - Test production access

**Afternoon (3 hours): Post-Deployment**

4. **Monitor production**:
   - Watch error logs
   - Monitor performance
   - Test critical paths

5. **Parallel run**:
   - Keep Replit running for 1 week
   - Monitor both systems
   - Compare outputs

**✅ Day 14 Deliverable**: Production live, migration complete!

---

## Rollback Plan

If issues arise:

1. **Immediate rollback** (< 5 minutes):
   ```bash
   # Point DNS back to Replit
   # Replit deployment should still be running
   ```

2. **Data sync** (if needed):
   ```bash
   # Export new Odoo data
   # Import to Replit database
   ```

---

## Post-Migration Checklist

### Week 1 After Launch
- [ ] Monitor error logs daily
- [ ] Check performance metrics
- [ ] Collect user feedback
- [ ] Fix any reported issues

### Week 2-4 After Launch
- [ ] Decommission Replit (if stable)
- [ ] Archive migration data
- [ ] Update documentation
- [ ] Train team on Odoo maintenance

---

## Success Metrics

**Migration is successful if**:

✅ All features work identically to Replit
✅ 100+ concurrent users supported
✅ Page load time < 2 seconds
✅ PDF quality matches Replit output
✅ Zero data loss during migration
✅ Hosting costs = $0 incremental

---

## Support Contacts

**During Migration**:
- Dev Team Lead: [contact]
- Odoo Admin: [contact]
- Infrastructure: [contact]

**Emergency**:
- Rollback procedure: [link]
- Escalation path: [link]

---

## Conclusion

This step-by-step guide ensures a smooth migration from Replit to Odoo 16. Follow each day's tasks in order, and test thoroughly before moving to the next phase.

**Key Success Factors**:
1. Thorough testing at each phase
2. Parallel run for validation
3. Quick rollback capability
4. Clear communication with stakeholders

Good luck with the migration! 🚀
