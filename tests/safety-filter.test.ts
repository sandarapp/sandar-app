import { describe, expect, it } from 'vitest';
import { SelfHarmPhraseClassifier, normaliseForSafety } from '../apps/api/src/spaces/safety.js';

const filter = new SelfHarmPhraseClassifier();
const blocked = async (text: string) => (await filter.classify(text)).requiredAction === 'BLOCK';

describe('self-harm phrase filter', () => {
  it.each([
    'Aku pengen mati aja rasanya', 'kayaknya aku mau bunuh diri', 'udah kepikiran bundir', 'Aku ingin mengakhiri hidup',
    'aku nggak mau hidup lagi', 'semalam aku menyakiti diri lagi', 'I want to die', 'thinking about suicide', 'I keep hurting myself',
    'Rasanya mau BUNUH DIRI', 'PENGEN MATIII', 'b4nget pengen m4ti'
  ])('blocks "%s"', async text => { expect(await blocked(text)).toBe(true); });

  it.each([
    'Hari ini capek banget di kantor', 'Lagu ini menyayat hati', 'Tadi malam mati lampu lama', 'Aku merasa sendirian minggu ini',
    'Senang ada ruang ini', 'My phone died again', 'Deadline bikin aku stres'
  ])('lets "%s" through', async text => { expect(await blocked(text)).toBe(false); });

  it('normalises case, accents, repeats and digit swaps', () => {
    expect(normaliseForSafety('PéNGEN  m4tiii!!')).toBe('pengen mati');
  });
});
