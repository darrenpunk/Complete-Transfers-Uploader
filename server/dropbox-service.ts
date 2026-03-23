import { Dropbox } from 'dropbox';

let cachedToken: { token: string; fetchedAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (process.env.DROPBOX_ACCESS_TOKEN) {
    return process.env.DROPBOX_ACCESS_TOKEN;
  }

  if (cachedToken && (Date.now() - cachedToken.fetchedAt) < 3 * 60 * 1000) {
    return cachedToken.token;
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? 'depl ' + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken) {
    throw new Error('X-Replit-Token not found for repl/depl');
  }

  if (!hostname) {
    throw new Error('REPLIT_CONNECTORS_HOSTNAME not set');
  }

  console.log(`[Dropbox] Fetching fresh access token...`);

  const connectorUrl = 'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=dropbox';
  const connectorRes = await fetch(connectorUrl, {
    headers: {
      'Accept': 'application/json',
      'X-Replit-Token': xReplitToken,
    },
  });

  if (!connectorRes.ok) {
    const errText = await connectorRes.text().catch(() => '');
    console.error(`[Dropbox] Connector API returned ${connectorRes.status}: ${errText.substring(0, 200)}`);
    throw new Error(`Connector API error: ${connectorRes.status}`);
  }

  const connectorData = await connectorRes.json();
  const connection = connectorData.items?.[0];

  const accessToken =
    connection?.settings?.access_token ||
    connection?.settings?.oauth?.credentials?.access_token;

  if (!connection || !accessToken) {
    console.error('[Dropbox] No connection found. Response:', JSON.stringify(connectorData).substring(0, 300));
    throw new Error('Dropbox not connected. Please reconnect Dropbox in the Integrations panel.');
  }

  console.log(`[Dropbox] Got token (prefix=${accessToken.substring(0, 10)}...)`);
  cachedToken = { token: accessToken, fetchedAt: Date.now() };
  return accessToken;
}

export function clearDropboxCache() {
  cachedToken = null;
}

async function getUncachableDropboxClient(): Promise<Dropbox> {
  try {
    const accessToken = await getAccessToken();
    return new Dropbox({ accessToken });
  } catch (error) {
    cachedToken = null;
    throw error;
  }
}

export async function createFileRequest(
  projectId: string,
  fileName: string,
  description?: string
): Promise<{ id: string; url: string; title: string; folder: string }> {
  const title = `${projectId}_${fileName}`;
  const destination = `/file_requests/${projectId}`;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const dbx = await getUncachableDropboxClient();
      const result = await dbx.fileRequestsCreate({
        title,
        destination,
        open: true,
        description: description || `Upload for project ${projectId}`,
      });

      console.log('[Dropbox] File request created successfully:', result.result.url);
      return {
        id: result.result.id,
        url: result.result.url,
        title: result.result.title,
        folder: destination,
      };
    } catch (error: any) {
      if (attempt === 0 && error?.status === 401) {
        console.warn('[Dropbox] Token expired, clearing cache and retrying...');
        connectionSettings = null;
        continue;
      }
      throw error;
    }
  }
  throw new Error('Dropbox file request failed after retry');
}

export async function getFileRequestFiles(fileRequestId: string): Promise<any[]> {
  const dbx = await getUncachableDropboxClient();
  try {
    await dbx.fileRequestsGet({ id: fileRequestId });
    return [];
  } catch (error: any) {
    console.error('Failed to get file request:', error);
    return [];
  }
}

export async function downloadFile(filePath: string): Promise<Buffer> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const dbx = await getUncachableDropboxClient();
      const result = await dbx.filesDownload({ path: filePath }) as any;
      return result.result.fileBinary;
    } catch (error: any) {
      const status = error?.status || error?.response?.status;
      if ((status === 401 || status === 400) && attempt === 1) {
        console.warn(`[Dropbox] Got ${status} on download attempt 1 — clearing token cache and retrying...`);
        clearDropboxCache();
        continue;
      }
      console.error('Failed to download file from Dropbox:', error);
      throw new Error(`Failed to download file: ${error.message}`);
    }
  }
  throw new Error('Dropbox download failed after retry');
}

export async function uploadFileToDropbox(
  fileBuffer: Buffer,
  dropboxPath: string,
): Promise<{ path: string; pathDisplay: string }> {
  // Retry once on 401 — clears cached token so a fresh one is fetched
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const dbx = await getUncachableDropboxClient();
      const result = await dbx.filesUpload({
        path: dropboxPath,
        contents: fileBuffer,
        mode: { '.tag': 'overwrite' },
        autorename: false,
        mute: true,
      }) as any;
      const pathDisplay = result.result.path_display || dropboxPath;
      console.log(`[Dropbox] File uploaded successfully: ${pathDisplay}`);
      return { path: dropboxPath, pathDisplay };
    } catch (error: any) {
      const status = error?.status || error?.response?.status;
      if ((status === 401 || status === 400) && attempt === 1) {
        console.warn(`[Dropbox] Got ${status} on upload attempt 1 — clearing token cache and retrying...`);
        clearDropboxCache();
        continue;
      }
      throw error;
    }
  }
  throw new Error('Dropbox upload failed after retry');
}

export async function listFolderFiles(folderPath: string): Promise<any[]> {
  const dbx = await getUncachableDropboxClient();
  try {
    const result = await dbx.filesListFolder({ path: folderPath }) as any;
    return result.result.entries || [];
  } catch (error: any) {
    if (error.status === 409) return [];
    console.error('Failed to list Dropbox folder:', error);
    return [];
  }
}
