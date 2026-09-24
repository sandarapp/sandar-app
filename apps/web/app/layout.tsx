import type { Metadata } from 'next';
import './styles.css';
export const metadata: Metadata = { title: 'Sandar — Ruang untuk menjadi dirimu',description: 'Akses akun Sandar. Komunitas dan dukungan sebaya untuk orang dewasa.',robots: { index: false,follow: false } };
export default function Layout({ children }: {children: React.ReactNode}) { return <html lang="id"><body>{children}</body></html>; }
