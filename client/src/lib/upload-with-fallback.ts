// Uploads logo files via multipart/form-data with an automatic base64-JSON fallback.
//
// Some corporate proxies / WAFs sitting in front of the deployment RESET the socket on
// binary multipart/form-data uploads (surfacing server-side as Node `abortIncoming` /
// "[ERROR] 500: aborted", and client-side as an xhr `error` event with status 0) or
// return a 403 before the body ever reaches our server. Ordinary JSON POSTs are let
// through, so on either signature we retry once as a base64-encoded JSON body. The server
// (`/logos/base64`) decodes the payload and replays it into the real multipart handler, so
// the response shape is identical to a direct upload.

const SAFE_JSON_BYTES = 80 * 1024 * 1024; // base64 (~1.33x) stays under the server's 200MB JSON limit and avoids browser OOM

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

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          onProgress?.(percent);
          if (percent >= 100) onProcessing?.();
        }
      });

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

      xhr.addEventListener('load', () => {
        if (xhr.status === 200 || xhr.status === 201) {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch {
            reject(new Error('Failed to parse upload response'));
          }
        } else if (xhr.status === 403 && !isFallback && totalBytes <= SAFE_JSON_BYTES) {
          console.warn('⚠️ Multipart upload blocked (403) — retrying via base64-JSON fallback');
          retryViaBase64();
        } else {
          reject(new Error(`Upload failed (${xhr.status})`));
        }
      });

      // A proxy/WAF that resets the connection instead of returning 403 surfaces here as
      // an error event (status 0). Treat it the same: retry once via the base64 fallback.
      xhr.addEventListener('error', () => {
        if (!isFallback && totalBytes <= SAFE_JSON_BYTES) {
          console.warn('⚠️ Multipart upload connection error — retrying via base64-JSON fallback');
          retryViaBase64();
          return;
        }
        reject(new Error('Upload failed'));
      });

      xhr.addEventListener('timeout', () => reject(new Error('Upload timed out')));

      xhr.open('POST', url);
      if (contentType) xhr.setRequestHeader('Content-Type', contentType);
      xhr.withCredentials = true;
      xhr.timeout = 120000; // 2 minutes
      xhr.send(body);
    };

    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    if (typeof canvasIndex === 'number') formData.append('canvasIndex', String(canvasIndex));
    send(`/api/projects/${projectId}/logos`, formData, null, false);
  });
}
