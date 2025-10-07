# Frontend Build Pipeline: React to Odoo

## Overview

This guide explains how to build the React frontend and deploy it as static assets within the Odoo module.

---

## Current Development Setup (Replit)

**Stack**:
- Build Tool: Vite 6
- Framework: React 18 + TypeScript
- Styling: Tailwind CSS + shadcn/ui
- State: TanStack Query v5
- Routing: Wouter

**Dev Server**:
```bash
npm run dev
# Runs Vite dev server + Express backend on port 5000
```

---

## Production Build Process

### Step 1: Build React App

```bash
# Build for production
npm run build

# Output directory: dist/
# ├── assets/
# │   ├── index-[hash].js
# │   ├── index-[hash].css
# │   └── [other-assets].js
# └── index.html
```

**Build Configuration** (`vite.config.ts`):
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        manualChunks: undefined, // Single bundle for simplicity
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './client/src'),
      '@assets': path.resolve(__dirname, './attached_assets'),
    },
  },
});
```

### Step 2: Copy Assets to Odoo Module

**Manual Method**:
```bash
# After build, copy dist/ to Odoo static folder
cp -r dist/* odoo_artwork_uploader/static/
```

**Automated Build Script** (`build-for-odoo.sh`):
```bash
#!/bin/bash

# Build React app
echo "Building React app..."
npm run build

# Create Odoo static directory if it doesn't exist
mkdir -p odoo_artwork_uploader/static

# Clear old assets
rm -rf odoo_artwork_uploader/static/assets

# Copy new build
echo "Copying assets to Odoo module..."
cp -r dist/* odoo_artwork_uploader/static/

echo "Build complete! Assets copied to odoo_artwork_uploader/static/"
```

**Make executable**:
```bash
chmod +x build-for-odoo.sh
./build-for-odoo.sh
```

---

## Odoo Template Integration

### Current Template (`odoo_artwork_uploader/views/website_templates.xml`)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<odoo>
    <template id="artwork_uploader_page" name="Artwork Uploader">
        <t t-call="website.layout">
            <div id="root"></div>
            
            <!-- Load React app bundle -->
            <script type="module" src="/odoo_artwork_uploader/static/assets/index-[HASH].js"></script>
            <link rel="stylesheet" href="/odoo_artwork_uploader/static/assets/index-[HASH].css"/>
        </t>
    </template>
</odoo>
```

### Dynamic Asset Loading

**Problem**: Hash in filename changes with each build (`index-abc123.js` → `index-def456.js`)

**Solution 1: Auto-generate XML from build**

Create `generate-odoo-template.js`:
```javascript
const fs = require('fs');
const path = require('path');

// Find built assets
const distPath = path.join(__dirname, 'dist', 'assets');
const files = fs.readdirSync(distPath);

const jsFile = files.find(f => f.startsWith('index-') && f.endsWith('.js'));
const cssFile = files.find(f => f.startsWith('index-') && f.endsWith('.css'));

// Generate template
const template = `<?xml version="1.0" encoding="UTF-8"?>
<odoo>
    <template id="artwork_uploader_page" name="Artwork Uploader">
        <t t-call="website.layout">
            <div id="root"></div>
            <script type="module" src="/odoo_artwork_uploader/static/assets/${jsFile}"></script>
            <link rel="stylesheet" href="/odoo_artwork_uploader/static/assets/${cssFile}"/>
        </t>
    </template>
</odoo>`;

// Write to Odoo views
fs.writeFileSync(
    path.join(__dirname, 'odoo_artwork_uploader', 'views', 'website_templates.xml'),
    template
);

console.log('✅ Odoo template updated with new asset hashes');
```

**Update build script**:
```json
{
  "scripts": {
    "build": "vite build",
    "build:odoo": "vite build && node generate-odoo-template.js && ./build-for-odoo.sh"
  }
}
```

**Solution 2: Disable hash in production**

Modify `vite.config.ts`:
```typescript
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        entryFileNames: 'assets/index.js',  // No hash
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
  },
});
```

Then use fixed filenames in XML:
```xml
<script type="module" src="/odoo_artwork_uploader/static/assets/index.js"></script>
<link rel="stylesheet" href="/odoo_artwork_uploader/static/assets/index.css"/>
```

**Recommendation**: Use Solution 2 for easier maintenance.

---

## Environment Variables

### Current `.env` (Replit)
```bash
# API Configuration
VITE_API_BASE_URL=http://localhost:5000

# Vectorization Service
VECTORIZER_API_ID=your_api_id
VECTORIZER_API_SECRET=your_api_secret

# Storage (will be removed - currently using Dropbox)
DROPBOX_ACCESS_TOKEN=your_token  # If using Dropbox API
DROPBOX_FOLDER_PATH=/artwork-uploads
```

### Odoo Environment Variables

**Option 1: Odoo System Parameters**

Store in `ir.config_parameter`:
```python
# Set parameter
self.env['ir.config_parameter'].sudo().set_param('artwork.api_base_url', '/artwork')
self.env['ir.config_parameter'].sudo().set_param('vectorizer.api_id', 'your_key')

# Get parameter
api_base = self.env['ir.config_parameter'].sudo().get_param('artwork.api_base_url')
```

**Option 2: Odoo Config File**

Add to `odoo.conf`:
```ini
[options]
vectorizer_api_id = your_api_id
vectorizer_api_secret = your_api_secret
```

Access in Python:
```python
from odoo import tools
api_id = tools.config.get('vectorizer_api_id')
```

**Option 3: Inject at Runtime**

In Odoo controller, inject config into HTML:
```xml
<template id="artwork_uploader_page">
    <t t-call="website.layout">
        <div id="root"></div>
        
        <!-- Inject config before app loads -->
        <script>
            window.ODOO_CONFIG = {
                apiBaseUrl: '<t t-esc="config_api_base_url"/>',
                vectorizerApiId: '<t t-esc="config_vectorizer_api_id"/>'
            };
        </script>
        
        <script type="module" src="/odoo_artwork_uploader/static/assets/index.js"></script>
    </t>
</template>
```

Update React app to read from `window.ODOO_CONFIG`:
```typescript
// In client/src/lib/config.ts
export const config = {
  apiBaseUrl: window.ODOO_CONFIG?.apiBaseUrl || import.meta.env.VITE_API_BASE_URL,
  vectorizerApiId: window.ODOO_CONFIG?.vectorizerApiId || import.meta.env.VECTORIZER_API_ID,
};
```

**Recommendation**: Use Option 3 for seamless integration.

---

## API Base URL Configuration

### Current (Replit)
```typescript
// All API calls go to same server
fetch('/api/template-sizes')
```

### Odoo Integration

**Update `client/src/lib/queryClient.ts`**:
```typescript
import { QueryClient } from '@tanstack/react-query';

const API_BASE_URL = window.ODOO_CONFIG?.apiBaseUrl || '';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: async ({ queryKey }) => {
        const url = `${API_BASE_URL}${queryKey[0]}`;
        const res = await fetch(url, {
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include', // Important for Odoo session cookies
        });
        
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      },
    },
  },
});

export async function apiRequest(url: string, options: RequestInit = {}) {
  const res = await fetch(`${API_BASE_URL}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    credentials: 'include',
  });
  
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
```

---

## Asset Path Updates

### Current (Replit with @assets alias)
```typescript
import logoPath from '@assets/complete_transfer_logo.png';

<img src={logoPath} alt="Logo" />
```

### After Build
Vite transforms this to:
```typescript
<img src="/assets/complete_transfer_logo-abc123.png" alt="Logo" />
```

### Odoo Integration

**Option 1: Copy assets to Odoo static**
```bash
# In build script
cp -r attached_assets/* odoo_artwork_uploader/static/assets/
```

Then assets work as-is with correct paths.

**Option 2: Update Vite public path**
```typescript
// vite.config.ts
export default defineConfig({
  base: '/odoo_artwork_uploader/static/',
  // All assets will be prefixed with this base
});
```

**Recommendation**: Use Option 1 for simplicity.

---

## CORS & Security Considerations

### Session Management

**Replit**: Uses express-session with PostgreSQL
**Odoo**: Uses built-in session management

**Changes needed**:
1. Remove Express session middleware
2. Use Odoo's `request.session` in controllers
3. Frontend sends cookies automatically with `credentials: 'include'`

### CSRF Protection

**Odoo requires CSRF tokens for POST requests**:

```typescript
// Get CSRF token from cookie
function getCsrfToken() {
  const match = document.cookie.match(/csrf_token=([^;]+)/);
  return match ? match[1] : '';
}

// Include in POST requests
export async function apiRequest(url: string, options: RequestInit = {}) {
  const res = await fetch(`${API_BASE_URL}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': getCsrfToken(),
      ...options.headers,
    },
    credentials: 'include',
  });
  
  return res.json();
}
```

**OR** disable CSRF for specific routes in Odoo controller:
```python
@http.route('/artwork/upload', type='http', auth='user', methods=['POST'], csrf=False)
def upload_file(self, **kwargs):
    # ...
```

---

## Deployment Checklist

### Pre-Build
- [ ] Update `VITE_API_BASE_URL` to point to Odoo endpoints
- [ ] Remove unused environment variables (Dropbox tokens, DATABASE_URL)
- [ ] Test build completes without errors: `npm run build`

### Build & Deploy
- [ ] Run production build: `npm run build`
- [ ] Copy `dist/*` to `odoo_artwork_uploader/static/`
- [ ] Update `website_templates.xml` with correct asset paths
- [ ] Copy `attached_assets/*` to Odoo static folder

### Odoo Module
- [ ] Update module to include new static files in `__manifest__.py`:
```python
'data': [
    'views/website_templates.xml',
],
'assets': {
    'web.assets_frontend': [
        'odoo_artwork_uploader/static/assets/index.js',
        'odoo_artwork_uploader/static/assets/index.css',
    ],
},
```

- [ ] Restart Odoo server
- [ ] Update/upgrade module: `odoo-bin -u odoo_artwork_uploader`

### Testing
- [ ] Verify React app loads in Odoo page
- [ ] Check browser console for errors
- [ ] Test API calls reach Odoo controllers
- [ ] Verify asset paths resolve correctly
- [ ] Test on different browsers

---

## Troubleshooting

### Issue: React app doesn't load

**Check**:
1. Browser console for 404 errors on asset paths
2. Odoo logs for permission errors on static files
3. Module is upgraded: `odoo-bin -u odoo_artwork_uploader`

**Fix**: Verify static file paths in XML template match built assets

### Issue: API calls fail with 404

**Check**:
1. API base URL is correct (`window.ODOO_CONFIG.apiBaseUrl`)
2. Odoo controllers are registered and routes match
3. Authentication cookies are sent (`credentials: 'include'`)

**Fix**: Update `queryClient.ts` with correct base URL

### Issue: CORS errors

**Check**:
1. Frontend and backend on same domain (Odoo serves both)
2. `credentials: 'include'` is set on all requests

**Fix**: Should not be an issue since Odoo serves both frontend and backend

### Issue: Assets have wrong path (404)

**Check**:
1. Vite `base` config matches Odoo static path
2. Assets are copied to correct Odoo static directory

**Fix**: Update `vite.config.ts` base path or copy script

---

## Complete Build Script

**`build-and-deploy-odoo.sh`**:
```bash
#!/bin/bash
set -e  # Exit on error

echo "🔨 Building React app for Odoo..."
npm run build

echo "📂 Creating Odoo static directory..."
mkdir -p odoo_artwork_uploader/static/assets

echo "🧹 Cleaning old assets..."
rm -rf odoo_artwork_uploader/static/assets/*

echo "📦 Copying build assets..."
cp -r dist/assets/* odoo_artwork_uploader/static/assets/

echo "🖼️  Copying attached assets..."
cp -r attached_assets/* odoo_artwork_uploader/static/assets/

echo "📝 Generating Odoo template..."
node generate-odoo-template.js

echo "✅ Build complete!"
echo "📋 Next steps:"
echo "   1. Copy odoo_artwork_uploader/ to Odoo addons directory"
echo "   2. Restart Odoo server"
echo "   3. Upgrade module: odoo-bin -u odoo_artwork_uploader"
```

**Usage**:
```bash
chmod +x build-and-deploy-odoo.sh
./build-and-deploy-odoo.sh
```

---

## Summary

**Key Changes**:
1. ✅ Build React app to static bundle with Vite
2. ✅ Copy `dist/` to `odoo_artwork_uploader/static/`
3. ✅ Update Odoo template to load bundled JS/CSS
4. ✅ Configure API base URL to point to Odoo controllers
5. ✅ Handle Odoo session cookies with `credentials: 'include'`
6. ✅ Remove Replit-specific configs (Dropbox storage, session storage)

**Result**: React app runs inside Odoo as native module, using Odoo's infrastructure for hosting, sessions, and API endpoints.
