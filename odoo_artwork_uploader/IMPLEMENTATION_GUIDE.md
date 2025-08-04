# Artwork Uploader Module - Implementation Guide

## Prerequisites

### System Requirements
- Odoo 16.0 or later
- Python 3.8+
- PostgreSQL 12+
- Node.js 14+ (for frontend assets)

### Required Odoo Modules
- `base` - Core Odoo functionality
- `website` - Website framework
- `website_sale` - E-commerce functionality
- `sale` - Sales management
- `product` - Product management

## Installation Steps

### 1. Module Installation
1. Copy the `artwork_uploader` directory to your Odoo addons path
2. Update your Odoo addons list: `./odoo-bin -u base --stop-after-init`
3. Install the module via Odoo Apps interface or command line:
   ```bash
   ./odoo-bin -i artwork_uploader -d your_database
   ```

### 2. File System Setup
Create required directories with proper permissions:
```bash
# In your Odoo data directory
mkdir -p filestore/artwork_uploads
mkdir -p filestore/artwork_temp
chmod 755 filestore/artwork_uploads
chmod 755 filestore/artwork_temp
```

### 3. External Dependencies
Install required Python packages:
```bash
pip install Pillow
pip install reportlab
pip install requests
```

### 4. Configuration

#### Database Configuration
The module automatically creates required database tables. No manual schema changes needed.

#### File Upload Limits
Configure in `odoo.conf`:
```ini
limit_request_size = 209715200  # 200MB
limit_memory_hard = 2684354560  # 2.5GB
limit_memory_soft = 2147483648  # 2GB
```

#### Website Configuration
1. Go to Website > Configuration > Settings
2. Enable "E-commerce" if not already enabled
3. Configure payment providers as needed

## Template-to-Product Mapping

### Automatic Product Creation
The module includes a wizard to create products from templates:

1. Navigate to Sales > Artwork > Template Mapping
2. Click "Create Products from Templates"
3. Select templates and configure product details
4. Run the wizard to auto-create products

### Manual Product Mapping
For existing products:

1. Go to Sales > Products > Products
2. Edit a product
3. Add to "Artwork Templates" tab
4. Select applicable templates for this product

## API Integration

### External Artwork Tool Integration
The module provides REST API endpoints for external tools:

#### Upload Artwork
```http
POST /artwork/api/upload
Content-Type: multipart/form-data

file: [artwork file]
project_name: "Project Name"
template_id: "template-A4"
```

#### Create Project
```http
POST /artwork/api/project
Content-Type: application/json

{
  "name": "Project Name",
  "template_id": "template-A4",
  "garment_colors": ["Navy", "Red"],
  "ink_colors": ["White", "Yellow"],
  "comments": "Special instructions"
}
```

#### Get Templates
```http
GET /artwork/api/templates
```

### Sales Order Integration
Projects automatically create sales order lines when confirmed:

- Product selection based on template mapping
- Automatic pricing from product configuration
- Project details in order line description
- Garment colors and comments included

## Hot Deployment System

### JavaScript Client
Access the deployment console in browser:
```javascript
// In browser console on any Odoo page
deploy.status()        // Check deployment status
deploy.views()         // Reload XML views
deploy.models()        // Refresh Python models
deploy.full()          // Complete system reload
deploy.backup()        // Create module backup
```

### API Endpoints
Direct HTTP access to deployment functions:

#### Status Check
```bash
curl -X GET /artwork/deploy/status
```

#### Update Files
```bash
curl -X POST /artwork/deploy/update-file \
  -H "Content-Type: application/json" \
  -d '{
    "file_path": "models/artwork_project.py",
    "content": "# Updated model code"
  }'
```

#### Database Updates
```bash
curl -X POST /artwork/deploy/run-sql \
  -H "Content-Type: application/json" \
  -d '{
    "sql": ["ALTER TABLE artwork_project ADD COLUMN new_field VARCHAR(255);"]
  }'
```

## Security Configuration

### Access Rights
The module includes preconfigured access rights:

- **Artwork User**: Can create and manage own projects
- **Artwork Manager**: Can manage all projects and templates
- **Sales User**: Can view projects and create orders

### Custom Security Groups
To create custom security groups:

1. Go to Settings > Users & Companies > Groups
2. Create new group with desired permissions
3. Assign users to the group
4. Configure record rules if needed

## Performance Optimization

### File Storage Optimization
Configure file storage location in `odoo.conf`:
```ini
data_dir = /path/to/fast/storage
```

### Database Indexing
The module includes optimized database indexes. Monitor query performance and add additional indexes if needed:

```sql
-- Example: Add index for frequently queried fields
CREATE INDEX idx_artwork_project_template ON artwork_project(template_id);
CREATE INDEX idx_artwork_project_status ON artwork_project(state);
```

### Caching Configuration
Enable Odoo caching for better performance:
```ini
enable_redis = True
redis_host = localhost
redis_port = 6379
redis_dbindex = 1
```

## Troubleshooting

### Common Issues

#### File Upload Failures
1. Check file size limits in `odoo.conf`
2. Verify directory permissions
3. Check disk space availability
4. Review Odoo server logs

#### Template Mapping Issues
1. Verify template IDs in database
2. Check product-template relationships
3. Use Template Mapping Wizard to reset mappings

#### Sales Order Integration Problems
1. Verify sale module is installed
2. Check product configurations
3. Review order line creation logs

### Log Analysis
Enable debug logging in `odoo.conf`:
```ini
log_level = debug
log_handler = :DEBUG
```

Monitor logs for artwork-related entries:
```bash
tail -f /var/log/odoo/odoo.log | grep artwork
```

### Performance Monitoring
Monitor key metrics:
- File upload success rate
- Order creation time
- Template loading speed
- Database query performance

## Backup and Recovery

### Module Backup
Use the hot deployment system:
```javascript
deploy.backup()  // Creates timestamped backup
```

### Data Backup
Regular Odoo database backups include all artwork data:
```bash
pg_dump -h localhost -U odoo -d database_name > backup.sql
```

### File System Backup
Backup artwork files separately:
```bash
tar -czf artwork_files_backup.tar.gz /odoo/data/filestore/artwork_*
```

## Customization Guide

### Adding Custom Fields
1. Extend the artwork_project model
2. Update views to include new fields
3. Modify API endpoints if needed
4. Use hot deployment to apply changes

### Custom Templates
1. Create template records in database
2. Add template images to file system
3. Configure template-to-product mappings
4. Test template selection and rendering

### Custom Workflows
1. Extend state management in models
2. Add custom workflow actions
3. Update views to show new states
4. Configure email notifications if needed

## Maintenance

### Regular Tasks
- Monitor file system usage
- Clean up temporary files
- Review and archive old projects
- Update template mappings as needed

### Updates and Upgrades
1. Create full backup before updates
2. Test updates in staging environment
3. Use hot deployment for minor fixes
4. Follow Odoo upgrade procedures for major versions

## Support and Documentation

### Internal Documentation
- Model documentation in Python docstrings
- API documentation in controller comments
- View documentation in XML comments

### External Resources
- Odoo Official Documentation
- Module-specific README files
- Hot Deployment Guide
- Template Mapping Guide

For technical support, review logs and use the hot deployment system for quick fixes and updates.