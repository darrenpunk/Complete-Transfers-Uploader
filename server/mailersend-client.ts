/**
 * Minimal MailerSend HTTP client. Uses Node's built-in fetch (Node 18+).
 *
 * Required env:
 *   MAILERSEND_API_KEY — API token (already provisioned in this project).
 *
 * Optional env (all have safe defaults):
 *   MAILERSEND_FROM_EMAIL — sender address. Default: alerts@completetransfers.com.
 *                           Note: MailerSend requires the sender DOMAIN to be
 *                           verified in your MailerSend account, otherwise the
 *                           API call will return 422.
 *   MAILERSEND_FROM_NAME  — sender display name. Default: "completetransfers.com Health Monitor".
 */

const MAILERSEND_API = 'https://api.mailersend.com/v1/email';

export interface MailerSendMessage {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  fromEmail?: string;
  fromName?: string;
}

export interface MailerSendResult {
  ok: boolean;
  status?: number;
  messageId?: string;
  error?: string;
  durationMs: number;
}

export async function sendMail(msg: MailerSendMessage): Promise<MailerSendResult> {
  const started = Date.now();
  const apiKey = process.env.MAILERSEND_API_KEY;
  if (!apiKey) {
    return { ok: false, error: 'MAILERSEND_API_KEY not set', durationMs: Date.now() - started };
  }
  const fromEmail = msg.fromEmail || process.env.MAILERSEND_FROM_EMAIL || 'alerts@completetransfers.com';
  const fromName = msg.fromName || process.env.MAILERSEND_FROM_NAME || 'completetransfers.com Health Monitor';
  const recipients = (Array.isArray(msg.to) ? msg.to : [msg.to]).map((email) => ({ email }));

  const body = {
    from: { email: fromEmail, name: fromName },
    to: recipients,
    subject: msg.subject,
    text: msg.text,
    ...(msg.html ? { html: msg.html } : {}),
  };

  // 15s timeout — MailerSend usually responds in <1s, but a hung outbound call
  // must not block the health-monitor scheduler.
  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), 15_000);
  try {
    const res = await fetch(MAILERSEND_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify(body),
      signal: ac.signal,
    });

    const messageId = res.headers.get('x-message-id') || undefined;
    if (res.ok) {
      return { ok: true, status: res.status, messageId, durationMs: Date.now() - started };
    }
    const errBody = await res.text().catch(() => '');
    return {
      ok: false,
      status: res.status,
      error: `HTTP ${res.status}: ${errBody.slice(0, 500)}`,
      durationMs: Date.now() - started,
    };
  } catch (e: any) {
    return {
      ok: false,
      error: e?.name === 'AbortError' ? 'MailerSend request timed out after 15s' : (e?.message || String(e)),
      durationMs: Date.now() - started,
    };
  } finally {
    // Always clear the timer — covers synchronous throws from fetch (e.g. DNS
    // failure thrown immediately) so the timer doesn't linger 15s.
    clearTimeout(timeout);
  }
}
