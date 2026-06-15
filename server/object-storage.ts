/**
 * Durable backing store for the ephemeral local `./uploads` directory.
 *
 * Why this exists
 * ---------------
 * The Replit Reserved VM serves the WHOLE workspace as the deployment image and
 * does NOT honor `.replitignore`/`.deployignore` (see replit.md "Deployment Image
 * Size"). Customer artwork written at runtime into `./uploads` therefore (a) bloats
 * the image until a publish fails with `image size is over the limit of 8 GiB`, and
 * (b) is EPHEMERAL — a redeploy wipes it, and a file can vanish before its PDF is
 * generated, with no recovery path (the old Dropbox backup was removed; see
 * `robust-pdf-generator.ts` pre-flight scan + `/dropbox-upload` 410).
 *
 * Model: `./uploads` becomes a write-through CACHE backed by Replit Object Storage.
 *   - BACKUP  : a background sweeper mirrors any un-backed-up local file to the
 *               bucket. Off the request path so it never slows an upload.
 *   - RESTORE : `ensureLocal(rel)` lazily downloads a file from the bucket on a
 *               local miss (PDF generation pre-flight + HTTP /uploads serving).
 *   - PRUNE   : `pruneLocalUploads()` keeps the local dir under a size budget,
 *               deleting ONLY files confirmed present in the bucket.
 *
 * Safety invariant: NEVER delete a local file that is not confirmed in the bucket.
 * Every function is defensive — it logs and returns a falsy/no-op result on error
 * rather than throwing, so storage trouble can never break uploads or PDF output.
 */
import fs from 'fs';
import path from 'path';
import { objectStorageClient } from './replit_integrations/object_storage/objectStorage';

export const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

// Local cache budget. Files beyond this (oldest, backed-up first) are pruned.
const LOCAL_BUDGET_BYTES = Number(process.env.UPLOADS_LOCAL_BUDGET_BYTES || 1.5 * 1024 * 1024 * 1024); // 1.5 GiB
// Never prune (or back up) a file younger than this — it may be mid-write or in
// active use by an in-flight request.
const MIN_AGE_MS = 60 * 1000; // 1 minute
// Sub-directories under uploads/ that are transient and must NOT be mirrored.
const SKIP_DIRS = new Set(['chunks']);

function parseBucketPrefix(): { bucketName: string; prefix: string } | null {
  const dir = process.env.PRIVATE_OBJECT_DIR || '';
  if (!dir) return null;
  const trimmed = dir.replace(/^\/+/, '').replace(/\/+$/, '');
  const slash = trimmed.indexOf('/');
  if (slash === -1) {
    // Only a bucket name was provided.
    return { bucketName: trimmed, prefix: '' };
  }
  return { bucketName: trimmed.slice(0, slash), prefix: trimmed.slice(slash + 1) };
}

const cfg = parseBucketPrefix();

export function isEnabled(): boolean {
  return !!cfg && !!cfg.bucketName;
}

// Files actively in use by an in-flight operation (e.g. a PDF generation reading
// a logo's source). The pruner must never evict these even if they are old +
// over budget, or a long generation could ENOENT mid-request. Ref-counted so
// concurrent generations sharing a logo don't unpin each other prematurely.
const pinned = new Map<string, number>();

export function pin(rels: Array<string | null | undefined>): void {
  for (const rel of rels) {
    if (!rel) continue;
    pinned.set(rel, (pinned.get(rel) || 0) + 1);
  }
}

export function unpin(rels: Array<string | null | undefined>): void {
  for (const rel of rels) {
    if (!rel) continue;
    const n = (pinned.get(rel) || 0) - 1;
    if (n <= 0) pinned.delete(rel);
    else pinned.set(rel, n);
  }
}

/** Object key in the bucket for a path relative to ./uploads. */
function toKey(rel: string): string {
  const clean = rel.replace(/^\/+/, '');
  const base = cfg!.prefix ? `${cfg!.prefix}/uploads` : 'uploads';
  return `${base}/${clean}`;
}

/** Strip the `<prefix>/uploads/` portion of a bucket key back to a relative path. */
function fromKey(key: string): string {
  const base = cfg!.prefix ? `${cfg!.prefix}/uploads/` : 'uploads/';
  return key.startsWith(base) ? key.slice(base.length) : key;
}

function bucketFile(rel: string) {
  return objectStorageClient.bucket(cfg!.bucketName).file(toKey(rel));
}

export async function existsInBucket(rel: string): Promise<boolean> {
  if (!isEnabled()) return false;
  try {
    const [exists] = await bucketFile(rel).exists();
    return exists;
  } catch (e: any) {
    console.warn(`[object-storage] existsInBucket("${rel}") failed: ${e?.message || e}`);
    return false;
  }
}

/**
 * Upload a local uploads/ file to the bucket. No-op if it already exists in the
 * bucket or the local file is missing. Never throws. Returns true if (now) backed up.
 */
export async function backupFile(rel: string): Promise<boolean> {
  if (!isEnabled()) return false;
  const local = path.join(UPLOADS_DIR, rel);
  try {
    if (!fs.existsSync(local) || !fs.statSync(local).isFile()) return false;
    if (await existsInBucket(rel)) return true;
    await objectStorageClient
      .bucket(cfg!.bucketName)
      .upload(local, { destination: toKey(rel), resumable: false });
    return true;
  } catch (e: any) {
    console.warn(`[object-storage] backupFile("${rel}") failed: ${e?.message || e}`);
    return false;
  }
}

/**
 * Download a file from the bucket into ./uploads if it is missing locally.
 * Writes to a temp file then renames so readers never see a partial file.
 * Never throws. Returns true if the local file is present afterwards.
 */
export async function restoreFile(rel: string): Promise<boolean> {
  const local = path.join(UPLOADS_DIR, rel);
  if (fs.existsSync(local)) return true;
  if (!isEnabled()) return false;
  try {
    if (!(await existsInBucket(rel))) return false;
    fs.mkdirSync(path.dirname(local), { recursive: true });
    const tmp = `${local}.restore-${process.pid}-${Date.now()}.tmp`;
    await bucketFile(rel).download({ destination: tmp });
    try {
      fs.renameSync(tmp, local);
    } catch {
      // Another concurrent restore may have won the race — clean up our temp.
      try { fs.unlinkSync(tmp); } catch {}
    }
    return fs.existsSync(local);
  } catch (e: any) {
    console.warn(`[object-storage] restoreFile("${rel}") failed: ${e?.message || e}`);
    return false;
  }
}

/**
 * Ensure a file exists locally, restoring from the bucket on a miss.
 * This is the single call every read path should make before touching an
 * uploads/ file. Never throws. Returns true if the file is present locally.
 */
export async function ensureLocal(rel: string | null | undefined): Promise<boolean> {
  if (!rel) return false;
  const local = path.join(UPLOADS_DIR, rel);
  if (fs.existsSync(local)) return true;
  return restoreFile(rel);
}

/**
 * Immediately mirror specific files to the bucket, bypassing the sweep cadence +
 * age gate. Call this fire-and-forget the moment a logo's files are written so a
 * crash/redeploy in the sweep window cannot lose them. Each file is independent
 * and never throws. Safe to call with already-backed-up or missing files (no-op).
 */
export async function backupFilesNow(rels: Array<string | null | undefined>): Promise<void> {
  if (!isEnabled()) return;
  for (const rel of rels) {
    if (!rel) continue;
    await backupFile(rel);
  }
}

/** List relative paths of all uploads currently mirrored in the bucket. */
async function listBucketUploads(): Promise<Set<string>> {
  const out = new Set<string>();
  if (!isEnabled()) return out;
  try {
    const prefix = cfg!.prefix ? `${cfg!.prefix}/uploads/` : 'uploads/';
    const [files] = await objectStorageClient.bucket(cfg!.bucketName).getFiles({ prefix });
    for (const f of files) out.add(fromKey(f.name));
  } catch (e: any) {
    console.warn(`[object-storage] listBucketUploads failed: ${e?.message || e}`);
  }
  return out;
}

interface LocalEntry { rel: string; size: number; mtimeMs: number; }

function listLocalUploads(): LocalEntry[] {
  const entries: LocalEntry[] = [];
  const walk = (absDir: string, relDir: string) => {
    let names: string[];
    try { names = fs.readdirSync(absDir); } catch { return; }
    for (const name of names) {
      if (name.startsWith('.')) continue; // skip dotfiles + our .tmp restores
      const abs = path.join(absDir, name);
      const rel = relDir ? `${relDir}/${name}` : name;
      let st: fs.Stats;
      try { st = fs.statSync(abs); } catch { continue; }
      if (st.isDirectory()) {
        if (SKIP_DIRS.has(name)) continue;
        walk(abs, rel);
      } else if (st.isFile()) {
        entries.push({ rel, size: st.size, mtimeMs: st.mtimeMs });
      }
    }
  };
  walk(UPLOADS_DIR, '');
  return entries;
}

/**
 * Back up any local uploads/ file not yet in the bucket. Runs in the background,
 * off the request path. Only considers files older than MIN_AGE_MS so a file
 * still being written is not mirrored half-complete. Never throws.
 */
export async function sweepBackup(): Promise<{ backedUp: number; total: number }> {
  if (!isEnabled()) return { backedUp: 0, total: 0 };
  const now = Date.now();
  const local = listLocalUploads().filter((e) => now - e.mtimeMs > MIN_AGE_MS);
  let backedUp = 0;
  try {
    const inBucket = await listBucketUploads();
    for (const e of local) {
      if (inBucket.has(e.rel)) continue;
      if (await backupFile(e.rel)) backedUp++;
    }
  } catch (e: any) {
    console.warn(`[object-storage] sweepBackup failed: ${e?.message || e}`);
  }
  if (backedUp > 0) console.log(`[object-storage] sweep: backed up ${backedUp} new file(s) (${local.length} local)`);
  return { backedUp, total: local.length };
}

/**
 * Keep the local uploads/ dir under LOCAL_BUDGET_BYTES by deleting the oldest
 * files — but ONLY ones confirmed present in the bucket, and never younger than
 * MIN_AGE_MS. This is what permanently bounds the deployment image size.
 * Never throws.
 */
export async function pruneLocalUploads(): Promise<{ deleted: number; freedBytes: number }> {
  if (!isEnabled()) return { deleted: 0, freedBytes: 0 };
  const now = Date.now();
  const entries = listLocalUploads();
  const totalBytes = entries.reduce((s, e) => s + e.size, 0);
  if (totalBytes <= LOCAL_BUDGET_BYTES) return { deleted: 0, freedBytes: 0 };

  // Oldest first — those are the safest to evict from a cache.
  entries.sort((a, b) => a.mtimeMs - b.mtimeMs);
  let over = totalBytes - LOCAL_BUDGET_BYTES;
  let deleted = 0;
  let freedBytes = 0;
  for (const e of entries) {
    if (over <= 0) break;
    if (now - e.mtimeMs < MIN_AGE_MS) continue; // too fresh — may be in active use
    if (pinned.has(e.rel)) continue; // in use by an in-flight operation — never evict
    // SAFETY INVARIANT: only delete what we can restore later.
    if (!(await existsInBucket(e.rel))) {
      const ok = await backupFile(e.rel);
      if (!ok) continue; // could not secure a copy — leave it on disk
    }
    try {
      fs.unlinkSync(path.join(UPLOADS_DIR, e.rel));
      deleted++;
      freedBytes += e.size;
      over -= e.size;
    } catch (err: any) {
      console.warn(`[object-storage] prune unlink("${e.rel}") failed: ${err?.message || err}`);
    }
  }
  if (deleted > 0) {
    console.log(`[object-storage] prune: removed ${deleted} backed-up file(s), freed ${(freedBytes / 1024 / 1024).toFixed(1)} MB (budget ${(LOCAL_BUDGET_BYTES / 1024 / 1024).toFixed(0)} MB)`);
  }
  return { deleted, freedBytes };
}

let started = false;
/**
 * Start the background maintenance loops. Safe to call once at server startup.
 * Backup runs first (and on an interval); prune runs after each backup so we
 * never prune a file before it is mirrored.
 */
export function startStorageMaintenance(): void {
  if (started || !isEnabled()) {
    if (!isEnabled()) console.warn('[object-storage] disabled (PRIVATE_OBJECT_DIR not set) — local uploads NOT backed up');
    return;
  }
  started = true;
  console.log(`[object-storage] enabled — bucket="${cfg!.bucketName}" prefix="${cfg!.prefix}/uploads" budget=${(LOCAL_BUDGET_BYTES / 1024 / 1024).toFixed(0)}MB`);

  const cycle = async () => {
    await sweepBackup();
    await pruneLocalUploads();
  };
  // Kick off shortly after boot, then every 5 minutes.
  setTimeout(() => { cycle().catch(() => {}); }, 20 * 1000);
  setInterval(() => { cycle().catch(() => {}); }, 5 * 60 * 1000);
}
