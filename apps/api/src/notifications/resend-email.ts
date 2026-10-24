import type { EmailMessage, EmailProvider } from './email.js';
import { renderEmail } from './templates.js';

/** Production delivery over Resend's HTTPS API, for hosts that block SMTP ports. */
export class ResendEmailProvider implements EmailProvider {
  constructor(private apiKey: string, private from: string, private appBaseUrl: string, private fetcher: typeof fetch = fetch) {}
  async send(message: EmailMessage) {
    const rendered = renderEmail(message, this.appBaseUrl);
    const response = await this.fetcher('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(15000),
      headers: {
        authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json',
        // The outbox id makes a retried delivery a no-op on Resend's side.
        ...(message.id ? { 'idempotency-key': message.id } : {})
      },
      body: JSON.stringify({ from: this.from, to: [message.to], subject: rendered.subject, text: rendered.text, html: rendered.html })
    });
    // Status only: the response body may echo the recipient, which must not reach logs.
    if (!response.ok) throw new Error(`Resend rejected the email (${response.status})`);
  }
}
