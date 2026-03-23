import { Dropbox } from 'dropbox';

// Dropbox integration - connection:conn_dropbox_01KH6AWHCZH0RGXZBFRTP0KV11
// Token is cached and refreshed automatically based on expires_at — do not cache the client itself.

let connectionSettings: any;

async function getAccessToken(): Promise<string> {
  // If a permanent token is configured as a secret, use it (never expires)
  if (process.env.DROPBOX_ACCESS_TOKEN) {
    return process.env.DROPBOX_ACCESS_TOKEN;
  }

  // Otherwise use the Replit OAuth connector (expires every 4 hours)
  // Use cached token if it hasn't expired yet
  if (
    connectionSettings &&
    connectionSettings.settings?.expires_at &&
    new Date(connectionSettings.settings.expires_at).getTime() > (Date.now() + 120000) // Buffer of 2 minutes
  ) {
    return connectionSettings.settings.access_token;
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const tokenType = process.env.REPL_IDENTITY ? 'repl' : process.env.WEB_REPL_RENEWAL ? 'depl' : null;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? 'depl ' + process.env.WEB_REPL_RENEWAL
    : null;

  console.log(`[Dropbox] Fetching fresh access token (type=${tokenType}, hostname=${hostname ? 'SET' : 'MISSING'})...`);

  if (!xReplitToken) {
    throw new Error('X-Replit-Token not found for repl/depl');
  }

  if (!hostname) {
    throw new Error('REPLIT_CONNECTORS_HOSTNAME not set');
  }

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
  connectionSettings = connectorData.items?.[0];

  const accessToken =
    connectionSettings?.settings?.access_token ||
    connectionSettings?.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    console.error('[Dropbox] No connection found. Connector response:', JSON.stringify(connectorData).substring(0, 300));
    throw new Error('Dropbox not connected. Please reconnect Dropbox in the Integrations panel.');
  }

  const expiresAt = connectionSettings.settings?.expires_at;
  console.log(`[Dropbox] Got token (prefix=${accessToken.substring(0, 10)}..., expires=${expiresAt || 'never'})`);

  return accessToken;
}

export function clearDropboxCache() {
  connectionSettings = null;
}

// WARNING: Never cache this client — always call fresh. Tokens expire.
async function getUncachableDropboxClient(): Promise<Dropbox> {
  try {
    const accessToken = await getAccessToken();
    return new Dropbox({ accessToken });
  } catch (error) {
    // If fetching fails, clear cache to force fresh fetch on next call
    connectionSettings = null;
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
