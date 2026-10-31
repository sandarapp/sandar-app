import type { Lang } from '../i18n';

// Labels for the stored taxonomy. Enum values never change; only these words do.
const taxonomy: Record<Lang, Record<string, string>> = {
  id: {
    ANXIETY_STRESS: 'Cemas dan stres', BURNOUT: 'Burnout', OVERWHELMED: 'Merasa kewalahan', LONELINESS: 'Kesepian',
    GRIEF_LOSS: 'Duka dan kehilangan', RELATIONSHIPS: 'Hubungan', PARENTING: 'Pengasuhan', LIFE_CHANGES: 'Perubahan hidup',
    RECOVERY: 'Pemulihan', WORK_PRESSURE: 'Tekanan kerja', GENERAL_SUPPORT: 'Dukungan umum', OTHER: 'Lainnya',
    PREFER_NOT_TO_SAY: 'Nggak mau jawab dulu',
    FIND_COMMUNITIES: 'Cari ruang yang cocok', READ_QUIETLY: 'Baca-baca dulu', SHARE_EXPERIENCES: 'Berbagi cerita',
    ATTEND_EVENTS: 'Ikut acara', JOIN_PROGRAMS: 'Ikut program', LEARN_PEER_SUPPORT: 'Belajar dukungan sebaya',
    STILL_FIGURING_OUT: 'Masih bingung',
    ONLINE: 'Online', LOCAL: 'Tatap muka', MIXED: 'Campuran', NO_PREFERENCE: 'Terserah',
    IN_PERSON: 'Tatap muka', HYBRID: 'Campuran'
  },
  en: {
    ANXIETY_STRESS: 'Anxiety and stress', BURNOUT: 'Burnout', OVERWHELMED: 'Feeling overwhelmed', LONELINESS: 'Loneliness',
    GRIEF_LOSS: 'Grief and loss', RELATIONSHIPS: 'Relationships', PARENTING: 'Parenting', LIFE_CHANGES: 'Life changes',
    RECOVERY: 'Recovery', WORK_PRESSURE: 'Work pressure', GENERAL_SUPPORT: 'General support', OTHER: 'Other',
    PREFER_NOT_TO_SAY: 'Prefer not to say',
    FIND_COMMUNITIES: 'Find spaces that fit', READ_QUIETLY: 'Read quietly first', SHARE_EXPERIENCES: 'Share my story',
    ATTEND_EVENTS: 'Join events', JOIN_PROGRAMS: 'Join programmes', LEARN_PEER_SUPPORT: 'Learn peer support',
    STILL_FIGURING_OUT: 'Still figuring it out',
    ONLINE: 'Online', LOCAL: 'In person', MIXED: 'Mixed', NO_PREFERENCE: 'No preference',
    IN_PERSON: 'In person', HYBRID: 'Hybrid'
  }
};
export const label = (lang: Lang, value: string) => taxonomy[lang][value] ?? value;

export const ruleKeys = ['rule.1', 'rule.2', 'rule.3', 'rule.4', 'rule.5'] as const;
export const reactionTypes = ['SUPPORT', 'RELATE', 'ENCOURAGEMENT'] as const;
export const reportReasons = ['HARMFUL_CONTENT', 'HARASSMENT', 'PRIVACY', 'MISINFORMATION', 'OTHER'] as const;

// Photos for official spaces, chosen by the space id so a space keeps its picture.
const photos = ['window', 'tea', 'bench', 'circle', 'laptop'];
export function spacePhoto(id: string) {
  let sum = 0;
  for (const char of id) sum = (sum + char.charCodeAt(0)) % 9973;
  return `/img/${photos[sum % photos.length]}.jpg`;
}

/** Error key for API codes the member can act on. */
export function errorKey(code: string) {
  const known = ['OFFLINE', 'TIMEOUT', 'NETWORK_ERROR', 'POLICY_VERSION_CHANGED', 'GUIDELINES_CHANGED', 'SPACE_RESTRICTED', 'MEMBERSHIP_REQUIRED', 'CONTENT_REMOVED', 'RATE_LIMITED', 'ONBOARDING_INCOMPLETE', 'CONTENT_REQUIRES_EDIT', 'ANONYMOUS_DISABLED', 'POSTING_DISABLED', 'ALREADY_REVIEWED', 'SELF_HARM_SUPPORT', 'SPACE_NAME_TAKEN', 'SPACE_NAME_NOT_ALLOWED', 'SPACE_ALREADY_IN_REVIEW', 'SPACE_LIMIT_REACHED', 'SPACE_NOT_EDITABLE', 'DISPLAY_NAME_TOO_SOON', 'CURRENT_PASSWORD_WRONG', 'VALIDATION_ERROR'] as const;
  return (known as readonly string[]).includes(code) ? `err.${code as typeof known[number]}` as const : 'err.default' as const;
}

export function timeAgo(iso: string, lang: Lang, t: (key: 'time.now' | 'time.min' | 'time.hour', vars?: Record<string, number>) => string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return t('time.now');
  if (minutes < 60) return t('time.min', { n: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t('time.hour', { n: hours });
  return new Date(iso).toLocaleDateString(lang === 'en' ? 'en-GB' : 'id-ID', { day: 'numeric', month: 'short' });
}
