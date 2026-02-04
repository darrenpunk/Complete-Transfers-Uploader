import { Dropbox } from 'dropbox';

// Dropbox integration - connection:conn_dropbox_01K71E68E7EB5E5STXWMJ463MR
let connectionSettings: any;

function clearTokenCache() {
  connectionSettings = null;
}

async function getAccessToken(forceRefresh = false) {
  // If force refresh or no cached settings, fetch new token
  if (forceRefresh) {
    connectionSettings = null;
  }
  
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  console.log('[Dropbox] Fetching fresh access token from Replit connector...');
  
  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=dropbox',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('Dropbox not connected. Please reconnect Dropbox in the Integrations panel.');
  }
  
  console.log('[Dropbox] Access token obtained, expires:', connectionSettings.settings.expires_at);
  return accessToken;
}

async function getUncachableDropboxClient(forceRefresh = false) {
  const accessToken = await getAccessToken(forceRefresh);
  return new Dropbox({ accessToken });
}

export async function createFileRequest(
  projectId: string,
  fileName: string,
  description?: string
): Promise<{ id: string; url: string; title: string; folder: string }> {
  const title = `${projectId}_${fileName}`;
  const destination = `/file_requests/${projectId}`;
  
  // Try with cached token first, then retry with fresh token on 401
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const dbx = await getUncachableDropboxClient(attempt > 0);
      
      const result = await dbx.fileRequestsCreate({
        title: title,
        destination: destination,
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
      console.error(`[Dropbox] File request creation failed (attempt ${attempt + 1}):`, error.status, error.error);
      
      // If 401 and first attempt, clear cache and retry
      if (error.status === 401 && attempt === 0) {
        console.log('[Dropbox] Token invalid, refreshing and retrying...');
        clearTokenCache();
        continue;
      }
      
      throw new Error(`Failed to create Dropbox file request: ${error.message || 'Unknown error'}`);
    }
  }
  
  throw new Error('Failed to create Dropbox file request after retries');
}

export async function getFileRequestFiles(fileRequestId: string): Promise<any[]> {
  const dbx = await getUncachableDropboxClient();
  
  try {
    const result = await dbx.fileRequestsGet({ id: fileRequestId });
    return [];
  } catch (error: any) {
    console.error('Failed to get file request:', error);
    return [];
  }
}

export async function downloadFile(path: string): Promise<Buffer> {
  const dbx = await getUncachableDropboxClient();
  
  try {
    const result = await dbx.filesDownload({ path }) as any;
    return result.result.fileBinary;
  } catch (error: any) {
    console.error('Failed to download file from Dropbox:', error);
    throw new Error(`Failed to download file: ${error.message}`);
  }
}
