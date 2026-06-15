---
name: uploads Object Storage write-through cache
description: How local uploads/ is kept bounded forever via Replit Object Storage, so the deployment image never exceeds the 8 GiB Reserved-VM cap; durability + prune-safety rules.
---

# uploads/ → Replit Object Storage write-through cache

`uploads/` (customer artwork written at runtime) is a write-through CACHE backed by Replit Object Storage. This is what permanently bounds the deployment image (Reserved VM = workspace IS the image; `.replitignore`/`.deployignore` are NOT honored). It also restores durability lost when the old Dropbox backup was removed (prod uploads dir is ephemeral across redeploys).

Helper: `server/object-storage.ts`. Bucket keys = `.private/uploads/<rel>`. Every function is defensive — never throws (a storage outage must never break uploads/PDF gen).

## The three legs
- **BACKUP** — background sweeper (`startStorageMaintenance`, wired in BOTH dev+prod branches of `server/index.ts`) mirrors un-backed-up files off the request path. Runs ~20s after boot then every ~5min.
- **RESTORE** — lazy `ensureLocal(rel)` at every read point: `/uploads/:filename` static + recolor route (`server/index.ts`), and the PDF generator's pre-flight source scan (`server/robust-pdf-generator.ts`). On a local miss it downloads from the bucket.
- **PRUNE** — `pruneLocalUploads` keeps local under `LOCAL_BUDGET_BYTES` (1.5 GiB), deleting ONLY files confirmed present in the bucket (backs them up first if missing). MIN_AGE_MS=60s skip; skips chunks/+dotfiles.

## Load-bearing rules (don't regress)
- **SAFETY INVARIANT: never delete a local file not confirmed in the bucket.** Prune backs up first, only deletes on confirmed `existsInBucket`.
- **Durability window is closed by an IMMEDIATE backup at logo creation.** The sweep cadence (60s+5min) could lose a file if the instance crashes/redeploys before the sweep. So the logo upload route (`server/routes.ts`) collects every file it creates per logo into an outer `allFilesToBackup` Set and, AFTER the file loop (just before `res.json`), fires `backupFilesNow(...)` fire-and-forget (`.catch` logs, never blocks).
  - **Why backup runs AFTER the loop, not inline:** single-colour templates recolor the file IN PLACE after it's collected, and `backupFile` SKIPS keys already in the bucket. Backing up pre-recolor would mirror stale bytes and the recolored version would never upload. Post-loop backup reads final on-disk (recolored) content. If you ever add a new in-place mutation of an upload file, it must complete BEFORE the post-loop backup, or you must overwrite the bucket key.
- **Prune must never evict a file mid-operation.** `pin(rels)`/`unpin(rels)` is a ref-counted Map; `pruneLocalUploads` skips pinned rels. `RobustPDFGenerator.generatePDF` pins its source logos (filename+originalFilename) at entry and unpins in a `finally`. Any new long-running consumer of upload files should pin/unpin the same way.
- **Do NOT mount presign/upload-URL routes.** The integration scaffolding's `routes.ts`/`index.ts` and the client `ObjectUploader.tsx`/`use-upload.ts` were DELETED as an abuse surface — uploads go through the existing server-side multipart route, not browser-direct-to-bucket. Only `server/replit_integrations/object_storage/objectStorage.ts` (provides `objectStorageClient`) + `objectAcl.ts` (its dep) remain.
