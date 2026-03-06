import fs from 'fs';
import path from 'path';

const DROPBOX_FOLDER = '/artwork-uploads';
const UPLOAD_DIR = './uploads';
const ALERT_EMAIL = 'darren@serigraf.com';

// Rate-limit: only send one alert email per failure type per hour
const lastAlertSent: Record<string, number> = {};
const ALERT_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

async function sendDropboxAlert(subject: string, body: string): Promise<void> {
  const key = subject;
  const now = Date.now();
  if (lastAlertSent[key] && now - lastAlertSent[key] < ALERT_COOLDOWN_MS) {
    return; // Already alerted recently, skip
  }
  lastAlertSent[key] = now;

  const apiKey = process.env.MAILERSEND_API_KEY;
  if (!apiKey) {
    console.warn('[dropbox-alert] MAILERSEND_API_KEY not set — cannot send alert email');
    return;
  }

  try {
    const res = await fetch('https://api.mailersend.com/v1/email', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: { email: 'uploader@serigraf.com', name: 'Serigraf System' },
        to: [{ email: ALERT_EMAIL }],
        subject,
        text: body,
      }),
    });
    if (res.ok) {
      console.log(`📧 [dropbox-alert] Alert sent: ${subject}`);
    } else {
      const err = await res.text();
      console.warn(`[dropbox-alert] MailerSend error ${res.status}:`, err);
    }
  } catch (err: any) {
    console.warn('[dropbox-alert] Failed to send alert email:', err.message);
  }
}

/**
 * Fire-and-forget backup: copies a file from ./uploads/{filename} to
 * Dropbox at /artwork-uploads/{filename}. Non-blocking — call without await.
 */
export function backupToDropbox(filename: string): void {
  const localPath = path.join(UPLOAD_DIR, filename);
  if (!fs.existsSync(localPath)) return;

  import('./dropbox-service')
    .then(async ({ uploadFileToDropbox }) => {
      const buffer = fs.readFileSync(localPath);
      const dest = `${DROPBOX_FOLDER}/${filename}`;
      await uploadFileToDropbox(buffer, dest);
      console.log(`☁️ [backup] ${filename} → Dropbox ${dest}`);
    })
    .catch(async (err: Error) => {
      // If we got a 401, it means our cached token is definitely bad
      if (err.message.includes('401')) {
        console.warn(`[backup] 401 detected for ${filename}, clearing Dropbox cache`);
        const { clearDropboxCache } = await import('./dropbox-service');
        clearDropboxCache();
      }
      
      console.warn(`⚠️ [backup] Dropbox backup failed for ${filename}:`, err.message);
      sendDropboxAlert(
        '⚠️ Dropbox Backup Failed — Artwork at Risk',
        `A file could not be backed up to Dropbox.\n\nFile: ${filename}\nError: ${err.message}\n\nUntil this is resolved, uploaded artwork files will be lost on the next redeployment.\n\nPlease reconnect Dropbox in the Replit Integrations panel.`
      );
    });
}

/**
 * Try to restore a missing file from Dropbox.
 * Returns true if the file was restored, false if not found or on error.
 */
export async function restoreFromDropbox(filename: string): Promise<boolean> {
  try {
    const { downloadFile } = await import('./dropbox-service');
    const src = `${DROPBOX_FOLDER}/${filename}`;
    const buffer = await downloadFile(src);
    const localPath = path.join(UPLOAD_DIR, filename);
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    fs.writeFileSync(localPath, buffer);
    console.log(`✅ [restore] ${filename} ← Dropbox`);
    return true;
  } catch (err: any) {
    const isNotFound = err?.message?.includes('not_found') || err?.status === 409;
    if (!isNotFound) {
      // Only alert on connection errors, not missing files
      console.warn(`⚠️ [restore] Dropbox restore failed for ${filename}:`, err.message);
      sendDropboxAlert(
        '⚠️ Dropbox Connection Error — File Restore Failed',
        `A file could not be restored from Dropbox after a redeployment.\n\nFile: ${filename}\nError: ${err.message}\n\nThis means a customer may see a blank or broken PDF.\n\nPlease reconnect Dropbox in the Replit Integrations panel immediately.`
      );
    }
    return false;
  }
}
