# Migration Guide: Standalone to Odoo Module

## Overview
This guide covers the process of migrating from the standalone Artwork Uploader application to the Odoo 16 module.

## Key Differences

### Architecture Changes
| Standalone | Odoo Module |
|------------|-------------|
| React + Express.js | Odoo MVC + OWL Components |
| PostgreSQL with Drizzle ORM | Odoo ORM |
| Custom authentication | Odoo user management |
| File system storage | Odoo attachment system |
| Custom pricing logic | Odoo pricelist integration |

### API Endpoints Mapping
| Standalone Endpoint | Odoo Endpoint |
|---------------------|---------------|
| `/api/projects` | `/artwork/api/projects` |
| `/api/projects/:id/logos` | `/artwork/api/projects/:uuid/logos` |
| `/api/projects/:id/canvas-elements` | `/artwork/api/projects/:uuid/canvas-elements` |
| `/api/projects/:id/generate-pdf` | `/artwork/api/projects/:uuid/generate-pdf` |

## Frontend Integration Strategy

### Option 1: Embedded React (Recommended)
Keep the existing React components and embed them in Odoo:

1. Bundle the React app as a single file
2. Load it in the Odoo website template
3. Use Odoo's JSON-RPC for API calls

```javascript
// Update API calls to use Odoo's RPC
const rpc = window.odoo.rpc;
const project = await rpc('/artwork/api/projects', {
    name: projectName,
    templateSize: templateSize
});
```

### Option 2: Full OWL Rewrite
Rewrite the frontend using Odoo's OWL framework:

1. Convert React components to OWL components
2. Use Odoo's built-in state management
3. Leverage Odoo's UI components

## Data Migration

### 1. Export Existing Data
```sql
-- Export projects
COPY (SELECT * FROM projects) TO '/tmp/projects.csv' CSV HEADER;

-- Export logos
COPY (SELECT * FROM logos) TO '/tmp/logos.csv' CSV HEADER;

-- Export canvas elements
COPY (SELECT * FROM canvas_elements) TO '/tmp/canvas_elements.csv' CSV HEADER;
```

### 2. Transform Data Structure
Create a Python script to transform the data:

```python
import csv
import json

# Read projects
with open('projects.csv', 'r') as f:
    reader = csv.DictReader(f)
    projects = list(reader)

# Transform to Odoo format
for project in projects:
    # Map fields
    odoo_project = {
        'name': project['name'],
        'uuid': project['id'],
        'template_size': project['templateSize'],
        'garment_color': project['garmentColor'],
        'ink_color': project.get('inkColor'),
        'quantity': int(project.get('quantity', 10)),
        'state': 'draft',
    }
    # Save for import
```

### 3. Import to Odoo
Use Odoo's data import wizard or create XML data files:

```xml
<odoo>
    <data>
        <record id="imported_project_1" model="artwork.project">
            <field name="name">Project Name</field>
            <field name="uuid">original-uuid</field>
            <field name="template_size">template-A3</field>
            <field name="garment_color">#000000</field>
            <field name="quantity">10</field>
        </record>
    </data>
</odoo>
```

## File Migration

### 1. Copy Upload Directory
```bash
# Copy all uploaded files to Odoo filestore
cp -r uploads/* /odoo/filestore/artwork_uploads/
```

### 2. Update File References
Create attachment records in Odoo:

```python
# In a server action or migration script
for logo in logos:
    attachment = env['ir.attachment'].create({
        'name': logo.filename,
        'type': 'binary',
        'datas': base64_encoded_file_content,
        'res_model': 'artwork.logo',
        'res_id': logo.id,
    })
```

## PDF Generation Service

### 1. Install System Dependencies
```bash
# On Odoo server
apt-get update
apt-get install -y ghostscript inkscape imagemagick
```

### 2. Configure Odoo
Add to Odoo configuration:
```ini
[options]
limit_request = 209715200  # 200MB upload limit
```

### 3. Update PDF Generation Code
Port the PDF generation logic to Odoo:

```python
class ArtworkProject(models.Model):
    _inherit = 'artwork.project'
    
    def generate_pdf(self):
        # Port SimplifiedPDFGenerator logic
        pdf_content = self._generate_pdf_content()
        
        # Save as attachment
        attachment = self.env['ir.attachment'].create({
            'name': f'{self.name}_artwork.pdf',
            'type': 'binary',
            'datas': base64.b64encode(pdf_content),
            'res_model': 'artwork.project',
            'res_id': self.id,
        })
        
        self.pdf_file = attachment.datas
        self.pdf_filename = attachment.name
```

## E-commerce Integration

### 1. Product Setup
- Create product templates for each artwork type
- Set up pricing tiers using Odoo pricelists
- Configure minimum quantities

### 2. Cart Integration
Update the add to cart functionality:

```python
def action_add_to_cart(self):
    # Create sale order line
    order = request.website.sale_get_order(force_create=True)
    order._cart_update(
        product_id=self.product_id.id,
        add_qty=self.quantity,
    )
    
    # Link project to order
    self.sale_order_id = order.id
```

## Testing Checklist

- [ ] File upload (all formats: PNG, JPEG, SVG, PDF, AI, EPS)
- [ ] Canvas manipulation (position, rotate, scale)
- [ ] Template selection
- [ ] Garment color selection
- [ ] PDF generation
- [ ] Add to cart functionality
- [ ] Checkout process
- [ ] Order confirmation
- [ ] Backend project management

## Deployment Steps

1. **Development Environment**
   ```bash
   # Clone Odoo 16
   git clone --depth 1 --branch 16.0 https://github.com/odoo/odoo.git
   
   # Install module
   cp -r odoo_artwork_uploader /path/to/odoo/addons/
   
   # Update addons path
   ./odoo-bin -u artwork_uploader
   ```

2. **Production Deployment**
   - Test in staging environment
   - Backup production database
   - Install module
   - Run data migration scripts
   - Verify all functionality
   - Monitor for issues

## Rollback Plan

If issues arise:
1. Uninstall the module
2. Restore database backup
3. Revert to standalone application
4. Investigate and fix issues
5. Retry migration

## New Features Requiring Migration

### Support Form / Helpdesk Integration

**Current Implementation (Standalone)**:
- Integrated Help Modal with Contact Support section
- Sends support requests via MailerSend API to `transferhelp@serigraf.com`
- Endpoint: `POST /api/support/send-email`
- Fields: name, email, subject, message
- Error handling for email service failures

**Required Migration to Odoo Helpdesk**:

1. **Replace Email Endpoint with Odoo Helpdesk Ticket Creation**
   ```python
   @http.route('/artwork/api/support/create-ticket', type='json', auth='public', methods=['POST'])
   def create_support_ticket(self, name, email, subject, message):
       """Create helpdesk ticket from support form"""
       try:
           # Find or create the "Complete Transfers Help" team
           team = request.env['helpdesk.team'].sudo().search([
               ('name', '=', 'Complete Transfers Help')
           ], limit=1)
           
           if not team:
               return {'success': False, 'error': 'Helpdesk team not found'}
           
           # Create ticket
           ticket = request.env['helpdesk.ticket'].sudo().create({
               'name': subject,
               'description': f"""
   Support Request from Artwork Uploader
   
   From: {name} ({email})
   Subject: {subject}
   
   Message:
   {message}
               """,
               'team_id': team.id,
               'partner_email': email,
               'partner_name': name,
               'priority': '1',  # Normal priority
           })
           
           return {
               'success': True,
               'ticket_id': ticket.id,
               'message': 'Support ticket created successfully'
           }
       except Exception as e:
           _logger.error(f'Support ticket creation error: {str(e)}')
           return {
               'success': False,
               'error': str(e)
           }
   ```

2. **Frontend Integration**
   - Update HelpModal component (`client/src/components/help-modal.tsx`)
   - Change API endpoint from `/api/support/send-email` to `/artwork/api/support/create-ticket`
   - Update success message to mention ticket creation instead of email
   - Keep same form fields (name, email, subject, message)

3. **Helpdesk Team Setup**
   - Create "Complete Transfers Help" team in Odoo Helpdesk
   - Configure email notifications for new tickets
   - Set up SLA policies if needed
   - Assign team members

4. **Required Odoo Apps**
   - Helpdesk module must be installed
   - Configure email servers for ticket notifications

5. **Migration Checklist**
   - [ ] Install Odoo Helpdesk module
   - [ ] Create "Complete Transfers Help" team
   - [ ] Implement ticket creation controller
   - [ ] Update frontend to use new endpoint
   - [ ] Test ticket creation flow
   - [ ] Configure email notifications
   - [ ] Remove MailerSend dependency

**Current MailerSend Configuration (To Be Removed)**:
- Sender: `support@completetransfers.com`
- Recipient: `transferhelp@serigraf.com`
- API Key: Stored in `MAILERSEND_API_KEY` environment variable

## Support

For migration assistance:
- Review Odoo logs: `/var/log/odoo/odoo.log`
- Check browser console for JavaScript errors
- Contact Complete Transfers support team via Odoo Helpdesk