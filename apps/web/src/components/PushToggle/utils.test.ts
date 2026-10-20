import { describe, expect, it } from 'vitest';

import { applicationServerKeyOf } from './utils';

describe('преобразование ключа VAPID', () => {
  it('переводит base64url в байты', () => {
    // 'AQID' — это 0x01 0x02 0x03 в обычном base64.
    expect([...applicationServerKeyOf('AQID')]).toEqual([1, 2, 3]);
  });

  it('понимает алфавит base64url без выравнивания', () => {
    // Браузер требует именно байты, а ключ приходит в base64url: символы
    // «-» и «_» вместо «+» и «/», и без хвостовых «=».
    const withUrlAlphabet = applicationServerKeyOf('-_8');
    const withStandard = applicationServerKeyOf('+/8=');

    expect([...withUrlAlphabet]).toEqual([...withStandard]);
  });

  it('отдаёт ровно столько байт, сколько в ключе', () => {
    expect(applicationServerKeyOf('AQIDBAUGBwgJCgsMDQ4PEA').length).toBe(16);
  });
});
