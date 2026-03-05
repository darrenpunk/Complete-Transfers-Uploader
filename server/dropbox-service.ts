import { Dropbox } from 'dropbox';

// Dropbox integration - connection:conn_dropbox_01KH6AWHCZH0RGXZBFRTP0KV11
// Token is cached and refreshed automatically based on expires_at — do not cache the client itself.

let connectionSettings: any;

async function getAccessToken(): Promise<string> {
  // Use cached token if it hasn't expired yet
  if (
    connectionSettings &&
    connectionSettings.settings?.expires_at &&
    new Date(connectionSettings.settings.expires_at).getTime() > Date.now()
  ) {
    return connectionSettings.settings.access_token;
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

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=dropbox',
    {
      headers: {
        'Accept': 'application/json',
        'X-Replit-Token': xReplitToken,
      },
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken =
    connectionSettings?.settings?.access_token ||
    connectionSettings?.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('Dropbox not connected. Please reconnect Dropbox in the Integrations panel.');
  }

  return accessToken;
}

// WARNING: Never cache this client — always call fresh. Tokens expire.
async function getUncachableDropboxClient(): Promise<Dropbox> {
  const accessToken = await getAccessToken();
  return new Dropbox({ accessToken });
}

export async function createFileRequest(
  projectId: string,
  fileName: string,
  description?: string
): Promise<{ id: string; url: string; title: string; folder: string }> {
  const title = `${projectId}_${fileName}`;
  const destination = `/file_requests/${projectId}`;

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
  const dbx = await getUncachableDropboxClient();
  try {
    const result = await dbx.filesDownload({ path: filePath }) as any;
    return result.result.fileBinary;
  } catch (error: any) {
    console.error('Failed to download file from Dropbox:', error);
    throw new Error(`Failed to download file: ${error.message}`);
  }
}

export async function uploadFileToDropbox(
  fileBuffer: Buffer,
  dropboxPath: string,
): Promise<{ path: string; pathDisplay: string }> {
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
