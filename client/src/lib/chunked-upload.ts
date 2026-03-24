const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB chunks

interface ChunkedUploadOptions {
  file: File;
  projectId: string;
  onProgress?: (percent: number) => void;
}

interface ChunkedUploadResult {
  uploadId: string;
  filename: string;
  originalName: string;
  size: number;
  mimetype: string;
}

export async function uploadLargeFile({ file, projectId, onProgress }: ChunkedUploadOptions): Promise<ChunkedUploadResult> {
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  
  const initRes = await fetch('/api/chunked-upload/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
      totalChunks,
      projectId,
    }),
  });
  
  if (!initRes.ok) {
    const err = await initRes.json().catch(() => ({ error: 'Failed to initialize upload' }));
    throw new Error(err.error || 'Failed to initialize upload');
  }
  
  const { uploadId } = await initRes.json();
  
  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const start = chunkIndex * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunk = file.slice(start, end);
    
    const formData = new FormData();
    formData.append('chunk', chunk);
    formData.append('uploadId', uploadId);
    formData.append('chunkIndex', String(chunkIndex));
    formData.append('totalChunks', String(totalChunks));
    
    const chunkRes = await fetch('/api/chunked-upload/chunk', {
      method: 'POST',
      body: formData,
    });
    
    if (!chunkRes.ok) {
      const err = await chunkRes.json().catch(() => ({ error: 'Chunk upload failed' }));
      throw new Error(err.error || `Chunk ${chunkIndex + 1}/${totalChunks} failed`);
    }
    
    if (onProgress) {
      const percent = Math.round(((chunkIndex + 1) / totalChunks) * 90);
      onProgress(percent);
    }
  }
  
  const completeRes = await fetch('/api/chunked-upload/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uploadId, projectId }),
  });
  
  if (!completeRes.ok) {
    const err = await completeRes.json().catch(() => ({ error: 'Failed to complete upload' }));
    throw new Error(err.error || 'Failed to complete upload');
  }
  
  if (onProgress) onProgress(100);
  
  return completeRes.json();
}

export function isLargeFile(file: File): boolean {
  return file.size > 100 * 1024 * 1024;
}

export const MAX_CHUNKED_FILE_SIZE = 500 * 1024 * 1024; // 500MB max
