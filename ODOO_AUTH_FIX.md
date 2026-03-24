# Fix: "Login Required" Shown to Logged-In Portal Users

## Issue
Logged-in portal users (e.g., daragh@hairybaby.com / Daragh Murphy) see a "Login Required" popup when clicking a template in the artwork uploader, even though they are clearly logged into the Odoo website (their name shows in the navigation bar).

## Root Cause
The artwork uploader iframe identifies users by their email address. The email is sourced from `request.env.user.partner_id.email` in the QWeb template. However, for some portal users, the `email` field on their `res.partner` record is **empty** — even though they log in with an email address (stored in `res.users.login`).

When the partner email is empty, the iframe receives an empty email string, all fallback methods fail, and after a 4-second timeout the user is marked as "not authenticated."

## Files Changed (3 files in the Odoo module)

### 1. `views/website_templates.xml`
**Two places** where `userEmail` is set from QWeb — both now include `request.env.user.login` as a fallback:

```xml
<!-- BEFORE -->
var userEmail = '<t t-esc="request.env.user.partner_id.email or \'\'"/>';

<!-- AFTER -->
var userEmail = '<t t-esc="request.env.user.partner_id.email or request.env.user.login or \'\'"/>';
```

This ensures portal users whose partner record lacks an email still get identified by their login email.

### 2. `static/src/js/iframe_message_handler.js`
Added `odoo.session_info.username` as a fallback source (the `username` field in session_info is the user's login, which is their email):

```javascript
// BEFORE
userEmail = odoo.session_info.partner_email || 
            odoo.session_info.email || 
            '';

// AFTER
userEmail = odoo.session_info.partner_email || 
            odoo.session_info.email || 
            odoo.session_info.username ||
            '';
```

### 3. `controllers/main.py` — `get_current_user` endpoint
Added `user.login` as a final fallback when looking up the email:

```python
# BEFORE
email = partner.email if partner else (user.email or user.login)

# AFTER
email = (partner.email if partner else '') or user.email or user.login or ''
```

The old code only used `user.login` when there was no partner at all. The fix ensures `user.login` is used whenever `partner.email` is empty.

## Deployment
These changes are in the `artwork_uploader` Odoo module. To deploy:
1. Update the module files on the Odoo server
2. Restart Odoo or upgrade the module: `odoo -u artwork_uploader -d <database>`
3. Clear browser caches (the JS file is cached)

## Also Recommended
Check Daragh Murphy's partner record in Odoo and populate the `email` field with `daragh@hairybaby.com` if it's empty. This fixes it immediately without waiting for the code deploy. Go to: Contacts → search "Daragh Murphy" or "Hairy Baby" → edit → set Email to `daragh@hairybaby.com`.
