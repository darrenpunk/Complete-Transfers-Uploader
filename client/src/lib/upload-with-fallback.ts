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

  return new Promise<any[]>((resolve, reject) => {
    const send = (url: string, body: XMLHttpRequestBodyInit, contentType: string | null, isFallback: boolean) => {
      const xhr = new XMLHttpRequest();
      const canFallback = !isFallback && totalBytes <= SAFE_JSON_BYTES;
      let handled = false; // guards every terminal path (load / error / timeout / stall) so we act exactly once
      let reachedFullUpload = false; // true once all bytes are sent — past this a timeout means slow SERVER processing, not a blocked upload, so we must NOT re-submit (would duplicate)
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
      const armStallTimer = () => { clearStallTimer(); stallTimer = setTimeout(handleStall, STALL_MS); };

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          onProgress?.(percent);
          if (percent >= 100) {
            onProcessing?.();
            reachedFullUpload = true;
            clearStallTimer(); // fully sent — now waiting on the server, no more upload progress expected
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
        if (canFallback && !reachedFullUpload) {
          console.warn('⚠️ Multipart upload timed out before completing — retrying via base64-JSON fallback');
          retryViaBase64();
          return;
        }
        reject(new Error('Upload timed out'));
      });

      xhr.open('POST', url);
      if (contentType) xhr.setRequestHeader('Content-Type', contentType);
      xhr.withCredentials = true;
      xhr.timeout = 120000; // 2 minutes
      xhr.send(body);
      armStallTimer(); // start the stall watchdog in case the connection hangs before any progress
    };

    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    if (typeof canvasIndex === 'number') formData.append('canvasIndex', String(canvasIndex));
    send(`/api/projects/${projectId}/logos`, formData, null, false);
  });
}
