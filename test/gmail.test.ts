import { describe, it, expect } from 'vitest';
import { parseTopping, calcExpiryFromPurchase, extractAccountEmail } from '../src/gmail';

describe('parseTopping', () => {
  it('1GB(7日間) を正しくパースする', () => {
    const result = parseTopping('1GB(7日間)を購入された方へ');
    expect(result).toEqual({ name: '1GB(7日間)', validityDays: 7 });
  });

  it('データ使い放題(24時間) を1日として扱う', () => {
    const result = parseTopping('データ使い放題(24時間)を購入された方へ');
    expect(result).toEqual({ name: 'データ使い放題(24時間)', validityDays: 1 });
  });

  it('12GB(365日間) を正しくパースする', () => {
    const result = parseTopping('12GB(365日間)を購入された方へ');
    expect(result).toEqual({ name: '12GB(365日間)', validityDays: 365 });
  });

  it('パターン外の件名はnullを返す', () => {
    expect(parseTopping('5月の販売開始トッピングをご紹介')).toBeNull();
  });

  it('日間マッチなし（ガチャ等）はfallback 7日を返す', () => {
    const result = parseTopping('からあげクン付きトッピングを購入された方へ');
    expect(result).toEqual({ name: 'からあげクン付きトッピング', validityDays: 7 });
  });
});

describe('calcExpiryFromPurchase', () => {
  it('購入日 + validityDays - 1 が有効期限', () => {
    const purchase = new Date('2026-05-25T00:00:00Z');
    const expiry = calcExpiryFromPurchase(purchase, 7);
    expect(expiry.toISOString().slice(0, 10)).toBe('2026-05-31');
  });

  it('24時間トッピングは購入日が有効期限', () => {
    const purchase = new Date('2026-05-25T00:00:00Z');
    const expiry = calcExpiryFromPurchase(purchase, 1);
    expect(expiry.toISOString().slice(0, 10)).toBe('2026-05-25');
  });
});

describe('extractAccountEmail', () => {
  it('yosinn1+1@gmail.com を含む To ヘッダーを識別する', () => {
    expect(extractAccountEmail('yosinn1+1@gmail.com')).toBe('yosinn1+1@gmail.com');
    expect(extractAccountEmail('yosinn1@gmail.com')).toBe('yosinn1@gmail.com');
    expect(extractAccountEmail('Yoshiki <yosinn1+1@gmail.com>')).toBe('yosinn1+1@gmail.com');
  });
});
