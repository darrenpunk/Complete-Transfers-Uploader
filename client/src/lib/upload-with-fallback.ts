// Uploads logo files via multipart/form-data with an automatic base64-JSON fallback.
//
// Some corporate proxies / WAFs sitting in front of the deployment interfere with binary
// multipart/form-data uploads in one of three ways:
//   1. return a 403 before the body ever reaches our server, or
//   2. RESET the socket (client sees an xhr `error` event, status 0), or
//   3. silently HANG the upload mid-stream — progress freezes (e.g. at 60%) and nothing
//      happens until the 2-minute timeout finally fires.
// Ordinary JSON POSTs are let through, so on ANY of these signatures we retry once as a
// base64-encoded JSON body. The server (`/logos/base64`) decodes the payload and replays it
// into the real multipart handler, so the response shape is identical to a direct upload.

const SAFE_JSON_BYTES = 80 * 1024 * 1024; // base64 (~1.33x) stays under the server's 200MB JSON limit and avoids browser OOM
const STALL_MS = 30000; // no upload progress for this long (while still sending) ⇒ treat as a hung proxy
const POST_UPLOAD_STALL_MS = 45000; // Raster uploads normally process quickly; keep fast WAF recovery for them.
const VECTOR_PROCESSING_GRACE_MS = 120000; // Even small PDFs can be complex enough to spend 60s+ in GS/pdf2svg.

export interface UploadWithFallbackOptions {
  projectId: string;
  files: File[];
  canvasIndex?: number;
  onProgress?: (percent: number) => void;
  onProcessing?: () => void;
}

async function buildBase64Body(files: File[], canvasIndex?: number): Promise<string> {
  const encoded = await Promise.all(files.map(async (file) => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
    }
    return { originalName: file.name, mimetype: file.type || 'application/pdf', dataBase64: btoa(binary) };
  }));
  const payload: { files: typeof encoded; canvasIndex?: number } = { files: encoded };
  if (typeof canvasIndex === 'number') payload.canvasIndex = canvasIndex;
  return JSON.stringify(payload);
}

export function uploadLogosWithFallback(opts: UploadWithFallbackOptions): Promise<any[]> {
  const { projectId, files, canvasIndex, onProgress, onProcessing } = opts;
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
  const needsVectorProcessingGrace = files.some((file) => {
    const name = file.name.toLowerCase();
    return file.type === 'application/pdf'
      || file.type === 'application/postscript'
      || name.endsWith('.pdf')
      || name.endsWith('.ai')
      || name.endsWith('.eps');
  });

  return new Promise<any[]>((resolve, reject) => {
    const send = (url: string, body: XMLHttpRequestBodyInit, contentType: string | null, isFallback: boolean) => {
      const xhr = new XMLHttpRequest();
      const canFallback = !isFallback && totalBytes <= SAFE_JSON_BYTES;
      let handled = false; // guards every terminal path (load / error / timeout / stall) so we act exactly once
      let stallTimer: ReturnType<typeof setTimeout> | null = null;
      const clearStallTimer = () => { if (stallTimer) { clearTimeout(stallTimer); stallTimer = null; } };

      const retryViaBase64 = async () => {
        try {
          onProcessing?.();
          onProgress?.(0);
          const jsonBody = await buildBase64Body(files, canvasIndex);
          send(`/api/projects/${projectId}/logos/base64`, jsonBody, 'application/json', true);
        } catch (err) {
          reject(err instanceof Error ? err : new Error('Upload failed'));
        }
      };

      const handleStall = () => {
        if (handled) return;
        handled = true;
        clearStallTimer();
        try { xhr.abort(); } catch {}
        if (canFallback) {
          console.warn('⚠️ Multipart upload stalled (no progress) — retrying via base64-JSON fallback');
          retryViaBase64();
          return;
        }
        reject(new Error('Upload stalled'));
      };
      const armStallTimer = (ms: number = STALL_MS) => { clearStallTimer(); stallTimer = setTimeout(handleStall, ms); };

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          onProgress?.(percent);
          if (percent >= 100) {
            onProcessing?.();
            // A hung proxy can withhold the server response even after all bytes are sent (small
            // files hit 100% instantly, so the mid-send watchdog never fires). Keep a watchdog
            // running so a post-send hang falls back instead of waiting out the 2-min timeout.
            armStallTimer(needsVectorProcessingGrace || totalBytes > 20 * 1024 * 1024
              ? VECTOR_PROCESSING_GRACE_MS
              : POST_UPLOAD_STALL_MS);
          } else {
            armStallTimer(); // reset the stall watchdog on every chunk of real progress
          }
        }
      });

      xhr.addEventListener('load', () => {
        if (handled) return;
        handled = true;
        clearStallTimer();
        if (xhr.status === 200 || xhr.status === 201) {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch {
            reject(new Error('Failed to parse upload response'));
          }
        } else if (xhr.status === 403 && canFallback) {
          console.warn('⚠️ Multipart upload blocked (403) — retrying via base64-JSON fallback');
          retryViaBase64();
        } else {
          reject(new Error(`Upload failed (${xhr.status})`));
        }
      });

      // A proxy/WAF that resets the connection instead of returning 403 surfaces here as
      // an error event (status 0). Treat it the same: retry once via the base64 fallback.
      xhr.addEventListener('error', () => {
        if (handled) return;
        handled = true;
        clearStallTimer();
        if (canFallback) {
          console.warn('⚠️ Multipart upload connection error — retrying via base64-JSON fallback');
          retryViaBase64();
          return;
        }
        reject(new Error('Upload failed'));
      });

      // A hung proxy can let progress freeze until the timeout fires; treat it the same as a
      // stall/reset and fall back to base64-JSON before giving up.
      xhr.addEventListener('timeout', () => {
        if (handled) return;
        handled = true;
        clearStallTimer();
        if (canFallback) {
          console.warn('⚠️ Multipart upload timed out — retrying via base64-JSON fallback');
          retryViaBase64();
          return;
        }
        reject(new Error('Upload timed out'));
      });

      xhr.open('POST', url);
      if (contentType) xhr.setRequestHeader('Content-Type', contentType);
      xhr.withCredentials = true;
      xhr.timeout = 180000; // Large PDFs can need two minutes of server-side analysis after upload completes.
      xhr.send(body);
      armStallTimer(); // start the stall watchdog in case the connection hangs before any progress
    };

    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    if (typeof canvasIndex === 'number') formData.append('canvasIndex', String(canvasIndex));
    send(`/api/projects/${projectId}/logos`, formData, null, false);
  });
}
