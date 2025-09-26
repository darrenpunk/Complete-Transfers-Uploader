# 🚀 Instant Odoo Sync System

## Quick Start

### For Instant Updates (Recommended)
```bash
node start-odoo-sync.js
```
This starts file watching and automatically syncs changes from your standalone app to the Odoo module in real-time!

### Manual Deploy (When Needed)
```bash
# Full deployment (includes restart if needed)
node odoo-hot-deploy.js

# Quick deployment (JS/CSS only, faster)
node odoo-hot-deploy.js quick
```

## How It Works

🔄 **File Watcher**: Monitors your standalone app files
📁 **Auto Convert**: Transforms files for Odoo compatibility
⚡ **Instant Update**: Pushes changes to Odoo module without reinstalling

## What Gets Synced

| Source | Target | Conversion |
|--------|--------|------------|
| `client/src/**/*.jsx` | `odoo_artwork_uploader/static/src/js/` | React → Odoo Widget |
| `client/src/**/*.js` | `odoo_artwork_uploader/static/src/js/` | ES6 → Odoo Define |
| `server/*.ts` | `odoo_artwork_uploader/controllers/` | Express → Python |
| `shared/*.ts` | `odoo_artwork_uploader/models/` | Types → Python Models |

## Usage Examples

### Start Development with Instant Sync
```bash
# Terminal 1: Start your standalone app
npm run dev

# Terminal 2: Start Odoo sync
node start-odoo-sync.js
```

Now make changes in `client/src/` or `server/` and watch them instantly appear in your Odoo module! 

### Configure Odoo Settings
Set environment variables:
```bash
export ODOO_CONFIG="/path/to/odoo.conf"
export ODOO_DB="your_database_name"
```

## File Conversion Examples

### React Component → Odoo Widget
**Before** (`client/src/ProofDesigner.jsx`):
```javascript
export default function ProofDesigner() {
  return <div>Designer</div>;
}
```

**After** (`odoo_artwork_uploader/static/src/js/ProofDesigner.js`):
```javascript
odoo.define('artwork_uploader.ProofDesigner', function (require) {
  var Widget = require('web.Widget');
  
  return Widget.extend({
    template: 'ProofDesignerTemplate'
  });
});
```

### Express Route → Python Controller
**Before** (`server/routes.ts`):
```typescript
app.post('/api/upload', (req, res) => {
  res.json({status: 'success'});
});
```

**After** (`odoo_artwork_uploader/controllers/main.py`):
```python
@http.route('/api/upload', type='http', auth='public', methods=['POST'])
def upload_artwork(self, **kwargs):
    return request.make_response(
        json.dumps({'status': 'success'}),
        headers={'Content-Type': 'application/json'}
    )
```

## Troubleshooting

### Sync Not Working?
1. Check file permissions: `chmod +x *.js`
2. Verify Odoo paths exist
3. Check console for error messages

### Changes Not Appearing?
- **JS/CSS**: Usually instant (auto cache clear)
- **Python**: May need restart (handled automatically)
- **Models**: Requires restart (detected automatically)

### Performance Tips
- Use quick deploy for CSS/JS changes
- Full deploy handles Python changes
- Restart is auto-detected when needed

## Stop Sync
Press `Ctrl+C` in the sync terminal to stop file watching.

---

**Pro Tip**: Keep the sync running in a separate terminal while developing. Any change you make in your standalone app will instantly be available in your Odoo module!