// Interface language, shared by server and client code. Indonesian is the
// default; the choice lives in a first-party cookie so the server renders the
// right <html lang>.
export type Lang = 'id' | 'en';
export const LANG_COOKIE = 'sandar_lang';
export const parseLang = (value: string | undefined): Lang => value === 'en' ? 'en' : 'id';
/** The API locale for this interface language. */
export const apiLocale = (lang: Lang) => lang === 'en' ? 'en' : 'id-ID';
