# Odoo Module Deployment Guide

## Prerequisites

### System Requirements
- Odoo 16.0 Community or Enterprise
- PostgreSQL 12+
- Python 3.8+
- 4GB RAM minimum (8GB recommended)
- 20GB disk space

### Required System Packages
```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y \
    ghostscript \
    inkscape \
    imagemagick \
    librsvg2-bin \
    poppler-utils \
    python3-pip \
    python3-dev \
    libxml2-dev \
    libxslt1-dev \
    libldap2-dev \
    libsasl2-dev \
    libssl-dev
```

### Python Dependencies
```bash
pip3 install \
    pdf2image \
    cairosvg \
    Pillow \
    PyPDF2
```

## Installation Steps

### 1. Module Installation

```bash
# Navigate to Odoo addons directory
cd /opt/odoo/addons/

# Clone or copy the module
cp -r /path/to/odoo_artwork_uploader .

# Set proper permissions
sudo chown -R odoo:odoo odoo_artwork_uploader
sudo chmod -R 755 odoo_artwork_uploader
```

### 2. Update Odoo Configuration

Edit `/etc/odoo/odoo.conf`:

```ini
[options]
addons_path = /opt/odoo/odoo/addons,/opt/odoo/addons
limit_request = 209715200  # 200MB for file uploads
limit_memory_hard = 2684354560  # 2.5GB
limit_memory_soft = 2147483648  # 2GB
workers = 4  # Adjust based on CPU cores
max_cron_threads = 2
```

### 3. Database Configuration

```sql
-- Create required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Increase connection limits if needed
ALTER SYSTEM SET max_connections = 200;
```

### 4. Nginx Configuration

```nginx
server {
    listen 80;
    server_name artwork.completetransfers.com;
    
    # Increase upload size
    client_max_body_size 200M;
    
    # Increase timeouts
    proxy_read_timeout 720s;
    proxy_connect_timeout 720s;
    proxy_send_timeout 720s;
    
    # Headers
    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";
    add_header X-XSS-Protection "1; mode=block";
    
    location / {
        proxy_pass http://127.0.0.1:8069;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Real-IP $remote_addr;
    }
    
    # Static files
    location ~* /web/static/ {
        proxy_cache_valid 200 90m;
        proxy_buffering on;
        expires 864000;
        proxy_pass http://127.0.0.1:8069;
    }
}
```

### 5. SSL Configuration (Production)

```bash
# Install certbot
sudo apt-get install certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d artwork.completetransfers.com
```

## Module Activation

### 1. Update Apps List
```
1. Log in to Odoo as Administrator
2. Go to Apps menu
3. Click "Update Apps List"
4. Search for "Artwork Uploader"
5. Click Install
```

### 2. Initial Configuration
```
1. Go to Settings > Technical > System Parameters
2. Add these parameters:
   - artwork.max_file_size: 209715200
   - artwork.allowed_formats: png,jpg,jpeg,svg,pdf,ai,eps
   - artwork.ghostscript_path: /usr/bin/gs
   - artwork.inkscape_path: /usr/bin/inkscape
```

### 3. Create Default Products
```
1. Go to Artwork > Configuration
2. Run "Create Default Products" action
3. Review and adjust pricing
```

## Security Setup

### 1. User Groups
```xml
<!-- Create in Settings > Users & Companies > Groups -->
<record id="group_artwork_user" model="res.groups">
    <field name="name">Artwork User</field>
    <field name="category_id" ref="base.module_category_sales_sales"/>
</record>

<record id="group_artwork_manager" model="res.groups">
    <field name="name">Artwork Manager</field>
    <field name="category_id" ref="base.module_category_sales_sales"/>
    <field name="implied_ids" eval="[(4, ref('group_artwork_user'))]"/>
</record>
```

### 2. Access Rights
- Regular users: Can create and view their own projects
- Managers: Can view all projects and modify settings

## Performance Optimization

### 1. Database Indexes
```sql
-- Add indexes for better performance
CREATE INDEX idx_artwork_project_uuid ON artwork_project(uuid);
CREATE INDEX idx_artwork_project_state ON artwork_project(state);
CREATE INDEX idx_artwork_logo_project ON artwork_logo(project_id);
```

### 2. Caching
```python
# Enable caching in odoo.conf
[options]
ormcache_size = 200000
ormcache_context_size = 8192
```

### 3. Background Jobs
Configure workers for PDF generation:
```python
# In odoo.conf
[queue_job]
channels = root:4
```

## Monitoring

### 1. Health Checks
```bash
# Create monitoring script
#!/bin/bash
# /opt/scripts/check_artwork_module.sh

# Check if module is installed
psql -U odoo -d artwork_db -c "SELECT state FROM ir_module_module WHERE name='artwork_uploader';"

# Check disk space
df -h /opt/odoo/filestore

# Check service status
systemctl status odoo
```

### 2. Log Monitoring
```bash
# Monitor logs
tail -f /var/log/odoo/odoo.log | grep artwork

# Set up log rotation
cat > /etc/logrotate.d/odoo << EOF
/var/log/odoo/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 0640 odoo odoo
}
EOF
```

## Backup Strategy

### 1. Database Backup
```bash
#!/bin/bash
# Daily backup script
BACKUP_DIR="/backup/odoo"
DATE=$(date +%Y%m%d_%H%M%S)

# Backup database
pg_dump -U odoo artwork_db > $BACKUP_DIR/artwork_db_$DATE.sql

# Backup filestore
tar -czf $BACKUP_DIR/filestore_$DATE.tar.gz /opt/odoo/filestore/

# Keep only 7 days of backups
find $BACKUP_DIR -type f -mtime +7 -delete
```

### 2. Automated Backups
```bash
# Add to crontab
0 2 * * * /opt/scripts/backup_odoo.sh
```

## Troubleshooting

### Common Issues

1. **Module not appearing in Apps**
   - Clear browser cache
   - Restart Odoo service
   - Check module permissions

2. **PDF generation fails**
   ```bash
   # Test Ghostscript
   gs --version
   
   # Test Inkscape
   inkscape --version
   ```

3. **Upload errors**
   - Check file permissions
   - Verify nginx upload limits
   - Check Odoo logs

### Debug Mode
```python
# Enable debug logging
import logging
_logger = logging.getLogger(__name__)
_logger.setLevel(logging.DEBUG)
```

## Production Checklist

- [ ] SSL certificate installed
- [ ] Firewall configured
- [ ] Backup system tested
- [ ] Monitoring alerts set up
- [ ] User permissions configured
- [ ] Performance testing completed
- [ ] Documentation provided to users
- [ ] Support contact information updated

## Support

For technical support:
- Email: support@completetransfers.com
- Documentation: /artwork/help
- System Status: /artwork/status