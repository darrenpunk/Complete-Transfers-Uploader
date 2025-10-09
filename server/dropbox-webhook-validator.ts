import * as crypto from 'crypto';

/**
 * Validates Dropbox webhook signatures to prevent spoofing
 * https://www.dropbox.com/developers/reference/webhooks#signatures
 */
export function validateDropboxWebhook(
  signature: string | undefined,
  body: string,
  appSecret: string
): boolean {
  if (!signature) {
    console.error('Missing X-Dropbox-Signature header');
    return false;
  }

  // Dropbox sends signature as HMAC-SHA256 of the raw request body
  const hmac = crypto.createHmac('sha256', appSecret);
  hmac.update(body);
  const expectedSignature = hmac.digest('hex');

  // Constant-time comparison to prevent timing attacks
  const isValid = crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );

  if (!isValid) {
    console.error('Invalid webhook signature - possible spoofing attempt');
  }

  return isValid;
}

/**
 * Middleware to capture raw body for signature validation
 * Must be used before JSON body parser
 */
export function rawBodyMiddleware(req: any, res: any, buf: Buffer, encoding: string) {
  if (req.url === '/api/dropbox/webhook') {
    req.rawBody = buf.toString((encoding as BufferEncoding) || 'utf8');
  }
}
