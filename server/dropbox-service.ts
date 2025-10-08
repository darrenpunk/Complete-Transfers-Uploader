import { Dropbox } from 'dropbox';

interface ConnectionSettings {
  settings: {
    access_token?: string;
    expires_at?: string;
    oauth?: {
      credentials?: {
        access_token?: string;
      };
    };
  };
}

let connectionSettings: ConnectionSettings | null = null;

async function getAccessToken(): Promise<string> {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token!;
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

  const response = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=dropbox',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  );
  
  if (!response.ok) {
    throw new Error(`Failed to fetch Dropbox connection: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json();
  connectionSettings = data.items?.[0];

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings?.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('Dropbox not connected');
  }
  return accessToken;
}

// WARNING: Never cache this client.
// Access tokens expire, so a new client must be created each time.
export async function getDropboxClient(): Promise<Dropbox> {
  const accessToken = await getAccessToken();
  return new Dropbox({ accessToken });
}

export interface FileRequestResponse {
  id: string;
  url: string;
  title: string;
  destination: string;
  deadline?: {
    deadline: string;
    allow_late_uploads?: string;
  };
  open?: boolean;
  file_count: number;
}

/**
 * Create a Dropbox file request for uploading complex files
 * @param projectId - The project ID to associate with this upload
 * @param fileName - Original filename for reference
 * @param description - Optional description for the file request
 * @returns File request details including upload URL
 */
export async function createFileRequest(
  projectId: string,
  fileName: string,
  description?: string
): Promise<FileRequestResponse> {
  const dbx = await getDropboxClient();
  
  // Create a unique folder path for this project
  const folderPath = `/CompleteTransfers/Projects/${projectId}`;
  
  // Ensure the folder exists
  try {
    await dbx.filesCreateFolderV2({ path: folderPath });
  } catch (error: any) {
    // Folder might already exist, which is fine
    if (error?.error?.error?.['.tag'] !== 'path' || error?.error?.error?.path?.['.tag'] !== 'conflict') {
      throw error;
    }
  }
  
  // Create file request
  const title = description || `Upload: ${fileName}`;
  const fileRequest = await dbx.fileRequestsCreate({
    title,
    destination: folderPath
  });
  
  console.log(`📤 Dropbox file request created: ${fileRequest.result.id} → ${fileRequest.result.url}`);
  
  return fileRequest.result as FileRequestResponse;
}

/**
 * Get file request status and uploaded files
 * @param fileRequestId - The file request ID
 * @returns File request details including file count
 */
export async function getFileRequestStatus(fileRequestId: string): Promise<FileRequestResponse> {
  const dbx = await getDropboxClient();
  const fileRequest = await dbx.fileRequestsGet({ id: fileRequestId });
  return fileRequest.result as FileRequestResponse;
}

/**
 * List files in a folder
 * @param folderPath - The folder path to list
 * @returns List of file entries
 */
export async function listFolderFiles(folderPath: string) {
  const dbx = await getDropboxClient();
  const result = await dbx.filesListFolder({ path: folderPath });
  return result.result.entries;
}

/**
 * Download a file from Dropbox
 * @param filePath - The file path in Dropbox
 * @returns File content as Buffer
 */
export async function downloadFile(filePath: string): Promise<Buffer> {
  const dbx = await getDropboxClient();
  const result = await dbx.filesDownload({ path: filePath });
  
  // @ts-ignore - fileBinary exists on the response
  const fileBlob = result.result.fileBinary;
  
  if (fileBlob instanceof Buffer) {
    return fileBlob;
  }
  
  // Convert to Buffer if needed
  return Buffer.from(await fileBlob.arrayBuffer());
}

/**
 * Get a temporary link to download a file
 * @param filePath - The file path in Dropbox
 * @returns Temporary download link
 */
export async function getTemporaryLink(filePath: string): Promise<string> {
  const dbx = await getDropboxClient();
  const result = await dbx.filesGetTemporaryLink({ path: filePath });
  return result.result.link;
}
