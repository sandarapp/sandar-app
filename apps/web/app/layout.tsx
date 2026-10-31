import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { LangProvider } from './i18n';
import { LANG_COOKIE, parseLang } from './lang';
// Senja type: Plus Jakarta Sans for text, Young Serif for headings, Figtree for
// the wordmark and buttons. Fonts ship with the app (Latin subsets), no font CDN.
import '@fontsource/plus-jakarta-sans/latin-400.css';
import '@fontsource/plus-jakarta-sans/latin-500.css';
import '@fontsource/plus-jakarta-sans/latin-600.css';
import '@fontsource/plus-jakarta-sans/latin-700.css';
import '@fontsource/young-serif/latin-400.css';
import '@fontsource/figtree/latin-600.css';
import '@fontsource/figtree/latin-700.css';
import './styles.css';
export const metadata: Metadata = { title: 'Sandar — Ruang untuk menjadi dirimu',description: 'Akses akun Sandar. Komunitas dan dukungan sebaya untuk orang dewasa.',robots: { index: false,follow: false } };
export default async function Layout({ children }: {children: React.ReactNode}) {
  const lang = parseLang((await cookies()).get(LANG_COOKIE)?.value);
  return <html lang={lang}><body><LangProvider initial={lang}>{children}</LangProvider></body></html>;
}
