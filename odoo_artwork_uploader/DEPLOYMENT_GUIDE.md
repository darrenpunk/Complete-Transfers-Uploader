# Hot Deployment Guide for Artwork Uploader Module

## Overview
The Artwork Uploader module includes a comprehensive hot deployment system that allows you to deploy fixes and new features without reinstalling the entire module.

## Features

### 1. Hot Reload Capabilities
- **Views**: Reload XML views without restart
- **Models**: Refresh Python models and clear caches
- **Controllers**: Update API endpoints on the fly
- **Full Reload**: Complete system refresh

### 2. File Management
- **Update Files**: Replace any module file with new content
- **Automatic Backup**: Creates backups before updates
- **Security**: Prevents access outside module directory

### 3. Database Updates
- **SQL Execution**: Run schema updates safely
- **Allowed Operations**: ALTER TABLE, CREATE INDEX, DROP INDEX, UPDATE, INSERT
- **Transaction Safety**: Automatic commit/rollback

### 4. Backup System
- **Module Backup**: Complete module state backup
- **Timestamped**: Automatic timestamp in backup names
- **Zip Format**: Compressed backups for easy storage

## API Endpoints

### Status Check
```bash
curl -X GET /artwork/deploy/status
```

### Reload Views
```bash
curl -X POST /artwork/deploy/reload-views
```

### Reload Models
```bash
curl -X POST /artwork/deploy/reload-models
```

### Update File
```bash
curl -X POST /artwork/deploy/update-file \
  -H "Content-Type: application/json" \
  -d '{
    "file_path": "models/artwork_project.py",
    "content": "# Updated model code here"
  }'
```

### Run SQL
```bash
curl -X POST /artwork/deploy/run-sql \
  -H "Content-Type: application/json" \
  -d '{
    "sql": ["ALTER TABLE artwork_project ADD COLUMN new_field VARCHAR(255);"]
  }'
```

### Full Reload
```bash
curl -X POST /artwork/deploy/full-reload
```

### Create Backup
```bash
curl -X POST /artwork/deploy/backup-module
```

## JavaScript Client

The module includes a JavaScript client for easy deployment from the browser console:

```javascript
// Check status
await deploy.status()

// Reload views
await deploy.views()

// Reload models  
await deploy.models()

// Full reload
await deploy.full()

// Update a file
await deploy.file('models/artwork_project.py', 'new content')

// Run SQL
await deploy.sql(['ALTER TABLE artwork_project ADD COLUMN test VARCHAR(255);'])

// Create backup
await deploy.backup()
```

## Common Deployment Scenarios

### 1. Fix a Bug in Model
```javascript
// Create backup first
await deploy.backup()

// Update model file
await deploy.file('models/artwork_project.py', updatedModelCode)

// Reload models
await deploy.models()
```

### 2. Update View Template
```javascript
// Update view file
await deploy.file('views/artwork_project_views.xml', updatedViewXML)

// Reload views
await deploy.views()
```

### 3. Add New API Endpoint
```javascript
// Update controller
await deploy.file('controllers/main.py', updatedControllerCode)

// Full reload needed for controllers
await deploy.full()
```

### 4. Database Schema Change
```javascript
// Add new field
await deploy.sql([
  'ALTER TABLE artwork_project ADD COLUMN new_field VARCHAR(255);'
])

// Update model to include new field
await deploy.file('models/artwork_project.py', updatedModelWithNewField)

// Reload models
await deploy.models()
```

## Security Considerations

### 1. User Permissions
- Requires authenticated user
- Only users with appropriate permissions can deploy
- Admin users recommended for production deployments

### 2. File Security
- Files must be within module directory
- Path traversal attacks prevented
- Automatic backups before changes

### 3. SQL Security
- Only specific SQL operations allowed
- No DROP TABLE or dangerous operations
- Transaction safety with automatic rollback on error

## Best Practices

### 1. Always Backup First
```javascript
await deploy.backup()
```

### 2. Test Changes in Development
- Use deployment system in development environment first
- Verify changes work as expected
- Only then deploy to production

### 3. Use Version Control
- Keep track of changes in Git
- Tag deployments for easy rollback
- Document deployment reasons

### 4. Monitor After Deployment
- Check logs for errors
- Verify functionality works
- Have rollback plan ready

## Error Handling

### Common Errors and Solutions

1. **File Update Failed**
   - Check file permissions
   - Verify file path is correct
   - Ensure content is valid

2. **View Reload Failed**
   - Check XML syntax
   - Verify view references exist
   - Clear browser cache

3. **Model Reload Failed**
   - Check Python syntax
   - Verify model dependencies
   - Check for circular imports

4. **SQL Execution Failed**
   - Verify SQL syntax
   - Check table/column exists
   - Ensure operation is allowed

## Rollback Procedures

### 1. File Rollback
Each file update creates a .backup file. To rollback:
```bash
cp file.backup original_file
```

### 2. Database Rollback
For database changes, you may need to:
- Reverse the SQL operations
- Restore from database backup
- Use Odoo's built-in migration tools

### 3. Full Module Rollback
1. Restore from module backup zip
2. Restart Odoo service
3. Clear all caches

## Production Deployment Checklist

- [ ] Create backup before deployment
- [ ] Test changes in development environment
- [ ] Verify user permissions
- [ ] Check for dependent modules
- [ ] Monitor system after deployment
- [ ] Document changes made
- [ ] Prepare rollback plan
- [ ] Notify team of deployment

## Example Deployment Script

```python
import requests

class ProductionDeployer:
    def __init__(self, base_url, session_id):
        self.base_url = base_url
        self.session = requests.Session()
        self.session.cookies['session_id'] = session_id
    
    def deploy_hotfix(self, file_path, content, description):
        # Create backup
        backup_result = self.session.post(f'{self.base_url}/artwork/deploy/backup-module')
        print(f"Backup created: {backup_result.json()}")
        
        # Update file
        update_result = self.session.post(f'{self.base_url}/artwork/deploy/update-file', 
                                        json={'file_path': file_path, 'content': content})
        print(f"File updated: {update_result.json()}")
        
        # Reload appropriate components
        reload_result = self.session.post(f'{self.base_url}/artwork/deploy/full-reload')
        print(f"System reloaded: {reload_result.json()}")
        
        return True

# Usage
deployer = ProductionDeployer('https://your-odoo-instance.com', 'your-session-id')
deployer.deploy_hotfix('models/artwork_project.py', new_model_code, 'Fix comment field validation')
```

## Monitoring and Logging

All deployment operations are logged with:
- Timestamp
- User who performed action
- Files modified
- Success/failure status
- Error details (if any)

Check Odoo logs for deployment activity:
```bash
tail -f /var/log/odoo/odoo.log | grep "Deployment"
```

This hot deployment system significantly reduces downtime and makes it easy to push urgent fixes and incremental improvements to your Artwork Uploader module.