import fs from 'fs';
import path from 'path';

const DROPBOX_FOLDER = '/artwork-uploads';
const UPLOAD_DIR = './uploads';

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
    .catch((err: Error) => {
      console.warn(`⚠️ [backup] Dropbox backup failed for ${filename}:`, err.message);
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
  } catch {
    return false;
  }
}
