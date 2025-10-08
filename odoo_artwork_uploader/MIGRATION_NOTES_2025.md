# Migration Notes - October 2025

## New Features to Implement in Odoo

### 1. Support Form / Helpdesk Integration ⚠️ PRIORITY

**Current Standalone Implementation:**
- Location: Help Modal → Contact Support section  
- Component: `client/src/components/help-modal.tsx`
- Backend: `POST /api/support/send-email` in `server/routes.ts` (lines 5147-5218)
- Email Service: MailerSend API
- Sends to: `transferhelp@serigraf.com`
- Sender: `support@completetransfers.com`

**Migration Requirements:**

1. **Install Odoo Helpdesk Module**
   ```bash
   # In Odoo
   Apps → Search "Helpdesk" → Install
   ```

2. **Create Helpdesk Team**
   - Name: `Complete Transfers Help`
   - Configure email notifications
   - Assign team members

3. **Implement Controller** (Add to `odoo_artwork_uploader/controllers/main.py`):
   ```python
   @http.route('/artwork/api/support/create-ticket', type='json', auth='public', methods=['POST'])
   def create_support_ticket(self, name, email, subject, message):
       """Create helpdesk ticket from support form"""
       try:
           team = request.env['helpdesk.team'].sudo().search([
               ('name', '=', 'Complete Transfers Help')
           ], limit=1)
           
           if not team:
               return {'success': False, 'error': 'Helpdesk team not found'}
           
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
               'priority': '1',
           })
           
           return {
               'success': True,
               'ticket_id': ticket.id,
               'message': 'Support ticket created successfully'
           }
       except Exception as e:
           _logger.error(f'Support ticket creation error: {str(e)}')
           return {'success': False, 'error': str(e)}
   ```

4. **Update Frontend**
   - Change endpoint from `/api/support/send-email` to `/artwork/api/support/create-ticket`
   - Update success message: "Support ticket created!" instead of "Email sent!"
   - Keep same form fields: name, email, subject, message

5. **Remove MailerSend Dependency**
   - Delete MailerSend import from `server/routes.ts`
   - Remove `MAILERSEND_API_KEY` environment variable
   - Remove email sending logic

**Testing Checklist:**
- [ ] Helpdesk module installed
- [ ] "Complete Transfers Help" team created
- [ ] Controller endpoint works
- [ ] Frontend form submits successfully
- [ ] Tickets appear in Odoo Helpdesk
- [ ] Email notifications work (optional)

---

## API Endpoints Summary

### Standalone Endpoints (Current)
- `POST /api/support/send-email` - Send support email via MailerSend

### Odoo Endpoints (New)
- `POST /artwork/api/support/create-ticket` - Create helpdesk ticket

---

## Dependencies Changes

### To Install in Odoo:
- **helpdesk** module (Odoo Apps)

### To Remove After Migration:
- MailerSend npm package
- MailerSend API key configuration

---

## Environment Variables

### Standalone (Current)
```bash
MAILERSEND_API_KEY=mlsn.xxxxx
```

### Odoo (After Migration)
```bash
# No additional env vars needed
# Helpdesk uses Odoo's built-in email configuration
```

---

## Quick Migration Steps

1. **Preparation**
   ```bash
   # In Odoo
   - Install Helpdesk module
   - Create "Complete Transfers Help" team
   ```

2. **Backend**
   ```bash
   # Add to odoo_artwork_uploader/controllers/main.py
   - Implement create_support_ticket method (see code above)
   ```

3. **Frontend** 
   ```bash
   # Update help-modal.tsx
   - Change API endpoint
   - Update success/error messages
   ```

4. **Testing**
   ```bash
   # Test support form
   - Submit test ticket
   - Verify ticket creation in Odoo Helpdesk
   - Test email notifications
   ```

5. **Cleanup**
   ```bash
   # Remove from standalone
   - Delete MailerSend code
   - Remove API key from environment
   ```

---

## Important Notes

- **Email Configuration**: Ensure Odoo's email server is configured for ticket notifications
- **Public Access**: Support form is accessible without login (`auth='public'`)
- **Error Handling**: Frontend displays user-friendly error messages
- **Fallback Contact**: Show `transferhelp@serigraf.com` if ticket creation fails

---

## Contact

For migration questions:
- Review: `MIGRATION_GUIDE.md` for complete details
- Reference: Standalone implementation in `server/routes.ts` (lines 5147-5218)
- Frontend: `client/src/components/help-modal.tsx`
