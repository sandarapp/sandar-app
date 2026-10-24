import type { EmailMessage } from './email.js';
export const escapeHtml = (text: string) => text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
export function renderEmail(message: EmailMessage, baseUrl: string) {
  const url = new URL(baseUrl);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost','127.0.0.1'].includes(url.hostname))) throw new Error('Email base URL must use HTTPS or loopback development HTTP');
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Email base URL must be an origin');
  // Loopback HTTP is only allowed in development; mark those emails so they are never mistaken for real ones.
  const development = url.protocol === 'http:';
  const verification = message.template === 'VERIFY_EMAIL';
  const title = verification ? 'Verifikasi email Sandar Anda' : message.template === 'RESET_PASSWORD' ? 'Atur ulang kata sandi Sandar' : 'Kata sandi Sandar diperbarui';
  const copy = verification ? 'Konfirmasikan alamat email Anda untuk melanjutkan. Tautan berlaku selama 24 jam.' : message.template === 'RESET_PASSWORD' ? 'Anda meminta pengaturan ulang kata sandi. Tautan berlaku selama 30 menit.' : 'Kata sandi Anda telah diperbarui dan semua sesi sebelumnya telah diakhiri. Jika bukan Anda, atur ulang kata sandi melalui aplikasi.';
  let link: string | null = null;
  if (message.template !== 'SECURITY_ALERT') {
    if (!message.token || !/^[A-Za-z0-9_-]{43}$/.test(message.token)) throw new Error('A valid action token is required');
    url.pathname = verification ? '/verify-email' : '/reset-password';
    // Fragments are not transmitted in HTTP requests or Referer headers.
    url.hash = new URLSearchParams({ token: message.token }).toString();
    link = url.toString();
  }
  const footer = 'Jika Anda tidak meminta email ini, abaikan. Jangan bagikan tautan ini. Sandar tidak meminta kata sandi melalui email.';
  return {
    subject: title,
    text: `${title}\n\n${copy}\n\n${link ?? ''}\n\n${footer}${development ? '\n\nEMAIL PENGEMBANGAN — bukan pengiriman produksi.' : ''}`,
    html: `<html lang="id"><meta name="referrer" content="no-referrer"><body style="font-family:Arial,sans-serif;background:#fff8f1;color:#4b241e;padding:32px;max-width:560px"><p>SANDAR · Real People. Brighter Days.</p><h1>${title}</h1><p>${copy}</p>${link ? `<p><a href="${escapeHtml(link)}">${verification ? 'Verifikasi email' : 'Atur ulang kata sandi'}</a></p>` : ''}<p>${footer}</p>${development ? '<small>EMAIL PENGEMBANGAN — bukan pengiriman produksi.</small>' : ''}</body></html>`,
    link
  };
}
