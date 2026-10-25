import { describe, expect, it } from 'vitest';
import { apiLocale, parseLang } from '../apps/web/app/lang.js';
import { authErrorText, dictionaries, noticeText } from '../apps/web/app/i18n.js';
import { label, spacePhoto } from '../apps/web/app/member/copy.js';

describe('web app languages', () => {
  it('defaults to Indonesian and only accepts known languages', () => {
    expect(parseLang(undefined)).toBe('id');
    expect(parseLang('fr')).toBe('id');
    expect(parseLang('en')).toBe('en');
    expect(apiLocale('id')).toBe('id-ID');
    expect(apiLocale('en')).toBe('en');
  });

  it('has every interface text in both languages, with the same placeholders', () => {
    const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();
    for (const [key, id] of Object.entries(dictionaries.id) as [string, string][]) {
      const en = dictionaries.en[key as keyof typeof dictionaries.en];
      expect(id.trim(), key).not.toBe('');
      expect(en?.trim(), key).not.toBe('');
      expect(placeholders(en), key).toEqual(placeholders(id));
    }
  });

  it('keeps the server text in Indonesian and translates known auth messages to English', () => {
    expect(authErrorText('id', 'TOKEN_EXPIRED', 'Tautan sudah kedaluwarsa.')).toBe('Tautan sudah kedaluwarsa.');
    expect(authErrorText('en', 'TOKEN_EXPIRED', 'Tautan sudah kedaluwarsa.')).toMatch(/expired/);
    expect(authErrorText('en', 'SOMETHING_NEW', 'Pesan baru.')).toBe(dictionaries.en['err.default']);
    expect(noticeText('en', 'Anda telah keluar.')).toMatch(/logged out/);
    expect(noticeText('id', 'Anda telah keluar.')).toBe('Anda telah keluar.');
  });

  it('labels the taxonomy in both languages and keeps a photo per space', () => {
    expect(label('id', 'LONELINESS')).toBe('Kesepian');
    expect(label('en', 'LONELINESS')).toBe('Loneliness');
    expect(label('en', 'UNKNOWN_VALUE')).toBe('UNKNOWN_VALUE');
    const id = 'f0100000-0000-4000-8000-000000000001';
    expect(spacePhoto(id)).toBe(spacePhoto(id));
    expect(spacePhoto(id)).toMatch(/^\/img\/(window|tea|bench|circle|laptop)\.jpg$/);
  });
});
