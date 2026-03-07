import fs from 'fs';
import path from 'path';

const DROPBOX_FOLDER = '/artwork-uploads';
const UPLOAD_DIR = './uploads';
const ALERT_EMAIL = 'darren@serigraf.com';

const RETRY_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes between retries
const MAX_RETRIES = 12; // Give up after ~3 hours (12 × 15 min)

// Rate-limit: only send one alert email per failure type per hour
const lastAlertSent: Record<string, number> = {};
const ALERT_COOLDOWN_MS = 60 * 60 * 1000;

// In-memory retry queue: filename → attempt count
const retryQueue: Map<string, number> = new Map();
let retryTimerStarted = false;

async function sendDropboxAlert(subject: string, body: string): Promise<void> {
  const key = subject;
  const now = Date.now();
  if (lastAlertSent[key] && now - lastAlertSent[key] < ALERT_COOLDOWN_MS) {
    return;
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

async function attemptUpload(filename: string): Promise<void> {
  const localPath = path.join(UPLOAD_DIR, filename);
  if (!fs.existsSync(localPath)) {
    console.warn(`[backup] File no longer on disk, skipping: ${filename}`);
    return;
  }
  const { uploadFileToDropbox } = await import('./dropbox-service');
  const buffer = fs.readFileSync(localPath);
  const dest = `${DROPBOX_FOLDER}/${filename}`;
  await uploadFileToDropbox(buffer, dest);
  console.log(`☁️ [backup] ${filename} → Dropbox ${dest}`);
}

function startRetryTimer(): void {
  if (retryTimerStarted) return;
  retryTimerStarted = true;

  setInterval(async () => {
    if (retryQueue.size === 0) return;
    console.log(`🔄 [backup] Retrying ${retryQueue.size} queued file(s)...`);

    const { clearDropboxCache } = await import('./dropbox-service');
    clearDropboxCache(); // Force a fresh token on every retry cycle

    const filenames = Array.from(retryQueue.keys());
    for (const filename of filenames) {
      const attempts = retryQueue.get(filename) ?? 0;
      try {
        await attemptUpload(filename);
        retryQueue.delete(filename);
        console.log(`✅ [backup] Retry succeeded for ${filename} (attempt ${attempts + 1})`);
      } catch (err: any) {
        const nextAttempts = attempts + 1;
        if (nextAttempts >= MAX_RETRIES) {
          retryQueue.delete(filename);
          console.error(`❌ [backup] Giving up on ${filename} after ${MAX_RETRIES} attempts`);
          sendDropboxAlert(
            '⚠️ Dropbox Backup Failed — Artwork at Risk',
            `A file could not be backed up to Dropbox after ${MAX_RETRIES} attempts over ~3 hours.\n\nFile: ${filename}\nLast error: ${err.message}\n\nUntil this is resolved, uploaded artwork files will be lost on the next redeployment.\n\nPlease reconnect Dropbox in the Replit Integrations panel.`
          );
        } else {
          retryQueue.set(filename, nextAttempts);
          console.warn(`⏳ [backup] Retry ${nextAttempts}/${MAX_RETRIES} failed for ${filename}: ${err.message}`);
        }
      }
    }
  }, RETRY_INTERVAL_MS);
}

/**
 * Fire-and-forget backup: copies a file from ./uploads/{filename} to
 * Dropbox at /artwork-uploads/{filename}. Non-blocking — call without await.
 * On failure, automatically retries every 15 minutes for up to 3 hours.
 */
export function backupToDropbox(filename: string): void {
  const localPath = path.join(UPLOAD_DIR, filename);
  if (!fs.existsSync(localPath)) return;

  startRetryTimer();

  attemptUpload(filename).catch(async (err: Error) => {
    const is401 = err.message.includes('401') || err.message.includes('400');
    if (is401) {
      console.warn(`[backup] Auth error for ${filename} — queuing for retry in ${RETRY_INTERVAL_MS / 60000} min`);
      const { clearDropboxCache } = await import('./dropbox-service');
      clearDropboxCache();
    } else {
      console.warn(`⚠️ [backup] Dropbox backup failed for ${filename}: ${err.message} — queuing for retry`);
    }
    // Queue for retry regardless of error type
    retryQueue.set(filename, 1);
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
      console.warn(`⚠️ [restore] Dropbox restore failed for ${filename}:`, err.message);
      sendDropboxAlert(
        '⚠️ Dropbox Connection Error — File Restore Failed',
        `A file could not be restored from Dropbox after a redeployment.\n\nFile: ${filename}\nError: ${err.message}\n\nThis means a customer may see a blank or broken PDF.\n\nPlease reconnect Dropbox in the Replit Integrations panel immediately.`
      );
    }
    return false;
  }
}
