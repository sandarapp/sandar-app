// Indonesian labels for the stored taxonomy. Enum values never change; only
// these words do.
export const labels: Record<string,string> = {
  ANXIETY_STRESS: 'Cemas dan stres', BURNOUT: 'Burnout', OVERWHELMED: 'Merasa kewalahan', LONELINESS: 'Kesepian',
  GRIEF_LOSS: 'Duka dan kehilangan', RELATIONSHIPS: 'Hubungan', PARENTING: 'Pengasuhan', LIFE_CHANGES: 'Perubahan hidup',
  RECOVERY: 'Pemulihan', WORK_PRESSURE: 'Tekanan kerja', GENERAL_SUPPORT: 'Dukungan umum', OTHER: 'Lainnya',
  PREFER_NOT_TO_SAY: 'Nggak mau jawab dulu',
  FIND_COMMUNITIES: 'Cari komunitas', READ_QUIETLY: 'Baca-baca dulu', SHARE_EXPERIENCES: 'Berbagi cerita',
  ATTEND_EVENTS: 'Ikut acara', JOIN_PROGRAMS: 'Ikut program', LEARN_PEER_SUPPORT: 'Belajar dukungan sebaya',
  STILL_FIGURING_OUT: 'Masih bingung',
  ONLINE: 'Online', LOCAL: 'Tatap muka', MIXED: 'Campuran', NO_PREFERENCE: 'Terserah',
  IN_PERSON: 'Tatap muka', HYBRID: 'Campuran'
};

export const guidelines = [
  'Bersikap baik. Dengarkan sebelum menanggapi.',
  'Bagikan pengalaman, bukan diagnosis atau saran obat.',
  'Cerita orang lain tetap di sini. Jangan sebarkan.',
  'Hargai pengalaman yang berbeda dari punyamu.',
  'Laporkan konten yang bikin nggak aman supaya bisa ditinjau.'
];

export const reactions = [
  { type: 'SUPPORT', label: 'Dukung' },
  { type: 'RELATE', label: 'Relate' },
  { type: 'ENCOURAGEMENT', label: 'Semangat' }
] as const;

export const reportReasons = [
  { value: 'HARMFUL_CONTENT', label: 'Berbahaya atau bikin nggak aman' },
  { value: 'HARASSMENT', label: 'Pelecehan atau serangan' },
  { value: 'PRIVACY', label: 'Membuka data pribadi orang lain' },
  { value: 'MISINFORMATION', label: 'Info kesehatan yang menyesatkan' },
  { value: 'OTHER', label: 'Lainnya' }
] as const;

export const helpLines = [
  { n: '119', l: 'Gawat darurat medis' },
  { n: '119 ext. 8', l: 'Krisis emosional, atau Healing119.id' },
  { n: '1500-567', l: 'Halo Kemenkes' }
];

/** Human error text for API codes the member can act on. */
export function errorText(code: string) {
  return ({
    OFFLINE: 'Kamu sedang offline. Sambungkan internet lalu coba lagi.',
    TIMEOUT: 'Koneksinya lama. Coba lagi sebentar lagi.',
    NETWORK_ERROR: 'Belum bisa terhubung. Periksa koneksimu.',
    POLICY_VERSION_CHANGED: 'Pedoman baru saja diperbarui. Baca lagi, lalu setujui.',
    GUIDELINES_CHANGED: 'Aturan ruang baru saja diperbarui. Muat ulang halaman ini.',
    SPACE_RESTRICTED: 'Ruang ini sedang dibatasi.',
    MEMBERSHIP_REQUIRED: 'Gabung dulu ke ruang ini untuk membacanya.',
    CONTENT_REMOVED: 'Konten ini sudah tidak tersedia.',
    RATE_LIMITED: 'Terlalu banyak percobaan. Tunggu sebentar.',
    ONBOARDING_INCOMPLETE: 'Masih ada langkah wajib yang belum selesai.'
  } as Record<string,string>)[code] ?? 'Ada yang salah. Pilihanmu masih di sini, coba lagi.';
}

export function timeAgo(iso: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return 'baru saja';
  if (minutes < 60) return `${minutes} mnt`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} jam`;
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}
