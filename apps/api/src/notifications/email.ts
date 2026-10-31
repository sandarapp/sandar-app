export type EmailMessage = {
  id?: string;
  to: string;
  template: 'VERIFY_EMAIL' | 'RESET_PASSWORD' | 'SECURITY_ALERT' | 'SPACE_REVIEWED' | 'OPS_CODE';
  token?: string;
  code?: string;
};
export interface EmailProvider { send(message: EmailMessage): Promise<void> }
/** Development adapter: intentionally no delivery and no token logging. */
export class DisabledEmailProvider implements EmailProvider {
  async send(message: EmailMessage) { void message; /* No production integration configured. */ }
}
