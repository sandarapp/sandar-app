import nodemailer, { type Transporter } from 'nodemailer';
import type { EmailMessage, EmailProvider } from './email.js';
import { renderEmail } from './templates.js';

export interface SmtpConfig { host: string; port: number; user: string; password: string; from: string }

/** Production delivery over SMTP (e.g. Zoho Mail). Only fixed templates are sent; no files, URLs or raw input. */
export class SmtpEmailProvider implements EmailProvider {
  private transport: Transporter;
  constructor(private config: SmtpConfig, private appBaseUrl: string, transport?: Transporter) {
    this.transport = transport ?? nodemailer.createTransport({
      host: config.host, port: config.port, secure: config.port === 465, requireTLS: config.port !== 465,
      auth: { user: config.user, pass: config.password },
      disableFileAccess: true, disableUrlAccess: true,
      connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000
    });
  }
  async send(message: EmailMessage) {
    const rendered = renderEmail(message, this.appBaseUrl);
    await this.transport.sendMail({
      from: this.config.from, to: message.to, subject: rendered.subject, text: rendered.text, html: rendered.html,
      ...(message.id ? { messageId: `<${message.id}@sandar>` } : {}),
      headers: { 'Auto-Submitted': 'auto-generated' }
    });
  }
}
